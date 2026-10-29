import type {AirportFlightStatus} from "../../types/airport-tracking";

const wallClockPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;
type WallClock = {year: number; month: number; day: number; hour: number; minute: number; second: number};

const wallClock = (value: unknown): WallClock | null => {
    if (typeof value !== "string") return null;
    const match = wallClockPattern.exec(value.trim());
    if (!match) return null;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] = match;
    const parts = {year: Number(yearText), month: Number(monthText), day: Number(dayText), hour: Number(hourText), minute: Number(minuteText), second: Number(secondText)};
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() + 1 !== parts.month || date.getUTCDate() !== parts.day
        || parts.hour > 23 || parts.minute > 59 || parts.second > 59) return null;
    return parts;
};

// AviationStack's schedule fields contain airport-local clock values with a misleading UTC offset.
// Keep their date and clock portion; never reinterpret them as instants.
export const airportLocalTimestamp = (value: unknown): string | null => wallClock(value) ? String(value).trim().slice(0, 19) : null;

export const localWallClockMinutes = (value: string | null): number | null => {
    const parts = wallClock(value);
    if (!parts) return null;
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) / 60_000;
};

export const formatAirportTime = (isoString: string | null): string => {
    if (!isoString || !wallClock(isoString)) return "—";
    const match = /T(\d{2}):(\d{2})/.exec(isoString);
    if (!match) return "—";
    const hour = Number(match[1]);
    const minute = match[2];
    return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
};

export const formatAirportDate = (value: string | null, long = false): string => {
    if (!value) return "Date unavailable";
    const parts = wallClock(value.includes("T") ? value : `${value}T00:00:00Z`);
    if (!parts) return "Date unavailable";
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const days = long ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = long ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getUTCDay()]}, ${parts.day} ${months[parts.month - 1]}`;
};

export const dateInTimezone = (instant: number | Date, timeZone = "Asia/Kolkata"): string =>
    new Intl.DateTimeFormat("en-CA", {timeZone, year: "numeric", month: "2-digit", day: "2-digit"}).format(instant);

export const localNowMinutes = (instant: number, timeZone = "Asia/Kolkata"): number | null => {
    if (!Number.isFinite(instant)) return null;
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date(instant));
        const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
        return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) / 60_000;
    } catch {
        return localNowMinutes(instant, "Asia/Kolkata");
    }
};

export const matchesAirportTime = (flight: Pick<AirportFlightStatus, "scheduledTime">, from: string, to: string): boolean => {
    if (!from && !to) return true;
    if (!flight.scheduledTime) return false;
    const match = /T(\d{2}):(\d{2})/.exec(flight.scheduledTime);
    if (!match) return false;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    const parse = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const start = from ? parse(from) : 0;
    const end = to ? parse(to) : 1439;
    return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
};
