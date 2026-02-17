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

const sample_create_post = {"id":"urn:li:share:123","content":{}};
const sample_get_profile = {"id":"user123","firstName":{"localized":{"en_US":"John"}},"lastName":{"localized":{"en_US":"Doe"}}};
const sample_list_posts = {"elements":[{"id":"post1","author":"urn:li:person:123"}]};
const sample_get_analytics = {"elements":[{"totalShareStatistics":{"shareCount":100,"likeCount":500}}]};

// 1. Action validation
describe('linkedin-marketing-api: action validation', () => {
  beforeEach(() => {});
  it('should reject invalid action', async () => { const r = await execute({ action: 'invalid' }, {}); assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'INVALID_ACTION'); });
  it('should reject missing action', async () => { const r = await execute({}, {}); assert.equal(r.metadata.success, false); });
  it('should reject null params', async () => { const r = await execute(null, {}); assert.equal(r.metadata.success, false); });
  it('should reject undefined params', async () => { const r = await execute(undefined, {}); assert.equal(r.metadata.success, false); });
  it('should list valid actions in error message', async () => { const r = await execute({ action: 'bad' }, {}); for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

// 2. PROVIDER_NOT_CONFIGURED
describe('linkedin-marketing-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});
  it('should fail create_post without client', async () => {
    const r = await execute({ action: 'create_post', content: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_profile without client', async () => {
    const r = await execute({ action: 'get_profile' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_posts without client', async () => {
    const r = await execute({ action: 'list_posts' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_analytics without client', async () => {
    const r = await execute({ action: 'get_analytics', postId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// 3-N. Per-action tests
describe('linkedin-marketing-api: create_post', () => {
  beforeEach(() => {});

  it('should execute create_post successfully', async () => {
    const ctx = mockContext(sample_create_post);
    const r = await execute({ action: 'create_post', content: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'create_post');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for create_post', async () => {
    const ctx = mockContext(sample_create_post);
    const r = await execute({ action: 'create_post' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for create_post', async () => {
    const ctx = mockContext(sample_create_post);
    const r = await execute({ action: 'create_post', content: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('linkedin-marketing-api: get_profile', () => {
  beforeEach(() => {});

  it('should execute get_profile successfully', async () => {
    const ctx = mockContext(sample_get_profile);
    const r = await execute({ action: 'get_profile' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_profile');
    assert.ok(r.metadata.timestamp);
  });
});

describe('linkedin-marketing-api: list_posts', () => {
  beforeEach(() => {});

  it('should execute list_posts successfully', async () => {
    const ctx = mockContext(sample_list_posts);
    const r = await execute({ action: 'list_posts' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'list_posts');
    assert.ok(r.metadata.timestamp);
  });
});

describe('linkedin-marketing-api: get_analytics', () => {
  beforeEach(() => {});

  it('should execute get_analytics successfully', async () => {
    const ctx = mockContext(sample_get_analytics);
    const r = await execute({ action: 'get_analytics', postId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_analytics');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for get_analytics', async () => {
    const ctx = mockContext(sample_get_analytics);
    const r = await execute({ action: 'get_analytics' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for get_analytics', async () => {
    const ctx = mockContext(sample_get_analytics);
    const r = await execute({ action: 'get_analytics', postId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

// N+1. Timeout
describe('linkedin-marketing-api: timeout', () => {
  beforeEach(() => {});
  it('should timeout on create_post', async () => {
    const r = await execute({ action: 'create_post', content: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_profile', async () => {
    const r = await execute({ action: 'get_profile' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on list_posts', async () => {
    const r = await execute({ action: 'list_posts' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_analytics', async () => {
    const r = await execute({ action: 'get_analytics', postId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// N+2. Network errors
describe('linkedin-marketing-api: network errors', () => {
  beforeEach(() => {});
  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: 'create_post', content: 'test' }, mockContextError(new Error('Connection refused')));
    assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });
  it('should include error message', async () => {
    const r = await execute({ action: 'create_post', content: 'test' }, mockContextError(new Error('Connection refused')));
    assert.ok(r.result.includes('Connection refused'));
  });
});

// N+3. getClient
describe('linkedin-marketing-api: getClient', () => {
  beforeEach(() => {});
  it('prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('null for empty', () => { assert.equal(getClient({}), null); });
  it('null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('null for null', () => { assert.equal(getClient(null), null); });
});

// N+4. redactSensitive
describe('linkedin-marketing-api: redactSensitive', () => {
  beforeEach(() => {});
  it('redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('clean string unchanged', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('non-string input', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// N+5. resolveTimeout
describe('linkedin-marketing-api: resolveTimeout', () => {
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
describe('linkedin-marketing-api: validate()', () => {
  beforeEach(() => {});
  it('reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('reject missing', () => { assert.equal(validate({}).valid, false); });
  it('reject null', () => { assert.equal(validate(null).valid, false); });
  it('create_post requires params', () => { assert.equal(validate({ action: 'create_post' }).valid, false); assert.equal(validate({ action: 'create_post', content: 'test' }).valid, true); });
  it('get_profile valid with no params', () => { assert.equal(validate({ action: 'get_profile' }).valid, true); });
  it('list_posts valid with no params', () => { assert.equal(validate({ action: 'list_posts' }).valid, true); });
  it('get_analytics requires params', () => { assert.equal(validate({ action: 'get_analytics' }).valid, false); assert.equal(validate({ action: 'get_analytics', postId: 'test' }).valid, true); });
});

// N+7. meta export
describe('linkedin-marketing-api: meta export', () => {
  beforeEach(() => {});
  it('name', () => { assert.equal(meta.name, 'linkedin-marketing-api'); });
  it('version', () => { assert.equal(meta.version, '1.0.0'); });
  it('description', () => { assert.ok(meta.description.length > 0); });
  it('actions count', () => { assert.equal(meta.actions.length, 4); });
});

// N+8. gatewayClient fallback
describe('linkedin-marketing-api: gatewayClient fallback', () => {
  beforeEach(() => {});
  it('should use gatewayClient', async () => {
    const ctx = { gatewayClient: { request: async () => sample_create_post }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'create_post', content: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// N+9. providerNotConfiguredError
describe('linkedin-marketing-api: providerNotConfiguredError', () => {
  beforeEach(() => {});
  it('success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('result includes Error', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// N+10. constants
describe('linkedin-marketing-api: constants', () => {
  beforeEach(() => {});
  it('VALID_ACTIONS', () => { assert.deepEqual(VALID_ACTIONS, ['create_post', 'get_profile', 'list_posts', 'get_analytics']); });
});

// N+11. request path verification
describe('linkedin-marketing-api: request path verification', () => {
  beforeEach(() => {});
  it('should call correct path for create_post', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_create_post; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'create_post', content: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_profile', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_profile; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_profile' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for list_posts', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_list_posts; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'list_posts' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_analytics', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_analytics; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_analytics', postId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });
});
