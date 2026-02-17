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
  validateQuery,
  validateLeadData,
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

/** Sample contact search response */
const sampleContactsResult = {
  contacts: [
    { name: 'Alice Johnson', email: 'alice@example.com' },
    { name: 'Bob Smith', email: 'bob@example.com' },
  ],
};

/** Sample lead creation response */
const sampleLeadResult = {
  id: 'lead_12345',
  name: 'Jane Doe',
  email: 'jane@example.com',
  company: 'Acme Corp',
};

/** Sample activity log response */
const sampleLogResult = {
  id: 'log_67890',
  contactId: 'contact_001',
  content: 'Called about renewal',
};

/** Sample deals response */
const sampleDealsResult = {
  deals: [
    { name: 'Enterprise License', value: 50000, status: 'open' },
    { name: 'Starter Plan', value: 5000, status: 'won' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('crm-connector: action validation', () => {
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
describe('crm-connector: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail find_contact without client', async () => {
    const result = await execute({ action: 'find_contact', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail create_lead without client', async () => {
    const result = await execute({ action: 'create_lead', leadData: '{"name":"Test"}' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail add_log without client', async () => {
    const result = await execute({ action: 'add_log', contactId: 'c1', logContent: 'note' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_deals without client', async () => {
    const result = await execute({ action: 'list_deals' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. find_contact
// ---------------------------------------------------------------------------
describe('crm-connector: find_contact', () => {
  beforeEach(() => {});

  it('should find contacts successfully', async () => {
    const ctx = mockContext(sampleContactsResult);
    const result = await execute({ action: 'find_contact', query: 'alice' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'find_contact');
    assert.equal(result.metadata.contactCount, 2);
    assert.ok(result.result.includes('Alice Johnson'));
    assert.ok(result.result.includes('alice@example.com'));
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleContactsResult);
    const result = await execute({ action: 'find_contact' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject query not string', async () => {
    const ctx = mockContext(sampleContactsResult);
    const result = await execute({ action: 'find_contact', query: 12345 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should handle empty results', async () => {
    const ctx = mockContext({ contacts: [] });
    const result = await execute({ action: 'find_contact', query: 'nobody' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.contactCount, 0);
    assert.ok(result.result.includes('0 contact(s)'));
  });

  it('should handle multiple results with results field', async () => {
    const ctx = mockContext({ results: [
      { name: 'One', email: 'one@test.com' },
      { name: 'Two', email: 'two@test.com' },
      { name: 'Three', email: 'three@test.com' },
    ]});
    const result = await execute({ action: 'find_contact', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.contactCount, 3);
  });
});

// ---------------------------------------------------------------------------
// 4. create_lead
// ---------------------------------------------------------------------------
describe('crm-connector: create_lead', () => {
  beforeEach(() => {});

  it('should create lead with JSON string', async () => {
    const ctx = mockContext(sampleLeadResult);
    const leadStr = JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com', company: 'Acme Corp' });
    const result = await execute({ action: 'create_lead', leadData: leadStr }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_lead');
    assert.ok(result.result.includes('Lead Created'));
    assert.ok(result.metadata.timestamp);
  });

  it('should create lead with object', async () => {
    const ctx = mockContext(sampleLeadResult);
    const result = await execute({
      action: 'create_lead',
      leadData: { name: 'Jane Doe', email: 'jane@example.com', company: 'Acme Corp' },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_lead');
    assert.ok(result.result.includes('Jane Doe'));
  });

  it('should reject missing leadData', async () => {
    const ctx = mockContext(sampleLeadResult);
    const result = await execute({ action: 'create_lead' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid JSON string', async () => {
    const ctx = mockContext(sampleLeadResult);
    const result = await execute({ action: 'create_lead', leadData: '{bad json' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('not valid JSON'));
  });

  it('should return id from response', async () => {
    const ctx = mockContext({ id: 'lead_99' });
    const result = await execute({
      action: 'create_lead',
      leadData: { name: 'Test Lead' },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.leadId, 'lead_99');
    assert.ok(result.result.includes('lead_99'));
  });
});

// ---------------------------------------------------------------------------
// 5. add_log
// ---------------------------------------------------------------------------
describe('crm-connector: add_log', () => {
  beforeEach(() => {});

  it('should add log successfully', async () => {
    const ctx = mockContext(sampleLogResult);
    const result = await execute({
      action: 'add_log',
      contactId: 'contact_001',
      logContent: 'Called about renewal',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'add_log');
    assert.equal(result.metadata.contactId, 'contact_001');
    assert.ok(result.result.includes('Activity Log Added'));
    assert.ok(result.result.includes('Called about renewal'));
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing contactId', async () => {
    const ctx = mockContext(sampleLogResult);
    const result = await execute({ action: 'add_log', logContent: 'note' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('contactId'));
  });

  it('should reject missing logContent', async () => {
    const ctx = mockContext(sampleLogResult);
    const result = await execute({ action: 'add_log', contactId: 'c1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('logContent'));
  });
});

// ---------------------------------------------------------------------------
// 6. list_deals
// ---------------------------------------------------------------------------
describe('crm-connector: list_deals', () => {
  beforeEach(() => {});

  it('should list deals with default status', async () => {
    const ctx = mockContext(sampleDealsResult);
    const result = await execute({ action: 'list_deals' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_deals');
    assert.equal(result.metadata.status, 'all');
    assert.equal(result.metadata.dealCount, 2);
    assert.ok(result.result.includes('Enterprise License'));
    assert.ok(result.metadata.timestamp);
  });

  it('should list deals with status filter', async () => {
    const ctx = mockContext({ deals: [{ name: 'Won Deal', value: 10000, status: 'won' }] });
    const result = await execute({ action: 'list_deals', status: 'won' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.status, 'won');
    assert.equal(result.metadata.dealCount, 1);
  });

  it('should handle empty deals', async () => {
    const ctx = mockContext({ deals: [] });
    const result = await execute({ action: 'list_deals' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.dealCount, 0);
    assert.ok(result.result.includes('0 deal(s)'));
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout handling
// ---------------------------------------------------------------------------
describe('crm-connector: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on find_contact abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'find_contact', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on create_lead abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'create_lead', leadData: { name: 'Test' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on add_log abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'add_log', contactId: 'c1', logContent: 'note' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_deals abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_deals' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 8. Network error handling
// ---------------------------------------------------------------------------
describe('crm-connector: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on find_contact failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'find_contact', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on create_lead failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'create_lead', leadData: { name: 'Test' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on add_log failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'add_log', contactId: 'c1', logContent: 'note' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_deals failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'list_deals' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'find_contact', query: 'test' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 9. getClient
// ---------------------------------------------------------------------------
describe('crm-connector: getClient', () => {
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

  it('should return null when no client (empty object)', () => {
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
describe('crm-connector: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sample_api_key_for_testing data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_api_key_for_testing'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: test_placeholder_token';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_placeholder_token'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: sample_auth_value_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_auth_value_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Found 5 contacts matching query';
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
describe('crm-connector: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use custom configured timeout', () => {
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
describe('crm-connector: validate()', () => {
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

  it('should validate find_contact requires query', () => {
    assert.equal(validate({ action: 'find_contact' }).valid, false);
    assert.equal(validate({ action: 'find_contact', query: '' }).valid, false);
    assert.equal(validate({ action: 'find_contact', query: 'alice' }).valid, true);
  });

  it('should validate create_lead requires leadData', () => {
    assert.equal(validate({ action: 'create_lead' }).valid, false);
    assert.equal(validate({ action: 'create_lead', leadData: '{"name":"Test"}' }).valid, true);
    assert.equal(validate({ action: 'create_lead', leadData: { name: 'Test' } }).valid, true);
  });

  it('should validate create_lead rejects invalid JSON string', () => {
    assert.equal(validate({ action: 'create_lead', leadData: '{bad' }).valid, false);
  });

  it('should validate add_log requires contactId and logContent', () => {
    assert.equal(validate({ action: 'add_log' }).valid, false);
    assert.equal(validate({ action: 'add_log', contactId: 'c1' }).valid, false);
    assert.equal(validate({ action: 'add_log', logContent: 'note' }).valid, false);
    assert.equal(validate({ action: 'add_log', contactId: 'c1', logContent: 'note' }).valid, true);
  });

  it('should validate list_deals needs no required params', () => {
    assert.equal(validate({ action: 'list_deals' }).valid, true);
  });

  it('should validate list_deals accepts optional status', () => {
    assert.equal(validate({ action: 'list_deals', status: 'open' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 13. meta export
// ---------------------------------------------------------------------------
describe('crm-connector: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'crm-connector');
  });

  it('should have version', () => {
    assert.ok(meta.version);
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('CRM'));
  });

  it('should list all 4 actions', () => {
    assert.equal(meta.actions.length, 4);
    assert.ok(meta.actions.includes('find_contact'));
    assert.ok(meta.actions.includes('create_lead'));
    assert.ok(meta.actions.includes('add_log'));
    assert.ok(meta.actions.includes('list_deals'));
  });
});

// ---------------------------------------------------------------------------
// 14. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('crm-connector: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleContactsResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'find_contact', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/contacts/search');
  });

  it('should succeed with gatewayClient for list_deals', async () => {
    let calledMethod = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledMethod = method;
          return sampleDealsResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_deals' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledMethod, 'GET');
  });
});

// ---------------------------------------------------------------------------
// 15. providerNotConfiguredError
// ---------------------------------------------------------------------------
describe('crm-connector: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });

  it('should include Error in result', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.result.includes('Error'));
  });
});

// ---------------------------------------------------------------------------
// 16. constants
// ---------------------------------------------------------------------------
describe('crm-connector: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, [
      'find_contact', 'create_lead', 'add_log', 'list_deals',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 17. request path verification
// ---------------------------------------------------------------------------
describe('crm-connector: request path verification', () => {
  beforeEach(() => {});

  it('should call POST /contacts/search for find_contact', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleContactsResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'find_contact', query: 'alice' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/contacts/search');
  });

  it('should call POST /leads for create_lead', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleLeadResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'create_lead', leadData: { name: 'Test' } }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/leads');
  });

  it('should call POST /contacts/{contactId}/logs for add_log', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleLogResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'add_log', contactId: 'contact_abc', logContent: 'Called' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/contacts/contact_abc/logs');
  });

  it('should call GET /deals?status=xxx for list_deals', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleDealsResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_deals', status: 'open' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.equal(calledPath, '/deals?status=open');
  });

  it('should call GET /deals?status=all for list_deals default', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleDealsResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_deals' }, ctx);
    assert.equal(calledPath, '/deals?status=all');
  });

  it('should pass body with query for find_contact', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleContactsResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'find_contact', query: 'search term' }, ctx);
    assert.deepEqual(capturedOpts.body, { query: 'search term' });
  });

  it('should pass leadData as body for create_lead', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleLeadResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'create_lead', leadData: { name: 'Bob', email: 'bob@test.com' } }, ctx);
    assert.deepEqual(capturedOpts.body, { name: 'Bob', email: 'bob@test.com' });
  });

  it('should pass content body for add_log', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleLogResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'add_log', contactId: 'c1', logContent: 'Discussed pricing' }, ctx);
    assert.deepEqual(capturedOpts.body, { content: 'Discussed pricing' });
  });
});
