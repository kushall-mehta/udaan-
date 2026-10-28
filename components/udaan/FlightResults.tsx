"use client";

import { useMemo, useState } from "react";
import type { Flight, FlightSearchResponse } from "@/types/flight";
import FlightCard from "./FlightCard";

type FlightResultsProps = {
  result: FlightSearchResponse | null;
  loading: boolean;
  error: string;
  canRefresh: boolean;
  onRefresh: () => void;
};

const rupees = (amount: number) => `₹${Math.round(amount).toLocaleString("en-IN")}`;
const pageSize = 15;
const noFlights: Flight[] = [];

const FlightResults = ({ result, loading, error, canRefresh, onRefresh }: FlightResultsProps) => {
  const [sort, setSort] = useState("cheapest");
  const [nonstop, setNonstop] = useState(false);
  const [airline, setAirline] = useState("all");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [previousResult, setPreviousResult] = useState(result);
  if (result !== previousResult) {
    setPreviousResult(result);
    setCurrentPage(1);
  }

  const flights = result?.flights ?? noFlights;
  const airlines = useMemo(() => [...new Set(flights.map((flight) => flight.airline))].sort(), [flights]);
  const highestFare = Math.max(1000, ...flights.map((flight) => flight.price));
  const sliderMax = Math.max(100_000, Math.ceil(highestFare / 500) * 500);
  const visible = useMemo(() => flights
    .filter((flight) => !nonstop || (flight.stops === 0 && (!flight.returnLeg || flight.returnLeg.stops === 0)))
    .filter((flight) => airline === "all" || flight.airline === airline)
    .filter((flight) => maxPrice === null || flight.price <= maxPrice)
    .sort((a, b) => sort === "fastest"
      ? a.duration + (a.returnLeg?.duration ?? 0) - b.duration - (b.returnLeg?.duration ?? 0)
      : sort === "earliest" ? a.departure.localeCompare(b.departure) : a.price - b.price),
  [airline, flights, maxPrice, nonstop, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const activePage = Math.min(currentPage, pageCount);
  const startIndex = visible.length ? (activePage - 1) * pageSize : 0;
  const endIndex = Math.min(startIndex + pageSize, visible.length);
  const pageFlights = visible.slice(startIndex, endIndex);
  const pageNumbers: (number | "ellipsis-start" | "ellipsis-end")[] = pageCount <= 5
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : activePage <= 3
      ? [1, 2, 3, 4, "ellipsis-end", pageCount]
      : activePage >= pageCount - 2
        ? [1, "ellipsis-start", pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
        : [1, "ellipsis-start", activePage - 1, activePage, activePage + 1, "ellipsis-end", pageCount];
  const cheapest = flights.length ? Math.min(...flights.map((flight) => flight.price)) : 0;
  const cachedAt = result ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(result.fetchedAt)) : "";

  const resetFilters = () => { setNonstop(false); setAirline("all"); setMaxPrice(null); setSort("cheapest"); setCurrentPage(1); };
  const goToPage = (page: number) => {
    setCurrentPage(page);
    document.getElementById("flight-results-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="sample-flights" className="flight-content sample-results" aria-label="Flight search results" aria-busy={loading}>
      <div className="results-heading">
        <div>
          <p className="eyebrow dark">YOUR NEXT JOURNEY</p>
          <h2>Flight results</h2>
          <p>{result ? `${flights.length} itineraries · prices shown in Indian rupees` : "Search for a route to see available fares."}</p>
        </div>
        {result && <span className={`result-badge ${result.localCache ? "cached-badge" : "live-badge"}`}>
          {result.liveRefreshError ? "SAVED FARE · LIVE UPDATE FAILED" : result.localCache ? "SAVED FARES · MAY BE OUTDATED" : "LIVE FLIGHTAPI DATA"}
        </span>}
      </div>

      {loading && result && <p className="refresh-status" role="status"><span className="loading-plane" aria-hidden="true">✈</span> Checking FlightAPI for current prices…</p>}
      {error && <div className="empty-state error-state" role="alert"><span aria-hidden="true">!</span><h3>We couldn’t load flights</h3><p>{error}</p><p>Check your route and date, then try searching again.</p></div>}
      {result?.liveRefreshError && <p className="saved-warning" role="status">{result.liveRefreshError}</p>}
      {result?.cachePersisted === false && <p className="saved-warning" role="status">This result is available for now, but could not be saved to the cache file.</p>}

      {!error && !result && loading && <div className="empty-state" role="status"><span className="loading-plane" aria-hidden="true">✈</span><h3>Finding flights</h3><p>Checking FlightAPI first; saved fares are used if it cannot return current results.</p></div>}
      {!error && !result && !loading && <div className="empty-state"><span aria-hidden="true">✈</span><h3>Ready when you are</h3><p>Choose your airports and travel date, then search to load flight options here.</p></div>}

      {result && !error && (
        <>
          <div className="results-tools-row">
            <button type="button" className="refresh-fares" onClick={onRefresh} disabled={loading || !canRefresh}>
              {loading ? "Checking current prices…" : "Retry FlightAPI · may use credits ↗"}
            </button>
            <span>{result.localCache ? `Saved result from ${cachedAt}` : `Price checked ${cachedAt}`}</span>
          </div>
          <div className="results-toolbar">
            <span>{visible.length} of {flights.length} itineraries shown</span>
            <label>Sort by <select aria-label="Sort flights" value={sort} onChange={(event) => { setSort(event.target.value); setCurrentPage(1); }}><option value="cheapest">Cheapest first</option><option value="fastest">Fastest first</option><option value="earliest">Earliest departure</option></select></label>
          </div>
          <div className="results-layout">
            <aside className="flight-filters" aria-label="Filter flights">
              <div className="filter-title"><h3>Compare your trip</h3><button type="button" className="text-button" onClick={resetFilters}>Reset</button></div>
              <label className="check-filter"><input type="checkbox" checked={nonstop} onChange={(event) => { setNonstop(event.target.checked); setCurrentPage(1); }} /> Non-stop only</label>
              <label className="filter-label">AIRLINE<select aria-label="Filter airline" value={airline} onChange={(event) => { setAirline(event.target.value); setCurrentPage(1); }}><option value="all">All airlines</option>{airlines.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <label className="filter-label">MAXIMUM ITINERARY PRICE<strong>{maxPrice === null ? "Any price" : rupees(maxPrice)}</strong><input aria-label="Maximum itinerary price" type="range" min="1000" max={sliderMax} step="500" value={maxPrice ?? sliderMax} onChange={(event) => { setMaxPrice(Number(event.target.value) >= sliderMax ? null : Number(event.target.value)); setCurrentPage(1); }} /></label>
              <p>Fares are shown per itinerary. Seller prices can change; confirm the final fare and baggage rules on the seller’s site.</p>
            </aside>
            <div className="fare-list" id="flight-results-list">
              {pageFlights.map((flight) => <FlightCard key={flight.id} flight={flight} cheapest={flight.price === cheapest} />)}
              {visible.length === 0 && <div className="empty-state"><span aria-hidden="true">⌁</span><h3>No fares match those filters</h3><p>Clear one or more filters to see more flights.</p><button type="button" className="text-button" onClick={resetFilters}>Clear filters →</button></div>}
            </div>
          </div>
          {visible.length > pageSize && (
            <nav className="flight-pagination" aria-label="Flight result pages">
              <p>Showing <strong>{startIndex + 1}–{endIndex}</strong> of <strong>{visible.length}</strong> flights</p>
              <div className="pagination-buttons">
                <button type="button" onClick={() => goToPage(activePage - 1)} disabled={activePage === 1}>← Previous</button>
                {pageNumbers.map((page, index) => typeof page === "number" ? (
                  <button type="button" key={page} className={page === activePage ? "page-active" : ""} aria-current={page === activePage ? "page" : undefined} aria-label={`Page ${page}`} onClick={() => goToPage(page)}>{page}</button>
                ) : <span key={`${page}-${index}`} className="pagination-ellipsis" aria-hidden="true">…</span>)}
                <button type="button" onClick={() => goToPage(activePage + 1)} disabled={activePage === pageCount}>Next {Math.min(endIndex + 1, visible.length)}–{Math.min(endIndex + pageSize, visible.length)} →</button>
              </div>
            </nav>
          )}
          <p className="results-footnote">{result.localCache ? `These saved fares may be outdated. Get current prices to check FlightAPI again. Last saved: ${cachedAt}.` : `FlightAPI response checked ${cachedAt}. No booking is made in Udaan.`}</p>
        </>
      )}
    </section>
  );
};

export default FlightResults;
