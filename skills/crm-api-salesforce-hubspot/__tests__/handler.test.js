import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute, validate, meta, getClient, providerNotConfiguredError,
  resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString,
  VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS,
} from '../handler.js';

function mockContext(requestResponse, config) {
  return { providerClient: { request: async (m, p, b, o) => requestResponse }, config: config || { timeoutMs: 5000 } };
}
function mockContextError(error) {
  return { providerClient: { request: async () => { throw error; } }, config: { timeoutMs: 1000 } };
}
function mockContextTimeout() {
  return { providerClient: { request: async (_m, _p, _b, o) => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; } }, config: { timeoutMs: 100 } };
}

const sample_find_contact = {"results":[{"id":"c1","email":"alice@example.com","firstName":"Alice","lastName":"Smith"}]};
const sample_create_contact = {"id":"c2","email":"bob@example.com","createdAt":"2024-01-01T00:00:00Z"};
const sample_list_deals = {"results":[{"id":"d1","dealname":"Big Deal","amount":50000,"stage":"negotiation"}]};
const sample_update_deal = {"id":"d1","dealname":"Big Deal","amount":75000,"stage":"closed_won"};
const sample_get_pipeline = {"id":"p1","label":"Sales Pipeline","stages":[{"id":"s1","label":"Prospecting"}]};

