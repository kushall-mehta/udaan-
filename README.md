# Udaan

Udaan is a domestic flight search app for comparing itineraries across India. Search one-way or round-trip routes, filter and sort fares, and follow seller links to complete a booking. Udaan does not book flights.

Flight results come from FlightAPI. Searches reuse locally saved results when available; requesting current prices makes a new FlightAPI request and may use provider credits. Saved prices can be outdated.

## Features

- Search routes between supported Indian airports.
- Compare one-way and round-trip itineraries, including duration, stops, airline, and seller prices.
- Sort by price, duration, or departure time; filter by stops, airline, and maximum price.
- Reuse local search results and explicitly request an updated fare from FlightAPI.
- Validate search inputs and provider responses on the server.

## Requirements

- Node.js 20.9 or newer
- npm
- A FlightAPI API key to fetch current fares

## Getting started

Install dependencies:

```bash
npm install
```

Create `.env.local` from the example file:

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux, use `cp .env.example .env.local` instead. Add your key to `.env.local`:

```dotenv
FLIGHTAPI_KEY=your_flightapi_key
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep your real API key private; `.env.local` is ignored by Git. Without a valid key, current-price requests will return an error. Previously saved results may still be available from the local cache.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Build the production app. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the flight search API tests. |

## Data and privacy

Flight searches are sent to the server-side FlightAPI integration. The API key is read from `FLIGHTAPI_KEY` and is not sent to the browser. Search results are cached in `.cache/flightapi/` on the server running the app; this local cache is excluded from Git and may not persist between deployments.

## Tech stack

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS 4
- FlightAPI for flight search data
