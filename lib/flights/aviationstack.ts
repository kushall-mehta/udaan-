import { airports } from "../../data/airports";
import type {
  AirportDirection,
  AirportFlightStatus,
  AirportFlightTrack,
  AirportTrackingResponse,
  TrackedPosition,
} from "../../types/airport-tracking";

type Row = Record<string, unknown>;
export type AirportTrackingQuery = { airport: string; direction: AirportDirection };

export class AviationstackError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AviationstackError";
  }
}

const isRecord = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const record = (value: unknown): Row => isRecord(value) ? value : {};
const asText = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const asNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const optionalText = (value: unknown): string | null => asText(value) || null;

export const validateAirportTracking = (params: URLSearchParams): AirportTrackingQuery => {
  for (const field of ["airport", "direction"]) {
    if (params.getAll(field).length !== 1) throw new AviationstackError(400, `Supply ${field} exactly once.`);
  }
  const airport = (params.get("airport") ?? "").trim().toUpperCase();
  if (!airports.some((item) => item.code === airport)) throw new AviationstackError(400, "Choose an airport from the Indian airport list.");
  const direction = params.get("direction");
  if (direction !== "arr" && direction !== "dep") throw new AviationstackError(400, "Choose arrivals or departures.");
  return { airport, direction };
};

const normalizeStatus = (flight: Row, direction: AirportDirection): AirportFlightStatus | null => {
  const airline = record(flight.airline);
  const flightInfo = record(flight.flight);
  const departure = record(flight.departure);
  const arrival = record(flight.arrival);
  const flightDate = asText(flight.flight_date);
  const flightNumber = asText(flightInfo.number) || asText(flightInfo.iata);
  const flightId = asText(flightInfo.iata) || `${asText(airline.iata)}${flightNumber}-${flightDate}`;
  if (!flightId) return null;
  const relevant = direction === "arr" ? arrival : departure;
  const live = record(flight.live);
  const latitude = asNumber(live.latitude);
  const longitude = asNumber(live.longitude);
  let track: AirportFlightTrack | null = null;
  if (latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
    const position: TrackedPosition = {
      latitude,
      longitude,
      altitude: asNumber(live.altitude),
      speed: asNumber(live.speed) ?? asNumber(live.speed_horizontal),
      source: "Aviationstack live data",
      timestamp: asText(live.updated) || new Date().toISOString(),
    };
    track = { flightId, positions: [position] };
  }
  const rawStatus = asText(flight.flight_status).toLowerCase();
  const status = rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : "Unknown";
  return {
    flightId,
    airline: asText(airline.name) || "Airline not supplied",
    airlineCode: asText(airline.iata) || asText(flightInfo.iata).slice(0, 2),
    flightNumber: flightNumber || "—",
    origin: asText(departure.iata) || "—",
    destination: asText(arrival.iata) || "—",
    status,
    scheduledTime: optionalText(relevant.scheduled),
    estimatedTime: optionalText(relevant.estimated),
    actualTime: optionalText(relevant.actual),
    terminal: optionalText(relevant.terminal),
    gate: optionalText(relevant.gate),
    baggage: direction === "arr" ? optionalText(arrival.baggage) : null,
    delayMinutes: asNumber(relevant.delay),
    track,
  };
};

export const getAirportTracking = async (
  query: AirportTrackingQuery,
  accessKey: string,
  fetcher: typeof fetch = fetch,
): Promise<AirportTrackingResponse> => {
  if (!accessKey.trim() || /^(your[_ -]?.*|replace.*)$/i.test(accessKey.trim())) {
    throw new AviationstackError(503, "Add AVIATIONSTACK_ACCESS_KEY to .env.local, then restart the app.");
  }
  const url = new URL("https://api.apilayer.net/aviationstack/v1/flights");
  url.searchParams.set("access_key", accessKey.trim());
  url.searchParams.set(query.direction === "arr" ? "arr_iata" : "dep_iata", query.airport);
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", "0");

  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new AviationstackError(502, "Could not reach Aviationstack or the request timed out.");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AviationstackError(502, "Aviationstack returned an unreadable response.");
  }
  if (!response.ok || !isRecord(body)) {
    if (response.status === 401 || response.status === 403) throw new AviationstackError(503, "Aviationstack rejected the key or this endpoint is not available on your plan.");
    if (response.status === 429) throw new AviationstackError(503, "Aviationstack request limit reached. Check your account quota and try again later.");
    throw new AviationstackError(502, "Aviationstack could not complete this airport tracking request.");
  }
  if (body.error) {
    const error = record(body.error);
    const code = asText(error.code);
    if (code.includes("access_key") || code.includes("function_access_restricted")) {
      throw new AviationstackError(503, "Aviationstack rejected the key or this endpoint is not available on your plan.");
    }
    throw new AviationstackError(502, "Aviationstack could not complete this airport tracking request.");
  }
  if (!Array.isArray(body.data)) throw new AviationstackError(502, "Aviationstack returned an unexpected response.");
  const flights = body.data.filter(isRecord)
    .map((flight) => normalizeStatus(flight, query.direction))
    .filter((flight): flight is AirportFlightStatus => Boolean(flight))
    .sort((a, b) => (a.estimatedTime ?? a.actualTime ?? a.scheduledTime ?? "").localeCompare(b.estimatedTime ?? b.actualTime ?? b.scheduledTime ?? ""));
  return { airport: query.airport, direction: query.direction, checkedAt: new Date().toISOString(), flights };
};
