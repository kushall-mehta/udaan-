import type { Metadata } from "next";
import AirportTracking from "@/components/udaan/AirportTracking";

export const metadata: Metadata = {
  title: "Airport Flight Tracking | Udaan",
  description: "View airport arrivals, departures, flight status, and live positions across India.",
};

export default function AirportTrackingPage() {
  return <AirportTracking />;
}
