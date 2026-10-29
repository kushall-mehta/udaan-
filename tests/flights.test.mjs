import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const compilation = mkdtempSync(join(tmpdir(), "udaan-api-test-"));
const removeTestDirectory = (directory) => {
  const target = resolve(directory);
  const isSystemTemp = target.startsWith(resolve(tmpdir()) + sep);
  const isWorkspaceCache = target.startsWith(resolve(project, ".cache") + sep);
  if ((!isSystemTemp && !isWorkspaceCache) || !basename(target).startsWith("udaan-api-test-")) {
    throw new Error("Refusing to remove a path outside this test's temporary directories.");
  }
  rmSync(target, { recursive: true, force: true });
};
after(() => removeTestDirectory(compilation));

// Compile only the pure server helpers to a temporary folder; Next.js handles
// the actual route build. No third-party test runner or live API key is needed.
execFileSync(process.execPath, [
  join(project, "node_modules/typescript/bin/tsc"),
  "--module", "commonjs", "--moduleResolution", "node", "--target", "ES2022",
  "--esModuleInterop", "--resolveJsonModule", "--skipLibCheck", "--strict", "--rootDir", project,
  "--outDir", compilation,
  join(project, "lib/flights/validation.ts"),
  join(project, "lib/flights/provider.ts"),
  join(project, "lib/flights/aviationstack.ts"),
  join(project, "lib/flights/search.ts"),
  join(project, "lib/flights/statusSummary.ts"),
  join(project, "lib/flights/statusCache.ts"),
  join(project, "lib/flights/airportTime.ts"),
  join(project, "lib/flights/serpapi.ts"),
], { cwd: project, stdio: "pipe" });
const require = createRequire(import.meta.url);
const { validateFlightSearch, FlightApiError } = require(join(compilation, "lib/flights/validation.js"));
const { normalizeFlightApi, requestFlightApi, flightBookingUrl } = require(join(compilation, "lib/flights/provider.js"));
const { getFlightTracking, getAirportTracking, validateFlightTracking, aviationstackLocalTime } = require(join(compilation, "lib/flights/aviationstack.js"));
const { createFlightSearch } = require(join(compilation, "lib/flights/search.js"));
const { stopTime, stopTimeLabel, summarizeFlightStatus, flightJourneyProgress, matchingFlightLeg, resolvedFlightStatus, airportBoardStatus } = require(join(compilation, "lib/flights/statusSummary.js"));
const { positionJourneyProgress } = require(join(compilation, "lib/flights/journeyPosition.js"));
const { createFlightStatusCache } = require(join(compilation, "lib/flights/statusCache.js"));
const { matchesAirportTime, formatAirportTime, formatAirportDate, localWallClockMinutes } = require(join(compilation, "lib/flights/airportTime.js"));
const { normalizeSerpFlight, getSerpFlightTracking, indiaDate } = require(join(compilation, "lib/flights/serpapi.js"));
const airportCoordinates = require(join(compilation, "data/airport-coordinates.json"));

test("airport timestamps display their local wall clock without applying the supplied offset", async () => {
  assert.equal(aviationstackLocalTime("2026-10-29T08:40:00+00:00"), "2026-10-29T08:40:00");
  assert.equal(formatAirportTime("2026-10-29T08:40:00+00:00"), "8:40 AM");
  assert.equal(formatAirportTime("2026-10-29T20:20:00+00:00"), "8:20 PM");
  assert.equal(formatAirportDate("2026-10-29T08:40:00+00:00", true), "Thursday, 29 October");
  assert.equal(localWallClockMinutes("2026-10-29T00:15:00+00:00") - localWallClockMinutes("2026-10-28T23:50:00+00:00"), 25, "date rollover uses wall-clock calendar fields");
  assert.equal(aviationstackLocalTime("invalid"), null);
  assert.equal(aviationstackLocalTime(null), null);
  const fetcher = async () => Response.json({data: [{flight_date: "2026-10-29", flight_status: "landed", flight: {iata: "6E2238", number: "2238"}, airline: {iata: "6E"}, departure: {iata: "LKO", timezone: "Asia/Kolkata", scheduled: "2026-10-29T11:10:00+00:00"}, arrival: {iata: "BOM", timezone: "Asia/Kolkata", scheduled: "2026-10-29T13:35:00+00:00"}}]});
  const board = await getAirportTracking({airport: "BOM", direction: "arr", flightDate: "2026-10-29"}, "test-key", fetcher);
  assert.equal(formatAirportTime(board.flights[0].scheduledTime), "1:35 PM");
  assert(matchesAirportTime(board.flights[0], "13:00", "14:00"));
  const refreshed = await getFlightTracking({flightNumber: "6E2238", flightDate: "2026-10-29", scheduledDeparture: board.flights[0].departure.scheduledTime}, "test-key", fetcher);
  assert.deepEqual(refreshed.flights[0].arrival, board.flights[0].arrival);
});

