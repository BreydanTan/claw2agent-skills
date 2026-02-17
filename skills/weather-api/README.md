# Weather API Skill

**Layer:** L1 (API-dependent)
**Category:** IoT/Data

Weather data retrieval via Open-Meteo API. Supports current weather, forecasts, hourly data, historical data, and location search through injected provider/gateway client.

## Actions

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `get_current` | Get current weather for a location | `lat`, `lon` |
| `get_forecast` | Get daily weather forecast (1-16 days) | `lat`, `lon`, optional `days` |
| `get_hourly` | Get hourly weather forecast (1-168 hours) | `lat`, `lon`, optional `hours` |
| `get_historical` | Get historical weather data | `lat`, `lon`, `start_date`, `end_date` |
| `search_location` | Search for a location by name | `name` |
| `list_variables` | List available weather variables | none |

## Parameters

- **lat** (number): Latitude, -90 to 90
- **lon** (number): Longitude, -180 to 180
- **days** (integer): Forecast days, 1-16 (default: 7)
- **hours** (integer): Forecast hours, 1-168 (default: 24)
- **start_date** (string): Start date in YYYY-MM-DD format
- **end_date** (string): End date in YYYY-MM-DD format
- **name** (string): Location name, max 200 characters

## Usage

```js
import { execute } from './handler.js';

// Get current weather
const result = await execute(
  { action: 'get_current', lat: 48.8566, lon: 2.3522 },
  { providerClient: myClient }
);

// Get 7-day forecast
const forecast = await execute(
  { action: 'get_forecast', lat: 40.7128, lon: -74.006, days: 7 },
  { providerClient: myClient }
);

// Search for a location
const search = await execute(
  { action: 'search_location', name: 'Tokyo' },
  { providerClient: myClient }
);

// List available variables (no API call)
const vars = await execute({ action: 'list_variables' }, {});
```

## L1 Architecture

- No hardcoded API URLs or keys
- All requests go through injected `providerClient` or `gatewayClient`
- Timeout enforcement (default 30s, max 120s)
- Input validation and sanitization
- Sensitive data redaction in outputs

## Running Tests

```bash
node --test skills/weather-api/__tests__/handler.test.js
```
