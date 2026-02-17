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
  sanitizeContainerId,
  validateLimit,
  validateStopTimeout,
  validateTail,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
  DEFAULT_STOP_TIMEOUT,
  MIN_STOP_TIMEOUT,
  MAX_STOP_TIMEOUT,
  DEFAULT_TAIL,
  MIN_TAIL,
  MAX_TAIL,
  MAX_CONTAINER_ID_LENGTH,
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

/** Sample containers list response */
const sampleContainersList = {
  containers: [
    { id: 'abc123def456', name: 'web-app', status: 'running' },
    { id: 'def456ghi789', name: 'db-server', status: 'exited' },
    { id: 'ghi789jkl012', name: 'redis-cache', status: 'running' },
  ],
};

/** Sample container inspect response */
const sampleContainer = {
  container: {
    id: 'abc123def456',
    name: 'web-app',
    image: 'nginx:latest',
    status: 'running',
    state: 'Up 2 hours',
    created: '2025-01-15T10:00:00Z',
  },
};

/** Sample images list response */
const sampleImagesList = {
  images: [
    { id: 'sha256:abc123', repository: 'nginx', tag: 'latest', size: '142MB' },
    { id: 'sha256:def456', repository: 'node', tag: '18-alpine', size: '175MB' },
  ],
};

/** Sample logs response */
const sampleLogs = {
  logs: '2025-01-15T10:00:00Z Starting application...\n2025-01-15T10:00:01Z Listening on port 8080',
};

