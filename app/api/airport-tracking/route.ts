import { NextRequest, NextResponse } from "next/server";
import { AviationstackError, getAirportTracking, validateAirportTracking } from "../../../lib/flights/aviationstack";

export const GET = async (request: NextRequest) => {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const query = validateAirportTracking(request.nextUrl.searchParams);
    const result = await getAirportTracking(query, process.env.AVIATIONSTACK_ACCESS_KEY || "");
    return NextResponse.json(result, { headers });
  } catch (error: unknown) {
    const status = error instanceof AviationstackError ? error.status : 500;
    const message = error instanceof AviationstackError
      ? error.message
      : "Could not load airport flight tracking. Please try again.";
    return NextResponse.json({ error: message }, { status, headers });
  }
};
