import { NextRequest, NextResponse } from "next/server";
import { AviationstackError, validateFlightTracking } from "../../../lib/flights/aviationstack";
import {getGoogleStatus} from "../../../lib/flights/googleStatus";

export const GET = async (request: NextRequest) => {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const query = validateFlightTracking(request.nextUrl.searchParams);
    const result = await getGoogleStatus(query);
    return NextResponse.json(result, { headers });
  } catch (error: unknown) {
    const status = error instanceof AviationstackError ? error.status : 500;
    const message = error instanceof AviationstackError
      ? error.message
      : "Could not load flight tracking. Please try again.";
    return NextResponse.json({ error: message }, { status, headers });
  }
};
