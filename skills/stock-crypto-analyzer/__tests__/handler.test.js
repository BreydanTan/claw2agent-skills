import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  computeSMA,
  computeRSI,
  computeMACD,
  computeBollingerBands,
  computeSupportResistance,
  generateRecommendation,
  getClient,
  checkCostLimit,
  redactSensitive,
  watchlist,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a gatewayClient that returns the given data
 * from its .fetch() method.
 */
function mockContext(fetchResponse, config) {
  return {
    gatewayClient: {
      fetch: async (_endpoint, _opts) => fetchResponse,
    },
    config: config || { timeoutMs: 5000, maxCostUsd: 1.00 },
  };
}

/**
 * Build a mock context where .fetch() rejects with the given error.
 */
function mockContextError(error) {
  return {
    gatewayClient: {
      fetch: async () => { throw error; },
    },
    config: { timeoutMs: 1000, maxCostUsd: 1.00 },
  };
}

/**
 * Build a mock context where .fetch() times out (AbortError).
 */
function mockContextTimeout() {
  return {
    gatewayClient: {
      fetch: async (_endpoint, opts) => {
        // Simulate a call that respects the abort signal
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100, maxCostUsd: 1.00 },
  };
}

/** Generate a sample price array for technical analysis tests. */
function generatePrices(length, base = 100, volatility = 2) {
  const prices = [base];
  for (let i = 1; i < length; i++) {
    const change = (Math.sin(i * 0.3) + Math.cos(i * 0.17)) * volatility;
    prices.push(prices[i - 1] + change);
  }
  return prices;
}

const samplePrices = generatePrices(250);

const sampleQuote = {
  quote: {
    price: 150.25,
    change: 2.50,
    changePercent: 1.69,
    volume: 45000000,
    high: 151.00,
    low: 148.00,
    open: 148.50,
    previousClose: 147.75,
    marketCap: '2.4T',
    timestamp: '2025-01-15T16:00:00Z',
  },
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: action validation', () => {
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
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all external actions
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: PROVIDER_NOT_CONFIGURED', () => {
  it('should fail quote without client', async () => {
    const result = await execute({ action: 'quote', symbol: 'AAPL' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail analyze without client', async () => {
    const result = await execute({ action: 'analyze', symbol: 'AAPL' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail compare without client', async () => {
    const result = await execute({ action: 'compare', symbols: ['AAPL', 'GOOG'] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail alert without client when watchlist has alerts', async () => {
    watchlist.clear();
    watchlist.set('AAPL', {
      symbol: 'AAPL',
      type: 'stock',
      targetPrice: 200,
      alertType: 'above',
      addedAt: new Date().toISOString(),
    });
    const result = await execute({ action: 'alert' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    watchlist.clear();
  });
});

// ---------------------------------------------------------------------------
// 3. Quote action
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: quote', () => {
  it('should return quote data for a stock symbol', async () => {
    const ctx = mockContext(sampleQuote);
    const result = await execute({ action: 'quote', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'quote');
    assert.equal(result.metadata.layer, 'L2');
    assert.equal(result.metadata.symbol, 'AAPL');
    assert.equal(result.metadata.price, 150.25);
    assert.equal(result.metadata.change, 2.50);
    assert.equal(result.metadata.volume, 45000000);
    assert.ok(result.result.includes('AAPL'));
    assert.ok(result.result.includes('150.25'));
  });

  it('should normalize symbol to uppercase', async () => {
    const ctx = mockContext(sampleQuote);
    const result = await execute({ action: 'quote', symbol: 'aapl' }, ctx);
    assert.equal(result.metadata.symbol, 'AAPL');
  });

  it('should accept crypto type', async () => {
    const ctx = mockContext(sampleQuote);
    const result = await execute({ action: 'quote', symbol: 'BTC', type: 'crypto' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.type, 'crypto');
  });

  it('should reject missing symbol', async () => {
    const ctx = mockContext(sampleQuote);
    const result = await execute({ action: 'quote' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_SYMBOL');
  });

  it('should reject invalid type', async () => {
    const ctx = mockContext(sampleQuote);
    const result = await execute({ action: 'quote', symbol: 'AAPL', type: 'bond' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TYPE');
  });
});

// ---------------------------------------------------------------------------
// 4. Analyze action
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: analyze', () => {
  it('should return technical analysis with all indicators', async () => {
    const ctx = mockContext({ prices: samplePrices });
    const result = await execute({ action: 'analyze', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'analyze');
    assert.equal(result.metadata.layer, 'L2');
    assert.equal(result.metadata.symbol, 'AAPL');
    assert.ok(result.metadata.indicators.sma20 !== null);
    assert.ok(result.metadata.indicators.sma50 !== null);
    assert.ok(result.metadata.indicators.rsi !== null);
    assert.ok(result.metadata.indicators.macd !== null);
    assert.ok(result.metadata.indicators.bollingerBands !== null);
    assert.ok(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell'].includes(result.metadata.recommendation));
    assert.ok(result.result.includes('Technical Analysis'));
    assert.ok(result.result.includes('SMA'));
    assert.ok(result.result.includes('RSI'));
    assert.ok(result.result.includes('MACD'));
    assert.ok(result.result.includes('Bollinger'));
  });

  it('should reject missing symbol', async () => {
    const ctx = mockContext({ prices: samplePrices });
    const result = await execute({ action: 'analyze' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_SYMBOL');
  });

  it('should reject invalid period', async () => {
    const ctx = mockContext({ prices: samplePrices });
    const result = await execute({ action: 'analyze', symbol: 'AAPL', period: '2y' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_PERIOD');
  });

  it('should handle no historical data', async () => {
    const ctx = mockContext({ prices: [] });
    const result = await execute({ action: 'analyze', symbol: 'XYZ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'NO_DATA');
  });

  it('should handle closingPrices field in response', async () => {
    const ctx = mockContext({ closingPrices: samplePrices });
    const result = await execute({ action: 'analyze', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.metadata.dataPoints > 0);
  });
});

// ---------------------------------------------------------------------------
// 5. Compare action
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: compare', () => {
  it('should compare multiple symbols', async () => {
    let callCount = 0;
    const ctx = {
      gatewayClient: {
        fetch: async (_ep, opts) => {
          callCount++;
          // Return different price series for each symbol
          const base = callCount === 1 ? 100 : 200;
          return { prices: generatePrices(60, base) };
        },
      },
      config: { timeoutMs: 5000, maxCostUsd: 1.00 },
    };

    const result = await execute(
      { action: 'compare', symbols: ['AAPL', 'GOOG'], type: 'stock', period: '1m' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'compare');
    assert.equal(result.metadata.layer, 'L2');
    assert.equal(result.metadata.comparisons.length, 2);
    assert.ok(result.metadata.ranking.length === 2);
    assert.ok(result.result.includes('AAPL'));
    assert.ok(result.result.includes('GOOG'));
  });

  it('should reject fewer than 2 symbols', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'compare', symbols: ['AAPL'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SYMBOLS');
  });

  it('should reject missing symbols array', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'compare' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SYMBOLS');
  });

  it('should handle partial failures in compare', async () => {
    const ctx = {
      gatewayClient: {
        fetch: async (_endpoint, opts) => {
          // Always fail for BAD symbol, succeed for others
          if (opts?.params?.symbol === 'BAD') {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            throw err;
          }
          return { prices: generatePrices(60) };
        },
      },
      config: { timeoutMs: 1000, maxCostUsd: 1.00 },
    };
    const result = await execute(
      { action: 'compare', symbols: ['AAPL', 'BAD'] },
      ctx
    );
    // Should still succeed overall, with error recorded for the failed symbol
    assert.equal(result.metadata.success, true);
    const failed = result.metadata.comparisons.find((c) => c.error);
    assert.ok(failed, 'Should have at least one failed comparison entry');
  });
});

// ---------------------------------------------------------------------------
// 6. Watchlist CRUD (local, no client needed)
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: watchlist', () => {
  beforeEach(() => {
    watchlist.clear();
  });

  it('should add a symbol to watchlist', async () => {
    const result = await execute(
      { action: 'watchlist_add', symbol: 'AAPL', type: 'stock' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'watchlist_add');
    assert.equal(result.metadata.symbol, 'AAPL');
    assert.equal(watchlist.size, 1);
  });

  it('should add with target price and alert type', async () => {
    const result = await execute(
      { action: 'watchlist_add', symbol: 'BTC', type: 'crypto', targetPrice: 100000, alertType: 'above' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.entry.targetPrice, 100000);
    assert.equal(result.metadata.entry.alertType, 'above');
    assert.ok(result.result.includes('100000'));
  });

  it('should add with below alert type', async () => {
    const result = await execute(
      { action: 'watchlist_add', symbol: 'ETH', type: 'crypto', targetPrice: 2000, alertType: 'below' },
      {}
    );
    assert.equal(result.metadata.entry.alertType, 'below');
  });

  it('should normalize symbol to uppercase on add', async () => {
    await execute({ action: 'watchlist_add', symbol: 'aapl' }, {});
    assert.ok(watchlist.has('AAPL'));
  });

  it('should reject add with missing symbol', async () => {
    const result = await execute({ action: 'watchlist_add' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_SYMBOL');
  });

  it('should remove a symbol from watchlist', async () => {
    watchlist.set('AAPL', { symbol: 'AAPL', type: 'stock', addedAt: new Date().toISOString() });
    const result = await execute({ action: 'watchlist_remove', symbol: 'AAPL' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'watchlist_remove');
    assert.equal(watchlist.size, 0);
  });

  it('should return NOT_FOUND when removing absent symbol', async () => {
    const result = await execute({ action: 'watchlist_remove', symbol: 'XYZ' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'NOT_FOUND');
  });

  it('should reject remove with missing symbol', async () => {
    const result = await execute({ action: 'watchlist_remove' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_SYMBOL');
  });

  it('should list empty watchlist', async () => {
    const result = await execute({ action: 'watchlist_list' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.deepEqual(result.metadata.entries, []);
    assert.ok(result.result.includes('empty'));
  });

  it('should list populated watchlist', async () => {
    watchlist.set('AAPL', { symbol: 'AAPL', type: 'stock', addedAt: new Date().toISOString() });
    watchlist.set('BTC', { symbol: 'BTC', type: 'crypto', targetPrice: 50000, alertType: 'above', addedAt: new Date().toISOString() });
    const result = await execute({ action: 'watchlist_list' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('AAPL'));
    assert.ok(result.result.includes('BTC'));
  });
});

// ---------------------------------------------------------------------------
// 7. Alert action
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: alert', () => {
  beforeEach(() => {
    watchlist.clear();
  });

  it('should return no alerts when watchlist is empty', async () => {
    const result = await execute({ action: 'alert' }, mockContext({}));
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.triggered.length, 0);
    assert.equal(result.metadata.checked, 0);
  });

  it('should return no alerts when no entries have target prices', async () => {
    watchlist.set('AAPL', { symbol: 'AAPL', type: 'stock', addedAt: new Date().toISOString() });
    const result = await execute({ action: 'alert' }, mockContext({}));
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.checked, 0);
  });

  it('should trigger alert when price exceeds above target', async () => {
    watchlist.set('AAPL', {
      symbol: 'AAPL',
      type: 'stock',
      targetPrice: 140,
      alertType: 'above',
      addedAt: new Date().toISOString(),
    });
    const ctx = mockContext({ quote: { price: 150 } });
    const result = await execute({ action: 'alert' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.triggered.length, 1);
    assert.equal(result.metadata.triggered[0].symbol, 'AAPL');
    assert.equal(result.metadata.triggered[0].currentPrice, 150);
  });

  it('should trigger alert when price drops below target', async () => {
    watchlist.set('ETH', {
      symbol: 'ETH',
      type: 'crypto',
      targetPrice: 3000,
      alertType: 'below',
      addedAt: new Date().toISOString(),
    });
    const ctx = mockContext({ quote: { price: 2500 } });
    const result = await execute({ action: 'alert' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.triggered.length, 1);
    assert.equal(result.metadata.triggered[0].alertType, 'below');
  });

  it('should not trigger alert when price does not meet threshold', async () => {
    watchlist.set('AAPL', {
      symbol: 'AAPL',
      type: 'stock',
      targetPrice: 200,
      alertType: 'above',
      addedAt: new Date().toISOString(),
    });
    const ctx = mockContext({ quote: { price: 150 } });
    const result = await execute({ action: 'alert' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.triggered.length, 0);
    assert.equal(result.metadata.checked, 1);
  });
});

// ---------------------------------------------------------------------------
// 8. Timeout handling
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: timeout', () => {
  it('should return TIMEOUT error on abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'quote', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on analyze abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'analyze', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 9. Cost limit checking
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: cost limits', () => {
  it('should reject quote when cost exceeds limit', async () => {
    const ctx = mockContext(sampleQuote, { timeoutMs: 5000, maxCostUsd: 0.001 });
    const result = await execute({ action: 'quote', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'COST_LIMIT_EXCEEDED');
  });

  it('should reject analyze when cost exceeds limit', async () => {
    const ctx = mockContext({ prices: samplePrices }, { timeoutMs: 5000, maxCostUsd: 0.001 });
    const result = await execute({ action: 'analyze', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'COST_LIMIT_EXCEEDED');
  });

  it('should reject compare when total cost exceeds limit', async () => {
    const ctx = mockContext({ prices: samplePrices }, { timeoutMs: 5000, maxCostUsd: 0.01 });
    const result = await execute(
      { action: 'compare', symbols: ['AAPL', 'GOOG', 'MSFT'] },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'COST_LIMIT_EXCEEDED');
  });

  it('should allow request when cost is within limit', async () => {
    const check = checkCostLimit({ config: { maxCostUsd: 1.00 } }, 0.05);
    assert.equal(check.ok, true);
  });

  it('should allow request when maxCostUsd is not configured', async () => {
    const check = checkCostLimit({}, 100);
    assert.equal(check.ok, true);
  });
});

// ---------------------------------------------------------------------------
// 10. Technical analysis: SMA
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: computeSMA', () => {
  it('should compute correct SMA for simple data', () => {
    const data = [10, 20, 30, 40, 50];
    assert.equal(computeSMA(data, 3), 40);  // (30+40+50)/3
    assert.equal(computeSMA(data, 5), 30);  // (10+20+30+40+50)/5
  });

  it('should return null for insufficient data', () => {
    assert.equal(computeSMA([1, 2], 5), null);
  });

  it('should return null for empty array', () => {
    assert.equal(computeSMA([], 1), null);
  });

  it('should return null for non-array input', () => {
    assert.equal(computeSMA(null, 5), null);
  });

  it('should handle period of 1', () => {
    const data = [10, 20, 30];
    assert.equal(computeSMA(data, 1), 30);
  });
});

// ---------------------------------------------------------------------------
// 11. Technical analysis: RSI
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: computeRSI', () => {
  it('should return RSI between 0 and 100', () => {
    const rsi = computeRSI(samplePrices);
    assert.ok(rsi !== null);
    assert.ok(rsi >= 0 && rsi <= 100, `RSI should be 0-100, got ${rsi}`);
  });

  it('should return 100 for only upward movement', () => {
    const upOnly = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = computeRSI(upOnly);
    assert.equal(rsi, 100);
  });

  it('should return near 0 for only downward movement', () => {
    const downOnly = Array.from({ length: 20 }, (_, i) => 200 - i);
    const rsi = computeRSI(downOnly);
    assert.ok(rsi !== null);
    assert.ok(rsi < 5, `RSI should be near 0 for only downward movement, got ${rsi}`);
  });

  it('should return null for insufficient data', () => {
    assert.equal(computeRSI([1, 2, 3]), null);
  });

  it('should return null for non-array input', () => {
    assert.equal(computeRSI(null), null);
  });
});

// ---------------------------------------------------------------------------
// 12. Technical analysis: MACD
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: computeMACD', () => {
  it('should return MACD with macdLine, signalLine, and histogram', () => {
    const macd = computeMACD(samplePrices);
    assert.ok(macd !== null);
    assert.ok(typeof macd.macdLine === 'number');
    assert.ok(typeof macd.signalLine === 'number');
    assert.ok(typeof macd.histogram === 'number');
    // histogram = macdLine - signalLine
    assert.ok(Math.abs(macd.histogram - (macd.macdLine - macd.signalLine)) < 0.0001);
  });

  it('should return null for insufficient data', () => {
    assert.equal(computeMACD([1, 2, 3]), null);
  });

  it('should return null for non-array input', () => {
    assert.equal(computeMACD(null), null);
  });
});

// ---------------------------------------------------------------------------
// 13. Technical analysis: Bollinger Bands
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: computeBollingerBands', () => {
  it('should return upper, middle, lower bands', () => {
    const bb = computeBollingerBands(samplePrices);
    assert.ok(bb !== null);
    assert.ok(typeof bb.upper === 'number');
    assert.ok(typeof bb.middle === 'number');
    assert.ok(typeof bb.lower === 'number');
    assert.ok(bb.upper > bb.middle, 'Upper should be above middle');
    assert.ok(bb.middle > bb.lower, 'Middle should be above lower');
  });

  it('should have symmetric bands around middle', () => {
    const bb = computeBollingerBands(samplePrices);
    const upperDiff = bb.upper - bb.middle;
    const lowerDiff = bb.middle - bb.lower;
    assert.ok(Math.abs(upperDiff - lowerDiff) < 0.0001, 'Bands should be symmetric');
  });

  it('should return null for insufficient data', () => {
    assert.equal(computeBollingerBands([1, 2, 3], 20), null);
  });

  it('should return null for non-array', () => {
    assert.equal(computeBollingerBands(null), null);
  });
});

// ---------------------------------------------------------------------------
// 14. Technical analysis: Support / Resistance
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: computeSupportResistance', () => {
  it('should return min and max of recent data', () => {
    const data = [10, 20, 5, 30, 15];
    const sr = computeSupportResistance(data);
    assert.equal(sr.support, 5);
    assert.equal(sr.resistance, 30);
  });

  it('should handle empty array', () => {
    const sr = computeSupportResistance([]);
    assert.equal(sr.support, 0);
    assert.equal(sr.resistance, 0);
  });
});

// ---------------------------------------------------------------------------
// 15. Recommendation engine
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: generateRecommendation', () => {
  it('should return hold for neutral indicators', () => {
    const rec = generateRecommendation({ rsi: 50, macd: null, sma20: null, sma50: null, sma200: null, price: null, bollingerBands: null });
    assert.equal(rec, 'hold');
  });

  it('should return buy for oversold RSI with bullish MACD', () => {
    const rec = generateRecommendation({
      rsi: 25,
      macd: { macdLine: 1, signalLine: 0.5, histogram: 0.5 },
      sma20: 95, sma50: 90, sma200: 85,
      price: 100,
      bollingerBands: { upper: 110, middle: 100, lower: 90 },
    });
    assert.ok(rec === 'buy' || rec === 'strong_buy', `Expected buy or strong_buy, got ${rec}`);
  });

  it('should return sell for overbought RSI with bearish MACD', () => {
    const rec = generateRecommendation({
      rsi: 80,
      macd: { macdLine: -1, signalLine: -0.5, histogram: -0.5 },
      sma20: 105, sma50: 110, sma200: 115,
      price: 100,
      bollingerBands: { upper: 105, middle: 100, lower: 95 },
    });
    assert.ok(rec === 'sell' || rec === 'strong_sell', `Expected sell or strong_sell, got ${rec}`);
  });

  it('should handle all null indicators', () => {
    const rec = generateRecommendation({});
    assert.equal(rec, 'hold');
  });
});

// ---------------------------------------------------------------------------
// 16. getClient helper
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: getClient', () => {
  it('should prefer gatewayClient', () => {
    const result = getClient({ gatewayClient: { fetch: () => {} }, providerClient: { fetch: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should fall back to providerClient', () => {
    const result = getClient({ providerClient: { fetch: () => {} } });
    assert.equal(result.type, 'provider');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// 17. Redact sensitive data
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: redactSensitive', () => {
  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact token patterns', () => {
    const input = 'token=mySecretToken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('mySecretToken123'));
  });

  it('should not alter clean strings', () => {
    const input = 'AAPL is up 5% today';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
  });
});

// ---------------------------------------------------------------------------
// 18. Network error handling
// ---------------------------------------------------------------------------
describe('stock-crypto-analyzer: network errors', () => {
  it('should return NETWORK_ERROR on fetch failure for quote', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'quote', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'NETWORK_ERROR');
  });

  it('should return error on fetch failure for analyze', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'analyze', symbol: 'AAPL' }, ctx);
    assert.equal(result.metadata.success, false);
  });
});
