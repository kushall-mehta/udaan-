# Airport coordinate reference

`airport-coordinates.json` contains IATA airport codes mapped to `[latitude, longitude]` in decimal degrees. It is used on the server to estimate journey completion from Aviationstack's reported aircraft position. The coordinates are not a flight path.

Source: [OurAirports official airports.csv](https://github.com/davidmegginson/ourairports-data/blob/main/airports.csv), downloaded 28 October 2026. OurAirports releases its data into the [public domain](https://ourairports.com/data/). Closed airports and invalid coordinates are excluded. For duplicate IATA codes, scheduled-service and larger airports take precedence.

The app uses a time estimate when live coordinates or airport references are unavailable.
