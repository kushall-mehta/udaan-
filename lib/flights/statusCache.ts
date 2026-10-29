import {AviationstackError, type FlightTrackingQuery} from "./aviationstack";
import type {FlightTrackingResponse} from "../../types/airport-tracking";

// Only expanded-card refreshes are cached. Initial flight searches keep their
// existing fresh-request behaviour. Shared refreshes avoid duplicate API credits.
export const createFlightStatusCache = (load: (query: FlightTrackingQuery) => Promise<FlightTrackingResponse>, now: () => number = Date.now, cacheKey?: (query: FlightTrackingQuery) => string) => {
    type Entry = {expiresAt: number; promise: Promise<FlightTrackingResponse>};
    const entries = new Map<string, Entry>();
    return (query: FlightTrackingQuery): Promise<FlightTrackingResponse> => {
        if (!query.scheduledDeparture && !query.flightDate && !cacheKey) return load(query);
        const key = cacheKey ? cacheKey(query) : `${query.flightNumber}|${query.flightDate ?? ""}|${query.origin ?? ""}|${query.destination ?? ""}|${query.scheduledDeparture?.slice(0, 16) ?? ""}`;
        const existing = entries.get(key);
        if (existing && existing.expiresAt > now()) return existing.promise;
        for (const [name, entry] of entries) if (entry.expiresAt <= now()) entries.delete(name);
        if (entries.size >= 128) return Promise.reject(new AviationstackError(503, "Status refresh is busy. Please try again shortly."));
        const entry: Entry = {expiresAt: Infinity, promise: Promise.resolve().then(() => load(query))};
        entry.promise = entry.promise.then((result) => { entry.expiresAt = now() + 60_000; return result; }, (error: unknown) => { entry.expiresAt = now() + 5000; throw error; });
        entries.set(key, entry);
        return entry.promise;
    };
};
