import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execute, validate, meta, redactSensitive, sanitizeSymbol } from '../handler.js';

// ---------------------------------------------------------------------------
// Helper: mock context with provider client
// ---------------------------------------------------------------------------

function mockContext(responseData) {
  return {
    providerClient: {
      request: async (_method, _path, _body, _opts) => responseData,
    },
    config: {},
  };
}

function errorContext(errorMessage) {
  return {
    providerClient: {
      request: async () => { throw new Error(errorMessage); },
    },
    config: {},
  };
}

function abortContext() {
  return {
    providerClient: {
      request: async () => { const err = new Error('Aborted'); err.name = 'AbortError'; throw err; },
    },
    config: {},
  };
}

// ===========================================================================
// meta export
// ===========================================================================

describe('binance-api: meta', () => {
  it('should export meta with correct name', () => {
    assert.equal(meta.name, 'binance-api');
  });

  it('should export meta with version', () => {
    assert.equal(meta.version, '1.0.0');
  });

  it('should export meta with all 5 actions', () => {
    assert.equal(meta.actions.length, 5);
    assert.ok(meta.actions.includes('get_price'));
    assert.ok(meta.actions.includes('get_order_book'));
    assert.ok(meta.actions.includes('get_ticker'));
    assert.ok(meta.actions.includes('list_symbols'));
    assert.ok(meta.actions.includes('get_klines'));
  });
});

// ===========================================================================
// validate export
// ===========================================================================

describe('binance-api: validate', () => {
  it('should return valid for get_price', () => {
    assert.equal(validate({ action: 'get_price' }).valid, true);
  });

  it('should return valid for get_order_book', () => {
    assert.equal(validate({ action: 'get_order_book' }).valid, true);
  });

  it('should return valid for get_ticker', () => {
    assert.equal(validate({ action: 'get_ticker' }).valid, true);
  });

  it('should return valid for list_symbols', () => {
    assert.equal(validate({ action: 'list_symbols' }).valid, true);
  });

  it('should return valid for get_klines', () => {
    assert.equal(validate({ action: 'get_klines' }).valid, true);
  });

  it('should return invalid for unknown action', () => {
    const res = validate({ action: 'unknown' });
    assert.equal(res.valid, false);
    assert.ok(res.error.includes('Invalid action'));
  });

  it('should return invalid for missing action', () => {
    assert.equal(validate({}).valid, false);
  });

  it('should return invalid for null params', () => {
    assert.equal(validate(null).valid, false);
  });
});

// ===========================================================================
// sanitizeSymbol
// ===========================================================================

describe('binance-api: sanitizeSymbol', () => {
  it('should uppercase and trim', () => {
    assert.equal(sanitizeSymbol('  btcusdt  '), 'BTCUSDT');
  });

  it('should remove special characters', () => {
    assert.equal(sanitizeSymbol('BTC/USDT'), 'BTCUSDT');
  });

  it('should return undefined for null', () => {
    assert.equal(sanitizeSymbol(null), undefined);
  });

  it('should return undefined for empty string', () => {
    assert.equal(sanitizeSymbol(''), undefined);
  });
});

// ===========================================================================
// redactSensitive
// ===========================================================================

describe('binance-api: redactSensitive', () => {
  it('should redact api_key patterns', () => {
    const result = redactSensitive('api_key: abc123xyz');
    assert.ok(result.includes('[REDACTED]'));
    assert.ok(!result.includes('abc123xyz'));
  });

  it('should not alter clean strings', () => {
    assert.equal(redactSensitive('BTCUSDT: 50000'), 'BTCUSDT: 50000');
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
  });
});

// ===========================================================================
// Action validation
// ===========================================================================

