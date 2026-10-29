import type {AirportDirection, AirportFlightStatus, FlightStopStatus} from "../../types/airport-tracking";
import {localNowMinutes, localWallClockMinutes} from "./airportTime";

const fallbackZone = "Asia/Kolkata";
export const stopTime = (stop: FlightStopStatus) => stop.actualTime ?? stop.estimatedTime ?? stop.scheduledTime;
export const stopTimeLabel = (stop: FlightStopStatus) => stop.actualTime ? "Actual" : stop.estimatedTime ? "Estimated" : "Scheduled";

export const resolvedFlightStatus = (flight: AirportFlightStatus, now?: number): {status: string; warning?: string} => {
    const status = flight.status.toLowerCase();
    if (["cancelled", "diverted", "incident"].includes(status)) return {status: flight.status};
    const arrival = localWallClockMinutes(flight.arrival.actualTime);
    const departure = localWallClockMinutes(flight.departure.actualTime);
    const departureNow = typeof now === "number" ? localNowMinutes(now, flight.departure.timezone || fallbackZone) : null;
    const arrivalNow = typeof now === "number" ? localNowMinutes(now, flight.arrival.timezone || fallbackZone) : null;
    if (departure !== null && departureNow !== null && departure > departureNow) return {
        status: "Unconfirmed",
        warning: "The provider reports an actual departure later than this record was checked. The flight timeline is inconsistent; departure status is unconfirmed.",
    };
    if (arrival !== null && arrivalNow !== null) {
        const sameZone = (flight.departure.timezone || fallbackZone) === (flight.arrival.timezone || fallbackZone);
        if (arrival > arrivalNow || (sameZone && departure !== null && arrival < departure)) return {
            status: "Unconfirmed",
            warning: "The provider's actual arrival time conflicts with the flight timeline. Status is unconfirmed; check with the airline.",
        };
        return {status: "Landed"};
    }
    return {status: flight.status};
};

export const airportBoardStatus = (flight: AirportFlightStatus, direction: AirportDirection, now: number): string => {
    const {status} = resolvedFlightStatus(flight, now);
    if (direction === "arr") return status === "Landed" || status === "Arrived" ? "Arrived" : status === "Active" ? "In flight" : status;
    if (["Cancelled", "Diverted", "Incident", "Unconfirmed"].includes(status)) return status;
    const departed = localWallClockMinutes(flight.departure.actualTime);
    const departureNow = localNowMinutes(now, flight.departure.timezone || fallbackZone);
    if ((departed !== null && departureNow !== null && departed <= departureNow) || ["Active", "Landed", "Arrived"].includes(status)) return "Departed";
    return status;
};

export type JourneyProgress = {percent: number | null; source: "position" | "time" | "status" | "unavailable"; note: string};
export const flightJourneyProgress = (flight: AirportFlightStatus, now: number, checkedAt = now): JourneyProgress => {
    const resolved = resolvedFlightStatus(flight, checkedAt);
    const status = resolved.status.toLowerCase();
    if (resolved.warning) return {percent: null, source: "unavailable", note: resolved.warning};
    if (status === "landed" || status === "arrived") return {percent: 100, source: "status", note: "Arrival confirmed by the provider."};
    if (status === "cancelled" || status === "diverted") return {percent: null, source: "unavailable", note: "Journey completion is unavailable for this flight status."};
    const position = flight.positionProgress;
    if (position && Number.isFinite(position.percent)) {
        const age = now - Date.parse(position.reportedAt);
        if (Number.isFinite(age) && age >= -30_000 && age <= 5 * 60_000 && (status === "active" || flight.departure.actualTime)) {
            const ageText = age >= 60_000 ? `${Math.floor(age / 60_000)} min` : `${Math.max(0, Math.floor(age / 1000))} sec`;
            return {percent: Math.max(0, Math.min(99, position.percent)), source: "position", note: `Position reported ${ageText} ago; completion is approximate and the flown route may vary.`};
        }
    }
    if ((status === "scheduled" || status === "delayed") && !flight.departure.actualTime) return {percent: 0, source: "status", note: "Awaiting a reported departure."};
    const zone = flight.departure.timezone || fallbackZone;
    const arrivalZone = flight.arrival.timezone || fallbackZone;
    const start = localWallClockMinutes(stopTime(flight.departure));
    const end = localWallClockMinutes(stopTime(flight.arrival));
    const current = localNowMinutes(now, zone);
    if (zone !== arrivalZone || start === null || end === null || current === null || end <= start || start > current || (status !== "active" && !flight.departure.actualTime)) return {percent: null, source: "unavailable", note: "Waiting for consistent local departure and arrival times or a fresh aircraft position."};
    return {percent: Math.max(0, Math.min(99, 100 * (current - start) / (end - start))), source: "time", note: current >= end ? "Estimated arrival time has passed; awaiting arrival confirmation." : "Estimated from elapsed flight time; live aircraft coordinates are unavailable or outdated."};
};

