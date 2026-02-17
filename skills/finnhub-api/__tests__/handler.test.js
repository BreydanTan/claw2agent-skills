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
  validateSymbol,
  validateQuery,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

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

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleQuote = { c: 150.25, d: 2.5, dp: 1.69, h: 151.0, l: 148.0, o: 149.0, pc: 147.75, t: 1700000000 };
const sampleProfile = { name: 'Apple Inc', ticker: 'AAPL', exchange: 'NASDAQ', ipo: '1980-12-12', marketCapitalization: 2500000, currency: 'USD' };
const sampleSearch = { result: [{ symbol: 'AAPL', description: 'Apple Inc' }, { symbol: 'AMZN', description: 'Amazon.com Inc' }] };
const sampleNews = [{ headline: 'Market rallies on earnings', source: 'Reuters', url: 'https://example.com', datetime: 1700000000 }];

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('finnhub-api: action validation', () => {
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
describe('finnhub-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_quote without client', async () => {
    const result = await execute({ action: 'get_quote', symbol: 'AAPL' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail get_profile without client', async () => {
    const result = await execute({ action: 'get_profile', symbol: 'AAPL' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_symbol without client', async () => {
    const result = await execute({ action: 'search_symbol', query: 'apple' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_news without client', async () => {
    const result = await execute({ action: 'get_news' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_quote
// ---------------------------------------------------------------------------
describe('finnhub-api: get_quote', () => {
  beforeEach(() => {});

  it('should get quote successfully', async () => {
    const ctx = mockContext(sampleQuote);
    const result = await execute({ action: 'get_quote', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_quote');
    assert.equal(result.metadata.symbol, 'AAPL');
    assert.equal(result.metadata.currentPrice, 150.25);
    assert.ok(result.result.includes('150.25'));
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing symbol', async () => {
    const ctx = mockContext(sampleQuote);
    const result = await execute({ action: 'get_quote' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string symbol', async () => {
    const ctx = mockContext(sampleQuote);
    const result = await execute({ action: 'get_quote', symbol: 123 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should uppercase the symbol', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: { request: async (method, path) => { calledPath = path; return sampleQuote; } },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_quote', symbol: 'aapl' }, ctx);
    assert.ok(calledPath.includes('AAPL'));
  });
});

// ---------------------------------------------------------------------------
// 4. get_profile
// ---------------------------------------------------------------------------
describe('finnhub-api: get_profile', () => {
  beforeEach(() => {});

  it('should get profile successfully', async () => {
    const ctx = mockContext(sampleProfile);
    const result = await execute({ action: 'get_profile', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_profile');
    assert.ok(result.result.includes('Apple Inc'));
    assert.ok(result.result.includes('NASDAQ'));
  });

  it('should reject missing symbol', async () => {
    const ctx = mockContext(sampleProfile);
    const result = await execute({ action: 'get_profile' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 5. search_symbol
// ---------------------------------------------------------------------------
describe('finnhub-api: search_symbol', () => {
  beforeEach(() => {});

  it('should search symbols successfully', async () => {
    const ctx = mockContext(sampleSearch);
    const result = await execute({ action: 'search_symbol', query: 'apple' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_symbol');
    assert.equal(result.metadata.resultCount, 2);
    assert.ok(result.result.includes('AAPL'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearch);
    const result = await execute({ action: 'search_symbol' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should handle empty results', async () => {
    const ctx = mockContext({ result: [] });
    const result = await execute({ action: 'search_symbol', query: 'zzzzz' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. get_news
// ---------------------------------------------------------------------------
describe('finnhub-api: get_news', () => {
  beforeEach(() => {});

  it('should get news successfully', async () => {
    const ctx = mockContext(sampleNews);
    const result = await execute({ action: 'get_news' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_news');
    assert.equal(result.metadata.category, 'general');
    assert.ok(result.result.includes('Market rallies'));
  });

  it('should accept custom category', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: { request: async (method, path) => { calledPath = path; return sampleNews; } },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_news', category: 'forex' }, ctx);
    assert.ok(calledPath.includes('category=forex'));
  });

  it('should handle empty news', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'get_news' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.articleCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout handling
// ---------------------------------------------------------------------------
describe('finnhub-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on get_quote abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_quote', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_profile abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_profile', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search_symbol abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_symbol', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_news abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_news' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 8. Network error handling
// ---------------------------------------------------------------------------
describe('finnhub-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on get_quote failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_quote', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search_symbol failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'search_symbol', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_quote', symbol: 'AAPL' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 9. getClient
// ---------------------------------------------------------------------------
describe('finnhub-api: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient over gatewayClient', () => {
    const result = getClient({ providerClient: { request: () => {} }, gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => { assert.equal(getClient({}), null); });
  it('should return null for undefined context', () => { assert.equal(getClient(undefined), null); });
  it('should return null for null context', () => { assert.equal(getClient(null), null); });
});

// ---------------------------------------------------------------------------
// 10. redactSensitive
// ---------------------------------------------------------------------------
describe('finnhub-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const output = redactSensitive('api_key: sample_api_key_for_testing data');
    assert.ok(!output.includes('sample_api_key_for_testing'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const output = redactSensitive('bearer: test_placeholder_token');
    assert.ok(!output.includes('test_placeholder_token'));
  });

  it('should redact authorization patterns', () => {
    const output = redactSensitive('authorization: sample_auth_value_placeholder');
    assert.ok(!output.includes('sample_auth_value_placeholder'));
  });

  it('should not alter clean strings', () => {
    assert.equal(redactSensitive('Normal output'), 'Normal output');
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
  });
});

// ---------------------------------------------------------------------------
// 11. resolveTimeout
// ---------------------------------------------------------------------------
describe('finnhub-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => { assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS); });
  it('should return default timeout for undefined context', () => { assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS); });
  it('should use custom configured timeout', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000); });
  it('should cap at MAX_TIMEOUT_MS', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS); });
  it('should ignore non-positive timeout', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS); });
  it('should ignore non-number timeout', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS); });
  it('should verify DEFAULT_TIMEOUT_MS is 30000', () => { assert.equal(DEFAULT_TIMEOUT_MS, 30000); });
  it('should verify MAX_TIMEOUT_MS is 120000', () => { assert.equal(MAX_TIMEOUT_MS, 120000); });
});

// ---------------------------------------------------------------------------
// 12. validate()
// ---------------------------------------------------------------------------
describe('finnhub-api: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('should reject missing action', () => { assert.equal(validate({}).valid, false); });
  it('should reject null params', () => { assert.equal(validate(null).valid, false); });

  it('should validate get_quote requires symbol', () => {
    assert.equal(validate({ action: 'get_quote' }).valid, false);
    assert.equal(validate({ action: 'get_quote', symbol: 'AAPL' }).valid, true);
  });

  it('should validate get_profile requires symbol', () => {
    assert.equal(validate({ action: 'get_profile' }).valid, false);
    assert.equal(validate({ action: 'get_profile', symbol: 'AAPL' }).valid, true);
  });

  it('should validate search_symbol requires query', () => {
    assert.equal(validate({ action: 'search_symbol' }).valid, false);
    assert.equal(validate({ action: 'search_symbol', query: 'apple' }).valid, true);
  });

  it('should validate get_news needs no required params', () => {
    assert.equal(validate({ action: 'get_news' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 13. meta export
// ---------------------------------------------------------------------------
describe('finnhub-api: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => { assert.equal(meta.name, 'finnhub-api'); });
  it('should have version', () => { assert.equal(meta.version, '1.0.0'); });
  it('should have description', () => { assert.ok(meta.description.includes('stock')); });
  it('should list all 4 actions', () => {
    assert.equal(meta.actions.length, 4);
    assert.ok(meta.actions.includes('get_quote'));
    assert.ok(meta.actions.includes('get_profile'));
    assert.ok(meta.actions.includes('search_symbol'));
    assert.ok(meta.actions.includes('get_news'));
  });
});

// ---------------------------------------------------------------------------
// 14. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('finnhub-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: { request: async (method, path) => { calledPath = path; return sampleQuote; } },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_quote', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('/quote'));
  });
});

// ---------------------------------------------------------------------------
// 15. providerNotConfiguredError
// ---------------------------------------------------------------------------
describe('finnhub-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
  });

  it('should include Error in result', () => {
    assert.ok(providerNotConfiguredError().result.includes('Error'));
  });
});

// ---------------------------------------------------------------------------
// 16. constants
// ---------------------------------------------------------------------------
describe('finnhub-api: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, ['get_quote', 'get_profile', 'search_symbol', 'get_news']);
  });
});

// ---------------------------------------------------------------------------
// 17. request path verification
// ---------------------------------------------------------------------------
describe('finnhub-api: request path verification', () => {
  beforeEach(() => {});

  it('should call GET /quote?symbol=AAPL for get_quote', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleQuote; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_quote', symbol: 'AAPL' }, ctx);
    assert.equal(calledPath, '/quote?symbol=AAPL');
  });

  it('should call GET /stock/profile2?symbol=AAPL for get_profile', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleProfile; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_profile', symbol: 'AAPL' }, ctx);
    assert.equal(calledPath, '/stock/profile2?symbol=AAPL');
  });

  it('should call GET /search?q=apple for search_symbol', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleSearch; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'search_symbol', query: 'apple' }, ctx);
    assert.equal(calledPath, '/search?q=apple');
  });

  it('should call GET /news?category=general for get_news default', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleNews; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_news' }, ctx);
    assert.equal(calledPath, '/news?category=general');
  });
});
