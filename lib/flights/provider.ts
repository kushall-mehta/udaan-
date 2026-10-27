import type { Flight, FlightLeg, FlightSearchQuery, FlightSearchResponse, FlightSeller } from "../../types/flight";
import { FlightApiError, indiaDate } from "./validation";

type Row = Record<string, unknown>;
export type ProviderResult = Pick<FlightSearchResponse, "mode" | "flights" | "fetchedAt">;
const isRecord = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(isRecord) : [];
const ids = (value: unknown): string[] => Array.isArray(value) ? value.filter((item) => typeof item === "string" || typeof item === "number").map(String) : [];
const text = (value: unknown): string => typeof value === "string" ? value : "";
const index = (value: unknown): Map<string, Row> => new Map(rows(value).filter((item) => typeof item.id === "string" || typeof item.id === "number").map((item) => [String(item.id), item]));

export const hasFlightApiKey = (key: string): boolean => Boolean(key.trim() && !/^(#+|your[_ -]?.*|replace.*)$/i.test(key.trim()));

export const flightBookingUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const relative = /^\/transport_deeplink\/4\.0\/IN\//.test(value);
    const url = relative ? new URL(value, "https://www.skyscanner.co.in") : new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};

const timestamp = (value: unknown): string | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const date = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}+05:30`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export const normalizeFlightApi = (body: unknown, query: FlightSearchQuery): Flight[] => {
  if (!isRecord(body) || !Array.isArray(body.itineraries) || !Array.isArray(body.legs)) {
    throw new FlightApiError(502, "FlightAPI returned an unexpected response format. No sample fares were substituted.");
  }
  if (typeof body.currency === "string" && body.currency.toUpperCase() !== "INR") {
    throw new FlightApiError(502, "FlightAPI returned a different currency. Prices were not displayed.");
  }
  const legs = index(body.legs);
  const carriers = index(body.carriers);
  const agents = index(body.agents);
  const segments = index(body.segments);
  const places = index(body.places);

  const makeLeg = (id: string, origin: string, destination: string, expectedDate: string): FlightLeg | null => {
    const leg = legs.get(id);
    if (!leg) return null;
    const departure = timestamp(leg.departure);
    const arrival = timestamp(leg.arrival);
    if (!departure || !arrival || arrival <= departure || indiaDate(new Date(departure)) !== expectedDate) return null;
    const originCode = places.get(String(leg.origin_place_id))?.display_code;
    const destinationCode = places.get(String(leg.destination_place_id))?.display_code;
    if ((originCode && originCode !== origin) || (destinationCode && destinationCode !== destination)) return null;
    const marketing = ids(leg.marketing_carrier_ids).map((carrier) => carriers.get(carrier)).filter((item): item is Row => Boolean(item));
    const airline = [...new Set(marketing.map((carrier) => text(carrier.name)).filter(Boolean))].join(" / ") || "Airline not supplied";
    const numbers = ids(leg.segment_ids).map((id) => segments.get(id)).flatMap((segment) => {
      if (!segment || (typeof segment.marketing_flight_number !== "string" && typeof segment.marketing_flight_number !== "number")) return [];
      const code = text(carriers.get(String(segment.marketing_carrier_id))?.display_code);
      return [`${code} ${segment.marketing_flight_number}`.trim()];
    });
    return {
      origin, destination, departure, arrival, airline,
      airlineCode: text(marketing[0]?.display_code),
      flightNumber: numbers.join(" + ") || "Flight number not supplied",
      duration: Math.round((new Date(arrival).getTime() - new Date(departure).getTime()) / 60_000),
      stops: typeof leg.stop_count === "number" && Number.isInteger(leg.stop_count) && leg.stop_count >= 0 ? leg.stop_count : null,
    };
  };

  return rows(body.itineraries).flatMap((itinerary, position) => {
    const legIds = ids(itinerary.leg_ids);
    if (legIds.length !== (query.returnDate ? 2 : 1)) return [];
    const outbound = makeLeg(legIds[0], query.origin, query.destination, query.date);
    const inbound = query.returnDate ? makeLeg(legIds[1], query.destination, query.origin, query.returnDate) : null;
    if (!outbound || (query.returnDate && (!inbound || inbound.departure < outbound.arrival))) return [];
    const sellers: FlightSeller[] = rows(itinerary.pricing_options).flatMap((option, sellerPosition) => {
      const price = isRecord(option.price) ? option.price.amount : undefined;
      const currency = isRecord(option.price) ? option.price.currency : undefined;
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || option.unpriced_type || (typeof currency === "string" && currency.toUpperCase() !== "INR")) return [];
      const items = rows(option.items);
      const sellerIds = ids(option.agent_ids);
      const sellerNames = (sellerIds.length ? sellerIds : items.map((item) => String(item.agent_id))).map((id) => text(agents.get(id)?.name) || id);
      return [{
        id: `${position}-${sellerPosition}`,
        name: [...new Set(sellerNames)].join(" + ") || "Seller not supplied",
        price,
        bookingUrl: flightBookingUrl(option.deepLink) || (items.length === 1 ? flightBookingUrl(items[0].url) : null),
      }];
    }).sort((a, b) => a.price - b.price);
    if (!sellers.length) return [];
    return [{
      ...outbound,
      id: `flightapi-${text(itinerary.id) || position}`,
      airline: [...new Set([outbound.airline, inbound?.airline].filter(Boolean))].join(" / "),
      price: sellers[0].price,
      bookingUrl: sellers[0].bookingUrl,
      itineraryUrl: flightBookingUrl(itinerary.deepLink),
      returnLeg: inbound,
      sellers,
    }];
  });
};

export const requestFlightApi = async (query: FlightSearchQuery, key: string, fetcher: typeof fetch = fetch): Promise<ProviderResult> => {
  if (!hasFlightApiKey(key)) throw new FlightApiError(503, "Set FLIGHTAPI_KEY in .env.local and restart the app.");
  const parts = [query.returnDate ? "roundtrip" : "onewaytrip", key.trim(), query.origin, query.destination, query.date,
    ...(query.returnDate ? [query.returnDate] : []), query.adults, query.children, query.infants, query.cabin, "INR"];
  const url = new URL(`https://api.flightapi.io/${parts.map(encodeURIComponent).join("/")}`);
  url.searchParams.set("region", "IN");
  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new FlightApiError(502, "FlightAPI could not be reached or timed out. No automatic retry was made; the provider may still count the request.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new FlightApiError(429, "FlightAPI request limit or credit allowance reached. Check the provider dashboard.");
    throw new FlightApiError(502, "FlightAPI rejected or could not complete the request. Check the key, plan, and route in the provider dashboard.");
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new FlightApiError(502, "FlightAPI returned an unreadable response."); }
  if (isRecord(body) && (body.error || (body.message && !body.itineraries))) {
    throw new FlightApiError(502, "FlightAPI returned an error. No sample data was substituted.");
  }
  return { mode: "flightapi", flights: normalizeFlightApi(body, query), fetchedAt: new Date().toISOString() };
};