describe('binance-api: action validation', () => {
  it('should return error when action is missing', async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for unknown action', async () => {
    const res = await execute({ action: 'unknown' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error when params is null', async () => {
    const res = await execute(null, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });
});

// ===========================================================================
// get_price
// ===========================================================================

describe('binance-api: get_price', () => {
  it('should return price for valid symbol', async () => {
    const ctx = mockContext({ price: '50000.00' });
    const res = await execute({ action: 'get_price', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'get_price');
    assert.equal(res.metadata.symbol, 'BTCUSDT');
    assert.equal(res.metadata.price, 50000);
    assert.ok(res.result.includes('50000'));
  });

  it('should normalize symbol to uppercase', async () => {
    const ctx = mockContext({ price: '100.00' });
    const res = await execute({ action: 'get_price', symbol: 'ethusdt' }, ctx);
    assert.equal(res.metadata.symbol, 'ETHUSDT');
  });

  it('should return error for missing symbol', async () => {
    const res = await execute({ action: 'get_price' }, mockContext({}));
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_SYMBOL');
  });

  it('should return PROVIDER_NOT_CONFIGURED without client', async () => {
    const res = await execute({ action: 'get_price', symbol: 'BTCUSDT' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should handle API errors', async () => {
    const ctx = errorContext('Connection refused');
    const res = await execute({ action: 'get_price', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'REQUEST_ERROR');
  });

  it('should handle timeout errors', async () => {
    const ctx = abortContext();
    const res = await execute({ action: 'get_price', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'TIMEOUT');
  });

  it('should handle null price', async () => {
    const ctx = mockContext({});
    const res = await execute({ action: 'get_price', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.price, null);
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext({ price: '50000.00' });
    const res = await execute({ action: 'get_price', symbol: 'BTCUSDT' }, ctx);
    assert.ok(res.metadata.timestamp);
  });
});

// ===========================================================================
// get_order_book
// ===========================================================================

describe('binance-api: get_order_book', () => {
  it('should return order book data', async () => {
    const ctx = mockContext({
      bids: [['49000', '1.5'], ['48900', '2.0']],
      asks: [['50100', '1.0'], ['50200', '3.0']],
    });
    const res = await execute({ action: 'get_order_book', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'get_order_book');
    assert.equal(res.metadata.bidCount, 2);
    assert.equal(res.metadata.askCount, 2);
    assert.ok(res.result.includes('49000'));
  });

  it('should return error for missing symbol', async () => {
    const res = await execute({ action: 'get_order_book' }, mockContext({}));
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_SYMBOL');
  });

  it('should handle empty order book', async () => {
    const ctx = mockContext({ bids: [], asks: [] });
    const res = await execute({ action: 'get_order_book', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.bidCount, 0);
    assert.equal(res.metadata.askCount, 0);
  });

  it('should return PROVIDER_NOT_CONFIGURED without client', async () => {
    const res = await execute({ action: 'get_order_book', symbol: 'BTCUSDT' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ===========================================================================
// get_ticker
// ===========================================================================

describe('binance-api: get_ticker', () => {
  it('should return 24h ticker data', async () => {
    const ctx = mockContext({
      lastPrice: '50000.00',
      priceChange: '1000.00',
      priceChangePercent: '2.04',
      highPrice: '51000.00',
      lowPrice: '49000.00',
      volume: '10000.5',
      quoteVolume: '500000000.00',
    });
    const res = await execute({ action: 'get_ticker', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'get_ticker');
    assert.equal(res.metadata.lastPrice, 50000);
    assert.equal(res.metadata.priceChangePercent, 2.04);
    assert.ok(res.result.includes('50000'));
  });

  it('should return error for missing symbol', async () => {
    const res = await execute({ action: 'get_ticker' }, mockContext({}));
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_SYMBOL');
  });

  it('should handle missing fields gracefully', async () => {
    const ctx = mockContext({});
    const res = await execute({ action: 'get_ticker', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.lastPrice, null);
  });
});

// ===========================================================================
// list_symbols
// ===========================================================================

describe('binance-api: list_symbols', () => {
  it('should list trading symbols', async () => {
    const ctx = mockContext({
      symbols: [
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
      ],
    });
    const res = await execute({ action: 'list_symbols' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'list_symbols');
    assert.equal(res.metadata.count, 2);
    assert.ok(res.result.includes('BTCUSDT'));
  });

  it('should filter out non-trading symbols', async () => {
    const ctx = mockContext({
      symbols: [
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'OLDCOIN', baseAsset: 'OLD', quoteAsset: 'USDT', status: 'BREAK' },
      ],
    });
    const res = await execute({ action: 'list_symbols' }, ctx);
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.symbols[0].symbol, 'BTCUSDT');
  });

  it('should return PROVIDER_NOT_CONFIGURED without client', async () => {
    const res = await execute({ action: 'list_symbols' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should handle empty symbols list', async () => {
    const ctx = mockContext({ symbols: [] });
    const res = await execute({ action: 'list_symbols' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.count, 0);
  });

  it('should respect limit parameter', async () => {
    const symbols = Array.from({ length: 20 }, (_, i) => ({
      symbol: `SYM${i}USDT`,
      baseAsset: `SYM${i}`,
      quoteAsset: 'USDT',
      status: 'TRADING',
    }));
    const ctx = mockContext({ symbols });
    const res = await execute({ action: 'list_symbols', limit: 5 }, ctx);
    assert.equal(res.metadata.count, 5);
  });
});

// ===========================================================================
// get_klines
// ===========================================================================

describe('binance-api: get_klines', () => {
  it('should return kline data', async () => {
    const ctx = mockContext([
      [1609459200000, '29000', '29500', '28500', '29300', '100'],
      [1609462800000, '29300', '30000', '29100', '29800', '150'],
    ]);
    const res = await execute({ action: 'get_klines', symbol: 'BTCUSDT', interval: '1h' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'get_klines');
    assert.equal(res.metadata.count, 2);
    assert.equal(res.metadata.interval, '1h');
    assert.equal(res.metadata.klines[0].open, 29000);
    assert.equal(res.metadata.klines[0].close, 29300);
  });

  it('should default interval to 1h for invalid value', async () => {
    const ctx = mockContext([]);
    const res = await execute({ action: 'get_klines', symbol: 'BTCUSDT', interval: 'invalid' }, ctx);
    assert.equal(res.metadata.interval, '1h');
  });

  it('should return error for missing symbol', async () => {
    const res = await execute({ action: 'get_klines' }, mockContext({}));
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_SYMBOL');
  });

  it('should return PROVIDER_NOT_CONFIGURED without client', async () => {
    const res = await execute({ action: 'get_klines', symbol: 'BTCUSDT' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should handle object kline data', async () => {
    const ctx = mockContext({
      klines: [
        { open: 29000, high: 29500, low: 28500, close: 29300, volume: 100 },
      ],
    });
    const res = await execute({ action: 'get_klines', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.count, 1);
  });

  it('should handle empty klines', async () => {
    const ctx = mockContext([]);
    const res = await execute({ action: 'get_klines', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.count, 0);
  });
});

// ===========================================================================
// Gateway client fallback
// ===========================================================================

describe('binance-api: gateway fallback', () => {
  it('should use gatewayClient when providerClient is absent', async () => {
    const ctx = {
      gatewayClient: {
        request: async () => ({ price: '42000.00' }),
      },
    };
    const res = await execute({ action: 'get_price', symbol: 'BTCUSDT' }, ctx);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.price, 42000);
  });
});
