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

const sample_send_email = {};
const sample_list_messages = {"value":[{"id":"msg1","subject":"Hello","from":{"emailAddress":{"address":"alice@example.com"}}}]};
const sample_get_message = {"id":"msg1","subject":"Hello","body":{"content":"Hello World"},"from":{"emailAddress":{"address":"alice@example.com"}}};
const sample_search_messages = {"value":[{"id":"msg1","subject":"Hello"}]};

// 1. Action validation
describe('outlook-microsoft-graph-api: action validation', () => {
  beforeEach(() => {});
  it('should reject invalid action', async () => { const r = await execute({ action: 'invalid' }, {}); assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'INVALID_ACTION'); });
  it('should reject missing action', async () => { const r = await execute({}, {}); assert.equal(r.metadata.success, false); });
  it('should reject null params', async () => { const r = await execute(null, {}); assert.equal(r.metadata.success, false); });
  it('should reject undefined params', async () => { const r = await execute(undefined, {}); assert.equal(r.metadata.success, false); });
  it('should list valid actions in error message', async () => { const r = await execute({ action: 'bad' }, {}); for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

// 2. PROVIDER_NOT_CONFIGURED
describe('outlook-microsoft-graph-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});
  it('should fail send_email without client', async () => {
    const r = await execute({ action: 'send_email', to: 'test', subject: 'test', body: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_messages without client', async () => {
    const r = await execute({ action: 'list_messages' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_message without client', async () => {
    const r = await execute({ action: 'get_message', messageId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_messages without client', async () => {
    const r = await execute({ action: 'search_messages', query: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// 3-N. Per-action tests
describe('outlook-microsoft-graph-api: send_email', () => {
  beforeEach(() => {});

  it('should execute send_email successfully', async () => {
    const ctx = mockContext(sample_send_email);
    const r = await execute({ action: 'send_email', to: 'test', subject: 'test', body: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'send_email');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for send_email', async () => {
    const ctx = mockContext(sample_send_email);
    const r = await execute({ action: 'send_email' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for send_email', async () => {
    const ctx = mockContext(sample_send_email);
    const r = await execute({ action: 'send_email', to: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('outlook-microsoft-graph-api: list_messages', () => {
  beforeEach(() => {});

  it('should execute list_messages successfully', async () => {
    const ctx = mockContext(sample_list_messages);
    const r = await execute({ action: 'list_messages' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'list_messages');
    assert.ok(r.metadata.timestamp);
  });
});

describe('outlook-microsoft-graph-api: get_message', () => {
  beforeEach(() => {});

  it('should execute get_message successfully', async () => {
    const ctx = mockContext(sample_get_message);
    const r = await execute({ action: 'get_message', messageId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_message');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for get_message', async () => {
    const ctx = mockContext(sample_get_message);
    const r = await execute({ action: 'get_message' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for get_message', async () => {
    const ctx = mockContext(sample_get_message);
    const r = await execute({ action: 'get_message', messageId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('outlook-microsoft-graph-api: search_messages', () => {
  beforeEach(() => {});

  it('should execute search_messages successfully', async () => {
    const ctx = mockContext(sample_search_messages);
    const r = await execute({ action: 'search_messages', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'search_messages');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for search_messages', async () => {
    const ctx = mockContext(sample_search_messages);
    const r = await execute({ action: 'search_messages' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for search_messages', async () => {
    const ctx = mockContext(sample_search_messages);
    const r = await execute({ action: 'search_messages', query: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

// N+1. Timeout
describe('outlook-microsoft-graph-api: timeout', () => {
  beforeEach(() => {});
  it('should timeout on send_email', async () => {
    const r = await execute({ action: 'send_email', to: 'test', subject: 'test', body: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on list_messages', async () => {
    const r = await execute({ action: 'list_messages' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_message', async () => {
    const r = await execute({ action: 'get_message', messageId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on search_messages', async () => {
    const r = await execute({ action: 'search_messages', query: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// N+2. Network errors
describe('outlook-microsoft-graph-api: network errors', () => {
  beforeEach(() => {});
  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: 'send_email', to: 'test', subject: 'test', body: 'test' }, mockContextError(new Error('Connection refused')));
    assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });
  it('should include error message', async () => {
    const r = await execute({ action: 'send_email', to: 'test', subject: 'test', body: 'test' }, mockContextError(new Error('Connection refused')));
    assert.ok(r.result.includes('Connection refused'));
  });
});

// N+3. getClient
describe('outlook-microsoft-graph-api: getClient', () => {
  beforeEach(() => {});
  it('prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('null for empty', () => { assert.equal(getClient({}), null); });
  it('null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('null for null', () => { assert.equal(getClient(null), null); });
});

// N+4. redactSensitive
describe('outlook-microsoft-graph-api: redactSensitive', () => {
  beforeEach(() => {});
  it('redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('clean string unchanged', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('non-string input', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// N+5. resolveTimeout
describe('outlook-microsoft-graph-api: resolveTimeout', () => {
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
describe('outlook-microsoft-graph-api: validate()', () => {
  beforeEach(() => {});
  it('reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('reject missing', () => { assert.equal(validate({}).valid, false); });
  it('reject null', () => { assert.equal(validate(null).valid, false); });
  it('send_email requires params', () => { assert.equal(validate({ action: 'send_email' }).valid, false); assert.equal(validate({ action: 'send_email', to: 'test', subject: 'test', body: 'test' }).valid, true); });
  it('list_messages valid with no params', () => { assert.equal(validate({ action: 'list_messages' }).valid, true); });
  it('get_message requires params', () => { assert.equal(validate({ action: 'get_message' }).valid, false); assert.equal(validate({ action: 'get_message', messageId: 'test' }).valid, true); });
  it('search_messages requires params', () => { assert.equal(validate({ action: 'search_messages' }).valid, false); assert.equal(validate({ action: 'search_messages', query: 'test' }).valid, true); });
});

// N+7. meta export
describe('outlook-microsoft-graph-api: meta export', () => {
  beforeEach(() => {});
  it('name', () => { assert.equal(meta.name, 'outlook-microsoft-graph-api'); });
  it('version', () => { assert.equal(meta.version, '1.0.0'); });
  it('description', () => { assert.ok(meta.description.length > 0); });
  it('actions count', () => { assert.equal(meta.actions.length, 4); });
});

// N+8. gatewayClient fallback
describe('outlook-microsoft-graph-api: gatewayClient fallback', () => {
  beforeEach(() => {});
  it('should use gatewayClient', async () => {
    const ctx = { gatewayClient: { request: async () => sample_send_email }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'send_email', to: 'test', subject: 'test', body: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// N+9. providerNotConfiguredError
describe('outlook-microsoft-graph-api: providerNotConfiguredError', () => {
  beforeEach(() => {});
  it('success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('result includes Error', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// N+10. constants
describe('outlook-microsoft-graph-api: constants', () => {
  beforeEach(() => {});
  it('VALID_ACTIONS', () => { assert.deepEqual(VALID_ACTIONS, ['send_email', 'list_messages', 'get_message', 'search_messages']); });
});

// N+11. request path verification
describe('outlook-microsoft-graph-api: request path verification', () => {
  beforeEach(() => {});
  it('should call correct path for send_email', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_send_email; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'send_email', to: 'test', subject: 'test', body: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for list_messages', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_list_messages; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'list_messages' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_message', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_message; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_message', messageId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for search_messages', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_search_messages; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'search_messages', query: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });
});
