import { NextRequest, NextResponse } from "next/server";
import { join } from "node:path";
import { createFlightSearch } from "../../../lib/flights/search";
import { FlightApiError, validateFlightSearch } from "../../../lib/flights/validation";

const globalFlights = globalThis as typeof globalThis & {
  udaanFlightSearch?: ReturnType<typeof createFlightSearch>;
};
const search = globalFlights.udaanFlightSearch ??= createFlightSearch(join(process.cwd(), ".cache", "flightapi"));

export const GET = async (request: NextRequest) => {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const query = validateFlightSearch(request.nextUrl.searchParams);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const result = await search(query, process.env.FLIGHTAPI_KEY || "", refresh);
    return NextResponse.json(result, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof FlightApiError ? error.message : "Could not complete the flight search. Please try again." },
      { status: error instanceof FlightApiError ? error.status : 500, headers },
    );
  }
};
