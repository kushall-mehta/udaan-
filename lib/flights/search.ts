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

// Results are keyed by the normalized search and a hash of the API key. The key is never saved in a filename or fare file.
export const createFlightSearch = (directory: string, fetcher: typeof fetch = fetch) => {
  const memory = new Map<string, FlightSearchResponse>();
  const pending = new Map<string, Promise<FlightSearchResponse>>();

  return async (query: FlightSearchQuery, key: string, refresh = false): Promise<FlightSearchResponse> => {
    const normalized: FlightSearchQuery = {
      origin: query.origin, destination: query.destination, date: query.date,
      adults: query.adults, children: query.children, infants: query.infants, cabin: query.cabin,
      ...(query.returnDate ? { returnDate: query.returnDate } : {}),
    };
    const digest = createHash("sha256").update(JSON.stringify(normalized)).update("\0").update(key.trim()).digest("hex");
    const requestId = `${digest}:${refresh ? "refresh" : "search"}`;
    const running = pending.get(requestId);
    if (running) return { ...(await running), localCache: true };

    const task = (async (): Promise<FlightSearchResponse> => {
      let saved: FlightSearchResponse | null = memory.get(digest) ?? null;
      if (!saved) {
        const filename = join(directory, `${digest}.json`);
        try {
          const value: unknown = JSON.parse(await readFile(filename, "utf8"));
          if (!validSavedResult(value)) {
            if (!refresh) throw new FlightApiError(500, "Saved fares are invalid. No provider call was made.");
          } else {
            saved = { ...value, localCache: true, cachePersisted: true };
            memory.set(digest, saved);
          }
        } catch (error: unknown) {
          if (error instanceof FlightApiError) throw error;
          const missing = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
          if (!missing && !refresh) throw new FlightApiError(500, "Saved fares could not be read. No provider call was made.");
        }
      }
      if (saved && !refresh) return { ...saved, localCache: true, liveRefreshError: undefined };

      let providerResult: ProviderResult;
      try {
        providerResult = await requestFlightApi(normalized, key, fetcher);
      } catch (error: unknown) {
        if (saved && error instanceof FlightApiError) {
          return {
            ...saved,
            localCache: true,
            liveRefreshError: `Could not get a current price. Showing the saved fare instead. ${error.message}`,
          };
        }
        throw error;
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
