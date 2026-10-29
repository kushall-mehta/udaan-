import {AviationstackError, type FlightTrackingQuery} from "./aviationstack";
import {airportLocalTimestamp, dateInTimezone} from "./airportTime";
import type {AirportFlightStatus, FlightStopStatus, FlightTrackingResponse} from "../../types/airport-tracking";

type Row = Record<string, unknown>;
const record = (value: unknown): Row => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const code = (value: unknown) => text(value).toUpperCase().replaceAll(/\s+/g, "");
const facility = (value: unknown) => typeof value === "number" ? String(value) : ["", "-", "N/A"].includes(text(value)) ? null : text(value);
// Flight event times are airport-local wall clocks; updated_at remains a real instant.
const timestamp = airportLocalTimestamp;
const instantTimestamp = (value: unknown) => {
    const result = text(value);
    return /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(result) && Number.isFinite(Date.parse(result)) ? new Date(Date.parse(result)).toISOString() : null;
};
export const indiaDate = (value: string) => dateInTimezone(new Date(value), "Asia/Kolkata");
const statusName = (value: string): string => {
    if (/CANCEL/i.test(value)) return "Cancelled";
    if (/DIVERT/i.test(value)) return "Diverted";
    if (/ARRIVED|LANDED/i.test(value)) return "Landed";
    if (/IN[_ ]?FLIGHT|EN[_ ]?ROUTE|AIRBORNE|DEPARTED|ARRIVING/i.test(value)) return "Active";
    if (/DELAY/i.test(value)) return "Delayed";
    if (/SCHEDULED|DEPARTING/i.test(value)) return "Scheduled";
    return "Unknown";
};
const stop = (value: Row, delay: unknown): FlightStopStatus => {
    const phase = text(value.status);
    const reported = timestamp(value.time);
    const confirmed = /^(arrived|landed|departed)\b/i.test(phase);
    return {
        airport: code(value.id) || "—", scheduledTime: timestamp(value.scheduled_time),
        timezone: text(value.timezone) || null,
        actualTime: confirmed ? reported : null,
        estimatedTime: confirmed ? null : reported,
        terminal: facility(value.terminal), gate: facility(value.gate), baggage: facility(value.baggage ?? value.baggage_belt),
        delayMinutes: typeof delay === "number" && Number.isFinite(delay) ? delay : null,
    };
};

export const normalizeSerpFlight = (body: unknown, expected: string, date: string): AirportFlightStatus[] => {
    const block = record(record(body).flight_result);
    const dates = Array.isArray(block.dates) ? block.dates.map(record) : [];
    const flights: AirportFlightStatus[] = [];
    for (const item of dates) {
        if (text(item.date) !== date) continue;
        const metadata = record(item.metadata);
        const designator = code(item.flight_designator) || code(block.flight_designator)
            || `${code(block.airline_iata_code ?? metadata.airline_iata_code)}${code(metadata.flight_number)}`;
        if (designator !== code(expected)) continue;
        const dep = record(item.departure_airport), arr = record(item.arrival_airport);
        if (!Object.keys(dep).length || !Object.keys(arr).length) continue;
        const departure = stop(dep, metadata.departure_delay), arrival = stop(arr, metadata.arrival_delay);
        const match = designator.match(/^([A-Z0-9]{2})(\d+[A-Z]?)$/);
        if (!match) continue;
        flights.push({
            flightId: [designator, date, departure.airport, arrival.airport, departure.scheduledTime].join("|"),
            flightDate: date,
            airline: text(block.airline) || "Airline not supplied", airlineCode: match[1], flightNumber: match[2],
            origin: departure.airport, destination: arrival.airport,
            status: statusName(text(item.status) || text(metadata.status)),
            scheduledTime: departure.scheduledTime, estimatedTime: departure.estimatedTime, actualTime: departure.actualTime,
            terminal: departure.terminal, gate: departure.gate, baggage: null, delayMinutes: departure.delayMinutes,
            departure, arrival, positionProgress: null, source: "Google via SerpApi", sourceUpdatedAt: instantTimestamp(item.updated_at),
        });
    }
    return [...new Map(flights.map((flight) => [flight.flightId, flight])).values()];
};

export const getSerpFlightTracking = async (query: FlightTrackingQuery, key: string, fetcher: typeof fetch = fetch): Promise<FlightTrackingResponse> => {
    if (!key.trim()) throw new AviationstackError(503, "Add SERPAPI_API_KEY to .env.local and restart the app.");
    const checkedAt = new Date().toISOString();
    const date = query.flightDate || indiaDate(checkedAt);
    const url = new URL("https://serpapi.com/search.json");
    for (const [name, value] of Object.entries({engine: "google", q: `${query.flightNumber} flight status ${date}`, api_key: key.trim(), hl: "en", gl: "in", google_domain: "google.co.in", no_cache: "true"})) url.searchParams.set(name, value);
    let response: Response;
    let body: Row;
    try {
        response = await fetcher(url, {cache: "no-store", signal: AbortSignal.timeout(30_000)});
        body = record(await response.json());
    } catch {
        throw new AviationstackError(502, "Could not reach SerpApi or read its response. Try again later.");
    }
    if (response.status === 401 || response.status === 403) throw new AviationstackError(503, "SerpApi rejected the key or account access. Check the SerpApi dashboard.");
    if (response.status === 429) throw new AviationstackError(503, "SerpApi's search limit was reached. Check the account quota and try later.");
    if (!response.ok || body.error) throw new AviationstackError(502, "SerpApi could not complete this flight-status search.");
    return {flightNumber: query.flightNumber, flightDate: date, checkedAt, flights: normalizeSerpFlight(body, query.flightNumber, date), source: "Google via SerpApi"};
};
