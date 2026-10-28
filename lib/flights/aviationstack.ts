import {airports} from "../../data/airports";
import type {
    AirportDirection,
    AirportFlightStatus,
    AirportFlightTrack,
    AirportTrackingResponse,
    FlightTrackingResponse,
    TrackedPosition,
} from "../../types/airport-tracking";

type Row = Record<string, unknown>;
export type AirportTrackingQuery = { airport: string; direction: AirportDirection };
export type FlightTrackingQuery = { flightNumber: string };

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

const providerError = (body: unknown): AviationstackError | null => {
    if (!isRecord(body) || !body.error) return null;
    const error = record(body.error);
    const code = String(error.code ?? "").toLowerCase();
    const type = asText(error.type).toLowerCase();
    if (code === "101" || code.includes("access_key") || type.includes("access_key")) {
        return new AviationstackError(503, "Aviationstack rejected the access key. Check that AVIATIONSTACK_ACCESS_KEY is copied from the Aviationstack dashboard, then restart the app.");
    }
    if (code === "102" || code.includes("inactive_user") || type.includes("inactive_user")) {
        return new AviationstackError(503, "The Aviationstack account is inactive or blocked. Check the account dashboard.");
    }
    if (code === "104" || code.includes("limit_reached") || code.includes("rate_limit") || type.includes("limit_reached") || type.includes("rate_limit")) {
        return new AviationstackError(503, "Aviationstack's request limit was reached. Check the account quota and try again later.");
    }
    if (code === "105" || code.includes("function_access_restricted") || type.includes("function_access_restricted")) {
        return new AviationstackError(503, "The Aviationstack account plan does not allow this flights endpoint. Check the plan in the dashboard.");
    }
    return new AviationstackError(502, "Aviationstack returned an API error. Check the account dashboard and server logs.");
};

export const validateAirportTracking = (params: URLSearchParams): AirportTrackingQuery => {
    for (const field of ["airport", "direction"]) {
        if (params.getAll(field).length !== 1) throw new AviationstackError(400, `Supply ${field} exactly once.`);
    }
    const airport = (params.get("airport") ?? "").trim().toUpperCase();
    if (!airports.some((item) => item.code === airport)) throw new AviationstackError(400, "Choose an airport from the Indian airport list.");
    const direction = params.get("direction");
    if (direction !== "arr" && direction !== "dep") throw new AviationstackError(400, "Choose arrivals or departures.");
    return {airport, direction};
};

export const validateFlightTracking = (params: URLSearchParams): FlightTrackingQuery => {
    if (params.getAll("flightNumber").length !== 1) throw new AviationstackError(400, "Supply flightNumber exactly once.");
    const flightNumber = (params.get("flightNumber") ?? "").toUpperCase().replaceAll(/\s+/g, "");
    if (!/^[A-Z0-9]{2,10}$/.test(flightNumber)) throw new AviationstackError(400, "Enter a valid flight number, such as AI101.");
    return {flightNumber};
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
        track = {flightId, positions: [position]};
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

const requestBody = async (url: URL, fetcher: typeof fetch): Promise<Row & { data: Row[] }> => {
    let response: Response;
    try {
        response = await fetcher(url, {cache: "no-store", signal: AbortSignal.timeout(20_000)});
    } catch {
        throw new AviationstackError(502, "Could not reach Aviationstack or the request timed out.");
    }
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new AviationstackError(502, "Aviationstack returned an unreadable response.");
    }
    const mappedError = providerError(body);
    if (mappedError) throw mappedError;
    if (!response.ok || !isRecord(body)) {
        if (response.status === 401) throw new AviationstackError(503, "Aviationstack rejected the access key. Check the key in the dashboard and restart the app.");
        if (response.status === 403) throw new AviationstackError(503, "Aviationstack denied access to this endpoint. Check the account plan in the dashboard.");
        if (response.status === 429) throw new AviationstackError(503, "Aviationstack request limit reached. Check your account quota and try again later.");
        throw new AviationstackError(502, "Aviationstack could not complete this airport tracking request.");
    }
    if (!Array.isArray(body.data)) throw new AviationstackError(502, "Aviationstack returned an unexpected response.");
    return {...body, data: body.data.filter(isRecord)};
};

const hasAccessKey = (accessKey: string): void => {
    if (!accessKey.trim() || /^(your[_ -]?.*|replace.*)$/i.test(accessKey.trim())) {
        throw new AviationstackError(503, "Add AVIATIONSTACK_ACCESS_KEY to .env.local, then restart the app.");
    }
};

export const getAirportTracking = async (
    query: AirportTrackingQuery,
    accessKey: string,
    fetcher: typeof fetch = fetch,
): Promise<AirportTrackingResponse> => {
    hasAccessKey(accessKey);
    const url = new URL("https://api.aviationstack.com/v1/flights");
    url.searchParams.set("access_key", accessKey.trim());
    url.searchParams.set(query.direction === "arr" ? "arr_iata" : "dep_iata", query.airport);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", "0");

    const body = await requestBody(url, fetcher);
    const flights = body.data
        .map((flight) => normalizeStatus(flight, query.direction))
        .filter((flight): flight is AirportFlightStatus => Boolean(flight))
        .sort((a, b) => (a.estimatedTime ?? a.actualTime ?? a.scheduledTime ?? "").localeCompare(b.estimatedTime ?? b.actualTime ?? b.scheduledTime ?? ""));
    return {airport: query.airport, direction: query.direction, checkedAt: new Date().toISOString(), flights};
};

export const getFlightTracking = async (
    query: FlightTrackingQuery,
    accessKey: string,
    fetcher: typeof fetch = fetch,
): Promise<FlightTrackingResponse> => {
    hasAccessKey(accessKey);
    const url = new URL("https://api.aviationstack.com/v1/flights");
    url.searchParams.set("access_key", accessKey.trim());
    url.searchParams.set("flight_iata", query.flightNumber);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", "0");
    const body = await requestBody(url, fetcher);
    const flights = body.data
        .map((flight) => normalizeStatus(flight, "arr"))
        .filter((flight): flight is AirportFlightStatus => Boolean(flight))
        .sort((a, b) => (a.estimatedTime ?? a.actualTime ?? a.scheduledTime ?? "").localeCompare(b.estimatedTime ?? b.actualTime ?? b.scheduledTime ?? ""));
    return {flightNumber: query.flightNumber, checkedAt: new Date().toISOString(), flights};
};