test("observed Google AI2872 result preserves Indian offsets and confirms its landed status", () => {
  const body = JSON.parse(readFileSync(join(project, "tests/fixtures/serp-ai2872.json"), "utf8"));
  const flights = normalizeSerpFlight(body, "AI2872", "2026-10-29");
  assert.equal(flights.length, 1);
  const flight = flights[0];
  assert.equal(flight.status, "Landed");
  assert.equal(flight.departure.scheduledTime, "2026-10-29T05:50:00");
  assert.equal(flight.departure.actualTime, "2026-10-29T05:34:00");
  assert.equal(flight.arrival.actualTime, "2026-10-29T07:13:00");
  assert.equal(flight.flightDate, "2026-10-29");
  assert.equal(formatAirportTime(flight.arrival.actualTime), "7:13 AM");
  assert.equal(flightJourneyProgress(flight, Date.parse("2026-10-29T12:00:00+05:30")).percent, 100);
  assert.equal(summarizeFlightStatus(flight).message, "Arrived 12 min early");
  assert.equal(flight.arrival.baggage, null);
  assert.equal(normalizeSerpFlight(body, "AI999", "2026-10-29").length, 0);
  assert.equal(normalizeSerpFlight(body, "AI2872", "2026-10-30").length, 0, "metadata-only dates must not become invented flight details");
  const original = {...flight, source: "Aviationstack", departure: {...flight.departure, scheduledTime: "2026-10-29T11:20:00+05:30"}};
  assert.equal(matchingFlightLeg(original, flights), flight, "provider replacement can correct the old schedule on the same day");
  assert.equal(matchingFlightLeg(original, [flight, {...flight, flightId: "second-leg"}]), null, "do not substitute ambiguous legs");
});

test("SerpApi uses server authentication, India locale and selected date without returning search metadata", async () => {
  assert.equal(indiaDate("2026-10-28T20:00:00Z"), "2026-10-29");
  const query = {flightNumber: "AI2872", origin: "HYD", destination: "BOM", flightDate: "2026-10-29", scheduledDeparture: "2026-10-29T11:20:00"};
  const result = await getSerpFlightTracking(query, "test-secret", async (url) => {
    assert.equal(url.origin, "https://serpapi.com");
    assert.equal(url.searchParams.get("api_key"), "test-secret");
    assert.equal(url.searchParams.get("engine"), "google");
    assert.equal(url.searchParams.get("gl"), "in");
    assert.equal(url.searchParams.get("no_cache"), "true");
    assert.match(url.searchParams.get("q"), /AI2872.*2026-10-29/);
    return Response.json({search_parameters: {api_key: "test-secret"}, organic_results: [{snippet: "landed"}]});
  });
  assert.equal(result.flights.length, 0, "search snippets are not a reliable flight-status record");
  assert(!JSON.stringify(result).includes("test-secret"));
  await assert.rejects(getSerpFlightTracking(query, "test-secret", async () => Response.json({error: "test-secret"}, {status: 429})), (error) => error.status === 503 && !error.message.includes("test-secret"));
});

test("airport windows use the scheduled IST time regardless of landed status or delayed actual time", () => {
  const landed = {scheduledTime: "2026-10-29T10:30:00+05:30", actualTime: "2026-10-29T15:00:00+05:30", status: "Landed"};
  assert(matchesAirportTime(landed, "10:00", "14:00"));
  assert(matchesAirportTime({...landed, status: "Active"}, "10:00", "14:00"));
  assert(!matchesAirportTime({scheduledTime: "2026-10-29T09:30:00+05:30", actualTime: landed.scheduledTime}, "10:00", "14:00"));
  assert(!matchesAirportTime({scheduledTime: "2026-10-29T04:30:00Z"}, "10:00", "14:00"));
  assert(matchesAirportTime({scheduledTime: "2026-10-29T10:30:00Z"}, "10:00", "14:00"));
  assert(matchesAirportTime({scheduledTime: "2026-10-29T14:00:00+05:30"}, "10:00", "14:00"));
  assert(matchesAirportTime({scheduledTime: "2026-10-29T01:00:00+05:30"}, "22:00", "02:00"));
  assert(!matchesAirportTime({scheduledTime: null}, "10:00", "14:00"));
  assert(matchesAirportTime({scheduledTime: null}, "", ""));
});

