# Udaan

Udaan is a domestic flight search app for comparing itineraries across India. Search one-way or round-trip routes, filter and sort fares, and follow seller links to complete a booking. Udaan does not book flights.

Flight results come from FlightAPI. Each search requests current results first and may use provider credits. If FlightAPI cannot return results, Udaan falls back to a valid locally saved result for that search; saved prices can be outdated. If neither source has data, the search returns a clear error.

## Features

- Search routes between supported Indian airports.
- View airport arrival and departure boards, look up a flight number, and expand a route status card with departure/arrival times, delays, terminals, and gates.
- Compare one-way and round-trip itineraries, including duration, stops, airline, and seller prices.
- Sort by price, duration, or departure time; filter by stops, airline, and maximum price.
- Request current FlightAPI results first and fall back to a saved result if the provider fails.
- Validate search inputs and provider responses on the server.

## Requirements

- Node.js 20.9 or newer
- npm
- Docker Engine and Docker Compose (optional, for containerized development/deployment)
- A FlightAPI API key to fetch current fares
- An Aviationstack access key for airport lists
- A SerpApi key for Google flight-status lookups

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
SERPAPI_API_KEY=your_serpapi_key
```

The airport tracking page uses Aviationstack for the airport list. Flight-number tracking uses Google Search flight results through SerpApi; airport details remain on Aviationstack; configure `SERPAPI_API_KEY` from its dashboard. SerpApi is a third-party service and is not an official Google flight-status API. Get the airport-list key from the [Aviationstack dashboard](https://aviationstack.com/dashboard) and the flight-status key from the [SerpApi dashboard](https://serpapi.com/dashboard). Keys are used only by server routes and are never sent to the browser.

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
| `npm run typecheck` | Generate Next.js route types and run TypeScript. |
| `npm test` | Run the flight search API tests. |

## Docker

Create `.env.local` from `.env.example` and add real provider keys. Compose passes these values to the container at runtime; they are excluded from the Docker build context and are not baked into the image.

```bash
docker compose up --build -d
```

Open [http://localhost:3000](http://localhost:3000). Follow logs with `docker compose logs -f udaan`, and stop the container with `docker compose down`. The `flightapi-cache` named volume keeps saved fare results across container rebuilds. `docker compose down -v` also deletes that cache volume.

The production image uses Next.js standalone output and runs as a non-root user. To change the host port, set `UDAAN_PORT`, for example `UDAAN_PORT=8080 docker compose up --build -d`.

## CI/CD and deployment

The GitHub Actions workflow at `.github/workflows/ci-cd.yml` runs lint, TypeScript, tests, and the Next.js production build on pull requests and pushes to `main`. Pushes to `main` and version tags such as `v1.0.0` publish the Docker image to [GitHub Container Registry](https://github.com/kushall-mehta/udaan-/pkgs/container/udaan-app), with `main`, `latest`, commit-SHA, and release tags as applicable. A push to `main` also deploys to Vercel after verification succeeds.

For Vercel CI/CD, create or select the Vercel project and configure these GitHub Actions secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Add `FLIGHTAPI_KEY`, `AVIATIONSTACK_ACCESS_KEY`, and `SERPAPI_API_KEY` to the Vercel project's Production environment variables; they are server-side keys and must not use the `NEXT_PUBLIC_` prefix. The workflow uses the Vercel CLI to pull the linked production settings, build, and deploy the prebuilt output. Disable automatic Vercel Git deployments for `main` so production is deployed only after GitHub Actions passes. To deploy the GHCR image (`ghcr.io/kushall-mehta/udaan-app`) on another host instead, expose container port `3000`, set the same provider keys as runtime secrets, and mount persistent storage at `/app/.cache/flightapi` if saved fares should survive restarts.

## Airport tracking

Open **Airport tracking**, enter an Indian airport code, and choose arrivals or departures. Optionally filter by a scheduled IST arrival/departure time range, independent of the current time or flight status. A flight scheduled at 10:30 stays in a 10:00–14:00 window even if it lands late. Overnight ranges are supported. The board follows Aviationstack pagination instead of stopping at 100 records (up to 20 provider pages / 45 seconds per refresh, with a visible warning if incomplete). Each provider page uses an API request; completeness still depends on provider coverage and plan access. The airport board shows 15 flights per page with numbered pages and Previous/Next controls. Time filters apply before pagination; filtering or refreshing returns to the first page. Changing pages uses already loaded data. **More details** opens a status card with the route, reported status, delay, and separate departure and arrival times, dates, terminals, gates, and baggage information when supplied. Actual times take precedence over estimates, then schedules. Missing values show a dash. The separate flight-number form returns today’s exact searched flight from SerpApi, including landed flights. Only structured Google flight results are accepted; ordinary search snippets are not treated as flight records. Explicit timezone offsets are preserved, then displayed in IST. Google may return no structured status for some flights.

The route line fills in proportion to journey completion, with a percentage and a marker at the completed point. Fresh Aviationstack coordinates (up to five minutes old) provide an approximate position-based percentage, using the airport coordinate reference documented in `data/airport-coordinates.README.md`. If coordinates are missing, outdated, or implausible, the card shows a clearly labeled estimate from actual/estimated departure and arrival times. Time estimates update every second. Flights awaiting departure show 0%; confirmed arrivals show 100%. Overdue in-flight estimates stop at 99% until arrival is confirmed, and inconsistent or missing data shows progress as unavailable.

Automatic status refresh is off by default to save SerpApi searches. You can enable it to refresh an open card about once a minute while the tab is visible. **Refresh status** requests an update manually. Refreshes for the same flight leg share a 60-second server cache; board checks, initial flight-number searches, and details share checks by flight number and IST date. These updates use SerpApi searches; turn off **Auto-refresh 1 min** to use manual updates instead. A refresh stays on the selected flight/date and can include its final arrival status and belt assignment. Arrival baggage is always displayed, with **Not available** when the provider has not supplied a belt. All times use IST with AM/PM; boarding times are not supplied.

## Data and privacy

Fare searches use FlightAPI; airport lists use Aviationstack; direct lookup and refreshed status cards use Google via SerpApi. Provider keys are read only on the server from `FLIGHTAPI_KEY`, `AVIATIONSTACK_ACCESS_KEY`, and `SERPAPI_API_KEY`. Fare search results are saved in `.cache/flightapi/`, which is excluded from Git and may not persist between deployments. Provider status updates may be delayed or incomplete.

## Tech stack

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS 4
- FlightAPI for flight search data
- Aviationstack for airport lists
- Google flight results through SerpApi for flight status

Airport searches use Aviationstack only and do not trigger Google checks for every listed flight. Opening details uses the existing record. Refreshing airport details calls Aviationstack through `/api/flight-status`; refreshing a Google-tracked flight calls SerpApi through `/api/flight-tracking`. Explicit flight-number searches also use SerpApi. Checks share a 60-second server cache by flight number and IST date. Automatic refresh is off by default; manual refresh or opting in consumes searches. Airport-list times may differ from Google details.

### Timestamp handling

Aviationstack timestamps are parsed using their explicit UTC offsets, normalized to UTC ISO timestamps, then displayed and filtered in Mumbai time (`Asia/Kolkata`, IST). No manual time subtraction or feed correction is applied. Offset-free or invalid values remain unavailable rather than assuming the server timezone. SerpApi is enabled only for direct flight-number tracking and refreshes of those tracked flights. Airport lists and airport detail refreshes use Aviationstack. Opening details uses the loaded flight record without another API request; automatic refresh is off.

Google is enabled only for the **Track by flight number** feature. Airport searches and their expanded details do not use Google/SerpApi. Auto-refresh stays off by default.
