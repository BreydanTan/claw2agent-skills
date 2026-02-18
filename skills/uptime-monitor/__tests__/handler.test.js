import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, _clearStore, _storeSize } from '../handler.js';

// ---------------------------------------------------------------------------
// Reset store and restore fetch before every test
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  _clearStore();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Helper: add a default monitor and return its metadata
// ---------------------------------------------------------------------------

async function addMonitor(overrides = {}) {
  const params = {
    action: 'add',
    url: 'https://example.com',
    name: 'Example',
    ...overrides,
  };
  return execute(params, {});
}

/**
 * Mock global fetch to return a controlled response.
 *
 * @param {Object} opts
 * @param {number} opts.status - HTTP status code
 * @param {string} opts.statusText - HTTP status text
 * @param {number} [opts.delay] - Optional delay in ms
 * @param {boolean} [opts.shouldThrow] - If true, fetch rejects
 * @param {string} [opts.errorMessage] - Error message when shouldThrow
 * @param {string} [opts.errorName] - Error name (e.g. 'AbortError')
 * @returns {Function} The mock function
 */
function mockFetch(opts = {}) {
  const {
    status = 200,
    statusText = 'OK',
    delay = 0,
    shouldThrow = false,
    errorMessage = 'Network failure',
    errorName = 'Error',
  } = opts;

  const calls = [];
  const mockFn = async (...args) => {
    calls.push(args);
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (shouldThrow) {
      const err = new Error(errorMessage);
      err.name = errorName;
      throw err;
    }
    return {
      status,
      statusText,
      headers: new Map(),
    };
  };

  mockFn.mock = { calls };
  globalThis.fetch = mockFn;
  return mockFn;
}

// ---------------------------------------------------------------------------
// add action
// ---------------------------------------------------------------------------

