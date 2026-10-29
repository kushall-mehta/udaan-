import airportCoordinates from "../../data/airport-coordinates.json";

type Point = readonly number[];
const coordinates: Readonly<Record<string, Point>> = airportCoordinates;
const radians = (degrees: number) => degrees * Math.PI / 180;
const distance = (a: Point, b: Point): number => {
    const latitude = radians(b[0] - a[0]);
    const longitude = radians(b[1] - a[1]);
    const h = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(longitude / 2) ** 2;
    return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, h))), Math.sqrt(Math.max(0, 1 - h)));
};

export const positionJourneyProgress = (origin: string, destination: string, live: Record<string, unknown>): {percent: number; reportedAt: string} | null => {
    const start = coordinates[origin];
    const end = coordinates[destination];
    const {latitude, longitude, updated} = live;
    if (!start || !end || typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || typeof updated !== "string" || !Number.isFinite(Date.parse(updated))) return null;
    const point = [latitude, longitude];
    const travelled = distance(start, point);
    const remaining = distance(point, end);
    const route = distance(start, end);
    // Reject implausible/off-route positions rather than showing unrelated data.
    if (route < 1000 || travelled + remaining > Math.max(route * 1.75, route + 200_000)) return null;
    return {percent: Math.max(0, Math.min(99, 100 * travelled / (travelled + remaining))), reportedAt: updated};
};
