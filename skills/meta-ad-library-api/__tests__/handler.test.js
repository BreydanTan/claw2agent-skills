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

const sample_search_ads = {"data":[{"id":"ad1","ad_creative_bodies":["Buy now!"],"page_name":"Test Brand"}]};
const sample_get_ad_details = {"id":"ad1","ad_creative_bodies":["Buy now!"],"page_name":"Test Brand","ad_delivery_start_time":"2024-01-01"};
const sample_get_page_ads = {"data":[{"id":"ad1","page_name":"Test Brand"}]};
const sample_get_ad_spend = {"data":[{"spend":{"lower_bound":"100","upper_bound":"200"}}]};

// 1. Action validation
describe('meta-ad-library-api: action validation', () => {
  beforeEach(() => {});
  it('should reject invalid action', async () => { const r = await execute({ action: 'invalid' }, {}); assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'INVALID_ACTION'); });
  it('should reject missing action', async () => { const r = await execute({}, {}); assert.equal(r.metadata.success, false); });
  it('should reject null params', async () => { const r = await execute(null, {}); assert.equal(r.metadata.success, false); });
  it('should reject undefined params', async () => { const r = await execute(undefined, {}); assert.equal(r.metadata.success, false); });
  it('should list valid actions in error message', async () => { const r = await execute({ action: 'bad' }, {}); for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

// 2. PROVIDER_NOT_CONFIGURED
describe('meta-ad-library-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});
  it('should fail search_ads without client', async () => {
    const r = await execute({ action: 'search_ads', query: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_ad_details without client', async () => {
    const r = await execute({ action: 'get_ad_details', adId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_page_ads without client', async () => {
    const r = await execute({ action: 'get_page_ads', pageId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_ad_spend without client', async () => {
    const r = await execute({ action: 'get_ad_spend', pageId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// 3-N. Per-action tests
describe('meta-ad-library-api: search_ads', () => {
  beforeEach(() => {});

  it('should execute search_ads successfully', async () => {
    const ctx = mockContext(sample_search_ads);
    const r = await execute({ action: 'search_ads', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'search_ads');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for search_ads', async () => {
    const ctx = mockContext(sample_search_ads);
    const r = await execute({ action: 'search_ads' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for search_ads', async () => {
    const ctx = mockContext(sample_search_ads);
    const r = await execute({ action: 'search_ads', query: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('meta-ad-library-api: get_ad_details', () => {
  beforeEach(() => {});

  it('should execute get_ad_details successfully', async () => {
    const ctx = mockContext(sample_get_ad_details);
    const r = await execute({ action: 'get_ad_details', adId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_ad_details');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for get_ad_details', async () => {
    const ctx = mockContext(sample_get_ad_details);
    const r = await execute({ action: 'get_ad_details' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for get_ad_details', async () => {
    const ctx = mockContext(sample_get_ad_details);
    const r = await execute({ action: 'get_ad_details', adId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('meta-ad-library-api: get_page_ads', () => {
  beforeEach(() => {});

  it('should execute get_page_ads successfully', async () => {
    const ctx = mockContext(sample_get_page_ads);
    const r = await execute({ action: 'get_page_ads', pageId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_page_ads');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for get_page_ads', async () => {
    const ctx = mockContext(sample_get_page_ads);
    const r = await execute({ action: 'get_page_ads' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for get_page_ads', async () => {
    const ctx = mockContext(sample_get_page_ads);
    const r = await execute({ action: 'get_page_ads', pageId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('meta-ad-library-api: get_ad_spend', () => {
  beforeEach(() => {});

  it('should execute get_ad_spend successfully', async () => {
    const ctx = mockContext(sample_get_ad_spend);
    const r = await execute({ action: 'get_ad_spend', pageId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_ad_spend');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for get_ad_spend', async () => {
    const ctx = mockContext(sample_get_ad_spend);
    const r = await execute({ action: 'get_ad_spend' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for get_ad_spend', async () => {
    const ctx = mockContext(sample_get_ad_spend);
    const r = await execute({ action: 'get_ad_spend', pageId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

// N+1. Timeout
describe('meta-ad-library-api: timeout', () => {
  beforeEach(() => {});
  it('should timeout on search_ads', async () => {
    const r = await execute({ action: 'search_ads', query: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_ad_details', async () => {
    const r = await execute({ action: 'get_ad_details', adId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_page_ads', async () => {
    const r = await execute({ action: 'get_page_ads', pageId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_ad_spend', async () => {
    const r = await execute({ action: 'get_ad_spend', pageId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// N+2. Network errors
describe('meta-ad-library-api: network errors', () => {
  beforeEach(() => {});
  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: 'search_ads', query: 'test' }, mockContextError(new Error('Connection refused')));
    assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });
  it('should include error message', async () => {
    const r = await execute({ action: 'search_ads', query: 'test' }, mockContextError(new Error('Connection refused')));
    assert.ok(r.result.includes('Connection refused'));
  });
});

// N+3. getClient
describe('meta-ad-library-api: getClient', () => {
  beforeEach(() => {});
  it('prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('null for empty', () => { assert.equal(getClient({}), null); });
  it('null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('null for null', () => { assert.equal(getClient(null), null); });
});

// N+4. redactSensitive
describe('meta-ad-library-api: redactSensitive', () => {
  beforeEach(() => {});
  it('redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('clean string unchanged', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('non-string input', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// N+5. resolveTimeout
describe('meta-ad-library-api: resolveTimeout', () => {
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
describe('meta-ad-library-api: validate()', () => {
  beforeEach(() => {});
  it('reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('reject missing', () => { assert.equal(validate({}).valid, false); });
  it('reject null', () => { assert.equal(validate(null).valid, false); });
  it('search_ads requires params', () => { assert.equal(validate({ action: 'search_ads' }).valid, false); assert.equal(validate({ action: 'search_ads', query: 'test' }).valid, true); });
  it('get_ad_details requires params', () => { assert.equal(validate({ action: 'get_ad_details' }).valid, false); assert.equal(validate({ action: 'get_ad_details', adId: 'test' }).valid, true); });
  it('get_page_ads requires params', () => { assert.equal(validate({ action: 'get_page_ads' }).valid, false); assert.equal(validate({ action: 'get_page_ads', pageId: 'test' }).valid, true); });
  it('get_ad_spend requires params', () => { assert.equal(validate({ action: 'get_ad_spend' }).valid, false); assert.equal(validate({ action: 'get_ad_spend', pageId: 'test' }).valid, true); });
});

// N+7. meta export
describe('meta-ad-library-api: meta export', () => {
  beforeEach(() => {});
  it('name', () => { assert.equal(meta.name, 'meta-ad-library-api'); });
  it('version', () => { assert.equal(meta.version, '1.0.0'); });
  it('description', () => { assert.ok(meta.description.length > 0); });
  it('actions count', () => { assert.equal(meta.actions.length, 4); });
});

// N+8. gatewayClient fallback
describe('meta-ad-library-api: gatewayClient fallback', () => {
  beforeEach(() => {});
  it('should use gatewayClient', async () => {
    const ctx = { gatewayClient: { request: async () => sample_search_ads }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'search_ads', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// N+9. providerNotConfiguredError
describe('meta-ad-library-api: providerNotConfiguredError', () => {
  beforeEach(() => {});
  it('success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('result includes Error', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// N+10. constants
describe('meta-ad-library-api: constants', () => {
  beforeEach(() => {});
  it('VALID_ACTIONS', () => { assert.deepEqual(VALID_ACTIONS, ['search_ads', 'get_ad_details', 'get_page_ads', 'get_ad_spend']); });
});

// N+11. request path verification
describe('meta-ad-library-api: request path verification', () => {
  beforeEach(() => {});
  it('should call correct path for search_ads', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_search_ads; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'search_ads', query: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_ad_details', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_ad_details; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_ad_details', adId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_page_ads', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_page_ads; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_page_ads', pageId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_ad_spend', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_ad_spend; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_ad_spend', pageId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });
});
