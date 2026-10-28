"use client";

import {useEffect, useState, type SubmitEvent} from "react";
import {airports} from "@/data/airports";
import type {FlightSearchQuery} from "@/types/flight";
import AirportField from "./AirportField";

type FlightSearchFormProps = {
    loading: boolean;
    onSearch: (query: FlightSearchQuery) => void;
};

const futureIndiaDate = (days: number) => {
    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
    const date = new Date(`${today}T00:00:00Z`); /**/
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

const FlightSearchForm = ({loading, onSearch}: FlightSearchFormProps) => {
    const [origin, setOrigin] = useState("BOM");
    const [destination, setDestination] = useState("BLR");
    const [departureDate, setDepartureDate] = useState("");
    const [roundTrip, setRoundTrip] = useState(false);
    const [returnDate, setReturnDate] = useState("");
    const [minimumDepartureDate, setMinimumDepartureDate] = useState("");
    const [message, setMessage] = useState("");

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setMinimumDepartureDate(futureIndiaDate(0));
            setDepartureDate(futureIndiaDate(7));
            setReturnDate(futureIndiaDate(12));
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (origin === destination) {
            setMessage("Choose different origin and destination airports.");
            return;
        }
        if (roundTrip && (!returnDate || returnDate < departureDate)) {
            setMessage("Choose a return date on or after your departure date.");
            return;
        }

        const originCity = airports.find((airport) => airport.code === origin)?.city;
        const destinationCity = airports.find((airport) => airport.code === destination)?.city;
        setMessage(`Searching ${originCity} (${origin}) to ${destinationCity} (${destination})…`);
        onSearch({
            origin,
            destination,
            date: departureDate,
            adults: "1",
            children: "0",
            infants: "0",
            cabin: "Economy",
            ...(roundTrip ? {returnDate} : {}),
        });
    };

    const swapAirports = () => {
        setOrigin(destination);
        setDestination(origin);
        setMessage("");
    };

    return (
        <section className="search-panel" aria-label="Flight search">
            <div className="search-heading">
                <div className="trip-summary">
                    <select
                        className="trip-pill"
                        aria-label="Trip type"
                        value={roundTrip ? "roundtrip" : "oneway"}
                        disabled={loading}
                        onChange={(event) => {
                            const isRoundTrip = event.target.value === "roundtrip";
                            setRoundTrip(isRoundTrip);
                            if (!isRoundTrip) setReturnDate("");
                            setMessage("");
                        }}
                    >
                        <option value="oneway">↗ One way</option>
                        <option value="roundtrip">⇄ Round trip</option>
                    </select>
                    <span className="search-meta">1 adult <span>·</span> Economy <span>·</span> India only</span>
                </div>
                <span className="mode-label">Data <strong>FlightAPI</strong></span>
            </div>

            <form id="flight-search" onSubmit={handleSubmit}>
                <AirportField label="From" name="origin" value={origin} onChange={(value) => {
                    setOrigin(value);
                    setMessage("");
                }}/>
                <button type="button" className="swap-airports" aria-label="Swap departure and destination"
                        onClick={swapAirports} disabled={loading}>⇄
                </button>
                <AirportField label="To" name="destination" value={destination} onChange={(value) => {
                    setDestination(value);
                    setMessage("");
                }}/>
                <label className="date-field" htmlFor="departure-date">
                    <span>DEPARTURE</span>
                    <input
                        id="departure-date"
                        name="departureDate"
                        type="date"
                        value={departureDate}
                        min={minimumDepartureDate || undefined}
                        onChange={(event) => {
                            const nextDate = event.target.value;
                            setDepartureDate(nextDate);
                            if (returnDate && returnDate < nextDate) setReturnDate("");
                            setMessage("");
                        }}
                        required
                    />
                    <small>All flight times are IST</small>
                </label>
                <button type="submit" className="search-button" disabled={loading}>
                    {loading ? "Searching…" : "Search flights"} <span aria-hidden="true">↗</span>
                </button>
            </form>

            {roundTrip && (
                <label className="return-date-field" htmlFor="return-date">
                    RETURN DATE
                    <input
                        id="return-date"
                        name="returnDate"
                        form="flight-search"
                        type="date"
                        min={departureDate || undefined}
                        value={returnDate}
                        onChange={(event) => {
                            setReturnDate(event.target.value);
                            setMessage("");
                        }}
                        required
                    />
                </label>
            )}

            {message && <p className="search-feedback" aria-live="polite">{message}</p>}
            <div className="data-notice">
                <span className="notice-dot" aria-hidden="true"/>
                <p>Searches reuse saved results from the cache file. Get current prices to make a new FlightAPI request;
                    saved prices may be outdated.</p>
            </div>
        </section>
    );
};

export default FlightSearchForm;
