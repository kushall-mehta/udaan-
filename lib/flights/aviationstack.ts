import {airports} from "../../data/airports";
import {positionJourneyProgress} from "./journeyPosition";
import {airportLocalTimestamp, dateInTimezone, localWallClockMinutes} from "./airportTime";
import type {
    AirportDirection,
    AirportFlightStatus,
    AirportTrackingResponse,
    FlightTrackingResponse,
    FlightStopStatus,
} from "../../types/airport-tracking";

type Row = Record<string, unknown>;
export type AirportTrackingQuery = { airport: string; direction: AirportDirection; flightDate?: string };
export type FlightTrackingQuery = { flightNumber: string; origin?: string; destination?: string; flightDate?: string; scheduledDeparture?: string };

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
const facilityText = (value: unknown): string | null => typeof value === "number" && Number.isFinite(value) ? String(value) : optionalText(value);
const isDateOnly = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
};
// AviationStack supplies airport-local wall-clock values with a misleading +00:00 suffix.
export const aviationstackLocalTime = airportLocalTimestamp;
const normalizeStop = (stop: Row): FlightStopStatus => {
    return {
    airport: asText(stop.iata) || "—",
    timezone: optionalText(stop.timezone),
    scheduledTime: aviationstackLocalTime(stop.scheduled),
    estimatedTime: aviationstackLocalTime(stop.estimated),
    actualTime: aviationstackLocalTime(stop.actual),
    terminal: facilityText(stop.terminal),
    gate: facilityText(stop.gate),
    baggage: facilityText(stop.baggage),
    delayMinutes: asNumber(stop.delay),
    };
};
const normalizeFlightCode = (value: string): string => value.toUpperCase().replaceAll(/\s+/g, "");

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
    const dates = params.getAll("flightDate");
    if (dates.length > 1) throw new AviationstackError(400, "Supply flightDate only once.");
    const suppliedDate = dates[0] ?? null;
    const flightDate = suppliedDate ?? dateInTimezone(Date.now(), "Asia/Kolkata");
    if (!isDateOnly(flightDate)) throw new AviationstackError(400, "Supply a valid flight date in YYYY-MM-DD format.");
    return {airport, direction, flightDate};
};

export const validateFlightTracking = (params: URLSearchParams): FlightTrackingQuery => {
    if (params.getAll("flightNumber").length !== 1) throw new AviationstackError(400, "Supply flightNumber exactly once.");
    const flightNumber = (params.get("flightNumber") ?? "").toUpperCase().replaceAll(/\s+/g, "");
    if (!/^[A-Z0-9]{2,10}$/.test(flightNumber)) throw new AviationstackError(400, "Enter a valid flight number, such as AI101.");
    const departureTimes = params.getAll("scheduledDeparture");
    if (departureTimes.length > 1 || (departureTimes.length === 1 && !aviationstackLocalTime(departureTimes[0]))) throw new AviationstackError(400, "Supply a valid scheduled departure time.");
    const route: Record<string, string> = {};
    for (const field of ["origin", "destination"] as const) {
        const values = params.getAll(field);
        if (values.length > 1 || (values.length === 1 && !/^[A-Z]{3}$/i.test(values[0]))) throw new AviationstackError(400, `Supply a valid ${field} airport code.`);
        if (values.length) route[field] = values[0].toUpperCase();
    }
    const dates = params.getAll("flightDate");
    if (dates.length > 1 || (dates.length === 1 && !isDateOnly(dates[0]))) throw new AviationstackError(400, "Supply a valid flight date in YYYY-MM-DD format.");
    return {flightNumber, ...route, ...(dates.length ? {flightDate: dates[0]} : {}), ...(departureTimes.length ? {scheduledDeparture: aviationstackLocalTime(departureTimes[0])!} : {})};
};

const normalizeStatus = (flight: Row, direction: AirportDirection): AirportFlightStatus | null => {
    const airline = record(flight.airline);
    const flightInfo = record(flight.flight);
    const departure = record(flight.departure);
    const arrival = record(flight.arrival);
    const flightDate = asText(flight.flight_date);
    const flightNumber = asText(flightInfo.number) || asText(flightInfo.iata);
    const flightCode = asText(flightInfo.iata) || `${asText(airline.iata)}${flightNumber}`;
    if (!flightCode) return null;
    const flightId = [
        flightCode,
        flightDate,
        asText(departure.iata),
        asText(arrival.iata),
        asText(departure.scheduled),
        asText(departure.estimated),
        asText(departure.actual),
        asText(arrival.scheduled),
        asText(arrival.estimated),
        asText(arrival.actual),
    ].filter(Boolean).join("|");
    const departureStop = normalizeStop(departure);
    const arrivalStop = normalizeStop(arrival);
    const relevant = direction === "arr" ? arrivalStop : departureStop;
    const rawStatus = asText(flight.flight_status).toLowerCase();
    const status = rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : "Unknown";
    return {
        flightId,
        flightDate: /^\d{4}-\d{2}-\d{2}$/.test(flightDate) ? flightDate : null,
        airline: asText(airline.name) || "Airline not supplied",
        airlineCode: asText(airline.iata) || asText(flightInfo.iata).slice(0, 2),
        flightNumber: flightNumber || "—",
        origin: asText(departure.iata) || "—",
        destination: asText(arrival.iata) || "—",
        status,
        scheduledTime: relevant.scheduledTime,
        estimatedTime: relevant.estimatedTime,
        actualTime: relevant.actualTime,
        terminal: facilityText(relevant.terminal),
        gate: facilityText(relevant.gate),
        baggage: direction === "arr" ? facilityText(arrival.baggage) : null,
        delayMinutes: relevant.delayMinutes,
        departure: departureStop,
        arrival: arrivalStop,
        source: "Aviationstack",
        positionProgress: positionJourneyProgress(asText(departure.iata), asText(arrival.iata), record(flight.live)),
    };
};

