/**
 * Weather API Skill Handler (Layer 1)
 *
 * Retrieve weather data via Open-Meteo API through injected provider/gateway client.
 * Supports current weather, forecasts, hourly data, historical data, and location search.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 30s, max 120s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'get_current',
  'get_forecast',
  'get_hourly',
  'get_historical',
  'search_location',
  'list_variables',
];

const WEATHER_VARIABLES = {
  current: [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
    'precipitation', 'rain', 'snowfall', 'cloud_cover',
    'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    'pressure_msl', 'surface_pressure', 'is_day',
    'weather_code',
  ],
  hourly: [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
    'precipitation_probability', 'precipitation', 'rain', 'snowfall',
    'cloud_cover', 'visibility', 'wind_speed_10m', 'wind_direction_10m',
    'uv_index', 'weather_code',
  ],
  daily: [
    'temperature_2m_max', 'temperature_2m_min', 'apparent_temperature_max',
    'apparent_temperature_min', 'sunrise', 'sunset', 'precipitation_sum',
    'rain_sum', 'snowfall_sum', 'precipitation_hours',
    'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
    'uv_index_max', 'weather_code',
  ],
};

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the provider or gateway client from context.
 * L1 prefers providerClient; falls back to gatewayClient.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

/**
 * Return the standard PROVIDER_NOT_CONFIGURED error response.
 *
 * @returns {{ result: string, metadata: Object }}
 */
function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for Weather API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Weather API access. Configure an API key or platform adapter.',
        retriable: false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective timeout from context config.
 *
 * @param {Object} context
 * @returns {number}
 */