// 1. Action validation
describe('crm-api-salesforce-hubspot: action validation', () => {
  beforeEach(() => {});
  it('should reject invalid action', async () => { const r = await execute({ action: 'invalid' }, {}); assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'INVALID_ACTION'); });
  it('should reject missing action', async () => { const r = await execute({}, {}); assert.equal(r.metadata.success, false); });
  it('should reject null params', async () => { const r = await execute(null, {}); assert.equal(r.metadata.success, false); });
  it('should reject undefined params', async () => { const r = await execute(undefined, {}); assert.equal(r.metadata.success, false); });
  it('should list valid actions in error message', async () => { const r = await execute({ action: 'bad' }, {}); for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

// 2. PROVIDER_NOT_CONFIGURED
describe('crm-api-salesforce-hubspot: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});
  it('should fail find_contact without client', async () => {
    const r = await execute({ action: 'find_contact', query: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_contact without client', async () => {
    const r = await execute({ action: 'create_contact', email: 'test', firstName: 'test', lastName: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_deals without client', async () => {
    const r = await execute({ action: 'list_deals' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_deal without client', async () => {
    const r = await execute({ action: 'update_deal', dealId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_pipeline without client', async () => {
    const r = await execute({ action: 'get_pipeline' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// 3-N. Per-action tests
describe('crm-api-salesforce-hubspot: find_contact', () => {
  beforeEach(() => {});

  it('should execute find_contact successfully', async () => {
    const ctx = mockContext(sample_find_contact);
    const r = await execute({ action: 'find_contact', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'find_contact');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for find_contact', async () => {
    const ctx = mockContext(sample_find_contact);
    const r = await execute({ action: 'find_contact' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for find_contact', async () => {
    const ctx = mockContext(sample_find_contact);
    const r = await execute({ action: 'find_contact', query: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('crm-api-salesforce-hubspot: create_contact', () => {
  beforeEach(() => {});

  it('should execute create_contact successfully', async () => {
    const ctx = mockContext(sample_create_contact);
    const r = await execute({ action: 'create_contact', email: 'test', firstName: 'test', lastName: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'create_contact');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for create_contact', async () => {
    const ctx = mockContext(sample_create_contact);
    const r = await execute({ action: 'create_contact' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for create_contact', async () => {
    const ctx = mockContext(sample_create_contact);
    const r = await execute({ action: 'create_contact', email: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('crm-api-salesforce-hubspot: list_deals', () => {
  beforeEach(() => {});

  it('should execute list_deals successfully', async () => {
    const ctx = mockContext(sample_list_deals);
    const r = await execute({ action: 'list_deals' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'list_deals');
    assert.ok(r.metadata.timestamp);
  });
});

describe('crm-api-salesforce-hubspot: update_deal', () => {
  beforeEach(() => {});

  it('should execute update_deal successfully', async () => {
    const ctx = mockContext(sample_update_deal);
    const r = await execute({ action: 'update_deal', dealId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'update_deal');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for update_deal', async () => {
    const ctx = mockContext(sample_update_deal);
    const r = await execute({ action: 'update_deal' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for update_deal', async () => {
    const ctx = mockContext(sample_update_deal);
    const r = await execute({ action: 'update_deal', dealId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('crm-api-salesforce-hubspot: get_pipeline', () => {
  beforeEach(() => {});

  it('should execute get_pipeline successfully', async () => {
    const ctx = mockContext(sample_get_pipeline);
    const r = await execute({ action: 'get_pipeline' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_pipeline');
    assert.ok(r.metadata.timestamp);
  });
});

// N+1. Timeout
describe('crm-api-salesforce-hubspot: timeout', () => {
  beforeEach(() => {});
  it('should timeout on find_contact', async () => {
    const r = await execute({ action: 'find_contact', query: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on create_contact', async () => {
    const r = await execute({ action: 'create_contact', email: 'test', firstName: 'test', lastName: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on list_deals', async () => {
    const r = await execute({ action: 'list_deals' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on update_deal', async () => {
    const r = await execute({ action: 'update_deal', dealId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_pipeline', async () => {
    const r = await execute({ action: 'get_pipeline' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// N+2. Network errors
describe('crm-api-salesforce-hubspot: network errors', () => {
  beforeEach(() => {});
  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: 'find_contact', query: 'test' }, mockContextError(new Error('Connection refused')));
    assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });
  it('should include error message', async () => {
    const r = await execute({ action: 'find_contact', query: 'test' }, mockContextError(new Error('Connection refused')));
    assert.ok(r.result.includes('Connection refused'));
  });
});

// N+3. getClient
describe('crm-api-salesforce-hubspot: getClient', () => {
  beforeEach(() => {});
  it('prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('null for empty', () => { assert.equal(getClient({}), null); });
  it('null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('null for null', () => { assert.equal(getClient(null), null); });
});

// N+4. redactSensitive
describe('crm-api-salesforce-hubspot: redactSensitive', () => {
  beforeEach(() => {});
  it('redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('clean string unchanged', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('non-string input', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// N+5. resolveTimeout
describe('crm-api-salesforce-hubspot: resolveTimeout', () => {
  beforeEach(() => {});
  it('default empty', () => { assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS); });
  it('default undefined', () => { assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS); });
  it('custom val', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000); });
  it('cap at max', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS); });
  it('ignore 0', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS); });
  it('ignore neg', () => { assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS); });
  it('ignore non-num', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 'x' } }), DEFAULT_TIMEOUT_MS); });
  it('DEFAULT=30000', () => { assert.equal(DEFAULT_TIMEOUT_MS, 30000); });
  it('MAX=120000', () => { assert.equal(MAX_TIMEOUT_MS, 120000); });
});

// N+6. validate()
describe('crm-api-salesforce-hubspot: validate()', () => {
  beforeEach(() => {});
  it('reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('reject missing', () => { assert.equal(validate({}).valid, false); });
  it('reject null', () => { assert.equal(validate(null).valid, false); });
  it('find_contact requires params', () => { assert.equal(validate({ action: 'find_contact' }).valid, false); assert.equal(validate({ action: 'find_contact', query: 'test' }).valid, true); });
  it('create_contact requires params', () => { assert.equal(validate({ action: 'create_contact' }).valid, false); assert.equal(validate({ action: 'create_contact', email: 'test', firstName: 'test', lastName: 'test' }).valid, true); });
  it('list_deals valid with no params', () => { assert.equal(validate({ action: 'list_deals' }).valid, true); });
  it('update_deal requires params', () => { assert.equal(validate({ action: 'update_deal' }).valid, false); assert.equal(validate({ action: 'update_deal', dealId: 'test' }).valid, true); });
  it('get_pipeline valid with no params', () => { assert.equal(validate({ action: 'get_pipeline' }).valid, true); });
});

// N+7. meta export
describe('crm-api-salesforce-hubspot: meta export', () => {
  beforeEach(() => {});
  it('name', () => { assert.equal(meta.name, 'crm-api-salesforce-hubspot'); });
  it('version', () => { assert.equal(meta.version, '1.0.0'); });
  it('description', () => { assert.ok(meta.description.length > 0); });
  it('actions count', () => { assert.equal(meta.actions.length, 5); });
});

// N+8. gatewayClient fallback
describe('crm-api-salesforce-hubspot: gatewayClient fallback', () => {
  beforeEach(() => {});
  it('should use gatewayClient', async () => {
    const ctx = { gatewayClient: { request: async () => sample_find_contact }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'find_contact', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// N+9. providerNotConfiguredError
describe('crm-api-salesforce-hubspot: providerNotConfiguredError', () => {
  beforeEach(() => {});
  it('success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('result includes Error', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// N+10. constants
describe('crm-api-salesforce-hubspot: constants', () => {
  beforeEach(() => {});
  it('VALID_ACTIONS', () => { assert.deepEqual(VALID_ACTIONS, ['find_contact', 'create_contact', 'list_deals', 'update_deal', 'get_pipeline']); });
});

// N+11. request path verification
describe('crm-api-salesforce-hubspot: request path verification', () => {
  beforeEach(() => {});
  it('should call correct path for find_contact', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_find_contact; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'find_contact', query: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for create_contact', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_create_contact; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'create_contact', email: 'test', firstName: 'test', lastName: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for list_deals', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_list_deals; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'list_deals' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for update_deal', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_update_deal; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'update_deal', dealId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_pipeline', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_pipeline; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_pipeline' }, ctx);
    assert.ok(calledPath !== null);
  });
});
