import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FlightSearchQuery, FlightSearchResponse } from "../../types/flight";
import { FlightApiError } from "./validation";
import { requestFlightApi, type ProviderResult } from "./provider";

const validSavedResult = (value: unknown): value is ProviderResult => {
  if (typeof value !== "object" || value === null) return false;
  const saved = value as Record<string, unknown>;
  return saved.mode === "flightapi" && typeof saved.fetchedAt === "string" && Number.isFinite(Date.parse(saved.fetchedAt)) && Array.isArray(saved.flights) && saved.flights.every((flight: unknown) => {
    if (typeof flight !== "object" || flight === null) return false;
    const row = flight as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.airline === "string" && typeof row.origin === "string" && typeof row.destination === "string" && typeof row.departure === "string" && typeof row.arrival === "string" && typeof row.price === "number" && Number.isFinite(row.price) && row.price > 0 && Array.isArray(row.sellers);
  });
};

// New cache files are keyed by the normalized search so they remain usable if a key is temporarily missing or rotated.
// Also read the older query-plus-key-hash filename format for cache files created by earlier versions.
export const createFlightSearch = (directory: string, fetcher: typeof fetch = fetch) => {
  const memory = new Map<string, FlightSearchResponse>();
  const pending = new Map<string, Promise<FlightSearchResponse>>();

  return async (query: FlightSearchQuery, key: string): Promise<FlightSearchResponse> => {
    const normalized: FlightSearchQuery = {
      origin: query.origin, destination: query.destination, date: query.date,
      adults: query.adults, children: query.children, infants: query.infants, cabin: query.cabin,
      ...(query.returnDate ? { returnDate: query.returnDate } : {}),
    };
    const digest = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    const legacyDigest = createHash("sha256").update(JSON.stringify(normalized)).update("\0").update(key.trim()).digest("hex");
    const requestId = digest;
    const running = pending.get(requestId);
    if (running) return running;

    const task = (async (): Promise<FlightSearchResponse> => {
      let saved: FlightSearchResponse | null = memory.get(digest) ?? null;
      if (!saved) {
        for (const cacheDigest of new Set([digest, legacyDigest])) {
          const filename = join(directory, `${cacheDigest}.json`);
          try {
            const value: unknown = JSON.parse(await readFile(filename, "utf8"));
            if (!validSavedResult(value)) continue;
            saved = { ...value, localCache: true, cachePersisted: true };
            memory.set(digest, saved);
            break;
          } catch {
            // A missing or unreadable cache must not prevent trying FlightAPI.
          }
        }
      }

      let providerResult: ProviderResult;
      try {
        providerResult = await requestFlightApi(normalized, key, fetcher);
      } catch (error: unknown) {
        if (!(error instanceof FlightApiError)) throw error;
        if (saved) {
          return {
            ...saved,
            localCache: true,
            liveRefreshError: `Could not get a current price. Showing the saved fare instead. ${error.message}`,
          };
        }
        throw new FlightApiError(error.status, `FlightAPI could not return current fares, and no saved results are available. ${error.message}`);
      }

      const filename = join(directory, `${digest}.json`);
      let cachePersisted = false;
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(temporary, JSON.stringify(providerResult), { mode: 0o600, flag: "wx" });
        await rename(temporary, filename);
        cachePersisted = true;
      } catch {
        // The current result remains available in memory if disk storage is unavailable.
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
      const result: FlightSearchResponse = { ...providerResult, localCache: false, cachePersisted };
      memory.set(digest, result);
      return result;
    })();

    pending.set(requestId, task);
    try { return await task; }
    finally { pending.delete(requestId); }
  };
};