function resolveTimeout(context) {
  const configured = context?.config?.timeoutMs;
  if (typeof configured === 'number' && configured > 0) {
    return Math.min(configured, MAX_TIMEOUT_MS);
  }
  return DEFAULT_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Request with timeout
// ---------------------------------------------------------------------------

/**
 * Make a request through the provider client with timeout.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The resource path
 * @param {Object} body - Request body or params
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, body, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw {
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms.`,
      };
    }

    throw {
      code: 'UPSTREAM_ERROR',
      message: err.message || 'Unknown upstream error',
    };
  }
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
];

/**
 * Redact sensitive tokens/keys from a string.
 *
 * @param {string} text
 * @returns {string}
 */
function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate latitude: number between -90 and 90.
 *
 * @param {*} lat
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLat(lat) {
  if (lat === undefined || lat === null) {
    return { valid: false, error: 'The "lat" parameter is required.' };
  }
  const num = Number(lat);
  if (typeof lat !== 'number' && typeof lat !== 'string') {
    return { valid: false, error: 'The "lat" parameter must be a number.' };
  }
  if (isNaN(num)) {
    return { valid: false, error: 'The "lat" parameter must be a valid number.' };
  }
  if (num < -90 || num > 90) {
    return { valid: false, error: `The "lat" parameter must be between -90 and 90. Got ${num}.` };
  }
  return { valid: true, value: num };
}

/**
 * Validate longitude: number between -180 and 180.
 *
 * @param {*} lon
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLon(lon) {
  if (lon === undefined || lon === null) {
    return { valid: false, error: 'The "lon" parameter is required.' };
  }
  const num = Number(lon);
  if (typeof lon !== 'number' && typeof lon !== 'string') {
    return { valid: false, error: 'The "lon" parameter must be a number.' };
  }
  if (isNaN(num)) {
    return { valid: false, error: 'The "lon" parameter must be a valid number.' };
  }
  if (num < -180 || num > 180) {
    return { valid: false, error: `The "lon" parameter must be between -180 and 180. Got ${num}.` };
  }
  return { valid: true, value: num };
}

/**
 * Validate days: integer between 1 and 16.
 *
 * @param {*} days
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateDays(days) {
  if (days === undefined || days === null) {
    return { valid: true, value: 7 };
  }
  const num = Number(days);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { valid: false, error: 'The "days" parameter must be an integer.' };
  }
  if (num < 1 || num > 16) {
    return { valid: false, error: `The "days" parameter must be between 1 and 16. Got ${num}.` };
  }
  return { valid: true, value: num };
}

/**
 * Validate hours: integer between 1 and 168.
 *
 * @param {*} hours
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateHours(hours) {
  if (hours === undefined || hours === null) {
    return { valid: true, value: 24 };
  }
  const num = Number(hours);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { valid: false, error: 'The "hours" parameter must be an integer.' };
  }
  if (num < 1 || num > 168) {
    return { valid: false, error: `The "hours" parameter must be between 1 and 168. Got ${num}.` };
  }
  return { valid: true, value: num };
}

/**
 * Validate a date string in YYYY-MM-DD format.
 *
 * @param {*} dateStr
 * @param {string} paramName
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateDate(dateStr, paramName) {
  if (dateStr === undefined || dateStr === null) {
    return { valid: false, error: `The "${paramName}" parameter is required.` };
  }
  if (typeof dateStr !== 'string') {
    return { valid: false, error: `The "${paramName}" parameter must be a string in YYYY-MM-DD format.` };
  }
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { valid: false, error: `The "${paramName}" parameter must be in YYYY-MM-DD format. Got "${trimmed}".` };
  }
  const parsed = new Date(trimmed + 'T00:00:00Z');
  if (isNaN(parsed.getTime())) {
    return { valid: false, error: `The "${paramName}" parameter is not a valid date. Got "${trimmed}".` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate location name: non-empty string, max 200 chars.
 *
 * @param {*} name
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateLocationName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'The "name" parameter is required and must be a non-empty string.' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "name" parameter must not be empty.' };
  }
  if (trimmed.length > 200) {
    return { valid: false, error: `The "name" parameter must be at most 200 characters. Got ${trimmed.length}.` };
  }
  return { valid: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Validate export (checks required params per action)
// ---------------------------------------------------------------------------

/**
 * Validate params for a given action. Returns { valid: true } or { valid: false, error: string }.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'get_current': {
      const latVal = validateLat(params.lat);
      if (!latVal.valid) return { valid: false, error: latVal.error };
      const lonVal = validateLon(params.lon);
      if (!lonVal.valid) return { valid: false, error: lonVal.error };
      return { valid: true };
    }
    case 'get_forecast': {
      const latVal = validateLat(params.lat);
      if (!latVal.valid) return { valid: false, error: latVal.error };
      const lonVal = validateLon(params.lon);
      if (!lonVal.valid) return { valid: false, error: lonVal.error };
      if (params.days !== undefined && params.days !== null) {
        const daysVal = validateDays(params.days);
        if (!daysVal.valid) return { valid: false, error: daysVal.error };
      }
      return { valid: true };
    }
    case 'get_hourly': {
      const latVal = validateLat(params.lat);
      if (!latVal.valid) return { valid: false, error: latVal.error };
      const lonVal = validateLon(params.lon);
      if (!lonVal.valid) return { valid: false, error: lonVal.error };
      if (params.hours !== undefined && params.hours !== null) {
        const hoursVal = validateHours(params.hours);
        if (!hoursVal.valid) return { valid: false, error: hoursVal.error };
      }
      return { valid: true };
    }
    case 'get_historical': {
      const latVal = validateLat(params.lat);
      if (!latVal.valid) return { valid: false, error: latVal.error };
      const lonVal = validateLon(params.lon);
      if (!lonVal.valid) return { valid: false, error: lonVal.error };
      const startVal = validateDate(params.start_date, 'start_date');
      if (!startVal.valid) return { valid: false, error: startVal.error };
      const endVal = validateDate(params.end_date, 'end_date');
      if (!endVal.valid) return { valid: false, error: endVal.error };
      return { valid: true };
    }
    case 'search_location': {
      const nameVal = validateLocationName(params.name);
      if (!nameVal.valid) return { valid: false, error: nameVal.error };
      return { valid: true };
    }
    case 'list_variables': {
      return { valid: true };
    }
    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle get_current -- GET /v1/forecast?latitude=...&longitude=...&current=...
 */
async function handleGetCurrent(params, context) {
  const latVal = validateLat(params.lat);
  if (!latVal.valid) {
    return {
      result: `Error: ${latVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const lonVal = validateLon(params.lon);
  if (!lonVal.valid) {
    return {
      result: `Error: ${lonVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const lat = latVal.value;
  const lon = lonVal.value;
  const currentVars = WEATHER_VARIABLES.current.join(',');
  const path = `/v1/forecast?latitude=${lat}&longitude=${lon}&current=${currentVars}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const current = data?.current || data || {};
    const lines = [
      'Current Weather',
      `Location: ${lat}, ${lon}`,
      current.temperature_2m !== undefined ? `Temperature: ${current.temperature_2m}${data?.current_units?.temperature_2m || '\u00b0C'}` : null,
      current.relative_humidity_2m !== undefined ? `Humidity: ${current.relative_humidity_2m}%` : null,
      current.apparent_temperature !== undefined ? `Feels like: ${current.apparent_temperature}${data?.current_units?.apparent_temperature || '\u00b0C'}` : null,
      current.wind_speed_10m !== undefined ? `Wind: ${current.wind_speed_10m} ${data?.current_units?.wind_speed_10m || 'km/h'}` : null,
      current.wind_direction_10m !== undefined ? `Wind direction: ${current.wind_direction_10m}\u00b0` : null,
      current.precipitation !== undefined ? `Precipitation: ${current.precipitation} mm` : null,
      current.cloud_cover !== undefined ? `Cloud cover: ${current.cloud_cover}%` : null,
      current.pressure_msl !== undefined ? `Pressure: ${current.pressure_msl} hPa` : null,
      current.weather_code !== undefined ? `Weather code: ${current.weather_code}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_current',
        layer: 'L1',
        lat,
        lon,
        current,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle get_forecast -- GET /v1/forecast?latitude=...&longitude=...&daily=...&forecast_days=...
 */
async function handleGetForecast(params, context) {
  const latVal = validateLat(params.lat);
  if (!latVal.valid) {
    return {
      result: `Error: ${latVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const lonVal = validateLon(params.lon);
  if (!lonVal.valid) {
    return {
      result: `Error: ${lonVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const daysVal = validateDays(params.days);
  if (!daysVal.valid) {
    return {
      result: `Error: ${daysVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const lat = latVal.value;
  const lon = lonVal.value;
  const days = daysVal.value;
  const dailyVars = WEATHER_VARIABLES.daily.join(',');
  const path = `/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${dailyVars}&forecast_days=${days}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const daily = data?.daily || data || {};
    const timeArr = daily.time || [];
    const forecastCount = timeArr.length;

    const lines = [
      `Weather Forecast (${days} days)`,
      `Location: ${lat}, ${lon}`,
      `Days: ${forecastCount}`,
      '',
    ];

    for (let i = 0; i < forecastCount; i++) {
      const date = timeArr[i];
      const maxTemp = daily.temperature_2m_max?.[i];
      const minTemp = daily.temperature_2m_min?.[i];
      const precip = daily.precipitation_sum?.[i];
      const code = daily.weather_code?.[i];
      const parts = [`${date}:`];
      if (maxTemp !== undefined && minTemp !== undefined) parts.push(`${minTemp}-${maxTemp}\u00b0C`);
      if (precip !== undefined) parts.push(`precip: ${precip}mm`);
      if (code !== undefined) parts.push(`code: ${code}`);
      lines.push(parts.join(' '));
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_forecast',
        layer: 'L1',
        lat,
        lon,
        days,
        forecastCount,
        daily,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle get_hourly -- GET /v1/forecast?latitude=...&longitude=...&hourly=...&forecast_hours=...
 */
async function handleGetHourly(params, context) {
  const latVal = validateLat(params.lat);
  if (!latVal.valid) {
    return {
      result: `Error: ${latVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const lonVal = validateLon(params.lon);
  if (!lonVal.valid) {
    return {
      result: `Error: ${lonVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const hoursVal = validateHours(params.hours);
  if (!hoursVal.valid) {
    return {
      result: `Error: ${hoursVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const lat = latVal.value;
  const lon = lonVal.value;
  const hours = hoursVal.value;
  const hourlyVars = WEATHER_VARIABLES.hourly.join(',');
  const path = `/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${hourlyVars}&forecast_hours=${hours}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const hourly = data?.hourly || data || {};
    const timeArr = hourly.time || [];
    const hourCount = timeArr.length;

    const lines = [
      `Hourly Forecast (${hours} hours)`,
      `Location: ${lat}, ${lon}`,
      `Hours: ${hourCount}`,
      '',
    ];

    for (let i = 0; i < Math.min(hourCount, 24); i++) {
      const time = timeArr[i];
      const temp = hourly.temperature_2m?.[i];
      const precip = hourly.precipitation?.[i];
      const parts = [`${time}:`];
      if (temp !== undefined) parts.push(`${temp}\u00b0C`);
      if (precip !== undefined) parts.push(`precip: ${precip}mm`);
      lines.push(parts.join(' '));
    }

    if (hourCount > 24) {
      lines.push(`... and ${hourCount - 24} more hours`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_hourly',
        layer: 'L1',
        lat,
        lon,
        hours,
        hourCount,
        hourly,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle get_historical -- GET /v1/archive?latitude=...&longitude=...&start_date=...&end_date=...&daily=...
 */
async function handleGetHistorical(params, context) {
  const latVal = validateLat(params.lat);
  if (!latVal.valid) {
    return {
      result: `Error: ${latVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const lonVal = validateLon(params.lon);
  if (!lonVal.valid) {
    return {
      result: `Error: ${lonVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const startVal = validateDate(params.start_date, 'start_date');
  if (!startVal.valid) {
    return {
      result: `Error: ${startVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const endVal = validateDate(params.end_date, 'end_date');
  if (!endVal.valid) {
    return {
      result: `Error: ${endVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const lat = latVal.value;
  const lon = lonVal.value;
  const startDate = startVal.value;
  const endDate = endVal.value;
  const dailyVars = WEATHER_VARIABLES.daily.join(',');
  const path = `/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=${dailyVars}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const daily = data?.daily || data || {};
    const timeArr = daily.time || [];
    const dayCount = timeArr.length;

    const lines = [
      `Historical Weather Data`,
      `Location: ${lat}, ${lon}`,
      `Period: ${startDate} to ${endDate}`,
      `Days: ${dayCount}`,
      '',
    ];

    for (let i = 0; i < Math.min(dayCount, 10); i++) {
      const date = timeArr[i];
      const maxTemp = daily.temperature_2m_max?.[i];
      const minTemp = daily.temperature_2m_min?.[i];
      const precip = daily.precipitation_sum?.[i];
      const parts = [`${date}:`];
      if (maxTemp !== undefined && minTemp !== undefined) parts.push(`${minTemp}-${maxTemp}\u00b0C`);
      if (precip !== undefined) parts.push(`precip: ${precip}mm`);
      lines.push(parts.join(' '));
    }

    if (dayCount > 10) {
      lines.push(`... and ${dayCount - 10} more days`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_historical',
        layer: 'L1',
        lat,
        lon,
        startDate,
        endDate,
        dayCount,
        daily,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle search_location -- GET /v1/search?name=...&count=10
 */
async function handleSearchLocation(params, context) {
  const nameVal = validateLocationName(params.name);
  if (!nameVal.valid) {
    return {
      result: `Error: ${nameVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const name = nameVal.value;
  const encodedName = encodeURIComponent(name);
  const path = `/v1/search?name=${encodedName}&count=10`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const results = data?.results || data?.data || [];
    const resultCount = results.length;

    const lines = [
      `Location Search Results`,
      `Query: "${name}"`,
      `Results: ${resultCount}`,
      '',
    ];

    for (let i = 0; i < resultCount; i++) {
      const loc = results[i];
      const locName = loc.name || 'Unknown';
      const country = loc.country || '';
      const admin1 = loc.admin1 || '';
      const lat = loc.latitude;
      const lon = loc.longitude;
      const parts = [`${i + 1}. ${locName}`];
      if (admin1) parts.push(admin1);
      if (country) parts.push(country);
      if (lat !== undefined && lon !== undefined) parts.push(`(${lat}, ${lon})`);
      lines.push(parts.join(', '));
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_location',
        layer: 'L1',
        query: name,
        resultCount,
        results,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle list_variables -- returns local data, no API call.
 */
function handleListVariables() {
  const lines = [
    'Available Weather Variables',
    '',
    `Current variables (${WEATHER_VARIABLES.current.length}):`,
    ...WEATHER_VARIABLES.current.map((v, i) => `  ${i + 1}. ${v}`),
    '',
    `Hourly variables (${WEATHER_VARIABLES.hourly.length}):`,
    ...WEATHER_VARIABLES.hourly.map((v, i) => `  ${i + 1}. ${v}`),
    '',
    `Daily variables (${WEATHER_VARIABLES.daily.length}):`,
    ...WEATHER_VARIABLES.daily.map((v, i) => `  ${i + 1}. ${v}`),
  ];

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_variables',
      layer: 'L1',
      variables: { ...WEATHER_VARIABLES },
      currentCount: WEATHER_VARIABLES.current.length,
      hourlyCount: WEATHER_VARIABLES.hourly.length,
      dailyCount: WEATHER_VARIABLES.daily.length,
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Weather API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: get_current, get_forecast, get_hourly, get_historical, search_location, list_variables
 * @param {number} [params.lat] - Latitude (-90 to 90)
 * @param {number} [params.lon] - Longitude (-180 to 180)
 * @param {number} [params.days] - Forecast days (1-16)
 * @param {number} [params.hours] - Forecast hours (1-168)
 * @param {string} [params.start_date] - Start date (YYYY-MM-DD)
 * @param {string} [params.end_date] - End date (YYYY-MM-DD)
 * @param {string} [params.name] - Location name for search
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  try {
    switch (action) {
      case 'get_current':
        return await handleGetCurrent(params, context);
      case 'get_forecast':
        return await handleGetForecast(params, context);
      case 'get_hourly':
        return await handleGetHourly(params, context);
      case 'get_historical':
        return await handleGetHistorical(params, context);
      case 'search_location':
        return await handleSearchLocation(params, context);
      case 'list_variables':
        return handleListVariables();
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: 'UPSTREAM_ERROR', detail: error.message },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'weather-api',
  version: '1.0.0',
  description: 'Weather data retrieval via Open-Meteo API. Supports current weather, forecasts, hourly data, historical data, and location search.',
  actions: VALID_ACTIONS,
};

// Export validate and internals for testing
export {
  validate,
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  validateLat,
  validateLon,
  validateDays,
  validateHours,
  validateDate,
  validateLocationName,
  VALID_ACTIONS,
  WEATHER_VARIABLES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
