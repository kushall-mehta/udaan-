"use client";

import {useState, type FormEvent} from "react";
import {airports} from "@/data/airports";
import type {AirportDirection, AirportFlightStatus, AirportTrackingResponse} from "@/types/airport-tracking";

type ApiError = { error?: string };
const localTime = (value: string | null) => value
    ? new Date(value).toLocaleTimeString("en-IN", {timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23"})
    : "—";
const statusClass = (status: string) => status.toLowerCase().replaceAll(" ", "-");

const AirportTracking = () => {
    const [airport, setAirport] = useState("BOM");
    const [direction, setDirection] = useState<AirportDirection>("arr");
    const [result, setResult] = useState<AirportTrackingResponse | null>(null);
    const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const loadFlights = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        setLoading(true);
        setError("");
        setSelectedFlightId(null);
        const params = new URLSearchParams({airport, direction});
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

    const selectedFlight = result?.flights.find((flight) => flight.flightId === selectedFlightId) ?? null;
    const airportInfo = airports.find((item) => item.code === result?.airport);

    return (
        <main className="airport-tracking-page">
            <section className="tracking-hero">
                <p className="eyebrow dark"><span aria-hidden="true"/>AVIATIONSTACK FLIGHT STATUS & TRACK</p>
                <h1>Know what’s<br/><em>in the air.</em></h1>
                <p>Live arrivals, departures, and available flight positions for airports across India.</p>
            </section>

            <section className="tracking-panel" aria-label="Airport flight tracking">
                <form className="tracking-controls" onSubmit={(event) => void loadFlights(event)}>
                    <label>
                        <span>AIRPORT</span>
                        <select value={airport} onChange={(event) => setAirport(event.target.value)}>
                            {airports.map((item) => <option key={item.code} value={item.code}>{item.city} · {item.code}</option>)}
                        </select>
                    </label>
                    <div className="tracking-direction" role="group" aria-label="Flight direction">
                        <button type="button" aria-pressed={direction === "arr"} onClick={() => setDirection("arr")}>Arrivals</button>
                        <button type="button" aria-pressed={direction === "dep"} onClick={() => setDirection("dep")}>Departures</button>
                    </div>
                    <button className="tracking-search" type="submit" disabled={loading}>
                        {loading ? "Checking Aviationstack…" : result ? "Refresh board" : "Show flights"}
                    </button>
                </form>
                <p className="tracking-window-note">Shows current provider results. Refresh manually to check for updates; the page does not poll automatically.</p>

                {error && <div className="tracking-message tracking-error" role="alert">{error}</div>}
                {!error && !result && !loading && <div className="tracking-empty">Choose an airport and arrivals or departures to view its flight board.</div>}
                {loading && <div className="tracking-empty" role="status">Loading airport status and available live positions…</div>}

                {result && !loading && (
                    <div className="tracking-board">
                        <div className="tracking-board-heading">
                            <div>
                                <p className="eyebrow dark">{result.direction === "arr" ? "ARRIVALS" : "DEPARTURES"} · UPDATED {new Date(result.checkedAt).toLocaleTimeString("en-IN", {timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit"})} IST</p>
                                <h2>{airportInfo?.city} <span>{result.airport}</span></h2>
                            </div>
                            <span className="tracking-flight-count">{result.flights.length} flights</span>
                        </div>

                        {result.flights.length === 0 ? (
                            <div className="tracking-empty">No flights were returned for this airport. Availability depends on provider coverage.</div>
                        ) : (
                            <div className="tracking-flight-list">
                                {result.flights.map((flight) => (
                                    <FlightRow key={flight.flightId} flight={flight} direction={result.direction}
                                        selected={flight.flightId === selectedFlightId}
                                        onTrack={() => setSelectedFlightId((current) => current === flight.flightId ? null : flight.flightId)} />
                                ))}
                            </div>
                        )}
                        {selectedFlight && <FlightTrackDetails flight={selectedFlight}/>}
                    </div>
                )}
            </section>
            <p className="tracking-disclaimer">Flight status and positions are supplied by Aviationstack and may be delayed or unavailable. Confirm gate and schedule changes with the airline or airport.</p>
        </main>
    );
};

const FlightRow = ({flight, direction, selected, onTrack}: {
    flight: AirportFlightStatus;
    direction: AirportDirection;
    selected: boolean;
    onTrack: () => void;
}) => {
    const relevantTime = flight.estimatedTime ?? flight.actualTime ?? flight.scheduledTime;
    return (
        <article className={`tracking-flight-row${selected ? " is-selected" : ""}`}>
            <div className="tracking-time-block">
                <strong>{localTime(relevantTime)}</strong>
                {flight.estimatedTime && flight.scheduledTime && flight.estimatedTime !== flight.scheduledTime &&
                    <small>Sched {localTime(flight.scheduledTime)}</small>}
            </div>
            <div className="tracking-flight-main">
                <strong>{flight.airline} <span>{flight.airlineCode} {flight.flightNumber}</span></strong>
                <p>{direction === "arr" ? `From ${flight.origin}` : `To ${flight.destination}`}</p>
            </div>
            <div className="tracking-gate-info">
                <span>{flight.terminal ? `Terminal ${flight.terminal}` : "Terminal —"}</span>
                <span>{direction === "arr" ? "Belt" : "Gate"} {direction === "arr" ? flight.baggage ?? "—" : flight.gate ?? "—"}</span>
            </div>
            <span className={`tracking-status status-${statusClass(flight.status)}`}>{flight.status}</span>
            <button className="tracking-track-button" type="button" onClick={onTrack} disabled={!flight.track?.positions.length}>
                {flight.track?.positions.length ? selected ? "Hide track" : "View track" : "No live track"}
            </button>
        </article>
    );
};

const FlightTrackDetails = ({flight}: { flight: AirportFlightStatus }) => {
    const latest = flight.track?.positions[0];
    if (!latest) return null;
    const mapUrl = new URL("https://www.openstreetmap.org/export/embed.html");
    mapUrl.searchParams.set("bbox", `${latest.longitude - 0.25},${latest.latitude - 0.18},${latest.longitude + 0.25},${latest.latitude + 0.18}`);
    mapUrl.searchParams.set("layer", "mapnik");
    mapUrl.searchParams.set("marker", `${latest.latitude},${latest.longitude}`);
    const mapLink = `https://www.openstreetmap.org/?mlat=${latest.latitude}&mlon=${latest.longitude}#map=8/${latest.latitude}/${latest.longitude}`;

    return (
        <section className="flight-track-details" aria-label={`Track for ${flight.airlineCode} ${flight.flightNumber}`}>
            <div className="track-details-heading">
                <div><p className="eyebrow dark">LATEST LIVE POSITION</p><h3>{flight.airlineCode} {flight.flightNumber}</h3></div>
                <span>{flight.origin} → {flight.destination}</span>
            </div>
            <div className="track-details-grid">
                <iframe className="track-map" title={`Map showing ${flight.airlineCode} ${flight.flightNumber} position`}
                    src={mapUrl.toString()} loading="lazy" referrerPolicy="no-referrer"/>
                <div className="track-position-summary">
                    <span className="position-label">LATEST POSITION</span>
                    <strong>{latest.latitude.toFixed(4)}°, {latest.longitude.toFixed(4)}°</strong>
                    {latest.altitude !== null && <p>Altitude {latest.altitude.toLocaleString()} (provider units)</p>}
                    {latest.speed !== null && <p>Speed {latest.speed.toLocaleString()} (provider units)</p>}
                    <p>{latest.source} · {new Date(latest.timestamp).toLocaleString("en-IN", {timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short"})} IST</p>
                    <a href={mapLink} target="_blank" rel="noreferrer">Open position in OpenStreetMap ↗</a>
                </div>
            </div>
            <p className="track-estimate-note">Aviationstack returns the latest available position; a live position is not available for every flight.</p>
        </section>
    );
};

export default AirportTracking;
