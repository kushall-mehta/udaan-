import {airports} from "../../data/airports";
import type {CabinClass, FlightSearchQuery} from "../../types/flight";

export class FlightApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = "FlightApiError";
    }
}

export const indiaDate = (date = new Date()): string =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);

const airportCodes = new Set(airports.map((airport) => airport.code));
const cabins: CabinClass[] = ["Economy", "Premium_Economy", "Business", "First"];

const parseDate = (value: string, label: string): Date => {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new FlightApiError(400, `Choose a valid ${label} date in YYYY-MM-DD format.`);
    }
    return parsed;
};

export const validateFlightSearch = (params: URLSearchParams, now = new Date()): FlightSearchQuery => {
    for (const field of ["origin", "destination", "date", "departureDate", "returnDate", "adults", "children", "infants", "cabin", "mode", "refresh"]) {
        if (params.getAll(field).length > 1) throw new FlightApiError(400, `Supply ${field} only once.`);
    }
    if (params.has("refresh") && params.get("refresh") !== "true") throw new FlightApiError(400, "refresh must be true when supplied.");
    if (params.has("mode") && params.get("mode") !== "flightapi") {
        throw new FlightApiError(400, "This endpoint supports FlightAPI searches.");
    }
    const origin = (params.get("origin") || "").trim().toUpperCase();
    const destination = (params.get("destination") || "").trim().toUpperCase();
    if (!airportCodes.has(origin) || !airportCodes.has(destination)) {
        throw new FlightApiError(400, "Choose origin and destination codes from the Indian airport list.");
    }
    if (origin === destination) throw new FlightApiError(400, "Departure and destination must be different.");
    if (params.has("date") && params.has("departureDate") && params.get("date") !== params.get("departureDate")) {
        throw new FlightApiError(400, "date and departureDate must agree when both are supplied.");
    }
    const date = params.get("date") || params.get("departureDate") || "";
    const departure = parseDate(date, "departure");
    const limit = new Date(now.getTime() + 365 * 86_400_000);
    if (date < indiaDate(now) || date > indiaDate(limit)) {
        throw new FlightApiError(400, "Choose a departure date between today and one year from today.");
    }
    const returnDate = params.get("returnDate") || "";
    if (returnDate) {
        const inbound = parseDate(returnDate, "return");
        if (inbound < departure || returnDate > indiaDate(limit)) {
            throw new FlightApiError(400, "Return must be on or after departure and within the next year.");
        }
    }
    const adults = params.get("adults") ?? "1";
    const children = params.get("children") ?? "0";
    const infants = params.get("infants") ?? "0";
    if (!/^[1-9]$/.test(adults) || !/^[0-9]$/.test(children) || !/^[0-9]$/.test(infants) || Number(adults) + Number(children) > 9 || Number(infants) > Number(adults)) {
        throw new FlightApiError(400, "Choose 1–9 adults, up to 9 adults and children combined, and no more infants than adults.");
    }
    const cabin = params.get("cabin") || "Economy";
    if (!cabins.includes(cabin as CabinClass)) throw new FlightApiError(400, "Choose a supported cabin class.");
    return {
        origin,
        destination,
        date,
        adults,
        children,
        infants,
        cabin: cabin as CabinClass, ...(returnDate ? {returnDate} : {})
    };
};
