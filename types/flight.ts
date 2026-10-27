export type CabinClass = "Economy" | "Premium_Economy" | "Business" | "First";

export type FlightSearchQuery = {
  origin: string;
  destination: string;
  date: string;
  adults: string;
  children: string;
  infants: string;
  cabin: CabinClass;
  returnDate?: string;
};

export type FlightLeg = {
  airline: string;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  duration: number;
  stops: number | null;
};

export type FlightSeller = {
  id: string;
  name: string;
  price: number;
  bookingUrl: string | null;
};

export type Flight = FlightLeg & {
  id: string;
  price: number;
  bookingUrl: string | null;
  itineraryUrl: string | null;
  returnLeg: FlightLeg | null;
  sellers: FlightSeller[];
};

export type FlightSearchResponse = {
  mode: "flightapi";
  flights: Flight[];
  fetchedAt: string;
  localCache: boolean;
  cachePersisted: boolean;
  liveRefreshError?: string;
};
