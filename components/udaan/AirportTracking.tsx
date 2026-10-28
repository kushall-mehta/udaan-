"use client";

import {useState, type FormEvent} from "react";
import {airports} from "@/data/airports";
import type {AirportDirection, AirportFlightStatus, AirportTrackingResponse, FlightTrackingResponse} from "@/types/airport-tracking";

type ApiError = { error?: string };
const exampleFlightNumbers = [
    {code: "AI2985", route: "DEL → BOM"},
    {code: "AI2549", route: "DEL → HYD"},
    {code: "6E6517", route: "DEL → CCU"},
];
const localTime = (value: string | null) => value
    ? new Date(value).toLocaleTimeString("en-IN", {timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23"})
    : "—";
const timeInMinutes = (value: string | null): number | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(parsed);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
};
const statusClass = (status: string) => status.toLowerCase().replaceAll(" ", "-");

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
    const fromMinutes = timeFrom ? Number(timeFrom.slice(0, 2)) * 60 + Number(timeFrom.slice(3, 5)) : null;
    const toMinutes = timeTo ? Number(timeTo.slice(0, 2)) * 60 + Number(timeTo.slice(3, 5)) : null;
    const filteredFlights = (result?.flights ?? []).filter((flight) => {
        if (fromMinutes !== null || toMinutes !== null) {
            const flightMinutes = timeInMinutes(flight.estimatedTime ?? flight.actualTime ?? flight.scheduledTime);
            if (flightMinutes === null) return false;
            if (fromMinutes !== null && toMinutes !== null) {
                if (fromMinutes <= toMinutes && (flightMinutes < fromMinutes || flightMinutes > toMinutes)) return false;
                if (fromMinutes > toMinutes && flightMinutes < fromMinutes && flightMinutes > toMinutes) return false;
            } else if (fromMinutes !== null && flightMinutes < fromMinutes) return false;
            else if (toMinutes !== null && flightMinutes > toMinutes) return false;
        }
        return true;
    });
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
                        <span>AIRPORT IATA CODE</span>
                        <input list="tracking-airports" value={airport} onChange={(event) => setAirport(event.target.value.toUpperCase())}
                            maxLength={3} pattern="[A-Za-z]{3}" placeholder="e.g. BOM" required aria-label="Airport IATA code" />
                        <datalist id="tracking-airports">
                            {airports.map((item) => <option key={item.code} value={item.code} label={item.city} />)}
                        </datalist>
                    </label>
                    <label>
                        <span>FROM (IST)</span>
                        <input type="time" value={timeFrom} onChange={(event) => setTimeFrom(event.target.value)} aria-label="Filter flights from time in India" />
                    </label>
                    <label>
                        <span>TO (IST)</span>
                        <input type="time" value={timeTo} onChange={(event) => setTimeTo(event.target.value)} aria-label="Filter flights until time in India" />
                    </label>
                    <div className="tracking-direction" role="group" aria-label="Flight direction">
                        <button type="button" aria-pressed={direction === "arr"} onClick={() => setDirection("arr")}>Arrivals</button>
                        <button type="button" aria-pressed={direction === "dep"} onClick={() => setDirection("dep")}>Departures</button>
                    </div>
                    <button className="tracking-search" type="submit" disabled={loading}>
                        {loading ? "Checking Aviationstack…" : result ? "Refresh board" : "Show flights"}
                    </button>
                </form>
                <p className="tracking-window-note">Airport code is sent to Aviationstack. IST time filters narrow the returned results locally; refresh manually to check for updates.</p>

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
                            <span className="tracking-flight-count">{filteredFlights.length}{filteredFlights.length !== result.flights.length ? ` / ${result.flights.length}` : ""} flights</span>
                        </div>

                        {filteredFlights.length === 0 ? (
                            <div className="tracking-empty">{result.flights.length === 0
                                ? "No flights were returned for this airport. Availability depends on provider coverage."
                                : "No flights match these flight-code and time filters."}</div>
                        ) : (
                            <div className="tracking-flight-list">
                                {filteredFlights.map((flight) => (
                                    <FlightRow key={flight.flightId} flight={flight} direction={result.direction}
                                        selected={flight.flightId === selectedFlightId}
                                        onTrack={() => setSelectedFlightId((current) => current === flight.flightId ? null : flight.flightId)} />
                                ))}
                            </div>
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
                <p className="tracking-window-note">Searches Aviationstack by flight number. Results depend on current provider coverage; a live map position is shown when available.</p>
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
                            <div className="tracking-empty">No current flight was returned for that number. Check the code and try again later.</div>
                        ) : (
                            <div className="tracking-flight-list">
                                {flightResult.flights.map((flight) => (
                                    <FlightRow key={flight.flightId} flight={flight} direction="arr"
                                        selected={flight.flightId === selectedTrackedFlightId}
                                        onTrack={() => setSelectedTrackedFlightId((current) => current === flight.flightId ? null : flight.flightId)} />
                                ))}
                            </div>
                        )}
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
            <button className="tracking-track-button" type="button" onClick={onTrack} aria-label={`${selected ? "Hide" : "Show"} more details for flight ${flight.airlineCode}${flight.flightNumber}`}>
                {selected ? "Hide details" : "More details"}
            </button>
            {selected && <FlightTrackDetails flight={flight}/>}
        </article>
    );
};

