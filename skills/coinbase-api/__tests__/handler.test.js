import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execute, validate, meta, redactSensitive, sanitizeCurrencyPair, sanitizeCurrency } from '../handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockContext(responseData) {
  return {
    providerClient: {
      request: async () => responseData,
    },
    config: {},
  };
}

function errorContext(msg) {
  return {
    providerClient: {
      request: async () => { throw new Error(msg); },
    },
    config: {},
  };
}

function abortContext() {
  return {
    providerClient: {
      request: async () => { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; },
    },
    config: {},
  };
}

// ===========================================================================
// meta
// ===========================================================================

describe('coinbase-api: meta', () => {
  it('should export correct name', () => assert.equal(meta.name, 'coinbase-api'));
  it('should export 5 actions', () => assert.equal(meta.actions.length, 5));
  it('should include get_spot_price', () => assert.ok(meta.actions.includes('get_spot_price')));
  it('should include list_currencies', () => assert.ok(meta.actions.includes('list_currencies')));
});

// ===========================================================================
// validate
// ===========================================================================

describe('coinbase-api: validate', () => {
  it('should validate known actions', () => {
    for (const a of meta.actions) assert.equal(validate({ action: a }).valid, true);
  });
  it('should reject unknown action', () => assert.equal(validate({ action: 'x' }).valid, false));
  it('should reject null', () => assert.equal(validate(null).valid, false));
});

// ===========================================================================
// sanitizeCurrencyPair
// ===========================================================================

describe('coinbase-api: sanitizeCurrencyPair', () => {
  it('should normalize BTC-USD', () => assert.equal(sanitizeCurrencyPair('btc-usd'), 'BTC-USD'));
  it('should normalize BTC/USD to BTC-USD', () => assert.equal(sanitizeCurrencyPair('BTC/USD'), 'BTC-USD'));
  it('should return undefined for empty', () => assert.equal(sanitizeCurrencyPair(''), undefined));
  it('should return undefined for null', () => assert.equal(sanitizeCurrencyPair(null), undefined));
  it('should return undefined for invalid format', () => assert.equal(sanitizeCurrencyPair('X'), undefined));
});

// ===========================================================================
// sanitizeCurrency
// ===========================================================================

describe('coinbase-api: sanitizeCurrency', () => {
  it('should normalize usd to USD', () => assert.equal(sanitizeCurrency('usd'), 'USD'));
  it('should return undefined for empty', () => assert.equal(sanitizeCurrency(''), undefined));
  it('should return undefined for single char', () => assert.equal(sanitizeCurrency('X'), undefined));
  it('should return undefined for null', () => assert.equal(sanitizeCurrency(null), undefined));
});

// ===========================================================================
// redactSensitive
// ===========================================================================

describe('coinbase-api: redactSensitive', () => {
  it('should redact api_key', () => assert.ok(redactSensitive('api_key: xyz').includes('[REDACTED]')));
  it('should pass clean text', () => assert.equal(redactSensitive('hello'), 'hello'));
  it('should handle non-string', () => assert.equal(redactSensitive(42), 42));
});

// ===========================================================================
// Action validation
// ===========================================================================

describe('coinbase-api: action validation', () => {
  it('should error on missing action', async () => {
    const r = await execute({}, {});
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });
  it('should error on unknown action', async () => {
    const r = await execute({ action: 'bad' }, {});
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });
  it('should error on null params', async () => {
    const r = await execute(null, {});
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });
});

// ===========================================================================
// get_spot_price
// ===========================================================================

