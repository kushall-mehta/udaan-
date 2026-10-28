export type AirportDirection = "arr" | "dep";

export type TrackedPosition = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  source: string;
  timestamp: string;
};

export type AirportFlightTrack = { flightId: string; positions: TrackedPosition[] };

export type AirportFlightStatus = {
  flightId: string;
  airline: string;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  status: string;
  scheduledTime: string | null;
  estimatedTime: string | null;
  actualTime: string | null;
  terminal: string | null;
  gate: string | null;
  baggage: string | null;
  delayMinutes: number | null;
  track: AirportFlightTrack | null;
};

export type AirportTrackingResponse = {
  airport: string;
  direction: AirportDirection;
  checkedAt: string;
  flights: AirportFlightStatus[];
};

export type FlightTrackingResponse = {
  flightNumber: string;
  checkedAt: string;
  flights: AirportFlightStatus[];
};