test("airport board follows provider pages and retains earlier landed flights in scheduled order", async () => {
  const calls = [];
  const rows = [
    {flight_date: "2026-10-29", flight_status: "active", flight: {iata: "6E200", number: "200"}, arrival: {iata: "AMD", timezone: "Asia/Kolkata", scheduled: "2026-10-29T14:00:00+00:00"}},
    {flight_date: "2026-10-29", flight_status: "landed", flight: {iata: "6E100", number: "100"}, arrival: {iata: "AMD", timezone: "Asia/Kolkata", scheduled: "2026-10-29T10:30:00+00:00", actual: "2026-10-29T15:00:00+00:00"}},
  ];
  const result = await getAirportTracking({airport: "AMD", direction: "arr", flightDate: "2026-10-29"}, "test-key", async (url) => {
    assert.equal(url.searchParams.has("flight_status"), false);
    assert.equal(url.searchParams.has("flight_date"), false);
    const offset = Number(url.searchParams.get("offset"));
    calls.push(offset);
    return Response.json({pagination: {total: 2, count: 1, limit: 1, offset}, data: [rows[offset]]});
  });
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(result.flights.map((flight) => flight.status), ["Landed", "Active"]);
  assert.equal(result.flights.filter((flight) => matchesAirportTime(flight, "10:00", "14:00")).length, 2);
  assert.equal(result.warning, undefined);
});

test("airport board warns instead of silently claiming completeness on a later page failure or repeated page", async () => {
  for (const repeat of [true, false]) {
    let calls = 0;
    const result = await getAirportTracking({airport: "AMD", direction: "arr", flightDate: "2026-10-29"}, "test-key", async () => {
      if (++calls > 1 && !repeat) throw new Error("network failure");
      return Response.json({pagination: {total: 5}, data: [{flight_date: "2026-10-29", flight: {iata: "6E100"}, arrival: {iata: "AMD"}}]});
    });
    assert.equal(calls, 2);
    assert.equal(result.flights.length, 1);
    assert(result.warning);
  }
});

const emptyStop = (changes = {}) => ({airport: "—", scheduledTime: null, estimatedTime: null, actualTime: null, terminal: null, gate: null, baggage: null, delayMinutes: null, ...changes});
const progressNow = Date.parse("2030-01-01T05:30:00Z");
const progressFlight = (changes = {}) => ({flightId: "progress-flight", airline: "IndiGo", airlineCode: "6E", flightNumber: "123", origin: "DEL", destination: "BOM", status: "Active", departure: emptyStop({scheduledTime: "2030-01-01T09:30:00Z", actualTime: "2030-01-01T10:00:00Z"}), arrival: emptyStop({scheduledTime: "2030-01-01T14:30:00Z", estimatedTime: "2030-01-01T15:00:00Z"}), ...changes});

test("reported actual arrival overrides a stale active flag in status and journey progress", () => {
  const flight = progressFlight({arrival: emptyStop({scheduledTime: "2030-01-01T10:55:00Z", actualTime: "2030-01-01T10:38:00Z"})});
  assert.equal(resolvedFlightStatus(flight, progressNow).status, "Landed");
  assert.equal(summarizeFlightStatus(flight, progressNow).label, "Arrived");
  assert.equal(summarizeFlightStatus(flight, progressNow).message, "Arrived 17 min early");
  assert.equal(flightJourneyProgress(flight, progressNow).percent, 100);
  assert.equal(resolvedFlightStatus({...flight, status: "Diverted"}, progressNow).status, "Diverted");
});

test("airport board status describes the selected airport event while details retain destination arrival status", () => {
  const flight = progressFlight({status: "Landed", arrival: emptyStop({actualTime: "2030-01-01T10:38:00Z"})});
  assert.equal(airportBoardStatus(flight, "dep", progressNow), "Departed");
  assert.equal(airportBoardStatus(flight, "arr", progressNow), "Arrived");
  assert.equal(summarizeFlightStatus(flight, progressNow).label, "Arrived");
  assert.equal(airportBoardStatus(progressFlight(), "dep", progressNow), "Departed");
  assert.equal(airportBoardStatus(progressFlight(), "arr", progressNow), "In flight");
  assert.equal(airportBoardStatus(progressFlight({status: "Cancelled"}), "dep", progressNow), "Cancelled");
});

