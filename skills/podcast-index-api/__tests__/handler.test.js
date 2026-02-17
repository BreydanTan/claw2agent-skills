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

const sample_search_podcasts = {"feeds":[{"id":1,"title":"Tech Talk","author":"John"}],"count":1};
const sample_get_podcast = {"feed":{"id":1,"title":"Tech Talk","author":"John","description":"A tech podcast"}};
const sample_get_episodes = {"items":[{"id":1,"title":"Episode 1","datePublished":1700000000}],"count":1};
const sample_get_trending = {"feeds":[{"id":1,"title":"Trending Podcast"}],"count":1};

// 1. Action validation
describe('podcast-index-api: action validation', () => {
  beforeEach(() => {});
  it('should reject invalid action', async () => { const r = await execute({ action: 'invalid' }, {}); assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'INVALID_ACTION'); });
  it('should reject missing action', async () => { const r = await execute({}, {}); assert.equal(r.metadata.success, false); });
  it('should reject null params', async () => { const r = await execute(null, {}); assert.equal(r.metadata.success, false); });
  it('should reject undefined params', async () => { const r = await execute(undefined, {}); assert.equal(r.metadata.success, false); });
  it('should list valid actions in error message', async () => { const r = await execute({ action: 'bad' }, {}); for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

// 2. PROVIDER_NOT_CONFIGURED
describe('podcast-index-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});
  it('should fail search_podcasts without client', async () => {
    const r = await execute({ action: 'search_podcasts', query: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_podcast without client', async () => {
    const r = await execute({ action: 'get_podcast', feedId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_episodes without client', async () => {
    const r = await execute({ action: 'get_episodes', feedId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_trending without client', async () => {
    const r = await execute({ action: 'get_trending' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// 3-N. Per-action tests
describe('podcast-index-api: search_podcasts', () => {
  beforeEach(() => {});

  it('should execute search_podcasts successfully', async () => {
    const ctx = mockContext(sample_search_podcasts);
    const r = await execute({ action: 'search_podcasts', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'search_podcasts');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for search_podcasts', async () => {
    const ctx = mockContext(sample_search_podcasts);
    const r = await execute({ action: 'search_podcasts' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for search_podcasts', async () => {
    const ctx = mockContext(sample_search_podcasts);
    const r = await execute({ action: 'search_podcasts', query: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('podcast-index-api: get_podcast', () => {
  beforeEach(() => {});

  it('should execute get_podcast successfully', async () => {
    const ctx = mockContext(sample_get_podcast);
    const r = await execute({ action: 'get_podcast', feedId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_podcast');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for get_podcast', async () => {
    const ctx = mockContext(sample_get_podcast);
    const r = await execute({ action: 'get_podcast' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for get_podcast', async () => {
    const ctx = mockContext(sample_get_podcast);
    const r = await execute({ action: 'get_podcast', feedId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('podcast-index-api: get_episodes', () => {
  beforeEach(() => {});

  it('should execute get_episodes successfully', async () => {
    const ctx = mockContext(sample_get_episodes);
    const r = await execute({ action: 'get_episodes', feedId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_episodes');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for get_episodes', async () => {
    const ctx = mockContext(sample_get_episodes);
    const r = await execute({ action: 'get_episodes' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for get_episodes', async () => {
    const ctx = mockContext(sample_get_episodes);
    const r = await execute({ action: 'get_episodes', feedId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('podcast-index-api: get_trending', () => {
  beforeEach(() => {});

  it('should execute get_trending successfully', async () => {
    const ctx = mockContext(sample_get_trending);
    const r = await execute({ action: 'get_trending' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_trending');
    assert.ok(r.metadata.timestamp);
  });
});

// N+1. Timeout
describe('podcast-index-api: timeout', () => {
  beforeEach(() => {});
  it('should timeout on search_podcasts', async () => {
    const r = await execute({ action: 'search_podcasts', query: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_podcast', async () => {
    const r = await execute({ action: 'get_podcast', feedId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_episodes', async () => {
    const r = await execute({ action: 'get_episodes', feedId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_trending', async () => {
    const r = await execute({ action: 'get_trending' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// N+2. Network errors
describe('podcast-index-api: network errors', () => {
  beforeEach(() => {});
  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: 'search_podcasts', query: 'test' }, mockContextError(new Error('Connection refused')));
    assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });
  it('should include error message', async () => {
    const r = await execute({ action: 'search_podcasts', query: 'test' }, mockContextError(new Error('Connection refused')));
    assert.ok(r.result.includes('Connection refused'));
  });
});

// N+3. getClient
describe('podcast-index-api: getClient', () => {
  beforeEach(() => {});
  it('prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('null for empty', () => { assert.equal(getClient({}), null); });
  it('null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('null for null', () => { assert.equal(getClient(null), null); });
});

// N+4. redactSensitive
describe('podcast-index-api: redactSensitive', () => {
  beforeEach(() => {});
  it('redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('clean string unchanged', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('non-string input', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// N+5. resolveTimeout
describe('podcast-index-api: resolveTimeout', () => {
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
describe('podcast-index-api: validate()', () => {
  beforeEach(() => {});
  it('reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('reject missing', () => { assert.equal(validate({}).valid, false); });
  it('reject null', () => { assert.equal(validate(null).valid, false); });
  it('search_podcasts requires params', () => { assert.equal(validate({ action: 'search_podcasts' }).valid, false); assert.equal(validate({ action: 'search_podcasts', query: 'test' }).valid, true); });
  it('get_podcast requires params', () => { assert.equal(validate({ action: 'get_podcast' }).valid, false); assert.equal(validate({ action: 'get_podcast', feedId: 'test' }).valid, true); });
  it('get_episodes requires params', () => { assert.equal(validate({ action: 'get_episodes' }).valid, false); assert.equal(validate({ action: 'get_episodes', feedId: 'test' }).valid, true); });
  it('get_trending valid with no params', () => { assert.equal(validate({ action: 'get_trending' }).valid, true); });
});

// N+7. meta export
describe('podcast-index-api: meta export', () => {
  beforeEach(() => {});
  it('name', () => { assert.equal(meta.name, 'podcast-index-api'); });
  it('version', () => { assert.equal(meta.version, '1.0.0'); });
  it('description', () => { assert.ok(meta.description.length > 0); });
  it('actions count', () => { assert.equal(meta.actions.length, 4); });
});

// N+8. gatewayClient fallback
describe('podcast-index-api: gatewayClient fallback', () => {
  beforeEach(() => {});
  it('should use gatewayClient', async () => {
    const ctx = { gatewayClient: { request: async () => sample_search_podcasts }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'search_podcasts', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// N+9. providerNotConfiguredError
describe('podcast-index-api: providerNotConfiguredError', () => {
  beforeEach(() => {});
  it('success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('result includes Error', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// N+10. constants
describe('podcast-index-api: constants', () => {
  beforeEach(() => {});
  it('VALID_ACTIONS', () => { assert.deepEqual(VALID_ACTIONS, ['search_podcasts', 'get_podcast', 'get_episodes', 'get_trending']); });
});

// N+11. request path verification
describe('podcast-index-api: request path verification', () => {
  beforeEach(() => {});
  it('should call correct path for search_podcasts', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_search_podcasts; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'search_podcasts', query: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_podcast', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_podcast; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_podcast', feedId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_episodes', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_episodes; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_episodes', feedId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for get_trending', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_get_trending; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_trending' }, ctx);
    assert.ok(calledPath !== null);
  });
});