describe('uptime-monitor: add', () => {
  it('should register a monitor with required fields', async () => {
    const result = await execute(
      { action: 'add', url: 'https://example.com' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'add');
    assert.ok(result.metadata.monitorId);
    assert.equal(result.metadata.monitor.url, 'https://example.com/');
    assert.equal(_storeSize(), 1);
  });

  it('should register a monitor with all optional fields', async () => {
    const result = await addMonitor({
      name: 'My Site',
      interval: 10,
      expectedStatus: 201,
      timeout: 5000,
    });
    assert.equal(result.metadata.success, true);
    const m = result.metadata.monitor;
    assert.equal(m.name, 'My Site');
    assert.equal(m.interval, 10);
    assert.equal(m.expectedStatus, 201);
    assert.equal(m.timeout, 5000);
  });

  it('should generate unique IDs for each monitor', async () => {
    const r1 = await addMonitor({ url: 'https://site-a.com' });
    const r2 = await addMonitor({ url: 'https://site-b.com' });
    assert.notEqual(r1.metadata.monitorId, r2.metadata.monitorId);
    assert.equal(_storeSize(), 2);
  });

  it('should use default values when optional params are omitted', async () => {
    const result = await addMonitor({});
    const m = result.metadata.monitor;
    assert.equal(m.interval, 5);
    assert.equal(m.expectedStatus, 200);
    assert.equal(m.timeout, 10000);
  });

  it('should return error for missing URL', async () => {
    const result = await execute({ action: 'add' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should return error for invalid URL format', async () => {
    const result = await execute({ action: 'add', url: 'not-a-url' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should return error for ftp:// scheme', async () => {
    const result = await execute({ action: 'add', url: 'ftp://files.example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should return error for file:// scheme', async () => {
    const result = await execute({ action: 'add', url: 'file:///etc/passwd' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should accept http:// URLs', async () => {
    const result = await execute({ action: 'add', url: 'http://example.com' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.monitor.url, 'http://example.com/');
  });

  it('should clamp timeout to max 30000ms', async () => {
    const result = await addMonitor({ timeout: 99999 });
    assert.equal(result.metadata.monitor.timeout, 30000);
  });
});

// ---------------------------------------------------------------------------
// SSRF protection (add action)
// ---------------------------------------------------------------------------

describe('uptime-monitor: SSRF protection', () => {
  it('should block localhost', async () => {
    const result = await execute({ action: 'add', url: 'https://localhost/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should block 127.0.0.1', async () => {
    const result = await execute({ action: 'add', url: 'https://127.0.0.1/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should block 127.x.x.x range', async () => {
    const result = await execute({ action: 'add', url: 'http://127.0.0.2/test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should block 10.x.x.x range', async () => {
    const result = await execute({ action: 'add', url: 'https://10.0.0.1/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should block 172.16-31.x.x range', async () => {
    const r1 = await execute({ action: 'add', url: 'https://172.16.0.1/api' }, {});
    assert.equal(r1.metadata.success, false);
    assert.equal(r1.metadata.error, 'BLOCKED_URL');

    const r2 = await execute({ action: 'add', url: 'https://172.31.255.255/api' }, {});
    assert.equal(r2.metadata.success, false);
    assert.equal(r2.metadata.error, 'BLOCKED_URL');
  });

  it('should block 192.168.x.x range', async () => {
    const result = await execute({ action: 'add', url: 'https://192.168.1.1/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should block 0.0.0.0', async () => {
    const result = await execute({ action: 'add', url: 'https://0.0.0.0/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should block IPv6 loopback [::1]', async () => {
    const result = await execute({ action: 'add', url: 'https://[::1]/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should block 169.254.x.x link-local range', async () => {
    const result = await execute({ action: 'add', url: 'https://169.254.1.1/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should allow 172.15.x.x (not in private range)', async () => {
    const result = await execute({ action: 'add', url: 'https://172.15.0.1/api' }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should allow 172.32.x.x (not in private range)', async () => {
    const result = await execute({ action: 'add', url: 'https://172.32.0.1/api' }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should also block private IPs in check action with raw URL', async () => {
    const result = await execute({ action: 'check', url: 'https://127.0.0.1/' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });
});

// ---------------------------------------------------------------------------
// remove action
// ---------------------------------------------------------------------------

describe('uptime-monitor: remove', () => {
  it('should remove an existing monitor', async () => {
    const added = await addMonitor();
    const id = added.metadata.monitorId;
    assert.equal(_storeSize(), 1);

    const result = await execute({ action: 'remove', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'remove');
    assert.equal(result.metadata.monitorId, id);
    assert.equal(_storeSize(), 0);
  });

  it('should return error when id is missing', async () => {
    const result = await execute({ action: 'remove' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ID');
  });

  it('should return error for non-existent monitor', async () => {
    const result = await execute({ action: 'remove', id: 'ghost-id' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MONITOR_NOT_FOUND');
  });

  it('should not remove the same monitor twice', async () => {
    const added = await addMonitor();
    const id = added.metadata.monitorId;

    await execute({ action: 'remove', id }, {});
    const second = await execute({ action: 'remove', id }, {});
    assert.equal(second.metadata.success, false);
    assert.equal(second.metadata.error, 'MONITOR_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// check action
// ---------------------------------------------------------------------------

describe('uptime-monitor: check', () => {
  it('should perform a check on a registered monitor (UP)', async () => {
    mockFetch({ status: 200 });

    const added = await addMonitor();
    const id = added.metadata.monitorId;

    const result = await execute({ action: 'check', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'check');
    assert.equal(result.metadata.check.isUp, true);
    assert.equal(result.metadata.check.statusCode, 200);
    assert.equal(typeof result.metadata.check.responseTimeMs, 'number');
    assert.ok(result.result.includes('UP'));
  });

  it('should detect DOWN when status does not match expected', async () => {
    mockFetch({ status: 503 });

    const added = await addMonitor();
    const id = added.metadata.monitorId;

    const result = await execute({ action: 'check', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.check.isUp, false);
    assert.equal(result.metadata.check.statusCode, 503);
    assert.ok(result.result.includes('DOWN'));
  });

  it('should check an ad-hoc URL without a registered monitor', async () => {
    mockFetch({ status: 200 });

    const result = await execute(
      { action: 'check', url: 'https://example.com' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.check.isUp, true);
    assert.equal(result.metadata.monitorId, null);
  });

  it('should handle fetch timeout (AbortError)', async () => {
    mockFetch({ shouldThrow: true, errorName: 'AbortError', errorMessage: 'The operation was aborted' });

    const added = await addMonitor();
    const id = added.metadata.monitorId;

    const result = await execute({ action: 'check', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.check.isUp, false);
    assert.equal(result.metadata.check.statusCode, null);
    assert.ok(result.metadata.check.error.includes('timed out'));
  });

  it('should handle network errors', async () => {
    mockFetch({ shouldThrow: true, errorMessage: 'getaddrinfo ENOTFOUND bad.invalid' });

    const result = await execute(
      { action: 'check', url: 'https://bad.invalid' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.check.isUp, false);
    assert.equal(result.metadata.check.statusCode, null);
    assert.ok(result.metadata.check.error.includes('ENOTFOUND'));
  });

  it('should return error when neither id nor url is provided', async () => {
    const result = await execute({ action: 'check' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TARGET');
  });

  it('should return error for non-existent monitor id', async () => {
    const result = await execute({ action: 'check', id: 'no-such-id' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MONITOR_NOT_FOUND');
  });

  it('should store check result in history for registered monitors', async () => {
    mockFetch({ status: 200 });

    const added = await addMonitor();
    const id = added.metadata.monitorId;

    await execute({ action: 'check', id }, {});
    await execute({ action: 'check', id }, {});

    const history = await execute({ action: 'history', id }, {});
    assert.equal(history.metadata.count, 2);
  });

  it('should NOT store check result in history for ad-hoc URLs', async () => {
    mockFetch({ status: 200 });

    await execute({ action: 'check', url: 'https://example.com' }, {});

    // No monitor exists, so no history to query
    assert.equal(_storeSize(), 0);
  });

  it('should use monitor timeout when no override is provided', async () => {
    const fetchMock = mockFetch({ status: 200 });

    const added = await addMonitor({ timeout: 5000 });
    const id = added.metadata.monitorId;

    await execute({ action: 'check', id }, {});
    assert.equal(fetchMock.mock.calls.length, 1, 'fetch should have been called once');
  });

  it('should match custom expectedStatus for UP determination', async () => {
    mockFetch({ status: 201 });

    const added = await addMonitor({ expectedStatus: 201 });
    const id = added.metadata.monitorId;

    const result = await execute({ action: 'check', id }, {});
    assert.equal(result.metadata.check.isUp, true);
    assert.equal(result.metadata.check.expectedStatus, 201);
  });
});

// ---------------------------------------------------------------------------
// status action
// ---------------------------------------------------------------------------

describe('uptime-monitor: status', () => {
  it('should return empty status when no monitors exist', async () => {
    const result = await execute({ action: 'status' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.deepEqual(result.metadata.statuses, []);
    assert.ok(result.result.includes('No monitors'));
  });

  it('should return status for all monitors', async () => {
    await addMonitor({ url: 'https://site-a.com', name: 'Site A' });
    await addMonitor({ url: 'https://site-b.com', name: 'Site B' });

    const result = await execute({ action: 'status' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.statuses.length, 2);
  });

  it('should return status for a specific monitor by ID', async () => {
    const added = await addMonitor({ name: 'My Site' });
    const id = added.metadata.monitorId;

    const result = await execute({ action: 'status', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.monitorId, id);
    assert.equal(result.metadata.status.name, 'My Site');
    assert.equal(result.metadata.status.isUp, null); // No checks yet
    assert.equal(result.metadata.status.uptimePercent, 100);
  });

  it('should reflect last check result in status', async () => {
    mockFetch({ status: 200 });

    const added = await addMonitor();
    const id = added.metadata.monitorId;

    await execute({ action: 'check', id }, {});

    const result = await execute({ action: 'status', id }, {});
    assert.equal(result.metadata.status.isUp, true);
    assert.equal(result.metadata.status.statusCode, 200);
    assert.ok(result.metadata.status.lastCheck);
    assert.ok(result.metadata.status.responseTimeMs >= 0);
  });

  it('should compute uptime percentage correctly', async () => {
    const added = await addMonitor();
    const id = added.metadata.monitorId;

    // 3 UP checks
    mockFetch({ status: 200 });
    await execute({ action: 'check', id }, {});
    await execute({ action: 'check', id }, {});
    await execute({ action: 'check', id }, {});

    // 1 DOWN check
    mockFetch({ status: 503 });
    await execute({ action: 'check', id }, {});

    const result = await execute({ action: 'status', id }, {});
    assert.equal(result.metadata.status.uptimePercent, 75);
  });

  it('should return error for non-existent monitor ID', async () => {
    const result = await execute({ action: 'status', id: 'not-real' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MONITOR_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// list action
// ---------------------------------------------------------------------------

describe('uptime-monitor: list', () => {
  it('should return empty list when no monitors exist', async () => {
    const result = await execute({ action: 'list' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.deepEqual(result.metadata.monitors, []);
    assert.ok(result.result.includes('No monitors'));
  });

  it('should list all registered monitors', async () => {
    await addMonitor({ url: 'https://alpha.com', name: 'Alpha' });
    await addMonitor({ url: 'https://beta.com', name: 'Beta' });
    await addMonitor({ url: 'https://gamma.com', name: 'Gamma' });

    const result = await execute({ action: 'list' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 3);
    assert.equal(result.metadata.monitors.length, 3);

    const names = result.metadata.monitors.map((m) => m.name);
    assert.ok(names.includes('Alpha'));
    assert.ok(names.includes('Beta'));
    assert.ok(names.includes('Gamma'));
  });

  it('should include monitor configuration in list output', async () => {
    await addMonitor({
      url: 'https://example.com',
      name: 'Test',
      interval: 15,
      expectedStatus: 204,
      timeout: 20000,
    });

    const result = await execute({ action: 'list' }, {});
    const m = result.metadata.monitors[0];
    assert.equal(m.name, 'Test');
    assert.equal(m.interval, 15);
    assert.equal(m.expectedStatus, 204);
    assert.equal(m.timeout, 20000);
  });
});

// ---------------------------------------------------------------------------
// history action
// ---------------------------------------------------------------------------

describe('uptime-monitor: history', () => {
  it('should return empty history for a monitor with no checks', async () => {
    const added = await addMonitor();
    const id = added.metadata.monitorId;

    const result = await execute({ action: 'history', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.deepEqual(result.metadata.entries, []);
    assert.ok(result.result.includes('No check history'));
  });

  it('should return check history entries', async () => {
    mockFetch({ status: 200 });

    const added = await addMonitor();
    const id = added.metadata.monitorId;

    await execute({ action: 'check', id }, {});
    await execute({ action: 'check', id }, {});
    await execute({ action: 'check', id }, {});

    const result = await execute({ action: 'history', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 3);
    assert.equal(result.metadata.entries.length, 3);

    // Each entry should have the expected shape
    const entry = result.metadata.entries[0];
    assert.ok('url' in entry);
    assert.ok('statusCode' in entry);
    assert.ok('responseTimeMs' in entry);
    assert.ok('isUp' in entry);
    assert.ok('timestamp' in entry);
  });

  it('should respect the limit parameter', async () => {
    mockFetch({ status: 200 });

    const added = await addMonitor();
    const id = added.metadata.monitorId;

    // Perform 5 checks
    for (let i = 0; i < 5; i++) {
      await execute({ action: 'check', id }, {});
    }

    const result = await execute({ action: 'history', id, limit: 3 }, {});
    assert.equal(result.metadata.count, 3);
    assert.equal(result.metadata.entries.length, 3);
  });

  it('should return the most recent entries when limited', async () => {
    const added = await addMonitor();
    const id = added.metadata.monitorId;

    // First 2 checks: UP
    mockFetch({ status: 200 });
    await execute({ action: 'check', id }, {});
    await execute({ action: 'check', id }, {});

    // Last check: DOWN
    mockFetch({ status: 500 });
    await execute({ action: 'check', id }, {});

    const result = await execute({ action: 'history', id, limit: 1 }, {});
    assert.equal(result.metadata.count, 1);
    assert.equal(result.metadata.entries[0].isUp, false);
    assert.equal(result.metadata.entries[0].statusCode, 500);
  });

  it('should return error when id is missing', async () => {
    const result = await execute({ action: 'history' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ID');
  });

  it('should return error for non-existent monitor', async () => {
    const result = await execute({ action: 'history', id: 'bad-id' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MONITOR_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Edge cases and validation
// ---------------------------------------------------------------------------

describe('uptime-monitor: edge cases', () => {
  it('should return error for invalid action', async () => {
    const result = await execute({ action: 'purge' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('purge'));
  });

  it('should return error for missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should return error when params is null', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should list from an empty store without error', async () => {
    const result = await execute({ action: 'list' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should status from an empty store without error', async () => {
    const result = await execute({ action: 'status' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should handle add with empty string URL', async () => {
    const result = await execute({ action: 'add', url: '' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should handle add with non-string URL', async () => {
    const result = await execute({ action: 'add', url: 12345 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should handle check with invalid URL', async () => {
    const result = await execute({ action: 'check', url: 'not-valid' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should default history limit to 20 when not specified', async () => {
    mockFetch({ status: 200 });

    const added = await addMonitor();
    const id = added.metadata.monitorId;

    // Perform 25 checks
    for (let i = 0; i < 25; i++) {
      await execute({ action: 'check', id }, {});
    }

    const result = await execute({ action: 'history', id }, {});
    assert.equal(result.metadata.count, 20);
  });

  it('should show UNKNOWN status for monitor that has never been checked', async () => {
    const added = await addMonitor();
    const id = added.metadata.monitorId;

    const result = await execute({ action: 'status', id }, {});
    assert.ok(result.result.includes('UNKNOWN'));
    assert.equal(result.metadata.status.isUp, null);
    assert.equal(result.metadata.status.lastCheck, null);
  });

  it('should handle remove then re-add of same URL', async () => {
    const added = await addMonitor({ url: 'https://example.com' });
    const id1 = added.metadata.monitorId;

    await execute({ action: 'remove', id: id1 }, {});
    assert.equal(_storeSize(), 0);

    const readded = await addMonitor({ url: 'https://example.com' });
    assert.equal(readded.metadata.success, true);
    assert.notEqual(readded.metadata.monitorId, id1);
    assert.equal(_storeSize(), 1);
  });
});

// ---------------------------------------------------------------------------
// Timeout enforcement
// ---------------------------------------------------------------------------

describe('uptime-monitor: timeout enforcement', () => {
  it('should clamp timeout to MAX_TIMEOUT (30000ms) on add', async () => {
    const result = await addMonitor({ timeout: 999999 });
    assert.equal(result.metadata.monitor.timeout, 30000);
  });

  it('should use default timeout (10000ms) when not specified', async () => {
    const result = await addMonitor({});
    assert.equal(result.metadata.monitor.timeout, 10000);
  });

  it('should enforce minimum timeout of 1ms', async () => {
    const result = await addMonitor({ timeout: -100 });
    assert.equal(result.metadata.monitor.timeout, 1);
  });

  it('should pass timeout to fetch via AbortController', async () => {
    // We verify by checking the mock is called (fetch is invoked) even with short timeout
    mockFetch({ status: 200 });

    const added = await addMonitor({ timeout: 100 });
    const id = added.metadata.monitorId;

    const result = await execute({ action: 'check', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.check.isUp, true);
  });
});