/** Sample stats response */
const sampleStats = {
  stats: {
    cpu_percent: 2.5,
    memory_usage: '256MB',
    memory_limit: '1GB',
    network_rx: '1.2MB',
    network_tx: '500KB',
    pids: 12,
  },
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('docker-api: action validation', () => {
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

  it('should have exactly 7 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 7);
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('docker-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail list_containers without client', async () => {
    const result = await execute({ action: 'list_containers' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail get_container without client', async () => {
    const result = await execute({ action: 'get_container', containerId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail start_container without client', async () => {
    const result = await execute({ action: 'start_container', containerId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail stop_container without client', async () => {
    const result = await execute({ action: 'stop_container', containerId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_images without client', async () => {
    const result = await execute({ action: 'list_images' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_logs without client', async () => {
    const result = await execute({ action: 'get_logs', containerId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail container_stats without client', async () => {
    const result = await execute({ action: 'container_stats', containerId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. list_containers action
// ---------------------------------------------------------------------------
describe('docker-api: list_containers', () => {
  beforeEach(() => {});

  it('should list containers with defaults', async () => {
    const ctx = mockContext(sampleContainersList);
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_containers');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.all, false);
    assert.equal(result.metadata.limit, 25);
    assert.equal(result.metadata.containerCount, 3);
    assert.ok(result.result.includes('web-app'));
    assert.ok(result.result.includes('running'));
  });

  it('should include all containers when all=true', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleContainersList; },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_containers', all: true }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.all, true);
    assert.ok(calledPath.includes('all=true'));
  });

  it('should default all to false', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleContainersList; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_containers' }, ctx);
    assert.ok(calledPath.includes('all=false'));
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleContainersList);
    const result = await execute({ action: 'list_containers', limit: 10 }, ctx);
    assert.equal(result.metadata.limit, 10);
  });

  it('should clamp limit to MAX_LIMIT', async () => {
    const ctx = mockContext(sampleContainersList);
    const result = await execute({ action: 'list_containers', limit: 500 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should reject invalid limit', async () => {
    const ctx = mockContext(sampleContainersList);
    const result = await execute({ action: 'list_containers', limit: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [{ name: 'alt-container', status: 'running' }] });
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.containerCount, 1);
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleContainersList);
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleContainersList; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_containers', all: true, limit: 50 }, ctx);
    assert.equal(calledPath, '/containers?all=true&limit=50');
  });
});

// ---------------------------------------------------------------------------
// 4. get_container action
// ---------------------------------------------------------------------------
describe('docker-api: get_container', () => {
  beforeEach(() => {});

  it('should inspect a container by ID', async () => {
    const ctx = mockContext(sampleContainer);
    const result = await execute({ action: 'get_container', containerId: 'abc123def456' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_container');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.containerId, 'abc123def456');
    assert.ok(result.result.includes('web-app'));
    assert.ok(result.result.includes('nginx:latest'));
  });

  it('should include container details in result', async () => {
    const ctx = mockContext(sampleContainer);
    const result = await execute({ action: 'get_container', containerId: 'abc123def456' }, ctx);
    assert.ok(result.result.includes('Status: running'));
    assert.ok(result.result.includes('State: Up 2 hours'));
  });

  it('should reject missing containerId', async () => {
    const ctx = mockContext(sampleContainer);
    const result = await execute({ action: 'get_container' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty containerId', async () => {
    const ctx = mockContext(sampleContainer);
    const result = await execute({ action: 'get_container', containerId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only containerId', async () => {
    const ctx = mockContext(sampleContainer);
    const result = await execute({ action: 'get_container', containerId: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleContainer; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_container', containerId: 'my-container' }, ctx);
    assert.equal(calledPath, '/containers/my-container');
  });

  it('should use GET method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledMethod = method; return sampleContainer; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_container', containerId: 'abc123' }, ctx);
    assert.equal(calledMethod, 'GET');
  });
});

// ---------------------------------------------------------------------------
// 5. start_container action
// ---------------------------------------------------------------------------
describe('docker-api: start_container', () => {
  beforeEach(() => {});

  it('should start a container', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'start_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'start_container');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.containerId, 'abc123');
    assert.ok(result.result.includes('started successfully'));
  });

  it('should use POST method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledMethod = method; return {}; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'start_container', containerId: 'abc123' }, ctx);
    assert.equal(calledMethod, 'POST');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return {}; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'start_container', containerId: 'web-server' }, ctx);
    assert.equal(calledPath, '/containers/web-server/start');
  });

  it('should reject missing containerId', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'start_container' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include timestamp', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'start_container', containerId: 'abc123' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 6. stop_container action
// ---------------------------------------------------------------------------
describe('docker-api: stop_container', () => {
  beforeEach(() => {});

  it('should stop a container with default timeout', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'stop_container');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.containerId, 'abc123');
    assert.equal(result.metadata.timeout, DEFAULT_STOP_TIMEOUT);
    assert.ok(result.result.includes('stopped successfully'));
  });

  it('should use custom timeout', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container', containerId: 'abc123', timeout: 30 }, ctx);
    assert.equal(result.metadata.timeout, 30);
  });

  it('should accept timeout of 0', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container', containerId: 'abc123', timeout: 0 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.timeout, 0);
  });

  it('should accept max timeout of 300', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container', containerId: 'abc123', timeout: 300 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.timeout, 300);
  });

  it('should reject timeout over 300', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container', containerId: 'abc123', timeout: 301 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject negative timeout', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container', containerId: 'abc123', timeout: -1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer timeout', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container', containerId: 'abc123', timeout: 10.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return {}; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'stop_container', containerId: 'web-server', timeout: 15 }, ctx);
    assert.equal(calledPath, '/containers/web-server/stop?timeout=15');
  });

  it('should use POST method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledMethod = method; return {}; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'stop_container', containerId: 'abc123' }, ctx);
    assert.equal(calledMethod, 'POST');
  });

  it('should reject missing containerId', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 7. list_images action
// ---------------------------------------------------------------------------
describe('docker-api: list_images', () => {
  beforeEach(() => {});

  it('should list images with defaults', async () => {
    const ctx = mockContext(sampleImagesList);
    const result = await execute({ action: 'list_images' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_images');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.limit, 25);
    assert.equal(result.metadata.imageCount, 2);
    assert.ok(result.result.includes('nginx'));
    assert.ok(result.result.includes('node'));
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleImagesList);
    const result = await execute({ action: 'list_images', limit: 10 }, ctx);
    assert.equal(result.metadata.limit, 10);
  });

  it('should clamp limit to MAX_LIMIT', async () => {
    const ctx = mockContext(sampleImagesList);
    const result = await execute({ action: 'list_images', limit: 500 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should reject invalid limit', async () => {
    const ctx = mockContext(sampleImagesList);
    const result = await execute({ action: 'list_images', limit: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleImagesList; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_images', limit: 50 }, ctx);
    assert.equal(calledPath, '/images?limit=50');
  });

  it('should use GET method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledMethod = method; return sampleImagesList; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_images' }, ctx);
    assert.equal(calledMethod, 'GET');
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [{ repository: 'alpine', tag: '3.18', size: '5MB' }] });
    const result = await execute({ action: 'list_images' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.imageCount, 1);
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleImagesList);
    const result = await execute({ action: 'list_images' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 8. get_logs action
// ---------------------------------------------------------------------------
describe('docker-api: get_logs', () => {
  beforeEach(() => {});

  it('should fetch container logs with defaults', async () => {
    const ctx = mockContext(sampleLogs);
    const result = await execute({ action: 'get_logs', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_logs');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.containerId, 'abc123');
    assert.equal(result.metadata.tail, DEFAULT_TAIL);
    assert.equal(result.metadata.timestamps, true);
    assert.ok(result.result.includes('Starting application'));
  });

  it('should use custom tail', async () => {
    const ctx = mockContext(sampleLogs);
    const result = await execute({ action: 'get_logs', containerId: 'abc123', tail: 50 }, ctx);
    assert.equal(result.metadata.tail, 50);
  });

  it('should disable timestamps', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleLogs; },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_logs', containerId: 'abc123', timestamps: false }, ctx);
    assert.equal(result.metadata.timestamps, false);
    assert.ok(calledPath.includes('timestamps=false'));
  });

  it('should default timestamps to true', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleLogs; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_logs', containerId: 'abc123' }, ctx);
    assert.ok(calledPath.includes('timestamps=true'));
  });

  it('should reject tail below minimum', async () => {
    const ctx = mockContext(sampleLogs);
    const result = await execute({ action: 'get_logs', containerId: 'abc123', tail: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject tail above maximum', async () => {
    const ctx = mockContext(sampleLogs);
    const result = await execute({ action: 'get_logs', containerId: 'abc123', tail: 1001 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer tail', async () => {
    const ctx = mockContext(sampleLogs);
    const result = await execute({ action: 'get_logs', containerId: 'abc123', tail: 50.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleLogs; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_logs', containerId: 'web-app', tail: 200, timestamps: true }, ctx);
    assert.equal(calledPath, '/containers/web-app/logs?tail=200&timestamps=true');
  });

  it('should reject missing containerId', async () => {
    const ctx = mockContext(sampleLogs);
    const result = await execute({ action: 'get_logs' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should handle string log output', async () => {
    const ctx = mockContext({ output: 'plain log output here' });
    const result = await execute({ action: 'get_logs', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('plain log output here'));
  });
});

// ---------------------------------------------------------------------------
// 9. container_stats action
// ---------------------------------------------------------------------------
describe('docker-api: container_stats', () => {
  beforeEach(() => {});

  it('should fetch container stats', async () => {
    const ctx = mockContext(sampleStats);
    const result = await execute({ action: 'container_stats', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'container_stats');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.containerId, 'abc123');
    assert.ok(result.result.includes('CPU: 2.5%'));
    assert.ok(result.result.includes('Memory: 256MB'));
    assert.ok(result.result.includes('PIDs: 12'));
  });

  it('should include network stats in result', async () => {
    const ctx = mockContext(sampleStats);
    const result = await execute({ action: 'container_stats', containerId: 'abc123' }, ctx);
    assert.ok(result.result.includes('Network RX: 1.2MB'));
    assert.ok(result.result.includes('Network TX: 500KB'));
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleStats; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'container_stats', containerId: 'web-app' }, ctx);
    assert.equal(calledPath, '/containers/web-app/stats');
  });

  it('should use GET method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledMethod = method; return sampleStats; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'container_stats', containerId: 'abc123' }, ctx);
    assert.equal(calledMethod, 'GET');
  });

  it('should reject missing containerId', async () => {
    const ctx = mockContext(sampleStats);
    const result = await execute({ action: 'container_stats' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleStats);
    const result = await execute({ action: 'container_stats', containerId: 'abc123' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should handle minimal stats data', async () => {
    const ctx = mockContext({ stats: { cpu_percent: 0 } });
    const result = await execute({ action: 'container_stats', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('CPU: 0%'));
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('docker-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on list_containers abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_container abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on start_container abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'start_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on stop_container abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'stop_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_images abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_images' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_logs abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_logs', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on container_stats abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'container_stats', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('docker-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on list_containers failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_container failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'get_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on start_container failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'start_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on stop_container failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'stop_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_images failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({ action: 'list_images' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_logs failure', async () => {
    const ctx = mockContextError(new Error('Not found'));
    const result = await execute({ action: 'get_logs', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on container_stats failure', async () => {
    const ctx = mockContextError(new Error('Service unavailable'));
    const result = await execute({ action: 'container_stats', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 12. Container ID security (injection prevention)
// ---------------------------------------------------------------------------
describe('docker-api: container ID security', () => {
  beforeEach(() => {});

  it('should accept valid alphanumeric container ID', () => {
    const result = sanitizeContainerId('abc123def456');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'abc123def456');
  });

  it('should accept container ID with hyphens', () => {
    const result = sanitizeContainerId('my-web-app');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'my-web-app');
  });

  it('should accept container ID with underscores', () => {
    const result = sanitizeContainerId('my_web_app');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'my_web_app');
  });

  it('should accept container ID with dots', () => {
    const result = sanitizeContainerId('app.v1.0');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'app.v1.0');
  });

  it('should trim whitespace from container ID', () => {
    const result = sanitizeContainerId('  abc123  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'abc123');
  });

  it('should reject path traversal attempt with slashes', () => {
    const result = sanitizeContainerId('../../etc/passwd');
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject shell injection with semicolons', () => {
    const result = sanitizeContainerId('abc123; rm -rf /');
    assert.equal(result.valid, false);
  });

  it('should reject command injection with backticks', () => {
    const result = sanitizeContainerId('abc`whoami`');
    assert.equal(result.valid, false);
  });

  it('should reject command injection with $() syntax', () => {
    const result = sanitizeContainerId('abc$(cat /etc/passwd)');
    assert.equal(result.valid, false);
  });

  it('should reject pipe injection', () => {
    const result = sanitizeContainerId('abc123 | cat /etc/shadow');
    assert.equal(result.valid, false);
  });

  it('should reject ampersand injection', () => {
    const result = sanitizeContainerId('abc123 && echo pwned');
    assert.equal(result.valid, false);
  });

  it('should reject newline injection', () => {
    const result = sanitizeContainerId('abc123\nrm -rf /');
    assert.equal(result.valid, false);
  });

  it('should reject container ID exceeding max length', () => {
    const longId = 'a'.repeat(MAX_CONTAINER_ID_LENGTH + 1);
    const result = sanitizeContainerId(longId);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('128'));
  });

  it('should accept container ID at max length', () => {
    const maxId = 'a'.repeat(MAX_CONTAINER_ID_LENGTH);
    const result = sanitizeContainerId(maxId);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, maxId);
  });

  it('should reject null container ID', () => {
    const result = sanitizeContainerId(null);
    assert.equal(result.valid, false);
  });

  it('should reject undefined container ID', () => {
    const result = sanitizeContainerId(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject empty string container ID', () => {
    const result = sanitizeContainerId('');
    assert.equal(result.valid, false);
  });

  it('should reject numeric container ID', () => {
    const result = sanitizeContainerId(12345);
    assert.equal(result.valid, false);
  });

  it('should reject HTML/XSS injection in container ID', () => {
    const result = sanitizeContainerId('<script>alert(1)</script>');
    assert.equal(result.valid, false);
  });

  it('should reject URL-encoded path traversal', () => {
    const result = sanitizeContainerId('%2e%2e%2f%2e%2e%2fetc');
    assert.equal(result.valid, false);
  });

  it('should reject container ID with colons', () => {
    const result = sanitizeContainerId('registry:5000/image');
    assert.equal(result.valid, false);
  });

  it('should reject container ID with quotes', () => {
    const result = sanitizeContainerId('"abc123"');
    assert.equal(result.valid, false);
  });

  it('should verify injection is blocked in execute', async () => {
    const ctx = mockContext(sampleContainer);
    const result = await execute({ action: 'get_container', containerId: '../../../etc/passwd' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should verify shell injection is blocked in start_container', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'start_container', containerId: 'abc; rm -rf /' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should verify injection is blocked in stop_container', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'stop_container', containerId: 'abc$(whoami)' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should verify injection is blocked in get_logs', async () => {
    const ctx = mockContext(sampleLogs);
    const result = await execute({ action: 'get_logs', containerId: 'abc | cat /etc/shadow' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should verify injection is blocked in container_stats', async () => {
    const ctx = mockContext(sampleStats);
    const result = await execute({ action: 'container_stats', containerId: 'abc`whoami`' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 13. getClient helper
// ---------------------------------------------------------------------------
describe('docker-api: getClient', () => {
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
});

// ---------------------------------------------------------------------------
// 14. redactSensitive
// ---------------------------------------------------------------------------
describe('docker-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: some_test_value_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('some_test_value_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: Bearer_mytoken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Bearer_mytoken123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact password patterns', () => {
    const input = 'password=testpass123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('testpass123'));
  });

  it('should not alter clean strings', () => {
    const input = 'Listed 3 containers successfully';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should redact sensitive data in error messages from upstream', async () => {
    const ctx = mockContextError(new Error('token: some_sensitive_value'));
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.ok(!result.result.includes('some_sensitive_value'));
  });
});

// ---------------------------------------------------------------------------
// 15. validateLimit helper
// ---------------------------------------------------------------------------
describe('docker-api: validateLimit', () => {
  beforeEach(() => {});

  it('should return default when limit is undefined', () => {
    const result = validateLimit(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should return default when limit is null', () => {
    const result = validateLimit(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should accept valid limit', () => {
    const result = validateLimit(50);
    assert.equal(result.valid, true);
    assert.equal(result.value, 50);
  });

  it('should clamp limit to MAX_LIMIT', () => {
    const result = validateLimit(200);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_LIMIT);
  });

  it('should accept MIN_LIMIT', () => {
    const result = validateLimit(MIN_LIMIT);
    assert.equal(result.valid, true);
    assert.equal(result.value, MIN_LIMIT);
  });

  it('should reject 0', () => {
    const result = validateLimit(0);
    assert.equal(result.valid, false);
  });

  it('should reject negative number', () => {
    const result = validateLimit(-5);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateLimit(1.5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateStopTimeout helper
// ---------------------------------------------------------------------------
describe('docker-api: validateStopTimeout', () => {
  beforeEach(() => {});

  it('should return default when timeout is undefined', () => {
    const result = validateStopTimeout(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_STOP_TIMEOUT);
  });

  it('should return default when timeout is null', () => {
    const result = validateStopTimeout(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_STOP_TIMEOUT);
  });

  it('should accept 0', () => {
    const result = validateStopTimeout(0);
    assert.equal(result.valid, true);
    assert.equal(result.value, 0);
  });

  it('should accept valid timeout', () => {
    const result = validateStopTimeout(30);
    assert.equal(result.valid, true);
    assert.equal(result.value, 30);
  });

  it('should accept max timeout', () => {
    const result = validateStopTimeout(MAX_STOP_TIMEOUT);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_STOP_TIMEOUT);
  });

  it('should reject over max', () => {
    const result = validateStopTimeout(301);
    assert.equal(result.valid, false);
  });

  it('should reject negative', () => {
    const result = validateStopTimeout(-1);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateStopTimeout(10.5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validateTail helper
// ---------------------------------------------------------------------------
describe('docker-api: validateTail', () => {
  beforeEach(() => {});

  it('should return default when tail is undefined', () => {
    const result = validateTail(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_TAIL);
  });

  it('should return default when tail is null', () => {
    const result = validateTail(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_TAIL);
  });

  it('should accept valid tail', () => {
    const result = validateTail(50);
    assert.equal(result.valid, true);
    assert.equal(result.value, 50);
  });

  it('should accept MIN_TAIL', () => {
    const result = validateTail(MIN_TAIL);
    assert.equal(result.valid, true);
    assert.equal(result.value, MIN_TAIL);
  });

  it('should accept MAX_TAIL', () => {
    const result = validateTail(MAX_TAIL);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_TAIL);
  });

  it('should reject 0', () => {
    const result = validateTail(0);
    assert.equal(result.valid, false);
  });

  it('should reject over max', () => {
    const result = validateTail(1001);
    assert.equal(result.valid, false);
  });

  it('should reject negative', () => {
    const result = validateTail(-10);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateTail(50.5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 18. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('docker-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should cap at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should ignore non-positive timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
    assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore non-number timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 19. validate() export
// ---------------------------------------------------------------------------
describe('docker-api: validate()', () => {
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

  it('should validate list_containers requires nothing', () => {
    assert.equal(validate({ action: 'list_containers' }).valid, true);
  });

  it('should validate get_container requires containerId', () => {
    assert.equal(validate({ action: 'get_container' }).valid, false);
    assert.equal(validate({ action: 'get_container', containerId: '' }).valid, false);
    assert.equal(validate({ action: 'get_container', containerId: 'abc123' }).valid, true);
  });

  it('should validate start_container requires containerId', () => {
    assert.equal(validate({ action: 'start_container' }).valid, false);
    assert.equal(validate({ action: 'start_container', containerId: 'abc123' }).valid, true);
  });

  it('should validate stop_container requires containerId', () => {
    assert.equal(validate({ action: 'stop_container' }).valid, false);
    assert.equal(validate({ action: 'stop_container', containerId: 'abc123' }).valid, true);
  });

  it('should validate list_images requires nothing', () => {
    assert.equal(validate({ action: 'list_images' }).valid, true);
  });

  it('should validate get_logs requires containerId', () => {
    assert.equal(validate({ action: 'get_logs' }).valid, false);
    assert.equal(validate({ action: 'get_logs', containerId: 'abc123' }).valid, true);
  });

  it('should validate container_stats requires containerId', () => {
    assert.equal(validate({ action: 'container_stats' }).valid, false);
    assert.equal(validate({ action: 'container_stats', containerId: 'abc123' }).valid, true);
  });

  it('should reject invalid containerId in validate', () => {
    assert.equal(validate({ action: 'get_container', containerId: '../etc/passwd' }).valid, false);
  });
});

// ---------------------------------------------------------------------------
// 20. meta export
// ---------------------------------------------------------------------------
describe('docker-api: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'docker-api');
  });

  it('should have version', () => {
    assert.ok(meta.version);
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('Docker'));
  });

  it('should list all 7 actions', () => {
    assert.equal(meta.actions.length, 7);
    assert.ok(meta.actions.includes('list_containers'));
    assert.ok(meta.actions.includes('get_container'));
    assert.ok(meta.actions.includes('start_container'));
    assert.ok(meta.actions.includes('stop_container'));
    assert.ok(meta.actions.includes('list_images'));
    assert.ok(meta.actions.includes('get_logs'));
    assert.ok(meta.actions.includes('container_stats'));
  });
});

// ---------------------------------------------------------------------------
// 21. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('docker-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path, body, opts) => {
          calledPath = path;
          return sampleContainersList;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('/containers'));
  });

  it('should use gatewayClient for get_container', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path, body, opts) => {
          calledPath = path;
          return sampleContainer;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_container', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/containers/abc123');
  });
});

// ---------------------------------------------------------------------------
// 22. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('docker-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });

  it('should mention Docker in error message', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.result.includes('Docker'));
    assert.ok(err.metadata.error.message.includes('Docker'));
  });
});

// ---------------------------------------------------------------------------
// 23. Edge cases and additional coverage
// ---------------------------------------------------------------------------
describe('docker-api: edge cases', () => {
  beforeEach(() => {});

  it('should handle all=true as string', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleContainersList; },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_containers', all: 'true' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('all=true'));
  });

  it('should handle empty containers list', async () => {
    const ctx = mockContext({ containers: [] });
    const result = await execute({ action: 'list_containers' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.containerCount, 0);
  });

  it('should handle empty images list', async () => {
    const ctx = mockContext({ images: [] });
    const result = await execute({ action: 'list_images' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.imageCount, 0);
  });

  it('should handle container with no optional fields', async () => {
    const ctx = mockContext({ container: { id: 'min123' } });
    const result = await execute({ action: 'get_container', containerId: 'min123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('min123'));
  });

  it('should handle timestamps=false as string', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { calledPath = path; return sampleLogs; },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_logs', containerId: 'abc123', timestamps: 'false' }, ctx);
    assert.equal(result.metadata.timestamps, false);
    assert.ok(calledPath.includes('timestamps=false'));
  });

  it('should handle non-string log data gracefully', async () => {
    const ctx = mockContext({ logs: { line1: 'hello', line2: 'world' } });
    const result = await execute({ action: 'get_logs', containerId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
  });
});