const uniqueFlights = (flights: AirportFlightStatus[]): AirportFlightStatus[] =>
    [...new Map(flights.map((flight) => [flight.flightId, flight])).values()];

const matchesFlightCode = (flight: Row, expectedCode: string): boolean => {
    const airline = record(flight.airline);
    const flightInfo = record(flight.flight);
    const iataCode = normalizeFlightCode(asText(flightInfo.iata));
    const composedCode = normalizeFlightCode(`${asText(airline.iata)}${asText(flightInfo.number)}`);
    return iataCode === expectedCode || composedCode === expectedCode;
};

const requestBody = async (url: URL, fetcher: typeof fetch, timeout = 20_000): Promise<Row & { data: Row[] }> => {
    let response: Response;
    try {
        response = await fetcher(url, {cache: "no-store", signal: AbortSignal.timeout(timeout)});
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

    const rows: Row[] = [];
    const seenPages = new Set<string>();
    const deadline = Date.now() + 45_000;
    let warning: string | undefined;
    // Follow the provider's pagination, rather than treating its first 100 rows as the whole board.
    for (let page = 0, offset = 0; page < 20; page++) {
        if (Date.now() >= deadline) {
            warning = "The airport board is incomplete because loading took too long. Refresh to try again.";
            break;
        }
        url.searchParams.set("offset", String(offset));
        let body: Row & {data: Row[]};
        try {
            body = await requestBody(url, fetcher, Math.max(1, Math.min(20_000, deadline - Date.now())));
        } catch (error) {
            if (!rows.length) throw error;
            warning = "Some airport records could not be loaded. These results are incomplete; refresh to try again.";
            break;
        }
        if (!body.data.length) break;
        const signature = JSON.stringify(body.data);
        if (seenPages.has(signature)) {
            warning = "The provider repeated a results page. Some flights may be missing.";
            break;
        }
        seenPages.add(signature);
        rows.push(...body.data);
        const pagination = record(body.pagination);
        const total = asNumber(pagination.total);
        offset += body.data.length;
        if (total !== null ? offset >= total : body.data.length < 100) break;
        if (page === 19) warning = "The provider returned a large board. Only the first 2,000 records were loaded; some flights may be missing.";
    }
    const flights = uniqueFlights(rows
        .map((flight) => normalizeStatus(flight, query.direction))
        .filter((flight): flight is AirportFlightStatus => Boolean(flight))
        .filter((flight) => flight.flightDate === (query.flightDate ?? dateInTimezone(Date.now(), (query.direction === "arr" ? flight.arrival.timezone : flight.departure.timezone) || "Asia/Kolkata")))
        .sort((a, b) => (localWallClockMinutes(a.scheduledTime) ?? 0) - (localWallClockMinutes(b.scheduledTime) ?? 0)));
    return {airport: query.airport, direction: query.direction, flightDate: query.flightDate, checkedAt: new Date().toISOString(), flights, ...(warning ? {warning} : {})};
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
    const expectedCode = normalizeFlightCode(query.flightNumber);
    const selectedDate = query.flightDate;
    const matchingRows = body.data.filter((flight) => matchesFlightCode(flight, expectedCode)
        && (!query.origin || asText(record(flight.departure).iata).toUpperCase() === query.origin)
        && (!query.destination || asText(record(flight.arrival).iata).toUpperCase() === query.destination));
    const defaultTimezone = asText(record(record(matchingRows[0]).departure).timezone) || "Asia/Kolkata";
    const targetDate = selectedDate ?? dateInTimezone(Date.now(), defaultTimezone);
    const targetDayStart = localWallClockMinutes(`${targetDate}T00:00:00`)!;
    const flights = uniqueFlights(body.data
        .filter((flight) => matchesFlightCode(flight, expectedCode))
        .filter((flight) => (!query.origin || asText(record(flight.departure).iata).toUpperCase() === query.origin)
            && (!query.destination || asText(record(flight.arrival).iata).toUpperCase() === query.destination))
        .filter((flight) => {
            const date = asText(flight.flight_date);
            const timezone = asText(record(flight.departure).timezone) || "Asia/Kolkata";
            return date === (selectedDate ?? dateInTimezone(Date.now(), timezone));
        })
        .filter((flight) => query.scheduledDeparture
            ? normalizeStop(record(flight.departure)).scheduledTime?.slice(0, 16) === query.scheduledDeparture.slice(0, 16)
            : true)
        .map((flight) => normalizeStatus(flight, "dep"))
        .filter((flight): flight is AirportFlightStatus => Boolean(flight))
        .sort((a, b) => {
            const aSchedule = localWallClockMinutes(a.departure.scheduledTime);
            const bSchedule = localWallClockMinutes(b.departure.scheduledTime);
            const aDistance = aSchedule === null ? Number.MAX_SAFE_INTEGER : Math.abs(aSchedule - targetDayStart);
            const bDistance = bSchedule === null ? Number.MAX_SAFE_INTEGER : Math.abs(bSchedule - targetDayStart);
            return aDistance - bDistance || (aSchedule ?? Number.MAX_SAFE_INTEGER) - (bSchedule ?? Number.MAX_SAFE_INTEGER);
        }));
    return {flightNumber: query.flightNumber, flightDate: selectedDate ?? flights[0]?.flightDate ?? targetDate, checkedAt: new Date().toISOString(), flights: flights.slice(0, 1)};
};
