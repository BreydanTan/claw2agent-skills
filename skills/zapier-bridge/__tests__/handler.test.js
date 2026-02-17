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
  VALID_ACTIONS,
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

/** Sample list_zaps response */
const sampleZapsList = {
  zaps: [
    { id: 'zap_001', title: 'New Lead Alert', enabled: true, steps: [{ id: 's1' }, { id: 's2' }] },
    { id: 'zap_002', title: 'Slack Notifier', enabled: false, steps: [{ id: 's1' }] },
  ],
};

/** Sample run_zap response */
const sampleRunResult = {
  status: 'success',
  attempt_id: 'exec_abc123',
};

/** Sample get_zap_status response (enabled) */
const sampleZapEnabled = {
  id: 'zap_001',
  title: 'New Lead Alert',
  enabled: true,
  status: 'on',
};

/** Sample get_zap_status response (disabled) */
const sampleZapDisabled = {
  id: 'zap_002',
  title: 'Slack Notifier',
  enabled: false,
  status: 'off',
};

/** Sample list_executions response */
const sampleExecutions = {
  executions: [
    { id: 'exec_001', status: 'success', started_at: '2025-01-15T12:00:00Z', ended_at: '2025-01-15T12:00:05Z' },
    { id: 'exec_002', status: 'failure', started_at: '2025-01-15T11:00:00Z', ended_at: '2025-01-15T11:00:03Z' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('zapier-bridge: action validation', () => {
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
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('zapier-bridge: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail list_zaps without client', async () => {
    const result = await execute({ action: 'list_zaps' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail run_zap without client', async () => {
    const result = await execute({ action: 'run_zap', zapId: 'zap_001' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_zap_status without client', async () => {
    const result = await execute({ action: 'get_zap_status', zapId: 'zap_001' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_executions without client', async () => {
    const result = await execute({ action: 'list_executions', zapId: 'zap_001' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. list_zaps
// ---------------------------------------------------------------------------
describe('zapier-bridge: list_zaps', () => {
  beforeEach(() => {});

  it('should list zaps with default status', async () => {
    const ctx = mockContext(sampleZapsList);
    const result = await execute({ action: 'list_zaps' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_zaps');
    assert.equal(result.metadata.status, 'all');
    assert.equal(result.metadata.zapCount, 2);
  });

  it('should list zaps with status filter', async () => {
    const ctx = mockContext(sampleZapsList);
    const result = await execute({ action: 'list_zaps', status: 'enabled' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.status, 'enabled');
  });

  it('should handle empty zaps list', async () => {
    const ctx = mockContext({ zaps: [] });
    const result = await execute({ action: 'list_zaps' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.zapCount, 0);
    assert.ok(result.result.includes('Total: 0'));
  });

  it('should include formatted output with zap titles', async () => {
    const ctx = mockContext(sampleZapsList);
    const result = await execute({ action: 'list_zaps' }, ctx);
    assert.ok(result.result.includes('New Lead Alert'));
    assert.ok(result.result.includes('Slack Notifier'));
    assert.ok(result.result.includes('enabled'));
    assert.ok(result.result.includes('disabled'));
  });
});

// ---------------------------------------------------------------------------
// 4. run_zap
// ---------------------------------------------------------------------------
describe('zapier-bridge: run_zap', () => {
  beforeEach(() => {});

  it('should run a zap successfully', async () => {
    const ctx = mockContext(sampleRunResult);
    const result = await execute({ action: 'run_zap', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'run_zap');
    assert.equal(result.metadata.zapId, 'zap_001');
    assert.equal(result.metadata.status, 'success');
  });

  it('should reject missing zapId', async () => {
    const ctx = mockContext(sampleRunResult);
    const result = await execute({ action: 'run_zap' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept a valid JSON string payload', async () => {
    const ctx = mockContext(sampleRunResult);
    const result = await execute({ action: 'run_zap', zapId: 'zap_001', payload: '{"key":"value"}' }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept an object payload', async () => {
    const ctx = mockContext(sampleRunResult);
    const result = await execute({ action: 'run_zap', zapId: 'zap_001', payload: { key: 'value' } }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should reject invalid JSON string payload in validate', () => {
    const v = validate({ action: 'run_zap', zapId: 'zap_001', payload: '{bad json' });
    assert.equal(v.valid, false);
    assert.ok(v.error.includes('JSON'));
  });

  it('should return the execution ID in metadata', async () => {
    const ctx = mockContext(sampleRunResult);
    const result = await execute({ action: 'run_zap', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.attemptId, 'exec_abc123');
    assert.ok(result.result.includes('exec_abc123'));
  });
});

// ---------------------------------------------------------------------------
// 5. get_zap_status
// ---------------------------------------------------------------------------
describe('zapier-bridge: get_zap_status', () => {
  beforeEach(() => {});

  it('should return enabled status', async () => {
    const ctx = mockContext(sampleZapEnabled);
    const result = await execute({ action: 'get_zap_status', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_zap_status');
    assert.equal(result.metadata.enabled, true);
    assert.equal(result.metadata.status, 'on');
    assert.ok(result.result.includes('on'));
  });

  it('should return disabled status', async () => {
    const ctx = mockContext(sampleZapDisabled);
    const result = await execute({ action: 'get_zap_status', zapId: 'zap_002' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.enabled, false);
    assert.equal(result.metadata.status, 'off');
    assert.ok(result.result.includes('off'));
  });

  it('should reject missing zapId', async () => {
    const ctx = mockContext(sampleZapEnabled);
    const result = await execute({ action: 'get_zap_status' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 6. list_executions
// ---------------------------------------------------------------------------
describe('zapier-bridge: list_executions', () => {
  beforeEach(() => {});

  it('should list executions with default limit', async () => {
    const ctx = mockContext(sampleExecutions);
    const result = await execute({ action: 'list_executions', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_executions');
    assert.equal(result.metadata.executionCount, 2);
    assert.equal(result.metadata.limit, 10);
  });

  it('should list executions with custom limit', async () => {
    const ctx = mockContext(sampleExecutions);
    const result = await execute({ action: 'list_executions', zapId: 'zap_001', limit: 5 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 5);
  });

  it('should reject missing zapId', async () => {
    const ctx = mockContext(sampleExecutions);
    const result = await execute({ action: 'list_executions' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should handle empty executions list', async () => {
    const ctx = mockContext({ executions: [] });
    const result = await execute({ action: 'list_executions', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.executionCount, 0);
    assert.ok(result.result.includes('Showing: 0'));
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout
// ---------------------------------------------------------------------------
describe('zapier-bridge: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on list_zaps abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_zaps' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on run_zap abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'run_zap', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_zap_status abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_zap_status', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_executions abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_executions', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 8. Network errors
// ---------------------------------------------------------------------------
describe('zapier-bridge: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on list_zaps failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_zaps' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on run_zap failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'run_zap', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_zap_status failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'get_zap_status', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_executions failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'list_executions', zapId: 'zap_001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_zaps' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 9. getClient
// ---------------------------------------------------------------------------
describe('zapier-bridge: getClient', () => {
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

  it('should return null when empty context', () => {
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
// 10. redactSensitive
// ---------------------------------------------------------------------------
describe('zapier-bridge: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: test_placeholder_token data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_placeholder_token'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: sample_api_key_for_testing';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_api_key_for_testing'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: sample_auth_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_auth_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Listed 5 Zaps from workspace';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 11. resolveTimeout
// ---------------------------------------------------------------------------
describe('zapier-bridge: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use custom configured value', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000);
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

  it('should verify DEFAULT_TIMEOUT_MS is 30000', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should verify MAX_TIMEOUT_MS is 120000', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });
});

// ---------------------------------------------------------------------------
// 12. validate()
// ---------------------------------------------------------------------------
describe('zapier-bridge: validate()', () => {
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

  it('should validate list_zaps requires nothing', () => {
    assert.equal(validate({ action: 'list_zaps' }).valid, true);
  });

  it('should validate run_zap requires zapId', () => {
    assert.equal(validate({ action: 'run_zap' }).valid, false);
    assert.equal(validate({ action: 'run_zap', zapId: '' }).valid, false);
    assert.equal(validate({ action: 'run_zap', zapId: 'zap_001' }).valid, true);
  });

  it('should validate run_zap rejects invalid JSON payload', () => {
    assert.equal(validate({ action: 'run_zap', zapId: 'zap_001', payload: '{bad' }).valid, false);
    assert.equal(validate({ action: 'run_zap', zapId: 'zap_001', payload: '{"ok":true}' }).valid, true);
  });

  it('should validate get_zap_status requires zapId', () => {
    assert.equal(validate({ action: 'get_zap_status' }).valid, false);
    assert.equal(validate({ action: 'get_zap_status', zapId: 'zap_001' }).valid, true);
  });

  it('should validate list_executions requires zapId', () => {
    assert.equal(validate({ action: 'list_executions' }).valid, false);
    assert.equal(validate({ action: 'list_executions', zapId: 'zap_001' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 13. meta export
// ---------------------------------------------------------------------------
describe('zapier-bridge: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'zapier-bridge');
  });

  it('should have version', () => {
    assert.ok(meta.version);
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('Zapier'));
  });

  it('should list all 4 actions with correct content', () => {
    assert.equal(meta.actions.length, 4);
    assert.ok(meta.actions.includes('list_zaps'));
    assert.ok(meta.actions.includes('run_zap'));
    assert.ok(meta.actions.includes('get_zap_status'));
    assert.ok(meta.actions.includes('list_executions'));
  });
});

// ---------------------------------------------------------------------------
// 14. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('zapier-bridge: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent for list_zaps', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleZapsList;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_zaps' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.startsWith('/zaps'));
  });
});

// ---------------------------------------------------------------------------
// 15. providerNotConfiguredError
// ---------------------------------------------------------------------------
describe('zapier-bridge: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 16. Constants
// ---------------------------------------------------------------------------
describe('zapier-bridge: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, [
      'list_zaps', 'run_zap', 'get_zap_status', 'list_executions',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 17. Request path verification
// ---------------------------------------------------------------------------
describe('zapier-bridge: request path verification', () => {
  beforeEach(() => {});

  it('should call GET /zaps for list_zaps', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleZapsList;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_zaps' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.ok(calledPath.startsWith('/zaps'));
    assert.ok(calledPath.includes('status='));
  });

  it('should call POST /zaps/{id}/execute for run_zap', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleRunResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'run_zap', zapId: 'zap_001' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/zaps/zap_001/execute');
  });

  it('should call GET /zaps/{id} for get_zap_status', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleZapEnabled;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_zap_status', zapId: 'zap_001' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.equal(calledPath, '/zaps/zap_001');
  });

  it('should call GET /zaps/{id}/executions for list_executions', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleExecutions;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_executions', zapId: 'zap_001' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.ok(calledPath.startsWith('/zaps/zap_001/executions'));
    assert.ok(calledPath.includes('limit='));
  });
});
