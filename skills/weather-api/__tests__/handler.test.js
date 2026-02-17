import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  validate,
  meta,
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
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .request() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .request() triggers an AbortError (timeout).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      request: async (_method, _path, _body, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample current weather response */
const sampleCurrentResult = {
  current: {
    temperature_2m: 22.5,
    relative_humidity_2m: 65,
    apparent_temperature: 21.0,
    precipitation: 0.0,
    cloud_cover: 40,
    wind_speed_10m: 12.3,
    wind_direction_10m: 180,
    pressure_msl: 1013.25,
    weather_code: 2,
  },
  current_units: {
    temperature_2m: '\u00b0C',
    apparent_temperature: '\u00b0C',
    wind_speed_10m: 'km/h',
  },
};

/** Sample forecast response */
const sampleForecastResult = {
  daily: {
    time: ['2025-01-01', '2025-01-02', '2025-01-03'],
    temperature_2m_max: [25, 27, 23],
    temperature_2m_min: [15, 17, 13],
    precipitation_sum: [0.0, 2.5, 0.1],
    weather_code: [1, 3, 2],
  },
};

/** Sample hourly response */
const sampleHourlyResult = {
  hourly: {
    time: ['2025-01-01T00:00', '2025-01-01T01:00', '2025-01-01T02:00'],
    temperature_2m: [18, 17.5, 17],
    precipitation: [0, 0, 0.1],
  },
};

/** Sample historical response */
const sampleHistoricalResult = {
  daily: {
    time: ['2024-06-01', '2024-06-02'],
    temperature_2m_max: [30, 32],
    temperature_2m_min: [20, 22],
    precipitation_sum: [0, 5.2],
  },
};

/** Sample search response */
const sampleSearchResult = {
  results: [
    { name: 'Paris', country: 'France', admin1: 'Ile-de-France', latitude: 48.8566, longitude: 2.3522 },
    { name: 'Paris', country: 'United States', admin1: 'Texas', latitude: 33.6609, longitude: -95.5555 },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('weather-api: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const result = await execute({ action: 'invalid' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('invalid'));
  });

  it('should reject missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject undefined params', async () => {
    const result = await execute(undefined, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should list valid actions in error message', async () => {
    const result = await execute({ action: 'bad' }, {});
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Error message should mention "${a}"`);
    }
  });

  it('should have 6 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 6);
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('weather-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_current without client', async () => {
    const result = await execute({ action: 'get_current', lat: 0, lon: 0 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail get_forecast without client', async () => {
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_hourly without client', async () => {
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_historical without client', async () => {
    const result = await execute({ action: 'get_historical', lat: 0, lon: 0, start_date: '2024-01-01', end_date: '2024-01-02' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_location without client', async () => {
    const result = await execute({ action: 'search_location', name: 'Paris' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should NOT fail list_variables without client (no API call)', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 3. get_current action
// ---------------------------------------------------------------------------
describe('weather-api: get_current', () => {
  beforeEach(() => {});

  it('should get current weather', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 48.8566, lon: 2.3522 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_current');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.lat, 48.8566);
    assert.equal(result.metadata.lon, 2.3522);
  });

  it('should include temperature in result', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 48.8566, lon: 2.3522 }, ctx);
    assert.ok(result.result.includes('22.5'));
  });

  it('should include humidity in result', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 48.8566, lon: 2.3522 }, ctx);
    assert.ok(result.result.includes('65'));
  });

  it('should include wind speed in result', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 48.8566, lon: 2.3522 }, ctx);
    assert.ok(result.result.includes('12.3'));
  });

  it('should include pressure in result', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 48.8566, lon: 2.3522 }, ctx);
    assert.ok(result.result.includes('1013.25'));
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 0, lon: 0 }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing lat', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing lon', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject lat out of range', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 91, lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject lon out of range', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const result = await execute({ action: 'get_current', lat: 0, lon: 181 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call GET with /v1/forecast path', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleCurrentResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_current', lat: 10, lon: 20 }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.ok(calledPath.includes('/v1/forecast'));
    assert.ok(calledPath.includes('latitude=10'));
    assert.ok(calledPath.includes('longitude=20'));
    assert.ok(calledPath.includes('current='));
  });

  it('should handle response without current wrapper', async () => {
    const ctx = mockContext({ temperature_2m: 15 });
    const result = await execute({ action: 'get_current', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept boundary lat values', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const r1 = await execute({ action: 'get_current', lat: -90, lon: 0 }, ctx);
    assert.equal(r1.metadata.success, true);
    const r2 = await execute({ action: 'get_current', lat: 90, lon: 0 }, ctx);
    assert.equal(r2.metadata.success, true);
  });

  it('should accept boundary lon values', async () => {
    const ctx = mockContext(sampleCurrentResult);
    const r1 = await execute({ action: 'get_current', lat: 0, lon: -180 }, ctx);
    assert.equal(r1.metadata.success, true);
    const r2 = await execute({ action: 'get_current', lat: 0, lon: 180 }, ctx);
    assert.equal(r2.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 4. get_forecast action
// ---------------------------------------------------------------------------
describe('weather-api: get_forecast', () => {
  beforeEach(() => {});

  it('should get forecast with defaults', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 40.7128, lon: -74.006 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_forecast');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.days, 7);
  });

  it('should accept custom days', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0, days: 14 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.days, 14);
  });

  it('should include forecast days in result', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0 }, ctx);
    assert.ok(result.result.includes('2025-01-01'));
    assert.ok(result.result.includes('2025-01-02'));
  });

  it('should include forecastCount', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.forecastCount, 3);
  });

  it('should reject invalid days (0)', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0, days: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid days (17)', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0, days: 17 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer days', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0, days: 3.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing lat', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call GET with daily and forecast_days params', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { calledPath = path; return sampleForecastResult; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_forecast', lat: 10, lon: 20, days: 5 }, ctx);
    assert.ok(calledPath.includes('daily='));
    assert.ok(calledPath.includes('forecast_days=5'));
  });

  it('should accept boundary days (1)', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0, days: 1 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.days, 1);
  });

  it('should accept boundary days (16)', async () => {
    const ctx = mockContext(sampleForecastResult);
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0, days: 16 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.days, 16);
  });

  it('should handle empty daily data', async () => {
    const ctx = mockContext({ daily: { time: [] } });
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.forecastCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. get_hourly action
// ---------------------------------------------------------------------------
describe('weather-api: get_hourly', () => {
  beforeEach(() => {});

  it('should get hourly forecast with defaults', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 35.6762, lon: 139.6503 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_hourly');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.hours, 24);
  });

  it('should accept custom hours', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0, hours: 48 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.hours, 48);
  });

  it('should include hourly data in result', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0 }, ctx);
    assert.ok(result.result.includes('2025-01-01T00:00'));
  });

  it('should include hourCount in metadata', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.hourCount, 3);
  });

  it('should reject invalid hours (0)', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0, hours: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid hours (169)', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0, hours: 169 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer hours', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0, hours: 12.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing lat', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call GET with hourly and forecast_hours params', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { calledPath = path; return sampleHourlyResult; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_hourly', lat: 10, lon: 20, hours: 72 }, ctx);
    assert.ok(calledPath.includes('hourly='));
    assert.ok(calledPath.includes('forecast_hours=72'));
  });

  it('should accept boundary hours (1)', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0, hours: 1 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.hours, 1);
  });

  it('should accept boundary hours (168)', async () => {
    const ctx = mockContext(sampleHourlyResult);
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0, hours: 168 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.hours, 168);
  });

  it('should handle response without hourly wrapper', async () => {
    const ctx = mockContext({ time: ['2025-01-01T00:00'], temperature_2m: [20] });
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 6. get_historical action
// ---------------------------------------------------------------------------
describe('weather-api: get_historical', () => {
  beforeEach(() => {});

  it('should get historical weather data', async () => {
    const ctx = mockContext(sampleHistoricalResult);
    const result = await execute({
      action: 'get_historical', lat: 51.5074, lon: -0.1278,
      start_date: '2024-06-01', end_date: '2024-06-02',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_historical');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.startDate, '2024-06-01');
    assert.equal(result.metadata.endDate, '2024-06-02');
  });

  it('should include dayCount in metadata', async () => {
    const ctx = mockContext(sampleHistoricalResult);
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      start_date: '2024-06-01', end_date: '2024-06-02',
    }, ctx);
    assert.equal(result.metadata.dayCount, 2);
  });

  it('should include dates in result text', async () => {
    const ctx = mockContext(sampleHistoricalResult);
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      start_date: '2024-06-01', end_date: '2024-06-02',
    }, ctx);
    assert.ok(result.result.includes('2024-06-01'));
    assert.ok(result.result.includes('2024-06-02'));
  });

  it('should reject missing start_date', async () => {
    const ctx = mockContext(sampleHistoricalResult);
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      end_date: '2024-06-02',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing end_date', async () => {
    const ctx = mockContext(sampleHistoricalResult);
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      start_date: '2024-06-01',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid date format', async () => {
    const ctx = mockContext(sampleHistoricalResult);
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      start_date: '06/01/2024', end_date: '2024-06-02',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing lat', async () => {
    const ctx = mockContext(sampleHistoricalResult);
    const result = await execute({
      action: 'get_historical', lon: 0,
      start_date: '2024-06-01', end_date: '2024-06-02',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call GET with /v1/archive path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { calledPath = path; return sampleHistoricalResult; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'get_historical', lat: 10, lon: 20,
      start_date: '2024-01-01', end_date: '2024-01-31',
    }, ctx);
    assert.ok(calledPath.includes('/v1/archive'));
    assert.ok(calledPath.includes('start_date=2024-01-01'));
    assert.ok(calledPath.includes('end_date=2024-01-31'));
  });

  it('should handle empty daily data', async () => {
    const ctx = mockContext({ daily: { time: [] } });
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      start_date: '2024-01-01', end_date: '2024-01-02',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.dayCount, 0);
  });

  it('should reject non-string start_date', async () => {
    const ctx = mockContext(sampleHistoricalResult);
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      start_date: 20240601, end_date: '2024-06-02',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 7. search_location action
// ---------------------------------------------------------------------------
describe('weather-api: search_location', () => {
  beforeEach(() => {});

  it('should search for a location', async () => {
    const ctx = mockContext(sampleSearchResult);
    const result = await execute({ action: 'search_location', name: 'Paris' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_location');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'Paris');
    assert.equal(result.metadata.resultCount, 2);
  });

  it('should include location names in result text', async () => {
    const ctx = mockContext(sampleSearchResult);
    const result = await execute({ action: 'search_location', name: 'Paris' }, ctx);
    assert.ok(result.result.includes('Paris'));
    assert.ok(result.result.includes('France'));
    assert.ok(result.result.includes('United States'));
  });

  it('should include coordinates in result text', async () => {
    const ctx = mockContext(sampleSearchResult);
    const result = await execute({ action: 'search_location', name: 'Paris' }, ctx);
    assert.ok(result.result.includes('48.8566'));
    assert.ok(result.result.includes('2.3522'));
  });

  it('should reject missing name', async () => {
    const ctx = mockContext(sampleSearchResult);
    const result = await execute({ action: 'search_location' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty name', async () => {
    const ctx = mockContext(sampleSearchResult);
    const result = await execute({ action: 'search_location', name: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only name', async () => {
    const ctx = mockContext(sampleSearchResult);
    const result = await execute({ action: 'search_location', name: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject name over 200 characters', async () => {
    const ctx = mockContext(sampleSearchResult);
    const longName = 'a'.repeat(201);
    const result = await execute({ action: 'search_location', name: longName }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept name of exactly 200 characters', async () => {
    const ctx = mockContext(sampleSearchResult);
    const name200 = 'a'.repeat(200);
    const result = await execute({ action: 'search_location', name: name200 }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should call GET with /v1/search path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { calledPath = path; return sampleSearchResult; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search_location', name: 'Tokyo' }, ctx);
    assert.ok(calledPath.includes('/v1/search'));
    assert.ok(calledPath.includes('name=Tokyo'));
    assert.ok(calledPath.includes('count=10'));
  });

  it('should URL-encode location name', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { calledPath = path; return sampleSearchResult; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search_location', name: 'New York' }, ctx);
    assert.ok(calledPath.includes('New%20York'));
  });

  it('should handle empty results', async () => {
    const ctx = mockContext({ results: [] });
    const result = await execute({ action: 'search_location', name: 'xyznonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
    assert.ok(result.result.includes('Results: 0'));
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [{ name: 'AltCity', latitude: 10, longitude: 20 }] });
    const result = await execute({ action: 'search_location', name: 'AltCity' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 1);
  });

  it('should trim name before use', async () => {
    const ctx = mockContext(sampleSearchResult);
    const result = await execute({ action: 'search_location', name: '  Paris  ' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.query, 'Paris');
  });
});

// ---------------------------------------------------------------------------
// 8. list_variables action
// ---------------------------------------------------------------------------
describe('weather-api: list_variables', () => {
  beforeEach(() => {});

  it('should list all variable categories', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_variables');
    assert.equal(result.metadata.layer, 'L1');
  });

  it('should include current variables', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.ok(result.result.includes('temperature_2m'));
    assert.ok(result.result.includes('relative_humidity_2m'));
    assert.ok(result.result.includes('wind_speed_10m'));
  });

  it('should include daily variables', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.ok(result.result.includes('temperature_2m_max'));
    assert.ok(result.result.includes('temperature_2m_min'));
    assert.ok(result.result.includes('sunrise'));
    assert.ok(result.result.includes('sunset'));
  });

  it('should include hourly variables', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.ok(result.result.includes('uv_index'));
    assert.ok(result.result.includes('precipitation_probability'));
    assert.ok(result.result.includes('visibility'));
  });

  it('should include variable counts in metadata', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.equal(result.metadata.currentCount, WEATHER_VARIABLES.current.length);
    assert.equal(result.metadata.hourlyCount, WEATHER_VARIABLES.hourly.length);
    assert.equal(result.metadata.dailyCount, WEATHER_VARIABLES.daily.length);
  });

  it('should not require a provider client', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should include timestamp', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.ok(result.metadata.timestamp);
  });

  it('should include variables object in metadata', async () => {
    const result = await execute({ action: 'list_variables' }, {});
    assert.ok(result.metadata.variables);
    assert.ok(Array.isArray(result.metadata.variables.current));
    assert.ok(Array.isArray(result.metadata.variables.hourly));
    assert.ok(Array.isArray(result.metadata.variables.daily));
  });
});

// ---------------------------------------------------------------------------
// 9. Timeout handling
// ---------------------------------------------------------------------------
describe('weather-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on get_current abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_current', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_forecast abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_hourly abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_historical abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      start_date: '2024-01-01', end_date: '2024-01-02',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search_location abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_location', name: 'Paris' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 10. Network error handling
// ---------------------------------------------------------------------------
describe('weather-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on get_current failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_current', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_forecast failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'get_forecast', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_hourly failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'get_hourly', lat: 0, lon: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_historical failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({
      action: 'get_historical', lat: 0, lon: 0,
      start_date: '2024-01-01', end_date: '2024-01-02',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search_location failure', async () => {
    const ctx = mockContextError(new Error('DNS resolution failed'));
    const result = await execute({ action: 'search_location', name: 'Paris' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_current', lat: 0, lon: 0 }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 11. getClient helper
// ---------------------------------------------------------------------------
describe('weather-api: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient over gatewayClient', () => {
    const result = getClient({
      providerClient: { request: () => {} },
      gatewayClient: { request: () => {} },
    });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });

  it('should return null for null context', () => {
    assert.equal(getClient(null), null);
  });

  it('should return client object with provider type', () => {
    const mockClient = { request: () => {} };
    const result = getClient({ providerClient: mockClient });
    assert.equal(result.client, mockClient);
    assert.equal(result.type, 'provider');
  });

  it('should return client object with gateway type', () => {
    const mockClient = { request: () => {} };
    const result = getClient({ gatewayClient: mockClient });
    assert.equal(result.client, mockClient);
    assert.equal(result.type, 'gateway');
  });
});

// ---------------------------------------------------------------------------
// 12. redactSensitive
// ---------------------------------------------------------------------------
describe('weather-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: test_value_placeholder data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_value_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: sample_placeholder_value';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_placeholder_value'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: sample_auth_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_auth_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact password patterns', () => {
    const input = 'password=test_pass_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_pass_placeholder'));
  });

  it('should redact api-key with hyphen', () => {
    const input = 'api-key: some_value_here';
    const output = redactSensitive(input);
    assert.ok(!output.includes('some_value_here'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Temperature is 22.5 degrees in Paris';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should handle empty string', () => {
    assert.equal(redactSensitive(''), '');
  });

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('token: exposed_placeholder_val'));
    const result = await execute({ action: 'get_current', lat: 0, lon: 0 }, ctx);
    assert.ok(!result.result.includes('exposed_placeholder_val'));
  });

  it('should redact secret patterns', () => {
    const input = 'secret: my_secret_val_here';
    const output = redactSensitive(input);
    assert.ok(!output.includes('my_secret_val_here'));
  });
});

// ---------------------------------------------------------------------------
// 13. validateLat helper
// ---------------------------------------------------------------------------
describe('weather-api: validateLat', () => {
  beforeEach(() => {});

  it('should accept valid latitude', () => {
    const result = validateLat(48.8566);
    assert.equal(result.valid, true);
    assert.equal(result.value, 48.8566);
  });

  it('should accept zero latitude', () => {
    const result = validateLat(0);
    assert.equal(result.valid, true);
    assert.equal(result.value, 0);
  });

  it('should accept -90', () => {
    const result = validateLat(-90);
    assert.equal(result.valid, true);
    assert.equal(result.value, -90);
  });

  it('should accept 90', () => {
    const result = validateLat(90);
    assert.equal(result.valid, true);
    assert.equal(result.value, 90);
  });

  it('should reject -91', () => {
    const result = validateLat(-91);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('-91'));
  });

  it('should reject 91', () => {
    const result = validateLat(91);
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateLat(null);
    assert.equal(result.valid, false);
  });

  it('should reject undefined', () => {
    const result = validateLat(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject non-numeric type', () => {
    const result = validateLat({ value: 10 });
    assert.equal(result.valid, false);
  });

  it('should accept numeric string', () => {
    const result = validateLat('45.5');
    assert.equal(result.valid, true);
    assert.equal(result.value, 45.5);
  });

  it('should reject NaN string', () => {
    const result = validateLat('abc');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 14. validateLon helper
// ---------------------------------------------------------------------------
describe('weather-api: validateLon', () => {
  beforeEach(() => {});

  it('should accept valid longitude', () => {
    const result = validateLon(2.3522);
    assert.equal(result.valid, true);
    assert.equal(result.value, 2.3522);
  });

  it('should accept zero longitude', () => {
    const result = validateLon(0);
    assert.equal(result.valid, true);
    assert.equal(result.value, 0);
  });

  it('should accept -180', () => {
    const result = validateLon(-180);
    assert.equal(result.valid, true);
    assert.equal(result.value, -180);
  });

  it('should accept 180', () => {
    const result = validateLon(180);
    assert.equal(result.valid, true);
    assert.equal(result.value, 180);
  });

  it('should reject -181', () => {
    const result = validateLon(-181);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('-181'));
  });

  it('should reject 181', () => {
    const result = validateLon(181);
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateLon(null);
    assert.equal(result.valid, false);
  });

  it('should reject undefined', () => {
    const result = validateLon(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject non-numeric type', () => {
    const result = validateLon([10]);
    assert.equal(result.valid, false);
  });

  it('should accept numeric string', () => {
    const result = validateLon('-74.006');
    assert.equal(result.valid, true);
    assert.equal(result.value, -74.006);
  });
});

// ---------------------------------------------------------------------------
// 15. validateDays helper
// ---------------------------------------------------------------------------
describe('weather-api: validateDays', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateDays(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 7);
  });

  it('should return default when null', () => {
    const result = validateDays(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 7);
  });

  it('should accept 1', () => {
    const result = validateDays(1);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1);
  });

  it('should accept 16', () => {
    const result = validateDays(16);
    assert.equal(result.valid, true);
    assert.equal(result.value, 16);
  });

  it('should reject 0', () => {
    const result = validateDays(0);
    assert.equal(result.valid, false);
  });

  it('should reject 17', () => {
    const result = validateDays(17);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateDays(3.5);
    assert.equal(result.valid, false);
  });

  it('should reject NaN', () => {
    const result = validateDays('abc');
    assert.equal(result.valid, false);
  });

  it('should reject negative', () => {
    const result = validateDays(-1);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateHours helper
// ---------------------------------------------------------------------------
describe('weather-api: validateHours', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateHours(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 24);
  });

  it('should return default when null', () => {
    const result = validateHours(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 24);
  });

  it('should accept 1', () => {
    const result = validateHours(1);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1);
  });

  it('should accept 168', () => {
    const result = validateHours(168);
    assert.equal(result.valid, true);
    assert.equal(result.value, 168);
  });

  it('should reject 0', () => {
    const result = validateHours(0);
    assert.equal(result.valid, false);
  });

  it('should reject 169', () => {
    const result = validateHours(169);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateHours(12.5);
    assert.equal(result.valid, false);
  });

  it('should reject NaN', () => {
    const result = validateHours('abc');
    assert.equal(result.valid, false);
  });

  it('should reject negative', () => {
    const result = validateHours(-5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validateDate helper
// ---------------------------------------------------------------------------
describe('weather-api: validateDate', () => {
  beforeEach(() => {});

  it('should accept valid YYYY-MM-DD date', () => {
    const result = validateDate('2024-06-15', 'test_date');
    assert.equal(result.valid, true);
    assert.equal(result.value, '2024-06-15');
  });

  it('should reject missing date', () => {
    const result = validateDate(undefined, 'test_date');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('test_date'));
  });

  it('should reject null date', () => {
    const result = validateDate(null, 'test_date');
    assert.equal(result.valid, false);
  });

  it('should reject non-string date', () => {
    const result = validateDate(20240615, 'test_date');
    assert.equal(result.valid, false);
  });

  it('should reject wrong format (MM/DD/YYYY)', () => {
    const result = validateDate('06/15/2024', 'test_date');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('YYYY-MM-DD'));
  });

  it('should reject wrong format (DD-MM-YYYY)', () => {
    const result = validateDate('15-06-2024', 'test_date');
    assert.equal(result.valid, false);
  });

  it('should trim whitespace', () => {
    const result = validateDate('  2024-06-15  ', 'test_date');
    assert.equal(result.valid, true);
    assert.equal(result.value, '2024-06-15');
  });

  it('should reject empty string', () => {
    const result = validateDate('', 'test_date');
    assert.equal(result.valid, false);
  });

  it('should include param name in error', () => {
    const result = validateDate(undefined, 'start_date');
    assert.ok(result.error.includes('start_date'));
  });
});

// ---------------------------------------------------------------------------
// 18. validateLocationName helper
// ---------------------------------------------------------------------------
describe('weather-api: validateLocationName', () => {
  beforeEach(() => {});

  it('should accept valid name', () => {
    const result = validateLocationName('Paris');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Paris');
  });

  it('should trim whitespace', () => {
    const result = validateLocationName('  Tokyo  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Tokyo');
  });

  it('should reject null', () => {
    const result = validateLocationName(null);
    assert.equal(result.valid, false);
  });

  it('should reject undefined', () => {
    const result = validateLocationName(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateLocationName('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only', () => {
    const result = validateLocationName('   ');
    assert.equal(result.valid, false);
  });

  it('should reject name over 200 chars', () => {
    const result = validateLocationName('a'.repeat(201));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('200'));
  });

  it('should accept name of exactly 200 chars', () => {
    const result = validateLocationName('a'.repeat(200));
    assert.equal(result.valid, true);
  });

  it('should reject non-string', () => {
    const result = validateLocationName(123);
    assert.equal(result.valid, false);
  });

  it('should accept unicode names', () => {
    const result = validateLocationName('Munchen');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Munchen');
  });
});

// ---------------------------------------------------------------------------
// 19. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('weather-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for null context', () => {
    assert.equal(resolveTimeout(null), DEFAULT_TIMEOUT_MS);
  });

  it('should use configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000);
  });

  it('should cap at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should ignore non-positive timeout (0)', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore negative timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore non-number timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });

  it('should have default of 30000ms', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should have max of 120000ms', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });

  it('should accept exactly MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 120000 } }), 120000);
  });
});

// ---------------------------------------------------------------------------
// 20. validate() export
// ---------------------------------------------------------------------------
describe('weather-api: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('bad'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate get_current requires lat and lon', () => {
    assert.equal(validate({ action: 'get_current' }).valid, false);
    assert.equal(validate({ action: 'get_current', lat: 0 }).valid, false);
    assert.equal(validate({ action: 'get_current', lon: 0 }).valid, false);
    assert.equal(validate({ action: 'get_current', lat: 0, lon: 0 }).valid, true);
  });

  it('should validate get_forecast requires lat and lon', () => {
    assert.equal(validate({ action: 'get_forecast' }).valid, false);
    assert.equal(validate({ action: 'get_forecast', lat: 0, lon: 0 }).valid, true);
  });

  it('should validate get_forecast rejects bad days', () => {
    assert.equal(validate({ action: 'get_forecast', lat: 0, lon: 0, days: 0 }).valid, false);
    assert.equal(validate({ action: 'get_forecast', lat: 0, lon: 0, days: 17 }).valid, false);
    assert.equal(validate({ action: 'get_forecast', lat: 0, lon: 0, days: 7 }).valid, true);
  });

  it('should validate get_hourly requires lat and lon', () => {
    assert.equal(validate({ action: 'get_hourly' }).valid, false);
    assert.equal(validate({ action: 'get_hourly', lat: 0, lon: 0 }).valid, true);
  });

  it('should validate get_hourly rejects bad hours', () => {
    assert.equal(validate({ action: 'get_hourly', lat: 0, lon: 0, hours: 0 }).valid, false);
    assert.equal(validate({ action: 'get_hourly', lat: 0, lon: 0, hours: 169 }).valid, false);
    assert.equal(validate({ action: 'get_hourly', lat: 0, lon: 0, hours: 48 }).valid, true);
  });

  it('should validate get_historical requires lat, lon, start_date, end_date', () => {
    assert.equal(validate({ action: 'get_historical' }).valid, false);
    assert.equal(validate({ action: 'get_historical', lat: 0, lon: 0 }).valid, false);
    assert.equal(validate({ action: 'get_historical', lat: 0, lon: 0, start_date: '2024-01-01' }).valid, false);
    assert.equal(validate({ action: 'get_historical', lat: 0, lon: 0, start_date: '2024-01-01', end_date: '2024-01-31' }).valid, true);
  });

  it('should validate search_location requires name', () => {
    assert.equal(validate({ action: 'search_location' }).valid, false);
    assert.equal(validate({ action: 'search_location', name: '' }).valid, false);
    assert.equal(validate({ action: 'search_location', name: 'Paris' }).valid, true);
  });

  it('should validate list_variables requires nothing', () => {
    assert.equal(validate({ action: 'list_variables' }).valid, true);
  });

  it('should validate lat range in get_current', () => {
    assert.equal(validate({ action: 'get_current', lat: 91, lon: 0 }).valid, false);
    assert.equal(validate({ action: 'get_current', lat: -91, lon: 0 }).valid, false);
  });

  it('should validate lon range in get_current', () => {
    assert.equal(validate({ action: 'get_current', lat: 0, lon: 181 }).valid, false);
    assert.equal(validate({ action: 'get_current', lat: 0, lon: -181 }).valid, false);
  });
});

// ---------------------------------------------------------------------------
// 21. meta export
// ---------------------------------------------------------------------------
describe('weather-api: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'weather-api');
  });

  it('should have version', () => {
    assert.ok(meta.version);
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('Weather'));
  });

  it('should list all 6 actions', () => {
    assert.equal(meta.actions.length, 6);
    assert.ok(meta.actions.includes('get_current'));
    assert.ok(meta.actions.includes('get_forecast'));
    assert.ok(meta.actions.includes('get_hourly'));
    assert.ok(meta.actions.includes('get_historical'));
    assert.ok(meta.actions.includes('search_location'));
    assert.ok(meta.actions.includes('list_variables'));
  });
});

// ---------------------------------------------------------------------------
// 22. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('weather-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent for get_current', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleCurrentResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_current', lat: 10, lon: 20 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('/v1/forecast'));
  });

  it('should use gatewayClient for search_location', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleSearchResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'search_location', name: 'Berlin' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('/v1/search'));
  });
});

// ---------------------------------------------------------------------------
// 23. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('weather-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });

  it('should mention Weather API in message', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.metadata.error.message.includes('Weather API'));
  });
});

// ---------------------------------------------------------------------------
// 24. Constants verification
// ---------------------------------------------------------------------------
describe('weather-api: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, [
      'get_current', 'get_forecast', 'get_hourly', 'get_historical', 'search_location', 'list_variables',
    ]);
  });

  it('should have current weather variables', () => {
    assert.ok(WEATHER_VARIABLES.current.length > 0);
    assert.ok(WEATHER_VARIABLES.current.includes('temperature_2m'));
    assert.ok(WEATHER_VARIABLES.current.includes('relative_humidity_2m'));
    assert.ok(WEATHER_VARIABLES.current.includes('wind_speed_10m'));
  });

  it('should have hourly weather variables', () => {
    assert.ok(WEATHER_VARIABLES.hourly.length > 0);
    assert.ok(WEATHER_VARIABLES.hourly.includes('temperature_2m'));
    assert.ok(WEATHER_VARIABLES.hourly.includes('uv_index'));
  });

  it('should have daily weather variables', () => {
    assert.ok(WEATHER_VARIABLES.daily.length > 0);
    assert.ok(WEATHER_VARIABLES.daily.includes('temperature_2m_max'));
    assert.ok(WEATHER_VARIABLES.daily.includes('temperature_2m_min'));
    assert.ok(WEATHER_VARIABLES.daily.includes('sunrise'));
    assert.ok(WEATHER_VARIABLES.daily.includes('sunset'));
  });

  it('should have correct default timeout', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should have correct max timeout', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });
});

// ---------------------------------------------------------------------------
// 25. requestWithTimeout
// ---------------------------------------------------------------------------
describe('weather-api: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return response on success', async () => {
    const client = { request: async () => ({ data: 'ok' }) };
    const result = await requestWithTimeout(client, 'GET', '/test', null, 5000);
    assert.deepEqual(result, { data: 'ok' });
  });

  it('should throw TIMEOUT on AbortError', async () => {
    const client = {
      request: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 100);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'TIMEOUT');
      assert.ok(err.message.includes('100'));
    }
  });

  it('should throw UPSTREAM_ERROR on other errors', async () => {
    const client = {
      request: async () => { throw new Error('network failure'); },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('network failure'));
    }
  });

  it('should handle error without message', async () => {
    const client = {
      request: async () => { throw new Error(); },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
    }
  });

  it('should pass signal to client', async () => {
    let capturedOpts = null;
    const client = {
      request: async (method, path, body, opts) => {
        capturedOpts = opts;
        return {};
      },
    };
    await requestWithTimeout(client, 'GET', '/test', null, 5000);
    assert.ok(capturedOpts.signal);
    assert.ok(capturedOpts.signal instanceof AbortSignal);
  });
});