test("future or impossible actual arrivals are flagged rather than shown as flying or completed", () => {
  for (const actualTime of ["2030-01-01T11:27:00Z", "2030-01-01T09:00:00Z"]) {
    const flight = progressFlight({arrival: emptyStop({actualTime})});
    assert.equal(resolvedFlightStatus(flight, progressNow).status, "Unconfirmed");
    assert.equal(summarizeFlightStatus(flight, progressNow).label, "Status unconfirmed");
    assert.equal(flightJourneyProgress(flight, progressNow).percent, null);
  }
  assert.equal(summarizeFlightStatus(progressFlight(), progressNow).label, "In flight");
});

test("SG671 future actual departure cannot be called in flight or departed, even after the local clock catches up", () => {
  const checked = Date.parse("2026-10-29T14:27:00+05:30");
  const flight = progressFlight({status: "Active", flightNumber: "671", airlineCode: "SG",
    departure: emptyStop({scheduledTime: "2026-10-29T12:30:00+05:30", actualTime: "2026-10-29T14:39:00+05:30"}),
    arrival: emptyStop({scheduledTime: "2026-10-29T14:45:00+05:30"})});
  assert.equal(summarizeFlightStatus(flight, checked).label, "Status unconfirmed");
  assert.equal(airportBoardStatus(flight, "arr", checked), "Unconfirmed");
  assert.equal(airportBoardStatus(flight, "dep", checked), "Unconfirmed");
  assert.equal(flightJourneyProgress(flight, checked).percent, null);
  assert.equal(flightJourneyProgress(flight, checked + 3600000, checked).percent, null, "a ticking UI clock must not validate a contradictory report without new data");
});
test("journey line reports twenty percent from actual departure and estimated arrival", () => {
  const progress = flightJourneyProgress(progressFlight(), progressNow);
  assert.equal(progress.percent, 20);
  assert.equal(progress.source, "time");
  assert(flightJourneyProgress(progressFlight(), progressNow + 60000).percent > 20);
});

test("fresh position progress takes priority and stale or future positions fall back to flight times", () => {
  const position = {percent: 37.5, reportedAt: "2030-01-01T05:29:00Z"};
  assert.equal(flightJourneyProgress(progressFlight({positionProgress: position}), progressNow).source, "position");
  assert.equal(flightJourneyProgress(progressFlight({positionProgress: position}), progressNow).percent, 37.5);
  for (const reportedAt of ["2030-01-01T04:50:00Z", "2030-01-01T06:00:00Z", "invalid"]) {
    const progress = flightJourneyProgress(progressFlight({positionProgress: {...position, reportedAt}}), progressNow);
    assert.equal(progress.source, "time");
    assert.equal(progress.percent, 20);
  }
});

test("progress handles landed, cancelled, predeparture, invalid timelines and overdue arrivals honestly", () => {
  assert.equal(flightJourneyProgress(progressFlight({status: "Landed"}), progressNow).percent, 100);
  assert.equal(flightJourneyProgress(progressFlight({status: "Cancelled"}), progressNow).percent, null);
  assert.equal(flightJourneyProgress(progressFlight({status: "Scheduled", departure: emptyStop()}), progressNow).percent, 0);
  assert.equal(flightJourneyProgress(progressFlight({arrival: emptyStop()}), progressNow).percent, null);
  assert.equal(flightJourneyProgress(progressFlight({departure: emptyStop({actualTime: "2030-01-01T12:00:00Z"})}), progressNow).percent, null);
  assert.equal(flightJourneyProgress(progressFlight(), Date.parse("2030-01-01T16:00:00Z")).percent, 99);
});

test("live aircraft position calculates route completion and rejects unrelated or invalid positions", () => {
  const start = airportCoordinates.DEL, end = airportCoordinates.BOM;
  const live = {latitude: start[0] + 0.2 * (end[0] - start[0]), longitude: start[1] + 0.2 * (end[1] - start[1]), updated: "2030-01-01T11:00:00Z"};
  const progress = positionJourneyProgress("DEL", "BOM", live);
  assert(progress.percent > 19 && progress.percent < 21);
  assert.equal(progress.reportedAt, live.updated);
  assert(airportCoordinates.IST, "International origins must be supported too");
  assert.equal(positionJourneyProgress("ZZZ", "BOM", live), null);
  assert.equal(positionJourneyProgress("DEL", "BOM", {...live, latitude: NaN}), null);
  assert.equal(positionJourneyProgress("DEL", "BOM", {...live, latitude: -40, longitude: -100}), null);
});