const FlightTrackDetails = ({flight}: { flight: AirportFlightStatus }) => {
    const latest = flight.track?.positions[0];
    const mapUrl = latest ? new URL("https://www.openstreetmap.org/export/embed.html") : null;
    if (latest && mapUrl) {
        mapUrl.searchParams.set("bbox", `${latest.longitude - 0.25},${latest.latitude - 0.18},${latest.longitude + 0.25},${latest.latitude + 0.18}`);
        mapUrl.searchParams.set("layer", "mapnik");
    }
    const mapLink = latest ? `https://www.openstreetmap.org/?mlat=${latest.latitude}&mlon=${latest.longitude}#map=8/${latest.latitude}/${latest.longitude}` : null;

    return (
        <section className="flight-track-details" aria-label={`Track for ${flight.airlineCode} ${flight.flightNumber}`}>
            <div className="track-details-heading">
                <div><p className="eyebrow dark">FLIGHT DETAILS</p><h3>{flight.airlineCode} {flight.flightNumber}</h3></div>
                <span>{flight.origin} → {flight.destination}</span>
            </div>
            <div className="track-details-grid">
                {latest && mapUrl ? (
                    <div className="track-map-frame">
                        <iframe className="track-map" title={`Map showing ${flight.airlineCode} ${flight.flightNumber} position`}
                            src={mapUrl.toString()} loading="lazy" referrerPolicy="no-referrer"/>
                        <span className="flight-map-marker" role="img" aria-label={`${flight.airlineCode} ${flight.flightNumber} reported position`}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z"/></svg>
                        </span>
                    </div>
                ) :
                    <div className="track-map track-map-empty">No live map position is available for this flight right now.</div>}
                <div className="track-position-summary">
                    <span className="position-label">STATUS & SCHEDULE</span>
                    <strong>{flight.status}</strong>
                    <p>Scheduled {localTime(flight.scheduledTime)}</p>
                    <p>Estimated {localTime(flight.estimatedTime)}</p>
                    <p>Actual {localTime(flight.actualTime)}</p>
                    <p>Terminal {flight.terminal ?? "—"} · Gate {flight.gate ?? "—"}</p>
                    {flight.baggage && <p>Baggage belt {flight.baggage}</p>}
                    {flight.delayMinutes !== null && <p>Delay {flight.delayMinutes} min</p>}
                    {latest && <>
                        <span className="position-label">LATEST LIVE POSITION</span>
                        <strong>{latest.latitude.toFixed(4)}°, {latest.longitude.toFixed(4)}°</strong>
                        {latest.altitude !== null && <p>Altitude {latest.altitude.toLocaleString()} (provider units)</p>}
                        {latest.speed !== null && <p>Speed {latest.speed.toLocaleString()} (provider units)</p>}
                        <p>{latest.source} · {new Date(latest.timestamp).toLocaleString("en-IN", {timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short"})} IST</p>
                        {mapLink && <a href={mapLink} target="_blank" rel="noreferrer">Open position in OpenStreetMap ↗</a>}
                    </>}
                </div>
            </div>
            <p className="track-estimate-note">Aviationstack returns live positions when available; not every flight includes a current map location.</p>
        </section>
    );
};

export default AirportTracking;
