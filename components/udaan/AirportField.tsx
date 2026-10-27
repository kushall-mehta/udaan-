"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { airports } from "@/data/airports";

type AirportFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
};

const displayAirport = (code: string) => {
  const airport = airports.find((item) => item.code === code);
  return airport ? `${airport.city} (${airport.code})` : code;
};

const exactTextPattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const AirportField = ({ label, name, value, onChange }: AirportFieldProps) => {
  const selectedAirport = airports.find((airport) => airport.code === value);
  const [searchText, setSearchText] = useState(() => displayAirport(value));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredAirports = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase();
    if (!search) return airports;
    return airports.filter((airport) =>
      `${airport.city} ${airport.code} ${airport.name}`.toLocaleLowerCase().includes(search),
    );
  }, [searchText]);

  const chooseAirport = (code: string) => {
    onChange(code);
    setSearchText(displayAirport(code));
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filteredAirports.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && filteredAirports[activeIndex]) {
      event.preventDefault();
      chooseAirport(filteredAirports[activeIndex].code);
    } else if (event.key === "Escape") {
      setOpen(false);
      setSearchText(displayAirport(value));
    }
  };

  return (
    <div className="airport-field" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <label htmlFor={name}><span>{label.toUpperCase()}</span></label>
      <div className="airport-picker">
        <input
          id={name}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${name}-airport-list`}
          aria-activedescendant={open && filteredAirports[activeIndex] ? `${name}-airport-${filteredAirports[activeIndex].code}` : undefined}
          autoComplete="off"
          pattern={exactTextPattern(displayAirport(value))}
          title="Choose an airport from the suggestions."
          value={open ? searchText : displayAirport(value)}
          onFocus={() => { setSearchText(""); setOpen(true); setActiveIndex(0); }}
          onChange={(event) => { setSearchText(event.target.value); setOpen(true); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          required
        />
        <button
          type="button"
          className="airport-toggle"
          aria-label={`Browse ${label.toLowerCase()} airports`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { setOpen((isOpen) => !isOpen); setSearchText(""); setActiveIndex(0); }}
        >⌄</button>
        {open && (
          <div className="airport-options" id={`${name}-airport-list`} role="listbox" aria-label={`${label} airports`}>
            {filteredAirports.length ? filteredAirports.map((airport, index) => (
              <button
                type="button"
                role="option"
                id={`${name}-airport-${airport.code}`}
                aria-selected={airport.code === value}
                className={index === activeIndex ? "airport-option-active" : ""}
                key={airport.code}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseAirport(airport.code)}
              >
                <span>{airport.city} <strong>({airport.code})</strong></span>
                <small>{airport.name}</small>
              </button>
            )) : (
              <p className="airport-no-results" role="option" aria-selected="false" aria-disabled="true">No matching airports</p>
            )}
          </div>
        )}
      </div>
      <small title={selectedAirport?.name}>{selectedAirport?.name}</small>
    </div>
  );
};

export default AirportField;