test("selected-leg refresh includes landed flights, preserves numeric belt details and does not request a paid date filter", async () => {
  const scheduled = "2026-10-28T10:00:00Z";
  const query = validateFlightTracking(new URLSearchParams({flightNumber: "6E123", flightDate: "2026-10-28", scheduledDeparture: scheduled}));
  const result = await getFlightTracking(query, "test-key", async (url) => {
    assert.equal(url.searchParams.has("flight_date"), false);
    return Response.json({data: [
      {flight_date: "2026-10-28", flight_status: "landed", flight: {iata: "6E123", number: "123"}, airline: {iata: "6E"}, departure: {iata: "DEL", scheduled}, arrival: {iata: "BOM", terminal: 1, baggage: 4}},
      {flight_date: "2026-10-29", flight_status: "scheduled", flight: {iata: "6E123", number: "123"}, airline: {iata: "6E"}, departure: {iata: "DEL", scheduled: "2026-10-29T10:00:00Z"}, arrival: {iata: "BOM", baggage: "7"}},
    ]});
  });
  assert.equal(result.flights.length, 1);
  assert.equal(result.flights[0].status, "Landed");
  assert.equal(result.flights[0].arrival.terminal, "1");
  assert.equal(result.flights[0].arrival.baggage, "4");
  assert.throws(() => validateFlightTracking(new URLSearchParams({flightNumber: "6E123", scheduledDeparture: "bad"})));
});

test("AI2626 refresh selects the requested date and preserves provider local wall-clock times", async () => {
  const fixture = JSON.parse(readFileSync(join(project, "tests/fixtures/aviationstack-ai2626.json"), "utf8"));
  const query = validateFlightTracking(new URLSearchParams({
    flightNumber: "AI2626", origin: "HYD", destination: "BOM", flightDate: "2026-10-29", scheduledDeparture: "2026-10-29T07:35:00Z",
  }));
  const result = await getFlightTracking(query, "test-key", async () => Response.json(fixture));
  assert.equal(result.flights.length, 1);
  assert.equal(result.flights[0].flightDate, "2026-10-29");
  assert.equal(result.flights[0].departure.scheduledTime, "2026-10-29T07:35:00");
  assert.equal(result.flights[0].departure.actualTime, "2026-10-29T07:36:00");
  assert.equal(result.flights[0].arrival.scheduledTime, "2026-10-29T09:10:00");
  assert.equal(result.flights[0].arrival.actualTime, "2026-10-29T08:50:00");
  assert.equal(formatAirportTime(result.flights[0].departure.scheduledTime), "7:35 AM");
  assert.equal(formatAirportTime(result.flights[0].arrival.actualTime), "8:50 AM");
  assert.throws(() => validateFlightTracking(new URLSearchParams({flightNumber: "AI2626", flightDate: "2026-02-30"})), /valid flight date/);
});

test("IX2216 shows only today's record with local scheduled and actual times and BOM terminal", async () => {
  const fixture = JSON.parse(readFileSync(join(project, "tests/fixtures/aviationstack-ix2216.json"), "utf8"));
  const result = await getAirportTracking({airport: "BOM", direction: "arr", flightDate: "2026-10-29"}, "test-key", async () => Response.json(fixture));
  assert.equal(result.flights.length, 1, "yesterday's same-number flight is excluded");
  const flight = result.flights[0];
  assert.equal(flight.flightDate, "2026-10-29");
  assert.equal(formatAirportTime(flight.departure.scheduledTime), "8:40 AM");
  assert.equal(formatAirportTime(flight.arrival.scheduledTime), "10:20 AM");
  assert.equal(formatAirportTime(flight.departure.actualTime), "8:55 AM");
  assert.equal(formatAirportTime(flight.arrival.actualTime), "10:24 AM");
  assert.equal(flight.arrival.terminal, "2");
  assert.equal(summarizeFlightStatus(flight).message, "Arrived 4 min late");
});

test("refresh matching does not switch the card to tomorrow's flight", () => {
  const original = progressFlight();
  const future = progressFlight({status: "Landed", departure: emptyStop({scheduledTime: "2030-01-02T09:30:00Z"})});
  const active = progressFlight({flightId: "changed-fields", arrival: emptyStop({baggage: "4"})});
  assert.equal(matchingFlightLeg(original, [future, {...original, status: "Scheduled"}, active]), active);
});

