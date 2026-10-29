"use client";

import {useCallback, useState, type FormEvent} from "react";
import {airports} from "@/data/airports";
import {dateInTimezone, formatAirportDate, formatAirportTime, matchesAirportTime} from "@/lib/flights/airportTime";
import {airportBoardStatus} from "@/lib/flights/statusSummary";
import FlightStatusDetails from "@/components/udaan/FlightStatusDetails";
import type {AirportDirection, AirportFlightStatus, AirportTrackingResponse, FlightTrackingResponse} from "@/types/airport-tracking";

type ApiError = { error?: string };
const airportPageSize = 15;
const exampleFlightNumbers = [
    {code: "AI2985", route: "DEL → BOM"},
    {code: "AI2549", route: "DEL → HYD"},
    {code: "6E6517", route: "DEL → CCU"},
];
const localTime = formatAirportTime;
const statusClass = (status: string) => status.toLowerCase().replaceAll(" ", "-");
const localDate = (value: string | null) => formatAirportDate(value);

const AirportTracking = () => {
    const [airport, setAirport] = useState("BOM");
    const [direction, setDirection] = useState<AirportDirection>("arr");
    const [timeFrom, setTimeFrom] = useState("");
    const [timeTo, setTimeTo] = useState("");
    const [flightNumber, setFlightNumber] = useState("");
    const [result, setResult] = useState<AirportTrackingResponse | null>(null);
    const [flightResult, setFlightResult] = useState<FlightTrackingResponse | null>(null);
    const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
    const [selectedTrackedFlightId, setSelectedTrackedFlightId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [flightError, setFlightError] = useState("");
    const [flightLoading, setFlightLoading] = useState(false);
    const [airportPage, setAirportPage] = useState(1);

    const loadFlights = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        setLoading(true);
        setError("");
        setSelectedFlightId(null);
        setAirportPage(1);
        const params = new URLSearchParams({airport, direction, flightDate: dateInTimezone(Date.now(), "Asia/Kolkata")});
        try {
            const response = await fetch(`/api/airport-tracking?${params}`, {
                headers: {Accept: "application/json"},
                cache: "no-store",
            });
            const body = (await response.json()) as AirportTrackingResponse | ApiError;
            if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Airport tracking request failed.");
            setResult(body as AirportTrackingResponse);
        } catch (cause: unknown) {
            setResult(null);
            setError(cause instanceof Error ? cause.message : "Could not reach the airport tracking service.");
        } finally {
            setLoading(false);
        }
    };

    const loadFlightByNumber = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedNumber = flightNumber.toUpperCase().replaceAll(/\s+/g, "");
        setFlightLoading(true);
        setFlightError("");
        setSelectedTrackedFlightId(null);
        try {
            const params = new URLSearchParams({flightNumber: normalizedNumber});
            const response = await fetch(`/api/flight-tracking?${params}`, {
                headers: {Accept: "application/json"},
                cache: "no-store",
            });
            const body = (await response.json()) as FlightTrackingResponse | ApiError;
            if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Flight tracking request failed.");
            setFlightResult(body as FlightTrackingResponse);
        } catch (cause: unknown) {
            setFlightResult(null);
            setFlightError(cause instanceof Error ? cause.message : "Could not reach the flight tracking service.");
        } finally {
            setFlightLoading(false);
        }
    };

    const airportInfo = airports.find((item) => item.code === result?.airport);
    const filteredFlights = (result?.flights ?? []).filter((flight) => matchesAirportTime(flight, timeFrom, timeTo));
    const pageCount = Math.max(1, Math.ceil(filteredFlights.length / airportPageSize));
    const activePage = Math.min(airportPage, pageCount);
    const startIndex = (activePage - 1) * airportPageSize;
    const endIndex = Math.min(startIndex + airportPageSize, filteredFlights.length);
    const pageFlights = filteredFlights.slice(startIndex, endIndex);
    const goToAirportPage = (page: number) => {
        setAirportPage(Math.max(1, Math.min(pageCount, page)));
        setSelectedFlightId(null);
        window.requestAnimationFrame(() => document.getElementById("airport-flight-board")?.scrollIntoView({block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}));
    };
    const changeTimeFilter = (value: string, setter: (value: string) => void) => {
        setter(value);
        setAirportPage(1);
        setSelectedFlightId(null);
    };
    return (
        <main className="airport-tracking-page">
            <section className="tracking-hero">
                <p className="eyebrow dark"><span aria-hidden="true"/>AIRPORT FLIGHT STATUS</p>
                <h1>Know what’s<br/><em>in the air.</em></h1>
                <p>Arrivals, departures, and flight status for airports across India.</p>
            </section>

            <section className="tracking-panel" aria-label="Airport flight tracking">
                <form className="tracking-controls" onSubmit={(event) => void loadFlights(event)}>
                    <label>
                        <span>AIRPORT IATA CODE</span>
                        <input list="tracking-airports" value={airport} onChange={(event) => setAirport(event.target.value.toUpperCase())}
                            maxLength={3} pattern="[A-Za-z]{3}" placeholder="e.g. BOM" required aria-label="Airport IATA code" />
                        <datalist id="tracking-airports">
                            {airports.map((item) => <option key={item.code} value={item.code} label={item.city} />)}
                        </datalist>
                    </label>
                    <label>
                        <span>FROM (IST)</span>
                        <input type="time" value={timeFrom} onChange={(event) => changeTimeFilter(event.target.value, setTimeFrom)} aria-label="Filter flights from time in India" />
                    </label>
                    <label>
                        <span>TO (IST)</span>
                        <input type="time" value={timeTo} onChange={(event) => changeTimeFilter(event.target.value, setTimeTo)} aria-label="Filter flights until time in India" />
                    </label>
                    <div className="tracking-direction" role="group" aria-label="Flight direction">
                        <button type="button" aria-pressed={direction === "arr"} onClick={() => setDirection("arr")}>Arrivals</button>
                        <button type="button" aria-pressed={direction === "dep"} onClick={() => setDirection("dep")}>Departures</button>
                    </div>
                    <button className="tracking-search" type="submit" disabled={loading}>
                        {loading ? "Loading airport list…" : result ? "Refresh board" : "Show flights"}
                    </button>
                </form>
                <p className="tracking-window-note">Shows today’s flights in the airport’s local timezone. Provider schedule times are displayed as airport-local clock values.</p>

                {error && <div className="tracking-message tracking-error" role="alert">{error}</div>}
                {!error && !result && !loading && <div className="tracking-empty">Choose an airport and arrivals or departures to view its flight board.</div>}
                {loading && <div className="tracking-empty" role="status">Loading airport flight status…</div>}

                {result && !loading && (
                    <div className="tracking-board" id="airport-flight-board">
                        {result.warning && <p className="tracking-message" role="status">{result.warning}</p>}
                        <div className="tracking-board-heading">
                            <div>
                                <p className="eyebrow dark">{result.direction === "arr" ? "ARRIVALS" : "DEPARTURES"} · UPDATED {new Date(result.checkedAt).toLocaleTimeString("en-IN", {timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit"})} IST</p>
                                <h2>{airportInfo?.city} <span>{result.airport}</span></h2>
                                {filteredFlights.length > 0 && <p className="tracking-page-summary" role="status">Showing {startIndex + 1}–{endIndex} of {filteredFlights.length} flights · {airportPageSize} per page</p>}
                            </div>
                            <span className="tracking-flight-count">{filteredFlights.length}{filteredFlights.length !== result.flights.length ? ` / ${result.flights.length}` : ""} flights</span>
                        </div>

                        {filteredFlights.length === 0 ? (
                            <div className="tracking-empty">{result.flights.length === 0
                                ? "No flights were returned for this airport. Availability depends on provider coverage."
                                : "No flights match these time filters."}</div>
                        ) : (
                            <div className="tracking-flight-list">
                                {pageFlights.map((flight) => (
                                    <FlightRow key={flight.flightId} flight={flight} direction={result.direction} checkedAt={result.checkedAt}
                                        selected={flight.flightId === selectedFlightId}
                                        onTrack={() => setSelectedFlightId((current) => current === flight.flightId ? null : flight.flightId)} />
                                ))}
                            </div>
                        )}
                        {filteredFlights.length > airportPageSize && (
                            <nav className="flight-pagination" aria-label="Airport flight pages">
                                <p>Showing <strong>{startIndex + 1}–{endIndex}</strong> of <strong>{filteredFlights.length}</strong> flights</p>
                                <div className="pagination-buttons">
                                    <button type="button" onClick={() => goToAirportPage(activePage - 1)} disabled={activePage === 1}>← Previous</button>
                                    {Array.from({length: Math.min(7, pageCount)}, (_, index) => Math.max(1, Math.min(activePage - 3, pageCount - 6)) + index).map((page) => (
                                        <button type="button" key={page} className={page === activePage ? "page-active" : ""} aria-current={page === activePage ? "page" : undefined} aria-label={`Page ${page}`} onClick={() => goToAirportPage(page)}>{page}</button>
                                    ))}
                                    <button type="button" onClick={() => goToAirportPage(activePage + 1)} disabled={activePage === pageCount}>Next {Math.min(endIndex + 1, filteredFlights.length)}–{Math.min(endIndex + airportPageSize, filteredFlights.length)} →</button>
                                </div>
                            </nav>
                        )}
                    </div>
                )}
            </section>

            <section className="tracking-panel flight-number-panel" aria-label="Track a flight by flight number">
                <div className="tracking-board-heading">
                    <div>
                        <p className="eyebrow dark">DIRECT FLIGHT LOOKUP</p>
                        <h2>Track by flight number</h2>
                    </div>
                </div>
                <form className="flight-number-controls" onSubmit={(event) => void loadFlightByNumber(event)}>
                    <label>
                        <span>FLIGHT NUMBER</span>
                        <input value={flightNumber} onChange={(event) => setFlightNumber(event.target.value.toUpperCase())}
                            placeholder="e.g. AI101" pattern="[A-Za-z0-9 ]{2,12}" maxLength={12} required />
                    </label>
                    <button className="tracking-search" type="submit" disabled={flightLoading}>
                        {flightLoading ? "Finding flight…" : flightResult ? "Refresh flight" : "Track flight"}
                    </button>
                </form>
                <div className="flight-number-examples" aria-label="Example flight numbers">
                    <span>Try an example:</span>
                    {exampleFlightNumbers.map((example) => (
                        <button key={example.code} type="button" onClick={() => setFlightNumber(example.code)}>
                            {example.code} <small>{example.route}</small>
                        </button>
                    ))}
                    <small>Examples may stop returning results as schedules change.</small>
                </div>
                <p className="tracking-window-note">Track a flight number using Google via SerpApi. Airport searches and airport details continue to use Aviationstack.</p>
                {flightError && <div className="tracking-message tracking-error" role="alert">{flightError}</div>}
                {flightLoading && <div className="tracking-empty" role="status">Looking up this flight…</div>}
                {flightResult && !flightLoading && (
                    <div className="tracking-board">
                        <div className="tracking-board-heading">
                            <div>
                                <p className="eyebrow dark">FLIGHT {flightResult.flightNumber} · UPDATED {new Date(flightResult.checkedAt).toLocaleTimeString("en-IN", {timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit"})} IST</p>
                                <h2>{flightResult.flights.length ? `${flightResult.flights.length} result${flightResult.flights.length === 1 ? "" : "s"}` : "No matching flights"}</h2>
                            </div>
                        </div>
                        {flightResult.flights.length === 0 ? (
                            <div className="tracking-empty">The provider returned no flight matching this number in the tracking window. Check the flight number and try later.</div>
                        ) : (
                            <div className="tracking-flight-list">
                                {flightResult.flights.map((flight) => (
                                    <FlightRow key={flight.flightId} flight={flight} direction="dep" checkedAt={flightResult.checkedAt}
                                        selected={flight.flightId === selectedTrackedFlightId}
                                        onTrack={() => setSelectedTrackedFlightId((current) => current === flight.flightId ? null : flight.flightId)} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>
            <p className="tracking-disclaimer">Provider information may be delayed or incomplete. Flight times are displayed as airport-local clock values; timezone labels come from the provider. Confirm changes with the airline or airport.</p>
        </main>
    );
};

const FlightRow = ({flight: initialFlight, direction, checkedAt, selected, onTrack}: {
    flight: AirportFlightStatus;
    direction: AirportDirection;
    checkedAt: string;
    selected: boolean;
    onTrack: () => void;
}) => {
    const [latest, setLatest] = useState<{sourceId: string; flight: AirportFlightStatus; checkedAt: string} | null>(null);
    const hasLatest = latest?.sourceId === initialFlight.flightId && Date.parse(latest.checkedAt) >= Date.parse(checkedAt);
    const flight = hasLatest ? latest.flight : initialFlight;
    const updatedAt = hasLatest ? latest.checkedAt : checkedAt;
    const updateFlight = useCallback((next: AirportFlightStatus, updated: string) => {
        const stop = direction === "arr" ? next.arrival : next.departure;
        setLatest({sourceId: initialFlight.flightId, flight: {...next, flightId: initialFlight.flightId, scheduledTime: stop.scheduledTime, estimatedTime: stop.estimatedTime, actualTime: stop.actualTime, terminal: stop.terminal, gate: stop.gate, baggage: direction === "arr" ? stop.baggage : null, delayMinutes: stop.delayMinutes}, checkedAt: updated});
    }, [initialFlight.flightId, direction]);
    const stop = direction === "arr" ? flight.arrival : flight.departure;
    const relevantTime = stop.actualTime ?? stop.estimatedTime ?? stop.scheduledTime;
    const displayStatus = airportBoardStatus(flight, direction, Date.parse(updatedAt));
    return (
        <article className={`tracking-flight-row${selected ? " is-selected" : ""}`}>
            <div className="tracking-time-block">
                <strong>{localTime(relevantTime)}</strong>
                <small>{direction === "arr" ? "Arrival" : "Departure"} · {stop.timezone || "Asia/Kolkata"}</small>
                <small>Flight date · {localDate(flight.flightDate ?? stop.scheduledTime ?? relevantTime)}</small>
                {stop.scheduledTime && relevantTime !== stop.scheduledTime &&
                    <small>Sched {localTime(stop.scheduledTime)}</small>}
                <small>{flight.source ?? "Aviationstack"}</small>
            </div>
            <div className="tracking-flight-main">
                <strong>{flight.airline} <span>{flight.airlineCode} {flight.flightNumber}</span></strong>
                <p>{direction === "arr" ? `From ${flight.origin}` : `To ${flight.destination}`}</p>
            </div>
            <div className="tracking-gate-info">
                <span>{flight.terminal ? `Terminal ${flight.terminal}` : "Terminal —"}</span>
                <span>{direction === "arr" ? "Belt" : "Gate"} {direction === "arr" ? flight.baggage ?? "—" : flight.gate ?? "—"}</span>
            </div>
            <span className={`tracking-status status-${statusClass(displayStatus)}`}>{displayStatus}</span>
            <button className="tracking-track-button" type="button" onClick={onTrack} aria-label={`${selected ? "Hide" : "Show"} more details for flight ${flight.airlineCode}${flight.flightNumber}`}>
                {selected ? "Hide details" : "More details"}
            </button>
            {selected && <FlightStatusDetails flight={flight} checkedAt={updatedAt} onClose={onTrack} onUpdate={updateFlight}/>}
        </article>
    );
};

export default AirportTracking;
