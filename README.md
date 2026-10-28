# Udaan

Udaan is a domestic flight search app for comparing itineraries across India. Search one-way or round-trip routes, filter and sort fares, and follow seller links to complete a booking. Udaan does not book flights.

Flight results come from FlightAPI. Each search requests current results first and may use provider credits. If FlightAPI cannot return results, Udaan falls back to a valid locally saved result for that search; saved prices can be outdated. If neither source has data, the search returns a clear error.

## Features

- Search routes between supported Indian airports.
- View Aviationstack arrival and departure boards with available live flight positions.
- Compare one-way and round-trip itineraries, including duration, stops, airline, and seller prices.
- Sort by price, duration, or departure time; filter by stops, airline, and maximum price.
- Request current FlightAPI results first and fall back to a saved result if the provider fails.
- Validate search inputs and provider responses on the server.

## Requirements

- Node.js 20.9 or newer
- npm
- A FlightAPI API key to fetch current fares
- An Aviationstack access key to use airport status and available live positions

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
AVIATIONSTACK_ACCESS_KEY=your_aviationstack_access_key
```

The airport tracking page uses Aviationstack's flights endpoint, filtering arrivals or departures by airport. Add your access key from the [Aviationstack dashboard](https://aviationstack.com/dashboard). The credential is used only by the server route and is never sent to the browser. Real-time position fields are available only when supplied for a flight, and API access, coverage, and request limits depend on your Aviationstack plan.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep your real API key private; `.env.local` is ignored by Git. Without a valid key, a search can still show a saved result; if there is no valid cache entry, the app returns a clear error.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Build the production app. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the flight search API tests. |

## Airport tracking

Open **Airport tracking** in the navigation, enter an Indian airport's IATA code, and choose arrivals or departures to load the current board. Optionally filter by an IST time range. Use **More details** to see schedule and status details and a live map position when available. The separate **Track by flight number** form shows only the exact searched code and departures scheduled in the next 24 hours. Times use AM/PM in IST; the API does not supply airline boarding-start times. Each refresh makes one Aviationstack API request; the time filter does not make extra requests, and the page does not poll automatically. A missing map position means the provider did not return a live location for that flight.

## Data and privacy

Flight searches are sent to the server-side FlightAPI integration. The API key is read from `FLIGHTAPI_KEY` and is not sent to the browser. Search results are cached in `.cache/flightapi/` on the server running the app; this local cache is excluded from Git and may not persist between deployments.

## Tech stack

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS 4
- FlightAPI for flight search data
- Aviationstack for airport flight status and live position data