export const matchingFlightLeg = (original: AirportFlightStatus, candidates: AirportFlightStatus[]): AirportFlightStatus | null => {
    const ranks: Record<string, number> = {landed: 100, arrived: 100, cancelled: 90, diverted: 90, active: 70, delayed: 50, scheduled: 20};
    const score = (flight: AirportFlightStatus) => ranks[flight.status.toLowerCase()] ?? 0;
    const sameRoute = candidates.filter((candidate) => candidate.airlineCode === original.airlineCode && candidate.flightNumber === original.flightNumber && candidate.origin === original.origin && candidate.destination === original.destination);
    const exact = sameRoute.filter((candidate) => original.departure.scheduledTime
        ? candidate.departure.scheduledTime?.slice(0, 16) === original.departure.scheduledTime.slice(0, 16)
            && candidate.flightDate === original.flightDate
        : candidate.flightId === original.flightId).sort((a, b) => score(b) - score(a))[0] ?? null;
    if (exact) return exact;
    if (original.source === "Google via SerpApi" || !original.departure.scheduledTime) return null;
    const corrected = sameRoute.filter((candidate) => candidate.source === "Google via SerpApi" && candidate.flightDate === original.flightDate);
    return corrected.length === 1 ? corrected[0] : null;
};

const delayAt = (stop: FlightStopStatus): number | null => {
    const time = stop.actualTime ?? stop.estimatedTime;
    if (time && stop.scheduledTime) {
        const actualMinutes = localWallClockMinutes(time);
        const scheduledMinutes = localWallClockMinutes(stop.scheduledTime);
        if (actualMinutes !== null && scheduledMinutes !== null) return actualMinutes - scheduledMinutes;
    }
    return stop.delayMinutes;
};
const duration = (minutes: number) => {
    const value = Math.abs(Math.round(minutes));
    return [value >= 60 ? `${Math.floor(value / 60)} hr` : "", value % 60 ? `${value % 60} min` : ""].filter(Boolean).join(" ");
};
const timing = (delay: number) => delay === 0 ? "on time" : `${duration(delay)} ${delay > 0 ? "late" : "early"}`;

export const summarizeFlightStatus = (flight: AirportFlightStatus, now?: number): {
    label: string; message: string; tone: "arrived" | "active" | "delayed" | "cancelled" | "neutral";
} => {
    const resolved = resolvedFlightStatus(flight, now);
    const status = resolved.status.toLowerCase();
    if (resolved.warning) return {label: "Status unconfirmed", message: resolved.warning, tone: "neutral"};
    const arrivalDelay = delayAt(flight.arrival);
    const departureDelay = delayAt(flight.departure);
    if (status === "landed" || status === "arrived") return {label: "Arrived", message: arrivalDelay === null ? "Arrival reported" : `Arrived ${timing(arrivalDelay)}`, tone: "arrived"};
    if (status === "cancelled") return {label: "Cancelled", message: "Check with the airline for updates", tone: "cancelled"};
    if (status === "diverted") return {label: "Diverted", message: "Check the destination with the airline", tone: "cancelled"};
    if (status === "active") return {label: "In flight", message: arrivalDelay === null ? "Departure reported; arrival not confirmed" : `Arrival expected ${timing(arrivalDelay)}`, tone: arrivalDelay !== null && arrivalDelay > 0 ? "delayed" : "active"};
    if (status === "delayed" || (departureDelay !== null && departureDelay > 0)) return {label: "Delayed", message: departureDelay !== null && departureDelay > 0 ? `Departure ${timing(departureDelay)}` : "Awaiting an updated departure time", tone: "delayed"};
    return {label: status === "scheduled" ? "Scheduled" : flight.status, message: status === "scheduled" ? "Awaiting departure" : "Latest reported flight status", tone: "neutral"};
};
