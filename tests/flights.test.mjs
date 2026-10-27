import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const compilation = mkdtempSync(join(tmpdir(), "udaan-api-test-"));
const removeTestDirectory = (directory) => {
  const target = resolve(directory);
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith("udaan-api-test-")) {
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
  "--esModuleInterop", "--skipLibCheck", "--strict", "--rootDir", project,
  "--outDir", compilation,
  join(project, "lib/flights/validation.ts"),
  join(project, "lib/flights/provider.ts"),
  join(project, "lib/flights/search.ts"),
], { cwd: project, stdio: "pipe" });
const require = createRequire(import.meta.url);
const { validateFlightSearch, FlightApiError } = require(join(compilation, "lib/flights/validation.js"));
const { normalizeFlightApi, requestFlightApi, flightBookingUrl } = require(join(compilation, "lib/flights/provider.js"));
const { createFlightSearch } = require(join(compilation, "lib/flights/search.js"));
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
  const directory = mkdtempSync(join(tmpdir(), "udaan-api-test-"));
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

test("concurrent searches share one request and saved results survive restart", async (t) => {
  const directory = tempCache(t);
  let calls = 0;
  const fetcher = async () => { calls++; await new Promise((done) => setTimeout(done, 15)); return Response.json(fixture()); };
  const search = createFlightSearch(directory, fetcher);
  const [first, second] = await Promise.all([search(query, "test-key"), search(query, "test-key")]);
  assert.equal(calls, 1);
  assert.equal(first.localCache, false);
  assert.equal(second.localCache, true);
  const restarted = createFlightSearch(directory, fetcher);
  assert.equal((await restarted(query, "test-key")).localCache, true);
  assert.equal(calls, 1);
  const files = readdirSync(directory);
  assert.equal(files.length, 1);
  assert.ok(!files[0].includes("test-key"));
  assert.ok(!readFileSync(join(directory, files[0]), "utf8").includes("test-key"));
});

test("corrupt saved results fail without spending another provider request", async (t) => {
  const directory = tempCache(t);
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json(fixture()); };
  await createFlightSearch(directory, fetcher)(query, "test-key");
  writeFileSync(join(directory, readdirSync(directory)[0]), "broken json");
  await assert.rejects(createFlightSearch(directory, fetcher)(query, "test-key"), /could not be read/);
  assert.equal(calls, 1);
});
