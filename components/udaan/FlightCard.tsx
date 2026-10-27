"use client";

import { useState } from "react";
import type { Flight, FlightLeg } from "@/types/flight";

type FlightCardProps = { flight: Flight; cheapest: boolean };

const time = (value: string) => new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));

const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const rupees = (amount: number) => `₹${Math.round(amount).toLocaleString("en-IN")}`;

const Journey = ({ leg, label }: { leg: FlightLeg; label: string }) => (
  <div className="flight-journey-block">
    {label && <small className="leg-label">{label}</small>}
    <div className="sample-route">
      <span><strong>{time(leg.departure)}</strong><small>{leg.origin}</small></span>
      <span className="route-arrow" aria-hidden="true">→</span>
      <span><strong>{time(leg.arrival)}</strong><small>{leg.destination}</small></span>
    </div>
    <small className="journey-meta">{duration(leg.duration)} · {leg.stops === null ? "Stops unknown" : leg.stops === 0 ? "Non-stop" : `${leg.stops} stop${leg.stops === 1 ? "" : "s"}`}</small>
  </div>
);

const FlightCard = ({ flight, cheapest }: FlightCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const sellers = [...flight.sellers].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  const bestSeller = sellers[0];
  const bestPrice = bestSeller?.price ?? flight.price;

  return (
    <article className={`fare-card ${expanded ? "fare-card-expanded" : ""}`}>
      <div className="fare-airline">
        <span className="airline-mark" aria-hidden="true">✈</span>
        <div><strong>{flight.airline}</strong><small>{flight.flightNumber || flight.airlineCode || "Flight option"}</small></div>
      </div>
      <div className="journey-stack">
        <Journey leg={flight} label="" />
        {flight.returnLeg && <Journey leg={flight.returnLeg} label="Return" />}
      </div>
      <div className="fare-price">
        {cheapest && <span className="lowest-tag">LOWEST ITINERARY FARE</span>}
        <strong>{rupees(bestPrice)}</strong>
        <small>{sellers.length} seller {sellers.length === 1 ? "option" : "options"}</small>
      </div>
      {bestSeller && (
        bestSeller.bookingUrl ? (
          <a className="best-booking-link" href={bestSeller.bookingUrl} target="_blank" rel="noopener noreferrer">
            Visit {bestSeller.name} · {rupees(bestSeller.price)} ↗
          </a>
        ) : (
          <button type="button" className="best-booking-link" disabled title="FlightAPI did not provide a booking link for this seller">
            {bestSeller.name} · {rupees(bestSeller.price)} · link unavailable
          </button>
        )
      )}
      <button
        type="button"
        className="seller-expand"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Hide booking sites ↑" : `Compare ${sellers.length} booking sites ↓`}
      </button>
      {expanded && (
        <div className="seller-options" aria-label={`Seller prices for ${flight.airline}`}>
          <h4>Compare booking sites · cheapest first</h4>
          {sellers.map((seller, index) => (
            <div className={`seller-option ${index === 0 ? "seller-best" : ""}`} key={seller.id}>
              <div><strong>{seller.name}</strong>{index === 0 && <span className="seller-best-label">Best price</span>}</div>
              <strong className="seller-price">{rupees(seller.price)}</strong>
              {seller.bookingUrl ? <a className="fare-action" href={seller.bookingUrl} target="_blank" rel="noopener noreferrer">Visit site ↗</a> : <button type="button" className="seller-link-unavailable" disabled>Link unavailable</button>}
            </div>
          ))}
        </div>
      )}
    </article>
  );
};

export default FlightCard;
