import {NextRequest, NextResponse} from "next/server";
import {AviationstackError, getFlightTracking, validateFlightTracking} from "../../../lib/flights/aviationstack";
import {createFlightStatusCache} from "../../../lib/flights/statusCache";

// Airport detail refreshes use Aviationstack only, never Google search credits.
const getStatus = createFlightStatusCache((query) => getFlightTracking(query, process.env.AVIATIONSTACK_ACCESS_KEY || ""));

export const GET = async (request: NextRequest) => {
    const headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"};
    try {
        const query = validateFlightTracking(request.nextUrl.searchParams);
        return NextResponse.json(await getStatus(query), {headers});
    } catch (error: unknown) {
        const status = error instanceof AviationstackError ? error.status : 500;
        const message = error instanceof AviationstackError ? error.message : "Could not refresh flight status. Please try again.";
        return NextResponse.json({error: message}, {status, headers});
    }
};
