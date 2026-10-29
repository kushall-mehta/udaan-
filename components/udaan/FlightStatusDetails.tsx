"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {airports} from "@/data/airports";
import {formatAirportDate, formatAirportTime, localNowMinutes, localWallClockMinutes} from "@/lib/flights/airportTime";
import {flightJourneyProgress, matchingFlightLeg, stopTime, stopTimeLabel, summarizeFlightStatus} from "@/lib/flights/statusSummary";
import type {AirportFlightStatus, FlightStopStatus, FlightTrackingResponse} from "@/types/airport-tracking";

const time = formatAirportTime;
const calendarDate = (value: string | null) => formatAirportDate(value, true);
const instantTime = (value: string) => new Date(value).toLocaleTimeString("en-IN", {timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true}).replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
const instantDate = (value: string) => new Date(value).toLocaleDateString("en-IN", {timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long"});
const city = (code: string) => airports.find((airport) => airport.code === code)?.city ?? code;

const Endpoint = ({stop, side, now, flightStatus}: {stop: FlightStopStatus; side: "departure" | "arrival"; now: number; flightStatus: string}) => {
    const displayedTimeType = stopTimeLabel(stop);
    const providerNote = flightStatus === "Arrived" && displayedTimeType === "Actual"
        ? "Reported by provider"
        : flightStatus === "In flight" && side === "departure" && displayedTimeType === "Actual"
            ? "Reported by provider"
            : flightStatus === "In flight" && side === "arrival" && displayedTimeType === "Estimated"
                ? "Estimate · may change"
                : "";

    return (
        <div className={`journey-endpoint journey-${side}`}>
            <strong className="journey-time">{time(stopTime(stop))}</strong>
            <span className="journey-time-kind">{displayedTimeType} {side} · {stop.timezone || "Asia/Kolkata"}{stop.actualTime && (localWallClockMinutes(stop.actualTime) ?? 0) > (localNowMinutes(now, stop.timezone || "Asia/Kolkata") ?? 0) ? " (provider time unconfirmed)" : ""}</span>
            <span className="journey-provider-note" aria-hidden={!providerNote}>{providerNote}</span>
            <p>Scheduled {time(stop.scheduledTime)}</p>
            <p>{calendarDate(stopTime(stop))}</p>
        </div>
    );
};

const AirportFacilities = ({stop, arrival = false}: {stop: FlightStopStatus; arrival?: boolean}) => (
    <dl className="journey-facilities">
        <div><dt>Terminal</dt><dd>{stop.terminal ?? "—"}</dd></div>
        <div><dt>Gate</dt><dd>{stop.gate ?? "—"}</dd></div>
        {arrival && <div><dt>Baggage belt</dt><dd>{stop.baggage ?? "Not available"}</dd></div>}
    </dl>
);

const FlightStatusDetails = ({flight: initialFlight, checkedAt, onClose, onUpdate}: {flight: AirportFlightStatus; checkedAt: string; onClose: () => void; onUpdate?: (flight: AirportFlightStatus, checkedAt: string) => void}) => {
    const [now, setNow] = useState(() => Date.parse(checkedAt));
    const [refreshed, setRefreshed] = useState<{sourceId: string; flight: AirportFlightStatus; checkedAt: string} | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState("");
    const requestRef = useRef<AbortController | null>(null);
    const lastRequestRef = useRef(Date.parse(checkedAt));
    const flight = refreshed?.sourceId === initialFlight.flightId ? refreshed.flight : initialFlight;
    const updatedAt = refreshed?.sourceId === initialFlight.flightId ? refreshed.checkedAt : checkedAt;

    const refreshStatus = useCallback(async () => {
        if (requestRef.current && !requestRef.current.signal.aborted) return;
        const controller = new AbortController();
        requestRef.current = controller;
        lastRequestRef.current = Date.now();
        setRefreshing(true);
        setRefreshError("");
        try {
            const params = new URLSearchParams({flightNumber: `${initialFlight.airlineCode}${initialFlight.flightNumber}`, origin: initialFlight.origin, destination: initialFlight.destination});
            if (initialFlight.flightDate) params.set("flightDate", initialFlight.flightDate);
            if (initialFlight.departure.scheduledTime) params.set("scheduledDeparture", initialFlight.departure.scheduledTime);
            const endpoint = initialFlight.source === "Google via SerpApi" ? "/api/flight-tracking" : "/api/flight-status";
            const response = await fetch(`${endpoint}?${params}`, {cache: "no-store", signal: controller.signal});
            const body = await response.json() as FlightTrackingResponse & {error?: string};
            if (!response.ok) throw new Error(body.error || "Could not update this flight.");
            const next = matchingFlightLeg(initialFlight, body.flights);
            if (!next) throw new Error("No newer details were returned for this flight. Showing the last available update.");
            setRefreshed({sourceId: initialFlight.flightId, flight: next, checkedAt: body.checkedAt});
            onUpdate?.(next, body.checkedAt);
        } catch (error: unknown) {
            if (!controller.signal.aborted) setRefreshError(error instanceof Error ? error.message : "Could not refresh flight status. Showing the last available details.");
        } finally {
            if (requestRef.current === controller) requestRef.current = null;
            if (!controller.signal.aborted) setRefreshing(false);
        }
    }, [initialFlight, onUpdate]);

    useEffect(() => {
        const firstTick = window.setTimeout(() => setNow(Date.now()), 0);
        const clock = window.setInterval(() => setNow(Date.now()), 1000);
        return () => {
            window.clearTimeout(firstTick);
            window.clearInterval(clock);
            requestRef.current?.abort();
        };
    }, []);
    useEffect(() => {
        if (!autoRefresh) return;
        const tick = () => {
            if (!document.hidden && Date.now() - lastRequestRef.current >= 60_000) void refreshStatus();
        };
        const interval = window.setInterval(tick, 60_000);
        document.addEventListener("visibilitychange", tick);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", tick);
        };
    }, [autoRefresh, refreshStatus]);

    const observationTime = Date.parse(updatedAt);
    const summary = summarizeFlightStatus(flight, observationTime);
    const progress = flightJourneyProgress(flight, now, observationTime);
    const percent = progress.percent === null ? null : Math.floor(progress.percent);
    const progressSource = progress.source === "position" ? "Live-position estimate" : progress.source === "time" ? "Time estimate" : progress.source === "status" ? "Reported status" : "Progress unavailable";
    return (
        <section className="flight-status-card" data-tone={summary.tone} data-progress-source={progress.source} aria-label={`Flight status for ${flight.airlineCode}${flight.flightNumber}`}>
            <header className="journey-heading">
                <h3>{city(flight.origin)} to {city(flight.destination)}</h3>
                <span>{flight.airlineCode} {flight.flightNumber}</span>
            </header>
            <div className="journey-update-row">
                <p className="journey-updated">Flight date {calendarDate(flight.flightDate ? `${flight.flightDate}T00:00:00Z` : flight.departure.scheduledTime)} · Checked {instantDate(updatedAt)}, {instantTime(updatedAt)} IST · {flight.source ?? "Aviationstack"}{flight.sourceUpdatedAt ? <> · Provider updated {instantDate(flight.sourceUpdatedAt)}, {instantTime(flight.sourceUpdatedAt)} IST</> : " · Provider update time unavailable"}</p>
                <div className="journey-refresh-controls">
                    <label><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)}/>Auto-refresh 1 min</label>
                    <button type="button" onClick={() => void refreshStatus()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh status"}</button>
                </div>
            </div>
            {refreshError && <p className="journey-refresh-error" role="status">{refreshError} Showing the last available record; status was not refreshed.</p>}
            <div className="journey-status"><span>{summary.label}</span><p>{summary.message}</p></div>
            <div className="journey-route">
                <strong>{flight.origin}</strong>
                <span className="journey-line" role="progressbar" aria-label={`${flight.origin} to ${flight.destination} journey completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? "Progress unavailable" : `${percent}% complete, ${progressSource}`} data-complete={percent === 100}>
                    <span className="journey-line-fill" style={{width: `${progress.percent ?? 0}%`}}/>
                    <span className="journey-dot journey-dot-start"/>
                    <span className="journey-dot journey-dot-end"/>
                    {percent !== null && percent > 0 && percent < 100 && <span className="journey-plane" style={{left: `${progress.percent}%`}} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z"/></svg></span>}
                </span>
                <strong>{flight.destination}</strong>
            </div>
            <div className="journey-progress-summary"><strong>{percent === null ? "Progress unavailable" : `${percent}% journey complete`}</strong><span>{progressSource}</span></div>
            <p className="journey-progress-note">{progress.note}</p>
            <div className="journey-times"><Endpoint stop={flight.departure} side="departure" now={observationTime} flightStatus={summary.label}/><Endpoint stop={flight.arrival} side="arrival" now={observationTime} flightStatus={summary.label}/></div>
            <div className="journey-airports"><AirportFacilities stop={flight.departure}/><AirportFacilities stop={flight.arrival} arrival/></div>
            {flight.airlineCode === "6E" ? (
                <p className="journey-note">Times are airport-local clock values from {flight.source ?? "Aviationstack"} and may differ from IndiGo. <a href="https://www.goindigo.in/check-flight-status.html" target="_blank" rel="noopener noreferrer">Check IndiGo flight status</a>. Timezone labels and status details depend on provider updates.</p>
            ) : (
            <p className="journey-note">Times are displayed as airport-local clock values; the provider timezone is shown for reference. Status and baggage belt details depend on provider updates; boarding times are not supplied.</p>
            )}
            <p className="journey-time-disclaimer">Times may differ by a few minutes from other flight sites, as each source reports live data differently.</p>
            <button type="button" className="journey-collapse" onClick={onClose} aria-label={`Collapse details for flight ${flight.airlineCode}${flight.flightNumber}`}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
        </section>
    );
};

export default FlightStatusDetails;