test("expanded status refreshes share one minute of cache while initial lookups remain fresh", async () => {
  let clock = 0, calls = 0;
  const load = createFlightStatusCache(async () => { calls++; return {flightNumber: "6E123", checkedAt: "2030-01-01T11:00:00Z", flights: []}; }, () => clock);
  const query = {flightNumber: "6E123", flightDate: "2030-01-01", scheduledDeparture: "2030-01-01T10:00:00"};
  await Promise.all([load(query), load(query)]);
  assert.equal(calls, 1);
  await load({...query, scheduledDeparture: "2030-01-01T10:00:00+05:30"});
  assert.equal(calls, 1);
  await load({...query, flightDate: "2030-01-02"});
  assert.equal(calls, 2, "different flight dates must never share cached status");
  clock = 60001;
  await load(query);
  assert.equal(calls, 3);
  await load({flightNumber: "6E123"});
  await load({flightNumber: "6E123"});
  assert.equal(calls, 5);
});
test("airport status preserves separate departure and arrival details for the route card", async () => {
  const result = await getAirportTracking({airport: "BOM", direction: "arr", flightDate: "2026-10-28"}, "test-key", async () => Response.json({data: [{
    flight_date: "2026-10-28", flight_status: "landed", airline: {iata: "6E", name: "IndiGo"}, flight: {iata: "6E123", number: "123"},
    departure: {iata: "JDH", scheduled: "2026-10-28T15:15:00+05:30", actual: "2026-10-28T16:34:00+05:30", gate: "5"},
    arrival: {iata: "BOM", scheduled: "2026-10-28T17:05:00+05:30", actual: "2026-10-28T18:13:00+05:30", terminal: "1", baggage: "4"},
  }]}));
  const flight = result.flights[0];
  assert.equal(flight.departure.actualTime, "2026-10-28T16:34:00");
  assert.equal(flight.departure.gate, "5");
  assert.equal(flight.arrival.actualTime, "2026-10-28T18:13:00");
  assert.equal(flight.arrival.terminal, "1");
  assert.equal(flight.arrival.gate, null);
  assert.equal(flight.arrival.baggage, "4");
  assert.equal(flight.actualTime, flight.arrival.actualTime);
  assert(!("track" in flight));
  assert.deepEqual(summarizeFlightStatus(flight), {label: "Arrived", message: "Arrived 1 hr 8 min late", tone: "arrived"});
});

test("status times prefer actual, then estimated, then scheduled without filling in unknown values", () => {
  const stop = emptyStop({scheduledTime: "2030-01-01T10:00:00Z", estimatedTime: "2030-01-01T10:15:00Z", actualTime: "2030-01-01T10:10:00Z"});
  assert.equal(stopTime(stop), stop.actualTime);
  assert.equal(stopTimeLabel(stop), "Actual");
  assert.equal(stopTime({...stop, actualTime: null}), stop.estimatedTime);
  assert.equal(stopTimeLabel({...stop, actualTime: null}), "Estimated");
  assert.equal(stopTime({...stop, actualTime: null, estimatedTime: null}), stop.scheduledTime);
  assert.equal(stopTime(emptyStop()), null);
});

test("status summaries handle overnight delays, early arrivals, missing times and cancellation", () => {
  const base = {status: "Landed", departure: emptyStop(), arrival: emptyStop({scheduledTime: "2030-01-01T23:40:00Z", actualTime: "2030-01-02T00:10:00Z"})};
  assert.equal(summarizeFlightStatus(base).message, "Arrived 30 min late");
  assert.equal(summarizeFlightStatus({...base, arrival: emptyStop({delayMinutes: -12})}).message, "Arrived 12 min early");
  assert.equal(summarizeFlightStatus({...base, arrival: emptyStop()}).message, "Arrival reported");
  assert.equal(summarizeFlightStatus({...base, status: "Cancelled"}).label, "Cancelled");
  assert.equal(summarizeFlightStatus({...base, status: "Active"}).label, "In flight");
});

