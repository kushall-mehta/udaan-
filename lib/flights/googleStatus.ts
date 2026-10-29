import {getSerpFlightTracking, indiaDate} from "./serpapi";
import {createFlightStatusCache} from "./statusCache";

// Explicit flight lookups and details share cached checks by flight/date.
export const getGoogleStatus = createFlightStatusCache(
    (query) => getSerpFlightTracking(query, process.env.SERPAPI_API_KEY || ""),
    Date.now,
    (query) => `${query.flightNumber}|${query.flightDate ?? indiaDate(new Date().toISOString())}|${query.origin ?? ""}|${query.destination ?? ""}`,
);
