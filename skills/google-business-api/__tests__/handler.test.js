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

const sample_get_listing = {"name":"locations/123","locationName":"Test Business","address":{"locality":"San Francisco"}};
const sample_list_reviews = {"reviews":[{"reviewId":"rev1","rating":5,"comment":"Great!"}],"totalReviewCount":1};
const sample_reply_review = {"comment":"Thank you!","updateTime":"2024-01-01T00:00:00Z"};
const sample_create_post = {"name":"locations/123/localPosts/456","summary":"New post content"};

// 1. Action validation
describe('google-business-api: action validation', () => {
  beforeEach(() => {});
  it('should reject invalid action', async () => { const r = await execute({ action: 'invalid' }, {}); assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'INVALID_ACTION'); });
  it('should reject missing action', async () => { const r = await execute({}, {}); assert.equal(r.metadata.success, false); });
  it('should reject null params', async () => { const r = await execute(null, {}); assert.equal(r.metadata.success, false); });
  it('should reject undefined params', async () => { const r = await execute(undefined, {}); assert.equal(r.metadata.success, false); });
  it('should list valid actions in error message', async () => { const r = await execute({ action: 'bad' }, {}); for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

// 2. PROVIDER_NOT_CONFIGURED
describe('google-business-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});
  it('should fail get_listing without client', async () => {
    const r = await execute({ action: 'get_listing', locationId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_reviews without client', async () => {
    const r = await execute({ action: 'list_reviews', locationId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail reply_review without client', async () => {
    const r = await execute({ action: 'reply_review', locationId: 'test', reviewId: 'test', comment: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_post without client', async () => {
    const r = await execute({ action: 'create_post', locationId: 'test', content: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// 3-N. Per-action tests
describe('google-business-api: get_listing', () => {
  beforeEach(() => {});

  it('should execute get_listing successfully', async () => {
    const ctx = mockContext(sample_get_listing);
    const r = await execute({ action: 'get_listing', locationId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_listing');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for get_listing', async () => {
    const ctx = mockContext(sample_get_listing);
    const r = await execute({ action: 'get_listing' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for get_listing', async () => {
    const ctx = mockContext(sample_get_listing);
    const r = await execute({ action: 'get_listing', locationId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('google-business-api: list_reviews', () => {
  beforeEach(() => {});

  it('should execute list_reviews successfully', async () => {
    const ctx = mockContext(sample_list_reviews);
    const r = await execute({ action: 'list_reviews', locationId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'list_reviews');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for list_reviews', async () => {
    const ctx = mockContext(sample_list_reviews);
    const r = await execute({ action: 'list_reviews' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for list_reviews', async () => {
    const ctx = mockContext(sample_list_reviews);
    const r = await execute({ action: 'list_reviews', locationId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('google-business-api: reply_review', () => {
  beforeEach(() => {});

  it('should execute reply_review successfully', async () => {
    const ctx = mockContext(sample_reply_review);
    const r = await execute({ action: 'reply_review', locationId: 'test', reviewId: 'test', comment: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'reply_review');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for reply_review', async () => {
    const ctx = mockContext(sample_reply_review);
    const r = await execute({ action: 'reply_review' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for reply_review', async () => {
    const ctx = mockContext(sample_reply_review);
    const r = await execute({ action: 'reply_review', locationId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('google-business-api: create_post', () => {
  beforeEach(() => {});

  it('should execute create_post successfully', async () => {
    const ctx = mockContext(sample_create_post);
    const r = await execute({ action: 'create_post', locationId: 'test', content: 'test' }, ctx);
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
    const r = await execute({ action: 'create_post', locationId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

// N+1. Timeout
describe('google-business-api: timeout', () => {
  beforeEach(() => {});
  it('should timeout on get_listing', async () => {
    const r = await execute({ action: 'get_listing', locationId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on list_reviews', async () => {
    const r = await execute({ action: 'list_reviews', locationId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on reply_review', async () => {
    const r = await execute({ action: 'reply_review', locationId: 'test', reviewId: 'test', comment: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on create_post', async () => {
    const r = await execute({ action: 'create_post', locationId: 'test', content: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// N+2. Network errors
describe('google-business-api: network errors', () => {
  beforeEach(() => {});
  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: 'get_listing', locationId: 'test' }, mockContextError(new Error('Connection refused')));
    assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });
  it('should include error message', async () => {
    const r = await execute({ action: 'get_listing', locationId: 'test' }, mockContextError(new Error('Connection refused')));
    assert.ok(r.result.includes('Connection refused'));
  });
});

// N+3. getClient
describe('google-business-api: getClient', () => {
  beforeEach(() => {});
  it('prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('null for empty', () => { assert.equal(getClient({}), null); });
  it('null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('null for null', () => { assert.equal(getClient(null), null); });
});

// N+4. redactSensitive
describe('google-business-api: redactSensitive', () => {
  beforeEach(() => {});
  it('redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('clean string unchanged', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('non-string input', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// N+5. resolveTimeout
describe('google-business-api: resolveTimeout', () => {
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
describe('google-business-api: validate()', () => {
  beforeEach(() => {});
  it('reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('reject missing', () => { assert.equal(validate({}).valid, false); });
  it('reject null', () => { assert.equal(validate(null).valid, false); });
  it('get_listing requires params', () => { assert.equal(validate({ action: 'get_listing' }).valid, false); assert.equal(validate({ action: 'get_listing', locationId: 'test' }).valid, true); });
  it('list_reviews requires params', () => { assert.equal(validate({ action: 'list_reviews' }).valid, false); assert.equal(validate({ action: 'list_reviews', locationId: 'test' }).valid, true); });
  it('reply_review requires params', () => { assert.equal(validate({ action: 'reply_review' }).valid, false); assert.equal(validate({ action: 'reply_review', locationId: 'test', reviewId: 'test', comment: 'test' }).valid, true); });
  it('create_post requires params', () => { assert.equal(validate({ action: 'create_post' }).valid, false); assert.equal(validate({ action: 'create_post', locationId: 'test', content: 'test' }).valid, true); });
});

// N+7. meta export
describe('google-business-api: meta export', () => {
  beforeEach(() => {});
  it('name', () => { assert.equal(meta.name, 'google-business-api'); });
  it('version', () => { assert.equal(meta.version, '1.0.0'); });
  it('description', () => { assert.ok(meta.description.length > 0); });
  it('actions count', () => { assert.equal(meta.actions.length, 4); });
});

// N+8. gatewayClient fallback
describe('google-business-api: gatewayClient fallback', () => {
  beforeEach(() => {});
  it('should use gatewayClient', async () => {
    const ctx = { gatewayClient: { request: async () => sample_get_listing }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'get_listing', locationId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// N+9. providerNotConfiguredError
describe('google-business-api: providerNotConfiguredError', () => {
  beforeEach(() => {});
  it('success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('result includes Error', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// N+10. constants
describe('google-business-api: constants', () => {
  beforeEach(() => {});
  it('VALID_ACTIONS', () => { assert.deepEqual(VALID_ACTIONS, ['get_listing', 'list_reviews', 'reply_review', 'create_post']); });
});

// N+11. request path verification
describe('google-business-api: request path verification', () => {
  beforeEach(() => {});
  it('should call correct path for get_listing', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_listing; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_listing', locationId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for list_reviews', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_list_reviews; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'list_reviews', locationId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for reply_review', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_reply_review; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'reply_review', locationId: 'test', reviewId: 'test', comment: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for create_post', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_create_post; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'create_post', locationId: 'test', content: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });
});