const now = new Date("2030-01-01T10:00:00Z");
const query = { origin: "BOM", destination: "BLR", date: "2030-01-03", adults: "1", children: "0", infants: "0", cabin: "Economy" };
const params = (changes = {}) => new URLSearchParams({ origin: query.origin, destination: query.destination, date: query.date, ...changes });
const fixture = () => ({
  currency: "INR",
  places: [{ id: "bom", display_code: "BOM" }, { id: "blr", display_code: "BLR" }],
  carriers: [{ id: "carrier", display_code: "EX", name: "Example Airline" }],
  agents: [{ id: "seller", name: "Example Seller" }],
  segments: [{ id: "segment", marketing_carrier_id: "carrier", marketing_flight_number: "123" }],
  legs: [{ id: "out", departure: "2030-01-03T08:00:00", arrival: "2030-01-03T10:00:00", origin_place_id: "bom", destination_place_id: "blr", marketing_carrier_ids: ["carrier"], segment_ids: ["segment"], stop_count: 0 }],
  itineraries: [{ id: "itinerary", leg_ids: ["out"], pricing_options: [{ price: { amount: 4500 }, agent_ids: ["seller"], items: [{ agent_id: "seller", url: "https://booking.example/offer" }] }] }],
});
const tempCache = (t) => {
  const cacheRoot = join(project, ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, "udaan-api-test-"));
  t.after(() => removeTestDirectory(directory));
  return directory;
};
const badInput = (changes) => assert.throws(() => validateFlightSearch(params(changes), now), (error) => error instanceof FlightApiError && error.status === 400);

test("search validation normalizes airports and passenger defaults", () => {
  assert.deepEqual(validateFlightSearch(params({ origin: " bom " }), now), query);
  const alias = new URLSearchParams({ origin: "BOM", destination: "BLR", departureDate: query.date });
  assert.equal(validateFlightSearch(alias, now).date, query.date);
});

test("invalid, identical, and non-Indian airport codes are rejected", () => {
  badInput({ origin: "XXX" });
  badInput({ destination: "BOM" });
  badInput({ origin: "JFK" });
});

test("invalid dates, past dates, and backwards returns are rejected", () => {
  badInput({ date: "2030-02-30" });
  badInput({ date: "2029-12-31" });
  badInput({ returnDate: "2030-01-02" });
  badInput({ date: "2032-01-01" });
  badInput({ departureDate: "2030-01-04" });
});

test("passenger limits and duplicate search values are validated", () => {
  badInput({ adults: "0" });
  badInput({ adults: "9", children: "1" });
  badInput({ infants: "2" });
  badInput({ cabin: "Unsupported" });
  const duplicate = params(); duplicate.append("origin", "STV");
  assert.throws(() => validateFlightSearch(duplicate, now));
});

test("provider response maps itineraries, airline, dates, and price", () => {
  const [flight] = normalizeFlightApi(fixture(), query);
  assert.equal(flight.airline, "Example Airline");
  assert.equal(flight.flightNumber, "EX 123");
  assert.equal(flight.price, 4500);
  assert.equal(flight.duration, 120);
  assert.equal(flight.departure, "2030-01-03T02:30:00.000Z");
  assert.equal(flight.bookingUrl, "https://booking.example/offer");
});

test("round trips retain both legs and the provider's total price", () => {
  const body = fixture();
  body.legs.push({ ...body.legs[0], id: "back", departure: "2030-01-08T12:00:00", arrival: "2030-01-08T14:00:00", origin_place_id: "blr", destination_place_id: "bom" });
  body.itineraries[0].leg_ids.push("back");
  const [flight] = normalizeFlightApi(body, { ...query, returnDate: "2030-01-08" });
  assert.equal(flight.returnLeg.origin, "BLR");
  assert.equal(flight.returnLeg.destination, "BOM");
  assert.equal(flight.price, 4500);
});

test("unexpected response, wrong currency, and mismatched routes are handled", () => {
  assert.throws(() => normalizeFlightApi({}, query), /unexpected response/);
  assert.throws(() => normalizeFlightApi({ ...fixture(), currency: "USD" }, query), /different currency/);
  const body = fixture(); body.places[0].display_code = "DEL";
  assert.deepEqual(normalizeFlightApi(body, query), []);
});

test("unsafe links and partial seller links are not presented as total bookings", () => {
  assert.equal(flightBookingUrl("javascript:alert(1)"), null);
  assert.equal(flightBookingUrl("https://user:password@example.com"), null);
  assert.equal(flightBookingUrl("/unknown/path"), null);
  const body = fixture();
  body.itineraries[0].pricing_options[0].items.push({ agent_id: "seller", url: "https://booking.example/second" });
  assert.equal(normalizeFlightApi(body, query)[0].bookingUrl, null);
});