describe('coinbase-api: get_spot_price', () => {
  it('should return spot price', async () => {
    const ctx = mockContext({ data: { amount: '50000.00', currency: 'USD' } });
    const r = await execute({ action: 'get_spot_price', currencyPair: 'BTC-USD' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_spot_price');
    assert.equal(r.metadata.currencyPair, 'BTC-USD');
    assert.equal(r.metadata.amount, 50000);
    assert.ok(r.result.includes('50000'));
  });

  it('should normalize currency pair', async () => {
    const ctx = mockContext({ data: { amount: '100', currency: 'USD' } });
    const r = await execute({ action: 'get_spot_price', currencyPair: 'eth/usd' }, ctx);
    assert.equal(r.metadata.currencyPair, 'ETH-USD');
  });

  it('should error for missing pair', async () => {
    const r = await execute({ action: 'get_spot_price' }, mockContext({}));
    assert.equal(r.metadata.error, 'MISSING_CURRENCY_PAIR');
  });

  it('should error without provider', async () => {
    const r = await execute({ action: 'get_spot_price', currencyPair: 'BTC-USD' }, {});
    assert.equal(r.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should handle API error', async () => {
    const r = await execute({ action: 'get_spot_price', currencyPair: 'BTC-USD' }, errorContext('fail'));
    assert.equal(r.metadata.error, 'REQUEST_ERROR');
  });

  it('should handle timeout', async () => {
    const r = await execute({ action: 'get_spot_price', currencyPair: 'BTC-USD' }, abortContext());
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should handle flat response format', async () => {
    const ctx = mockContext({ amount: '30000', currency: 'USD' });
    const r = await execute({ action: 'get_spot_price', currencyPair: 'BTC-USD' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.amount, 30000);
  });
});

// ===========================================================================
// get_exchange_rates
// ===========================================================================

describe('coinbase-api: get_exchange_rates', () => {
  it('should return exchange rates', async () => {
    const ctx = mockContext({ data: { rates: { BTC: '0.00002', ETH: '0.0003' } } });
    const r = await execute({ action: 'get_exchange_rates', currency: 'USD' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.baseCurrency, 'USD');
    assert.equal(r.metadata.rateCount, 2);
    assert.ok(r.result.includes('BTC'));
  });

  it('should default currency to USD', async () => {
    const ctx = mockContext({ data: { rates: {} } });
    const r = await execute({ action: 'get_exchange_rates' }, ctx);
    assert.equal(r.metadata.baseCurrency, 'USD');
  });

  it('should error without provider', async () => {
    const r = await execute({ action: 'get_exchange_rates' }, {});
    assert.equal(r.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should handle flat rates format', async () => {
    const ctx = mockContext({ rates: { BTC: '0.00002' } });
    const r = await execute({ action: 'get_exchange_rates' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.rateCount, 1);
  });
});

// ===========================================================================
// list_currencies
// ===========================================================================

describe('coinbase-api: list_currencies', () => {
  it('should list currencies', async () => {
    const ctx = mockContext({
      data: [
        { id: 'USD', name: 'US Dollar' },
        { id: 'EUR', name: 'Euro' },
      ],
    });
    const r = await execute({ action: 'list_currencies' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 2);
    assert.ok(r.result.includes('USD'));
  });

  it('should handle alternative format', async () => {
    const ctx = mockContext({ currencies: [{ code: 'BTC', name: 'Bitcoin' }] });
    const r = await execute({ action: 'list_currencies' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 1);
  });

  it('should error without provider', async () => {
    const r = await execute({ action: 'list_currencies' }, {});
    assert.equal(r.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should handle empty list', async () => {
    const ctx = mockContext({ data: [] });
    const r = await execute({ action: 'list_currencies' }, ctx);
    assert.equal(r.metadata.count, 0);
  });
});

// ===========================================================================
// get_buy_price
// ===========================================================================

describe('coinbase-api: get_buy_price', () => {
  it('should return buy price', async () => {
    const ctx = mockContext({ data: { amount: '51000.00', currency: 'USD' } });
    const r = await execute({ action: 'get_buy_price', currencyPair: 'BTC-USD' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_buy_price');
    assert.equal(r.metadata.amount, 51000);
  });

  it('should error for missing pair', async () => {
    const r = await execute({ action: 'get_buy_price' }, mockContext({}));
    assert.equal(r.metadata.error, 'MISSING_CURRENCY_PAIR');
  });
});

// ===========================================================================
// get_sell_price
// ===========================================================================

describe('coinbase-api: get_sell_price', () => {
  it('should return sell price', async () => {
    const ctx = mockContext({ data: { amount: '49000.00', currency: 'USD' } });
    const r = await execute({ action: 'get_sell_price', currencyPair: 'BTC-USD' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_sell_price');
    assert.equal(r.metadata.amount, 49000);
  });

  it('should error for missing pair', async () => {
    const r = await execute({ action: 'get_sell_price' }, mockContext({}));
    assert.equal(r.metadata.error, 'MISSING_CURRENCY_PAIR');
  });
});

// ===========================================================================
// Gateway fallback
// ===========================================================================

describe('coinbase-api: gateway fallback', () => {
  it('should use gatewayClient when providerClient is absent', async () => {
    const ctx = { gatewayClient: { request: async () => ({ data: { amount: '42000', currency: 'USD' } }) } };
    const r = await execute({ action: 'get_spot_price', currencyPair: 'BTC-USD' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.amount, 42000);
  });
});
