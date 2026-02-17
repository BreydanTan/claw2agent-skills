import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  redactSensitive,
  sanitizeString,
  _clearAlerts,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (_method, _path, _body, _opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .request() tracks calls and returns data.
 */
function mockContextWithSpy(requestResponse) {
  const calls = [];
  return {
    context: {
      providerClient: {
        request: async (method, path, body, opts) => {
          calls.push({ method, path, body, opts });
          return requestResponse;
        },
      },
      config: { timeoutMs: 5000 },
    },
    calls,
  };
}

/**
 * Build a mock context where .request() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .request() times out (AbortError).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      request: async (_method, _path, _body, _opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

// ---------------------------------------------------------------------------
// Sample response data
// ---------------------------------------------------------------------------

const samplePriceData = {
  price: 29.99,
  currentPrice: 29.99,
  currency: 'USD',
  name: 'Wireless Mouse',
  store: 'TechStore',
  inStock: true,
  lastUpdated: '2025-06-01T10:00:00Z',
};

const samplePriceNotFound = { found: false };

const samplePriceHistory = {
  name: 'Wireless Mouse',
  currency: 'USD',
  history: [
    { date: '2025-05-01', price: 34.99 },
    { date: '2025-05-08', price: 32.99 },
    { date: '2025-05-15', price: 31.49 },
    { date: '2025-05-22', price: 29.99 },
    { date: '2025-05-29', price: 29.99 },
  ],
};

const samplePriceHistoryEmpty = {
  name: 'Unknown Product',
  currency: 'USD',
  history: [],
};

const samplePriceHistorySingle = {
  name: 'Keyboard',
  currency: 'USD',
  history: [{ date: '2025-05-01', price: 49.99 }],
};

const sampleCompareResults = {
  name: 'Wireless Mouse',
  results: [
    { store: 'TechStore', price: 29.99, currency: 'USD', inStock: true },
    { store: 'MegaMart', price: 27.49, currency: 'USD', inStock: true },
    { store: 'ShopWorld', price: 31.99, currency: 'USD', inStock: false },
  ],
};

const sampleCompareEmpty = {
  name: 'Unknown Product',
  results: [],
};

const sampleDeals = {
  deals: [
    { name: 'Gaming Keyboard', productId: 'kb-001', price: 49.99, originalPrice: 79.99, discount: 38, currency: 'USD' },
    { name: 'USB Hub', productId: 'hub-002', price: 14.99, originalPrice: 24.99, discount: 40, currency: 'USD' },
    { name: 'Mouse Pad', productId: 'mp-003', price: 9.99, originalPrice: 14.99, discount: 33, currency: 'USD' },
  ],
};

const sampleDealsEmpty = { deals: [] };

const sampleTrendUp = {
  name: 'Graphics Card',
  currency: 'USD',
  history: [
    { date: '2025-04-01', price: 300.00 },
    { date: '2025-04-15', price: 310.00 },
    { date: '2025-05-01', price: 325.00 },
    { date: '2025-05-15', price: 340.00 },
    { date: '2025-06-01', price: 350.00 },
  ],
};

const sampleTrendDown = {
  name: 'Old Laptop',
  currency: 'USD',
  history: [
    { date: '2025-04-01', price: 500.00 },
    { date: '2025-04-15', price: 480.00 },
    { date: '2025-05-01', price: 450.00 },
    { date: '2025-05-15', price: 420.00 },
    { date: '2025-06-01', price: 400.00 },
  ],
};

const sampleTrendStable = {
  name: 'Basic Cable',
  currency: 'USD',
  history: [
    { date: '2025-04-01', price: 10.00 },
    { date: '2025-04-15', price: 10.20 },
    { date: '2025-05-01', price: 9.80 },
    { date: '2025-05-15', price: 10.10 },
    { date: '2025-06-01', price: 10.00 },
  ],
};

const sampleTrendHighVolatility = {
  name: 'Crypto GPU',
  currency: 'USD',
  history: [
    { date: '2025-04-01', price: 200.00 },
    { date: '2025-04-15', price: 350.00 },
    { date: '2025-05-01', price: 150.00 },
    { date: '2025-05-15', price: 400.00 },
    { date: '2025-06-01', price: 200.00 },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('price-drop-monitor: action validation', () => {
  beforeEach(() => {
    _clearAlerts();
  });

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
    assert.ok(result.result.includes('check_price'));
    assert.ok(result.result.includes('set_alert'));
    assert.ok(result.result.includes('analyze_trend'));
  });

  it('should list all 8 valid actions in error', async () => {
    const result = await execute({ action: 'nope' }, {});
    assert.ok(result.result.includes('check_price'));
    assert.ok(result.result.includes('set_alert'));
    assert.ok(result.result.includes('list_alerts'));
    assert.ok(result.result.includes('remove_alert'));
    assert.ok(result.result.includes('price_history'));
    assert.ok(result.result.includes('compare_prices'));
    assert.ok(result.result.includes('find_deals'));
    assert.ok(result.result.includes('analyze_trend'));
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for external actions
// ---------------------------------------------------------------------------
describe('price-drop-monitor: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should fail check_price without client', async () => {
    const result = await execute({ action: 'check_price', productId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail price_history without client', async () => {
    const result = await execute({ action: 'price_history', productId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail compare_prices without client', async () => {
    const result = await execute({ action: 'compare_prices', productId: 'abc', stores: ['store1'] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail find_deals without client', async () => {
    const result = await execute({ action: 'find_deals', category: 'electronics' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail analyze_trend without client', async () => {
    const result = await execute({ action: 'analyze_trend', productId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should NOT fail set_alert without client (local action)', async () => {
    const result = await execute({ action: 'set_alert', productId: 'abc', targetPrice: 10 }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should NOT fail list_alerts without client (local action)', async () => {
    const result = await execute({ action: 'list_alerts' }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should NOT fail remove_alert without client (local action, not found)', async () => {
    const result = await execute({ action: 'remove_alert', alertId: 'alert_999' }, {});
    assert.equal(result.metadata.error, 'ALERT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// 3. check_price action
// ---------------------------------------------------------------------------
describe('price-drop-monitor: check_price', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should return price info successfully', async () => {
    const ctx = mockContext(samplePriceData);
    const result = await execute({ action: 'check_price', productId: 'mouse-001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'check_price');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.productId, 'mouse-001');
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.price, 29.99);
    assert.equal(result.metadata.currency, 'USD');
    assert.equal(result.metadata.name, 'Wireless Mouse');
    assert.equal(result.metadata.inStock, true);
    assert.ok(result.result.includes('Wireless Mouse'));
    assert.ok(result.result.includes('29.99'));
  });

  it('should accept url parameter as productId', async () => {
    const ctx = mockContext(samplePriceData);
    const result = await execute({ action: 'check_price', url: 'https://example.com/product/123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, true);
  });

  it('should reject missing productId and url', async () => {
    const ctx = mockContext(samplePriceData);
    const result = await execute({ action: 'check_price' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PRODUCT_ID');
  });

  it('should handle product not found', async () => {
    const ctx = mockContext(samplePriceNotFound);
    const result = await execute({ action: 'check_price', productId: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
  });

  it('should call the correct endpoint with GET method', async () => {
    const { context, calls } = mockContextWithSpy(samplePriceData);
    await execute({ action: 'check_price', productId: 'mouse-001' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.ok(calls[0].path.includes('/prices/'));
    assert.ok(calls[0].path.includes('mouse-001'));
    assert.equal(calls[0].body, null);
  });

  it('should include store in metadata when provided', async () => {
    const ctx = mockContext(samplePriceData);
    const result = await execute({ action: 'check_price', productId: 'mouse-001', store: 'Amazon' }, ctx);
    assert.equal(result.metadata.store, 'TechStore');
  });

  it('should include lastUpdated in metadata', async () => {
    const ctx = mockContext(samplePriceData);
    const result = await execute({ action: 'check_price', productId: 'mouse-001' }, ctx);
    assert.equal(result.metadata.lastUpdated, '2025-06-01T10:00:00Z');
  });

  it('should display In Stock status', async () => {
    const ctx = mockContext(samplePriceData);
    const result = await execute({ action: 'check_price', productId: 'mouse-001' }, ctx);
    assert.ok(result.result.includes('In Stock'));
    assert.ok(result.result.includes('Yes'));
  });
});

// ---------------------------------------------------------------------------
// 4. set_alert action
// ---------------------------------------------------------------------------
describe('price-drop-monitor: set_alert', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should create alert successfully', async () => {
    const result = await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 20 }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'set_alert');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.productId, 'mouse-001');
    assert.equal(result.metadata.targetPrice, 20);
    assert.equal(result.metadata.notifyMethod, 'email');
    assert.equal(result.metadata.active, true);
    assert.ok(result.metadata.alertId.startsWith('alert_'));
    assert.ok(result.result.includes('mouse-001'));
  });

  it('should use custom notify method', async () => {
    const result = await execute({ action: 'set_alert', productId: 'kb-001', targetPrice: 50, notifyMethod: 'sms' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.notifyMethod, 'sms');
    assert.ok(result.result.includes('sms'));
  });

  it('should reject missing productId', async () => {
    const result = await execute({ action: 'set_alert', targetPrice: 20 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PRODUCT_ID');
  });

  it('should reject missing targetPrice', async () => {
    const result = await execute({ action: 'set_alert', productId: 'mouse-001' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TARGET_PRICE');
  });

  it('should reject negative targetPrice', async () => {
    const result = await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: -5 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TARGET_PRICE');
  });

  it('should reject non-numeric targetPrice', async () => {
    const result = await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 'cheap' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TARGET_PRICE');
  });

  it('should reject invalid notify method', async () => {
    const result = await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 20, notifyMethod: 'pigeon' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_NOTIFY_METHOD');
  });

  it('should accept push as notify method', async () => {
    const result = await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 20, notifyMethod: 'push' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.notifyMethod, 'push');
  });

  it('should accept webhook as notify method', async () => {
    const result = await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 20, notifyMethod: 'webhook' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.notifyMethod, 'webhook');
  });

  it('should generate unique alert IDs', async () => {
    const r1 = await execute({ action: 'set_alert', productId: 'p1', targetPrice: 10 }, {});
    const r2 = await execute({ action: 'set_alert', productId: 'p2', targetPrice: 20 }, {});
    assert.notEqual(r1.metadata.alertId, r2.metadata.alertId);
  });

  it('should accept zero targetPrice', async () => {
    const result = await execute({ action: 'set_alert', productId: 'free-item', targetPrice: 0 }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.targetPrice, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. list_alerts action
// ---------------------------------------------------------------------------
describe('price-drop-monitor: list_alerts', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should return empty list when no alerts', async () => {
    const result = await execute({ action: 'list_alerts' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_alerts');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 0);
    assert.deepEqual(result.metadata.alerts, []);
    assert.ok(result.result.includes('No price alerts'));
  });

  it('should list alerts after creating them', async () => {
    await execute({ action: 'set_alert', productId: 'p1', targetPrice: 10 }, {});
    await execute({ action: 'set_alert', productId: 'p2', targetPrice: 20 }, {});
    const result = await execute({ action: 'list_alerts' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.alerts.length, 2);
    assert.ok(result.result.includes('p1'));
    assert.ok(result.result.includes('p2'));
  });

  it('should show alert details in output', async () => {
    await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 25, notifyMethod: 'sms' }, {});
    const result = await execute({ action: 'list_alerts' }, {});
    assert.ok(result.result.includes('mouse-001'));
    assert.ok(result.result.includes('25'));
    assert.ok(result.result.includes('sms'));
    assert.ok(result.result.includes('ACTIVE'));
  });

  it('should include alert objects in metadata', async () => {
    await execute({ action: 'set_alert', productId: 'kb-001', targetPrice: 50, notifyMethod: 'push' }, {});
    const result = await execute({ action: 'list_alerts' }, {});
    const alert = result.metadata.alerts[0];
    assert.equal(alert.productId, 'kb-001');
    assert.equal(alert.targetPrice, 50);
    assert.equal(alert.notifyMethod, 'push');
    assert.equal(alert.active, true);
    assert.ok(alert.alertId);
    assert.ok(alert.createdAt);
  });
});

// ---------------------------------------------------------------------------
// 6. remove_alert action
// ---------------------------------------------------------------------------
describe('price-drop-monitor: remove_alert', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should remove an existing alert', async () => {
    const created = await execute({ action: 'set_alert', productId: 'p1', targetPrice: 10 }, {});
    const alertId = created.metadata.alertId;
    const result = await execute({ action: 'remove_alert', alertId }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'remove_alert');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.alertId, alertId);
    assert.equal(result.metadata.removed, true);
    assert.ok(result.result.includes(alertId));
    assert.ok(result.result.includes('p1'));
  });

  it('should reject missing alertId', async () => {
    const result = await execute({ action: 'remove_alert' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ALERT_ID');
  });

  it('should return ALERT_NOT_FOUND for nonexistent alert', async () => {
    const result = await execute({ action: 'remove_alert', alertId: 'alert_999' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'ALERT_NOT_FOUND');
  });

  it('should not be able to remove same alert twice', async () => {
    const created = await execute({ action: 'set_alert', productId: 'p1', targetPrice: 10 }, {});
    const alertId = created.metadata.alertId;
    await execute({ action: 'remove_alert', alertId }, {});
    const result = await execute({ action: 'remove_alert', alertId }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'ALERT_NOT_FOUND');
  });

  it('should reduce alert count after removal', async () => {
    await execute({ action: 'set_alert', productId: 'p1', targetPrice: 10 }, {});
    const created2 = await execute({ action: 'set_alert', productId: 'p2', targetPrice: 20 }, {});

    let list = await execute({ action: 'list_alerts' }, {});
    assert.equal(list.metadata.count, 2);

    await execute({ action: 'remove_alert', alertId: created2.metadata.alertId }, {});

    list = await execute({ action: 'list_alerts' }, {});
    assert.equal(list.metadata.count, 1);
    assert.equal(list.metadata.alerts[0].productId, 'p1');
  });
});

// ---------------------------------------------------------------------------
// 7. price_history action
// ---------------------------------------------------------------------------
describe('price-drop-monitor: price_history', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should return price history successfully', async () => {
    const ctx = mockContext(samplePriceHistory);
    const result = await execute({ action: 'price_history', productId: 'mouse-001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'price_history');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.productId, 'mouse-001');
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.count, 5);
    assert.equal(result.metadata.name, 'Wireless Mouse');
    assert.equal(result.metadata.currency, 'USD');
    assert.ok(result.result.includes('Wireless Mouse'));
  });

  it('should calculate high, low, avg prices', async () => {
    const ctx = mockContext(samplePriceHistory);
    const result = await execute({ action: 'price_history', productId: 'mouse-001' }, ctx);
    assert.equal(result.metadata.highPrice, 34.99);
    assert.equal(result.metadata.lowPrice, 29.99);
    assert.ok(typeof result.metadata.avgPrice === 'number');
    assert.equal(result.metadata.currentPrice, 29.99);
  });

  it('should reject missing productId', async () => {
    const ctx = mockContext(samplePriceHistory);
    const result = await execute({ action: 'price_history' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PRODUCT_ID');
  });

  it('should handle empty history', async () => {
    const ctx = mockContext(samplePriceHistoryEmpty);
    const result = await execute({ action: 'price_history', productId: 'unknown' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
    assert.equal(result.metadata.count, 0);
  });

  it('should use default of 30 days', async () => {
    const ctx = mockContext(samplePriceHistory);
    const result = await execute({ action: 'price_history', productId: 'mouse-001' }, ctx);
    assert.equal(result.metadata.days, 30);
  });

  it('should pass custom days parameter', async () => {
    const ctx = mockContext(samplePriceHistory);
    const result = await execute({ action: 'price_history', productId: 'mouse-001', days: 7 }, ctx);
    assert.equal(result.metadata.days, 7);
  });

  it('should call correct endpoint with GET method', async () => {
    const { context, calls } = mockContextWithSpy(samplePriceHistory);
    await execute({ action: 'price_history', productId: 'mouse-001' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.ok(calls[0].path.includes('/prices/'));
    assert.ok(calls[0].path.includes('mouse-001'));
    assert.ok(calls[0].path.includes('/history'));
  });

  it('should display price stats in result text', async () => {
    const ctx = mockContext(samplePriceHistory);
    const result = await execute({ action: 'price_history', productId: 'mouse-001' }, ctx);
    assert.ok(result.result.includes('High'));
    assert.ok(result.result.includes('Low'));
    assert.ok(result.result.includes('Average'));
    assert.ok(result.result.includes('Current'));
  });

  it('should floor fractional days', async () => {
    const ctx = mockContext(samplePriceHistory);
    const result = await execute({ action: 'price_history', productId: 'mouse-001', days: 14.7 }, ctx);
    assert.equal(result.metadata.days, 14);
  });

  it('should default negative days to 30', async () => {
    const ctx = mockContext(samplePriceHistory);
    const result = await execute({ action: 'price_history', productId: 'mouse-001', days: -5 }, ctx);
    assert.equal(result.metadata.days, 30);
  });
});

// ---------------------------------------------------------------------------
// 8. compare_prices action
// ---------------------------------------------------------------------------
describe('price-drop-monitor: compare_prices', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should compare prices successfully', async () => {
    const ctx = mockContext(sampleCompareResults);
    const result = await execute({ action: 'compare_prices', productId: 'mouse-001', stores: ['TechStore', 'MegaMart', 'ShopWorld'] }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'compare_prices');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.count, 3);
    assert.equal(result.metadata.lowestPrice, 27.49);
    assert.equal(result.metadata.highestPrice, 31.99);
    assert.equal(result.metadata.bestStore, 'MegaMart');
    assert.ok(result.result.includes('Wireless Mouse'));
    assert.ok(result.result.includes('MegaMart'));
  });

  it('should accept query parameter as productId', async () => {
    const ctx = mockContext(sampleCompareResults);
    const result = await execute({ action: 'compare_prices', query: 'wireless mouse', stores: ['TechStore'] }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.productId, 'wireless mouse');
  });

  it('should reject missing productId and query', async () => {
    const ctx = mockContext(sampleCompareResults);
    const result = await execute({ action: 'compare_prices', stores: ['TechStore'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PRODUCT_ID');
  });

  it('should reject missing stores', async () => {
    const ctx = mockContext(sampleCompareResults);
    const result = await execute({ action: 'compare_prices', productId: 'mouse-001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_STORES');
  });

  it('should reject empty stores array', async () => {
    const ctx = mockContext(sampleCompareResults);
    const result = await execute({ action: 'compare_prices', productId: 'mouse-001', stores: [] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_STORES');
  });

  it('should handle empty comparison results', async () => {
    const ctx = mockContext(sampleCompareEmpty);
    const result = await execute({ action: 'compare_prices', productId: 'unknown', stores: ['Store1'] }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
    assert.equal(result.metadata.count, 0);
  });

  it('should call correct endpoint with POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleCompareResults);
    await execute({ action: 'compare_prices', productId: 'mouse-001', stores: ['TechStore', 'MegaMart'] }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/prices/compare');
    assert.equal(calls[0].body.productId, 'mouse-001');
    assert.deepEqual(calls[0].body.stores, ['TechStore', 'MegaMart']);
  });

  it('should show out of stock indicator', async () => {
    const ctx = mockContext(sampleCompareResults);
    const result = await execute({ action: 'compare_prices', productId: 'mouse-001', stores: ['TechStore', 'ShopWorld'] }, ctx);
    assert.ok(result.result.includes('Out of Stock'));
  });

  it('should show best price in result', async () => {
    const ctx = mockContext(sampleCompareResults);
    const result = await execute({ action: 'compare_prices', productId: 'mouse-001', stores: ['TechStore', 'MegaMart'] }, ctx);
    assert.ok(result.result.includes('Best Price'));
    assert.ok(result.result.includes('27.49'));
  });
});

// ---------------------------------------------------------------------------
// 9. find_deals action
// ---------------------------------------------------------------------------
describe('price-drop-monitor: find_deals', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should find deals successfully', async () => {
    const ctx = mockContext(sampleDeals);
    const result = await execute({ action: 'find_deals', category: 'electronics' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'find_deals');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 3);
    assert.equal(result.metadata.category, 'electronics');
    assert.ok(result.result.includes('Gaming Keyboard'));
    assert.ok(result.result.includes('USB Hub'));
    assert.ok(result.result.includes('Mouse Pad'));
  });

  it('should reject missing category', async () => {
    const ctx = mockContext(sampleDeals);
    const result = await execute({ action: 'find_deals' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CATEGORY');
  });

  it('should handle no deals found', async () => {
    const ctx = mockContext(sampleDealsEmpty);
    const result = await execute({ action: 'find_deals', category: 'rare-items' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No deals'));
  });

  it('should pass maxPrice in request body', async () => {
    const { context, calls } = mockContextWithSpy(sampleDeals);
    await execute({ action: 'find_deals', category: 'electronics', maxPrice: 50 }, context);
    assert.equal(calls[0].body.maxPrice, 50);
  });

  it('should pass minDiscount in request body', async () => {
    const { context, calls } = mockContextWithSpy(sampleDeals);
    await execute({ action: 'find_deals', category: 'electronics', minDiscount: 20 }, context);
    assert.equal(calls[0].body.minDiscount, 20);
  });

  it('should call correct endpoint with POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleDeals);
    await execute({ action: 'find_deals', category: 'electronics' }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/prices/deals');
    assert.equal(calls[0].body.category, 'electronics');
  });

  it('should include discount info in result', async () => {
    const ctx = mockContext(sampleDeals);
    const result = await execute({ action: 'find_deals', category: 'electronics' }, ctx);
    assert.ok(result.result.includes('38% off'));
    assert.ok(result.result.includes('40% off'));
  });

  it('should include original price in result', async () => {
    const ctx = mockContext(sampleDeals);
    const result = await execute({ action: 'find_deals', category: 'electronics' }, ctx);
    assert.ok(result.result.includes('79.99'));
    assert.ok(result.result.includes('49.99'));
  });

  it('should include deals metadata', async () => {
    const ctx = mockContext(sampleDeals);
    const result = await execute({ action: 'find_deals', category: 'electronics' }, ctx);
    assert.equal(result.metadata.deals.length, 3);
    assert.equal(result.metadata.deals[0].name, 'Gaming Keyboard');
    assert.equal(result.metadata.deals[0].discount, 38);
  });

  it('should store maxPrice in metadata', async () => {
    const ctx = mockContext(sampleDeals);
    const result = await execute({ action: 'find_deals', category: 'electronics', maxPrice: 30 }, ctx);
    assert.equal(result.metadata.maxPrice, 30);
  });
});

// ---------------------------------------------------------------------------
// 10. analyze_trend action
// ---------------------------------------------------------------------------
describe('price-drop-monitor: analyze_trend', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should analyze upward trend correctly', async () => {
    const ctx = mockContext(sampleTrendUp);
    const result = await execute({ action: 'analyze_trend', productId: 'gpu-001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'analyze_trend');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.trendDirection, 'up');
    assert.ok(result.metadata.changePercent > 0);
    assert.equal(result.metadata.name, 'Graphics Card');
    assert.equal(result.metadata.currentPrice, 350);
    assert.equal(result.metadata.startPrice, 300);
    assert.ok(result.result.includes('up'));
    assert.ok(result.result.includes('Graphics Card'));
  });

  it('should analyze downward trend correctly', async () => {
    const ctx = mockContext(sampleTrendDown);
    const result = await execute({ action: 'analyze_trend', productId: 'laptop-001' }, ctx);
    assert.equal(result.metadata.trendDirection, 'down');
    assert.ok(result.metadata.changePercent < 0);
    assert.equal(result.metadata.currentPrice, 400);
    assert.equal(result.metadata.startPrice, 500);
  });

  it('should analyze stable trend correctly', async () => {
    const ctx = mockContext(sampleTrendStable);
    const result = await execute({ action: 'analyze_trend', productId: 'cable-001' }, ctx);
    assert.equal(result.metadata.trendDirection, 'stable');
    assert.ok(Math.abs(result.metadata.changePercent) <= 5);
  });

  it('should detect high volatility', async () => {
    const ctx = mockContext(sampleTrendHighVolatility);
    const result = await execute({ action: 'analyze_trend', productId: 'crypto-gpu' }, ctx);
    assert.equal(result.metadata.volatilityLevel, 'high');
    assert.ok(result.metadata.volatility > 20);
    assert.ok(result.result.includes('high'));
  });

  it('should detect low volatility', async () => {
    const ctx = mockContext(sampleTrendStable);
    const result = await execute({ action: 'analyze_trend', productId: 'cable-001' }, ctx);
    assert.equal(result.metadata.volatilityLevel, 'low');
    assert.ok(result.metadata.volatility < 10);
  });

  it('should reject missing productId', async () => {
    const ctx = mockContext(sampleTrendUp);
    const result = await execute({ action: 'analyze_trend' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PRODUCT_ID');
  });

  it('should handle insufficient data (less than 2 points)', async () => {
    const ctx = mockContext(samplePriceHistorySingle);
    const result = await execute({ action: 'analyze_trend', productId: 'kb-001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
    assert.ok(result.result.includes('Not enough'));
  });

  it('should handle empty history', async () => {
    const ctx = mockContext(samplePriceHistoryEmpty);
    const result = await execute({ action: 'analyze_trend', productId: 'unknown' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
  });

  it('should use default 30 days', async () => {
    const ctx = mockContext(sampleTrendUp);
    const result = await execute({ action: 'analyze_trend', productId: 'gpu-001' }, ctx);
    assert.equal(result.metadata.days, 30);
  });

  it('should pass custom days parameter', async () => {
    const ctx = mockContext(sampleTrendUp);
    const result = await execute({ action: 'analyze_trend', productId: 'gpu-001', days: 60 }, ctx);
    assert.equal(result.metadata.days, 60);
  });

  it('should call correct endpoint with GET method', async () => {
    const { context, calls } = mockContextWithSpy(sampleTrendUp);
    await execute({ action: 'analyze_trend', productId: 'gpu-001' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.ok(calls[0].path.includes('/prices/'));
    assert.ok(calls[0].path.includes('gpu-001'));
    assert.ok(calls[0].path.includes('/history'));
  });

  it('should include high/low prices in metadata', async () => {
    const ctx = mockContext(sampleTrendUp);
    const result = await execute({ action: 'analyze_trend', productId: 'gpu-001' }, ctx);
    assert.equal(result.metadata.highPrice, 350);
    assert.equal(result.metadata.lowPrice, 300);
  });

  it('should include avgPrice in metadata', async () => {
    const ctx = mockContext(sampleTrendUp);
    const result = await execute({ action: 'analyze_trend', productId: 'gpu-001' }, ctx);
    assert.equal(result.metadata.avgPrice, 325);
  });

  it('should include dataPoints in metadata', async () => {
    const ctx = mockContext(sampleTrendUp);
    const result = await execute({ action: 'analyze_trend', productId: 'gpu-001' }, ctx);
    assert.equal(result.metadata.dataPoints, 5);
  });

  it('should display volatility info in result', async () => {
    const ctx = mockContext(sampleTrendUp);
    const result = await execute({ action: 'analyze_trend', productId: 'gpu-001' }, ctx);
    assert.ok(result.result.includes('Volatility'));
    assert.ok(result.result.includes('Data Points'));
  });
});

// ---------------------------------------------------------------------------
// 11. Timeout handling
// ---------------------------------------------------------------------------
describe('price-drop-monitor: timeout', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should return TIMEOUT error on abort for check_price', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'check_price', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for price_history', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'price_history', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for compare_prices', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'compare_prices', productId: 'abc', stores: ['store1'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for find_deals', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'find_deals', category: 'electronics' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for analyze_trend', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'analyze_trend', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 12. Network error handling
// ---------------------------------------------------------------------------
describe('price-drop-monitor: network errors', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should return REQUEST_ERROR on network failure for check_price', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'check_price', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should return REQUEST_ERROR on network failure for price_history', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'price_history', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should return REQUEST_ERROR on network failure for compare_prices', async () => {
    const ctx = mockContextError(new Error('ECONNRESET'));
    const result = await execute({ action: 'compare_prices', productId: 'abc', stores: ['store1'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should return REQUEST_ERROR on network failure for find_deals', async () => {
    const ctx = mockContextError(new Error('Network error'));
    const result = await execute({ action: 'find_deals', category: 'electronics' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should return REQUEST_ERROR on network failure for analyze_trend', async () => {
    const ctx = mockContextError(new Error('Socket hang up'));
    const result = await execute({ action: 'analyze_trend', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'check_price', productId: 'abc' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 13. getClient helper
// ---------------------------------------------------------------------------
describe('price-drop-monitor: getClient', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should prefer providerClient', () => {
    const result = getClient({ providerClient: { request: () => {} }, gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });

  it('should return null for null context', () => {
    assert.equal(getClient(null), null);
  });
});

// ---------------------------------------------------------------------------
// 14. redactSensitive
// ---------------------------------------------------------------------------
describe('price-drop-monitor: redactSensitive', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123def456 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123def456'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact token patterns', () => {
    const input = 'token=mySecretToken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('mySecretToken123'));
  });

  it('should redact secret patterns', () => {
    const input = 'secret: super_secret_value_xyz here';
    const output = redactSensitive(input);
    assert.ok(!output.includes('super_secret_value_xyz'));
  });

  it('should redact sk_live patterns', () => {
    const input = 'Key is sk_live_1234567890abcdef';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_1234567890abcdef'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Wireless Mouse costs $29.99';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 15. sanitizeString
// ---------------------------------------------------------------------------
describe('price-drop-monitor: sanitizeString', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should trim whitespace', () => {
    assert.equal(sanitizeString('  hello  '), 'hello');
  });

  it('should remove control characters', () => {
    const input = 'hello\x00world\x07test';
    const output = sanitizeString(input);
    assert.ok(!output.includes('\x00'));
    assert.ok(!output.includes('\x07'));
    assert.ok(output.includes('hello'));
  });

  it('should return undefined for null', () => {
    assert.equal(sanitizeString(null), undefined);
  });

  it('should return undefined for undefined', () => {
    assert.equal(sanitizeString(undefined), undefined);
  });

  it('should convert numbers to strings', () => {
    assert.equal(sanitizeString(123), '123');
  });
});

// ---------------------------------------------------------------------------
// 16. L1 compliance - no hardcoded URLs
// ---------------------------------------------------------------------------
describe('price-drop-monitor: L1 compliance', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should not use hardcoded URLs in request paths', async () => {
    const { context, calls } = mockContextWithSpy(samplePriceData);
    await execute({ action: 'check_price', productId: 'abc' }, context);
    for (const call of calls) {
      assert.ok(!call.path.includes('https://'), 'Path must not contain https://');
      assert.ok(!call.path.includes('http://'), 'Path must not contain http://');
    }
  });

  it('should use /prices/ prefix for price API calls', async () => {
    const { context, calls } = mockContextWithSpy(samplePriceData);
    await execute({ action: 'check_price', productId: 'abc' }, context);
    assert.ok(calls[0].path.startsWith('/prices/'), `Path "${calls[0].path}" must start with /prices/`);
  });

  it('should use correct paths for all API actions', async () => {
    const { context, calls } = mockContextWithSpy(samplePriceData);

    await execute({ action: 'check_price', productId: 'abc' }, context);
    await execute({ action: 'price_history', productId: 'abc' }, context);
    await execute({ action: 'compare_prices', productId: 'abc', stores: ['s1'] }, context);
    await execute({ action: 'find_deals', category: 'electronics' }, context);
    await execute({ action: 'analyze_trend', productId: 'abc' }, context);

    assert.equal(calls.length, 5);
    assert.ok(calls[0].path.includes('/prices/abc'));
    assert.ok(calls[1].path.includes('/prices/abc/history'));
    assert.equal(calls[2].path, '/prices/compare');
    assert.equal(calls[3].path, '/prices/deals');
    assert.ok(calls[4].path.includes('/prices/abc/history'));
  });

  it('should use correct HTTP methods', async () => {
    const { context, calls } = mockContextWithSpy(samplePriceData);

    await execute({ action: 'check_price', productId: 'abc' }, context);
    await execute({ action: 'price_history', productId: 'abc' }, context);
    await execute({ action: 'compare_prices', productId: 'abc', stores: ['s1'] }, context);
    await execute({ action: 'find_deals', category: 'electronics' }, context);
    await execute({ action: 'analyze_trend', productId: 'abc' }, context);

    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[2].method, 'POST');
    assert.equal(calls[3].method, 'POST');
    assert.equal(calls[4].method, 'GET');
  });
});

// ---------------------------------------------------------------------------
// 17. Alert state isolation with _clearAlerts
// ---------------------------------------------------------------------------
describe('price-drop-monitor: alert state management', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should start with no alerts after clear', async () => {
    const result = await execute({ action: 'list_alerts' }, {});
    assert.equal(result.metadata.count, 0);
  });

  it('should clear alerts properly between tests', async () => {
    await execute({ action: 'set_alert', productId: 'temp', targetPrice: 1 }, {});
    _clearAlerts();
    const result = await execute({ action: 'list_alerts' }, {});
    assert.equal(result.metadata.count, 0);
  });

  it('should reset alert ID counter on clear', async () => {
    await execute({ action: 'set_alert', productId: 'a', targetPrice: 1 }, {});
    await execute({ action: 'set_alert', productId: 'b', targetPrice: 2 }, {});
    _clearAlerts();
    const r = await execute({ action: 'set_alert', productId: 'c', targetPrice: 3 }, {});
    assert.equal(r.metadata.alertId, 'alert_1');
  });

  it('should handle multiple alerts for same product', async () => {
    await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 20 }, {});
    await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 15 }, {});
    const list = await execute({ action: 'list_alerts' }, {});
    assert.equal(list.metadata.count, 2);
    const productAlerts = list.metadata.alerts.filter((a) => a.productId === 'mouse-001');
    assert.equal(productAlerts.length, 2);
  });

  it('should persist alerts across list calls', async () => {
    await execute({ action: 'set_alert', productId: 'x', targetPrice: 5 }, {});
    const list1 = await execute({ action: 'list_alerts' }, {});
    const list2 = await execute({ action: 'list_alerts' }, {});
    assert.equal(list1.metadata.count, list2.metadata.count);
  });
});

// ---------------------------------------------------------------------------
// 18. Edge cases
// ---------------------------------------------------------------------------
describe('price-drop-monitor: edge cases', () => {
  beforeEach(() => {
    _clearAlerts();
  });

  it('should handle null response data for check_price', async () => {
    const ctx = mockContext(null);
    const result = await execute({ action: 'check_price', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
  });

  it('should handle undefined fields in price response', async () => {
    const ctx = mockContext({ price: 19.99 });
    const result = await execute({ action: 'check_price', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.price, 19.99);
    assert.equal(result.metadata.currency, 'USD');
  });

  it('should encode productId in URL path', async () => {
    const { context, calls } = mockContextWithSpy(samplePriceData);
    await execute({ action: 'check_price', productId: 'product with spaces' }, context);
    assert.ok(calls[0].path.includes('product%20with%20spaces'));
  });

  it('should handle compare_prices with non-string stores gracefully', async () => {
    const ctx = mockContext(sampleCompareResults);
    const result = await execute({ action: 'compare_prices', productId: 'abc', stores: [null, undefined, 'valid'] }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should use gatewayClient when providerClient is missing', async () => {
    const calls = [];
    const ctx = {
      gatewayClient: {
        request: async (method, path, body, opts) => {
          calls.push({ method, path, body, opts });
          return samplePriceData;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'check_price', productId: 'abc' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calls.length, 1);
  });
});
