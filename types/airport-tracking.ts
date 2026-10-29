export type AirportDirection = "arr" | "dep";

export type FlightStopStatus = {
  airport: string;
  timezone?: string | null;
  scheduledTime: string | null;
  estimatedTime: string | null;
  actualTime: string | null;
  terminal: string | null;
  gate: string | null;
  baggage: string | null;
  delayMinutes: number | null;
};

export type AirportFlightStatus = {
  flightId: string;
  /** Provider flight date when supplied; timestamps remain authoritative for local display date. */
  flightDate?: string | null;
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
  departure: FlightStopStatus;
  arrival: FlightStopStatus;
  positionProgress?: {percent: number; reportedAt: string} | null;
  source?: string;
  sourceUpdatedAt?: string | null;
};

export type AirportTrackingResponse = {
  airport: string;
  direction: AirportDirection;
  flightDate?: string;
  checkedAt: string;
  flights: AirportFlightStatus[];
  warning?: string;
};

export type FlightTrackingResponse = {
  flightNumber: string;
  flightDate?: string;
  checkedAt: string;
  flights: AirportFlightStatus[];
  source?: string;
};