test("provider request uses the server key, selected route, and INR", async () => {
  let seen;
  const result = await requestFlightApi(query, "test-key", async (url, options) => {
    seen = { url: new URL(url), options };
    return Response.json(fixture());
  });
  assert.match(seen.url.pathname, /^\/onewaytrip\/test-key\/BOM\/BLR\/2030-01-03\/1\/0\/0\/Economy\/INR$/);
  assert.equal(seen.url.searchParams.get("region"), "IN");
  assert.equal(seen.options.cache, "no-store");
  assert.equal(result.mode, "flightapi");
});

test("failed provider requests do not expose response secrets or retry", async () => {
  let calls = 0;
  await assert.rejects(requestFlightApi(query, "test-key", async () => {
    calls++; return Response.json({ error: "secret-from-provider" }, { status: 403 });
  }), (error) => error.status === 502 && !error.message.includes("secret-from-provider") && !error.message.includes("test-key"));
  assert.equal(calls, 1);
});

test("missing key is rejected before any provider request", async () => {
  let calls = 0;
  await assert.rejects(requestFlightApi(query, "", async () => { calls++; return Response.json(fixture()); }), (error) => error.status === 503);
  assert.equal(calls, 0);
});

test("flight-number tracking includes only today's records for a flight number", async () => {
  const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
  const yesterday = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date(Date.now() - 86_400_000));
  const tracked = (iata, number, departureTime, flightDate) => ({
    flight_date: flightDate,
    flight_status: "scheduled",
    airline: { iata: iata.slice(0, 2), name: "Example Airline" },
    flight: { iata, number },
    departure: { iata: "DEL", timezone: "Asia/Kolkata", scheduled: departureTime, estimated: null, actual: null, gate: "A1" },
    arrival: { iata: "BOM", timezone: "Asia/Kolkata", scheduled: null, estimated: null, actual: null },
  });
  const records = [
    tracked("AI101", "101", `${today}T00:05:00+00:00`, today),
    tracked("AI101", "101", `${today}T13:00:00+00:00`, today),
    tracked("AI101", "101", `${yesterday}T12:00:00+00:00`, yesterday),
    tracked("VS8753", "8753", `${today}T12:00:00+00:00`, today),
  ];
  let requestedUrl;
  const result = await getFlightTracking({ flightNumber: "AI101" }, "test-key", async (url) => {
    requestedUrl = new URL(url);
    return Response.json({ data: records });
  });

  assert.equal(requestedUrl.searchParams.get("flight_iata"), "AI101");
  assert.equal(result.flights.length, 1, "selects the same-day record closest to the selected date");
  assert(result.flights.every(flight => flight.airlineCode + flight.flightNumber === "AI101"));
  assert(result.flights.every(flight => flight.flightDate === today));
  assert.equal(result.flights[0].scheduledTime, `${today}T00:05:00`);
});

test("live searches share a request, prefer FlightAPI, and fall back to saved results", async (t) => {
  const directory = tempCache(t);
  let calls = 0;
  let providerUnavailable = false;
  const fetcher = async () => {
    calls++;
    await new Promise((done) => setTimeout(done, 15));
    return providerUnavailable ? Response.json({ error: "provider unavailable" }, { status: 503 }) : Response.json(fixture());
  };
  const search = createFlightSearch(directory, fetcher);
  const [first, second] = await Promise.all([search(query, "test-key"), search(query, "test-key")]);
  assert.equal(calls, 1);
  assert.equal(first.localCache, false);
  assert.equal(second.localCache, false);
  const restarted = createFlightSearch(directory, fetcher);
  const restartedResult = await restarted(query, "test-key");
  assert.equal(restartedResult.localCache, false);
  assert.equal(calls, 2);
  providerUnavailable = true;
  const fallback = await createFlightSearch(directory, fetcher)(query, "test-key");
  assert.equal(fallback.localCache, true);
  assert.match(fallback.liveRefreshError, /Showing the saved fare instead/);
  assert.equal(calls, 3);
  const files = readdirSync(directory);
  assert.equal(files.length, 1);
  assert.ok(!files[0].includes("test-key"));
  assert.ok(!readFileSync(join(directory, files[0]), "utf8").includes("test-key"));
});

test("a corrupt cache is ignored and a fresh provider result replaces it", async (t) => {
  const directory = tempCache(t);
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json(fixture()); };
  await createFlightSearch(directory, fetcher)(query, "test-key");
  writeFileSync(join(directory, readdirSync(directory)[0]), "broken json");
  const result = await createFlightSearch(directory, fetcher)(query, "test-key");
  assert.equal(result.localCache, false);
  assert.equal(calls, 2);
  assert.doesNotThrow(() => JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]), "utf8")));
});
