"use client";

import { useState } from "react";
import FlightSearchForm from "./FlightSearchForm";
import FlightResults from "./FlightResults";
import type { FlightSearchQuery, FlightSearchResponse } from "@/types/flight";

type ApiError = { error?: string };

const FlightSearch = () => {
  const [result, setResult] = useState<FlightSearchResponse | null>(null);
  const [lastQuery, setLastQuery] = useState<FlightSearchQuery | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const searchFlights = async (query: FlightSearchQuery, refresh = false) => {
    setLoading(true);
    setError("");
    if (!refresh) {
      setResult(null);
      setLastQuery(query);
    }

    const params = new URLSearchParams({
      origin: query.origin,
      destination: query.destination,
      date: query.date,
      adults: query.adults,
      children: query.children,
      infants: query.infants,
      cabin: query.cabin,
      ...(query.returnDate ? { returnDate: query.returnDate } : {}),
      ...(refresh ? { refresh: "true" } : {}),
    });

    try {
      const response = await fetch(`/api/flights?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = (await response.json()) as FlightSearchResponse | ApiError;
      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Flight search failed. Please try again.");
      }
      setResult(data as FlightSearchResponse);
      setLastQuery(query);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not reach the flight search. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <FlightSearchForm loading={loading} onSearch={(query) => void searchFlights(query)} />
      <FlightResults
        result={result}
        loading={loading}
        error={error}
        canRefresh={Boolean(lastQuery)}
        onRefresh={() => lastQuery && void searchFlights(lastQuery, true)}
      />
    </>
  );
};

export default FlightSearch;
