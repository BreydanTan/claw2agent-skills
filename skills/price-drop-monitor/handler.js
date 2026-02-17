/**
 * Price Drop Monitor Skill Handler (Layer 1)
 *
 * Track product prices, set price alerts, and analyze price history
 * via an injected provider client. Supports checking current prices,
 * managing alerts, comparing prices across stores, finding deals,
 * and analyzing price trends.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://api.example.com/...)
 * - All external access goes through context.providerClient or context.gatewayClient
 * - If no client is available: PROVIDER_NOT_CONFIGURED
 * - Enforces timeout (default 15s, max 30s)
 * - Redacts secrets from all outputs
 * - Sanitizes inputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'check_price', 'set_alert', 'list_alerts', 'remove_alert',
  'price_history', 'compare_prices', 'find_deals', 'analyze_trend',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_HISTORY_DAYS = 30;
const DEFAULT_MIN_DISCOUNT = 0;

const VALID_NOTIFY_METHODS = ['email', 'sms', 'push', 'webhook'];

// ---------------------------------------------------------------------------
// Internal state: in-memory alert storage
// ---------------------------------------------------------------------------

/** @type {Map<string, Object>} */
const alerts = new Map();
let alertIdCounter = 0;

/**
 * Clear all alerts and reset counter. Exported for test cleanup.
 */
export function _clearAlerts() {
  alerts.clear();
  alertIdCounter = 0;
}

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the provider or gateway client from context.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
export function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

/**
 * Return the standard PROVIDER_NOT_CONFIGURED error response.
 *
 * @returns {{ result: string, metadata: Object }}
 */
function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for price data access. Configure the platform adapter.',
    metadata: {
      success: false,
      error: 'PROVIDER_NOT_CONFIGURED',
    },
  };
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
  /(?:sk|pk)[-_](?:live|test)[-_]\S{10,}/g,
];

/**
 * Redact sensitive tokens/keys from a string.
 *
 * @param {string} text
 * @returns {string}
 */
export function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a string input by trimming and removing control characters.
 *
 * @param {*} value
 * @returns {string|undefined}
 */
export function sanitizeString(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return String(value);
  // eslint-disable-next-line no-control-regex
  return value.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective timeout from context config.
 *
 * @param {Object} context
 * @returns {number}
 */
function resolveTimeout(context) {
  const configured = context?.config?.timeoutMs;
  if (typeof configured === 'number' && configured > 0) {
    return Math.min(configured, MAX_TIMEOUT_MS);
  }
  return DEFAULT_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Request with timeout
// ---------------------------------------------------------------------------

/**
 * Make a request through the provider client with timeout enforcement.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The resource/endpoint path
 * @param {Object|null} body - Request body (for POST, PUT, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, body, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'REQUEST_ERROR', message: err.message || 'Unknown request error' };
  }
}

// ---------------------------------------------------------------------------
// Price formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a price value for display.
 *
 * @param {number} price
 * @param {string} [currency='USD']
 * @returns {string}
 */
function formatPrice(price, currency) {
  if (typeof price !== 'number' || isNaN(price)) return 'N/A';
  const cur = currency || 'USD';
  return `${cur} ${price.toFixed(2)}`;
}

/**
 * Calculate percentage change between two values.
 *
 * @param {number} oldVal
 * @param {number} newVal
 * @returns {number}
 */
function percentChange(oldVal, newVal) {
  if (oldVal === 0) return 0;
  return ((newVal - oldVal) / oldVal) * 100;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * check_price - Check current price of a product.
 */
async function handleCheckPrice(params, context) {
  const productId = sanitizeString(params.productId || params.url);
  const store = sanitizeString(params.store);

  if (!productId) {
    return {
      result: 'Error: The "productId" or "url" parameter is required for check_price.',
      metadata: { success: false, error: 'MISSING_PRODUCT_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/prices/${encodeURIComponent(productId)}`,
      null,
      timeoutMs,
    );

    if (!data || data.found === false) {
      return {
        result: `No price data found for product "${productId}".`,
        metadata: {
          success: true,
          action: 'check_price',
          layer: 'L1',
          productId,
          store: store || null,
          found: false,
        },
      };
    }

    const currentPrice = data.price ?? data.currentPrice ?? null;
    const currency = data.currency || 'USD';
    const productName = data.name || data.title || productId;
    const storeName = data.store || store || 'N/A';
    const inStock = data.inStock !== undefined ? data.inStock : null;
    const lastUpdated = data.lastUpdated || data.updatedAt || null;

    const result = [
      `Product: ${productName}`,
      `Store: ${storeName}`,
      `Price: ${formatPrice(currentPrice, currency)}`,
      `In Stock: ${inStock !== null ? (inStock ? 'Yes' : 'No') : 'N/A'}`,
      `Last Updated: ${lastUpdated || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'check_price',
        layer: 'L1',
        productId,
        store: storeName,
        found: true,
        price: currentPrice,
        currency,
        name: productName,
        inStock,
        lastUpdated,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

/**
 * set_alert - Set a price alert for a product.
 */
async function handleSetAlert(params, _context) {
  const productId = sanitizeString(params.productId);
  const targetPrice = typeof params.targetPrice === 'number' ? params.targetPrice : null;
  const notifyMethod = sanitizeString(params.notifyMethod) || 'email';

  if (!productId) {
    return {
      result: 'Error: The "productId" parameter is required for set_alert.',
      metadata: { success: false, error: 'MISSING_PRODUCT_ID' },
    };
  }

  if (targetPrice === null || isNaN(targetPrice) || targetPrice < 0) {
    return {
      result: 'Error: The "targetPrice" parameter must be a non-negative number.',
      metadata: { success: false, error: 'INVALID_TARGET_PRICE' },
    };
  }

  if (!VALID_NOTIFY_METHODS.includes(notifyMethod)) {
    return {
      result: `Error: Invalid notifyMethod "${notifyMethod}". Must be one of: ${VALID_NOTIFY_METHODS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_NOTIFY_METHOD' },
    };
  }

  alertIdCounter += 1;
  const alertId = `alert_${alertIdCounter}`;
  const alert = {
    alertId,
    productId,
    targetPrice,
    notifyMethod,
    createdAt: new Date().toISOString(),
    active: true,
  };

  alerts.set(alertId, alert);

  return {
    result: `Alert "${alertId}" set for product "${productId}" at target price ${targetPrice}. Notify via ${notifyMethod}.`,
    metadata: {
      success: true,
      action: 'set_alert',
      layer: 'L1',
      alertId,
      productId,
      targetPrice,
      notifyMethod,
      active: true,
    },
  };
}

/**
 * list_alerts - List all price alerts.
 */
async function handleListAlerts(_params, _context) {
  const allAlerts = Array.from(alerts.values());

  if (allAlerts.length === 0) {
    return {
      result: 'No price alerts configured.',
      metadata: {
        success: true,
        action: 'list_alerts',
        layer: 'L1',
        count: 0,
        alerts: [],
      },
    };
  }

  const lines = allAlerts.map(
    (a) => `[${a.alertId}] ${a.productId} - target: ${a.targetPrice} (${a.notifyMethod}) ${a.active ? 'ACTIVE' : 'INACTIVE'}`
  );

  return {
    result: `Price Alerts (${allAlerts.length}):\n${lines.join('\n')}`,
    metadata: {
      success: true,
      action: 'list_alerts',
      layer: 'L1',
      count: allAlerts.length,
      alerts: allAlerts,
    },
  };
}

/**
 * remove_alert - Remove a price alert.
 */
async function handleRemoveAlert(params, _context) {
  const alertId = sanitizeString(params.alertId);

  if (!alertId) {
    return {
      result: 'Error: The "alertId" parameter is required for remove_alert.',
      metadata: { success: false, error: 'MISSING_ALERT_ID' },
    };
  }

  if (!alerts.has(alertId)) {
    return {
      result: `Error: Alert "${alertId}" not found.`,
      metadata: { success: false, error: 'ALERT_NOT_FOUND' },
    };
  }

  const removed = alerts.get(alertId);
  alerts.delete(alertId);

  return {
    result: `Alert "${alertId}" for product "${removed.productId}" has been removed.`,
    metadata: {
      success: true,
      action: 'remove_alert',
      layer: 'L1',
      alertId,
      productId: removed.productId,
      removed: true,
    },
  };
}

/**
 * price_history - Get price history for a product.
 */
async function handlePriceHistory(params, context) {
  const productId = sanitizeString(params.productId);
  const days = typeof params.days === 'number' && params.days > 0 ? Math.floor(params.days) : DEFAULT_HISTORY_DAYS;

  if (!productId) {
    return {
      result: 'Error: The "productId" parameter is required for price_history.',
      metadata: { success: false, error: 'MISSING_PRODUCT_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/prices/${encodeURIComponent(productId)}/history`,
      null,
      timeoutMs,
    );

    const history = Array.isArray(data?.history) ? data.history : [];
    const currency = data?.currency || 'USD';
    const productName = data?.name || productId;

    if (history.length === 0) {
      return {
        result: `No price history found for product "${productId}" over the last ${days} days.`,
        metadata: {
          success: true,
          action: 'price_history',
          layer: 'L1',
          productId,
          days,
          found: false,
          count: 0,
          history: [],
        },
      };
    }

    const prices = history.map((h) => h.price).filter((p) => typeof p === 'number');
    const highPrice = prices.length > 0 ? Math.max(...prices) : null;
    const lowPrice = prices.length > 0 ? Math.min(...prices) : null;
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const currentPrice = prices.length > 0 ? prices[prices.length - 1] : null;

    const lines = [
      `Price History for: ${productName} (last ${days} days)`,
      `Current: ${formatPrice(currentPrice, currency)}`,
      `High: ${formatPrice(highPrice, currency)}`,
      `Low: ${formatPrice(lowPrice, currency)}`,
      `Average: ${formatPrice(avgPrice, currency)}`,
      `Data Points: ${history.length}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'price_history',
        layer: 'L1',
        productId,
        days,
        found: true,
        count: history.length,
        currency,
        name: productName,
        currentPrice,
        highPrice,
        lowPrice,
        avgPrice: avgPrice !== null ? parseFloat(avgPrice.toFixed(2)) : null,
        history,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

/**
 * compare_prices - Compare prices across stores.
 */
async function handleComparePrices(params, context) {
  const productId = sanitizeString(params.productId || params.query);
  const stores = Array.isArray(params.stores) ? params.stores.map((s) => sanitizeString(s)).filter(Boolean) : [];

  if (!productId) {
    return {
      result: 'Error: The "productId" or "query" parameter is required for compare_prices.',
      metadata: { success: false, error: 'MISSING_PRODUCT_ID' },
    };
  }

  if (stores.length === 0) {
    return {
      result: 'Error: The "stores" parameter must be a non-empty array.',
      metadata: { success: false, error: 'MISSING_STORES' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/prices/compare',
      { productId, stores },
      timeoutMs,
    );

    const results = Array.isArray(data?.results) ? data.results : [];
    const productName = data?.name || productId;

    if (results.length === 0) {
      return {
        result: `No price comparison data found for "${productId}".`,
        metadata: {
          success: true,
          action: 'compare_prices',
          layer: 'L1',
          productId,
          stores,
          found: false,
          count: 0,
          results: [],
        },
      };
    }

    const prices = results.map((r) => r.price).filter((p) => typeof p === 'number');
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
    const highestPrice = prices.length > 0 ? Math.max(...prices) : null;
    const bestStore = results.find((r) => r.price === lowestPrice);

    const lines = [
      `Price Comparison for: ${productName}`,
      ...results.map((r) => `  ${r.store || 'Unknown'}: ${formatPrice(r.price, r.currency || 'USD')}${r.inStock === false ? ' (Out of Stock)' : ''}`),
      `Best Price: ${formatPrice(lowestPrice, bestStore?.currency || 'USD')} at ${bestStore?.store || 'Unknown'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'compare_prices',
        layer: 'L1',
        productId,
        stores,
        found: true,
        count: results.length,
        name: productName,
        lowestPrice,
        highestPrice,
        bestStore: bestStore?.store || null,
        results,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

/**
 * find_deals - Find current deals/discounts.
 */
async function handleFindDeals(params, context) {
  const category = sanitizeString(params.category);
  const maxPrice = typeof params.maxPrice === 'number' ? params.maxPrice : null;
  const minDiscount = typeof params.minDiscount === 'number' ? params.minDiscount : DEFAULT_MIN_DISCOUNT;

  if (!category) {
    return {
      result: 'Error: The "category" parameter is required for find_deals.',
      metadata: { success: false, error: 'MISSING_CATEGORY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const body = { category, minDiscount };
    if (maxPrice !== null) body.maxPrice = maxPrice;

    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/prices/deals',
      body,
      timeoutMs,
    );

    const deals = Array.isArray(data?.deals) ? data.deals : [];

    if (deals.length === 0) {
      return {
        result: `No deals found for category "${category}".`,
        metadata: {
          success: true,
          action: 'find_deals',
          layer: 'L1',
          category,
          maxPrice,
          minDiscount,
          count: 0,
          deals: [],
        },
      };
    }

    const lines = [
      `Deals in "${category}" (${deals.length} found):`,
      ...deals.map((d) => {
        const discount = d.discount ? `${d.discount}% off` : '';
        const price = formatPrice(d.price, d.currency || 'USD');
        const originalPrice = d.originalPrice ? ` (was ${formatPrice(d.originalPrice, d.currency || 'USD')})` : '';
        return `  ${d.name || d.productId || 'Unknown'}: ${price}${originalPrice} ${discount}`.trim();
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'find_deals',
        layer: 'L1',
        category,
        maxPrice,
        minDiscount,
        count: deals.length,
        deals,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

/**
 * analyze_trend - Analyze price trend for a product.
 */
async function handleAnalyzeTrend(params, context) {
  const productId = sanitizeString(params.productId);
  const days = typeof params.days === 'number' && params.days > 0 ? Math.floor(params.days) : DEFAULT_HISTORY_DAYS;

  if (!productId) {
    return {
      result: 'Error: The "productId" parameter is required for analyze_trend.',
      metadata: { success: false, error: 'MISSING_PRODUCT_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/prices/${encodeURIComponent(productId)}/history`,
      null,
      timeoutMs,
    );

    const history = Array.isArray(data?.history) ? data.history : [];
    const currency = data?.currency || 'USD';
    const productName = data?.name || productId;

    if (history.length < 2) {
      return {
        result: `Not enough price data to analyze trend for "${productId}". Need at least 2 data points.`,
        metadata: {
          success: true,
          action: 'analyze_trend',
          layer: 'L1',
          productId,
          days,
          found: false,
          dataPoints: history.length,
        },
      };
    }

    const prices = history.map((h) => h.price).filter((p) => typeof p === 'number');
    if (prices.length < 2) {
      return {
        result: `Not enough valid price data to analyze trend for "${productId}".`,
        metadata: {
          success: true,
          action: 'analyze_trend',
          layer: 'L1',
          productId,
          days,
          found: false,
          dataPoints: prices.length,
        },
      };
    }

    const highPrice = Math.max(...prices);
    const lowPrice = Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const currentPrice = prices[prices.length - 1];
    const startPrice = prices[0];

    // Trend direction
    const change = percentChange(startPrice, currentPrice);
    let trendDirection;
    if (change > 5) trendDirection = 'up';
    else if (change < -5) trendDirection = 'down';
    else trendDirection = 'stable';

    // Price volatility (coefficient of variation)
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const volatility = avgPrice > 0 ? (stdDev / avgPrice) * 100 : 0;

    let volatilityLevel;
    if (volatility > 20) volatilityLevel = 'high';
    else if (volatility > 10) volatilityLevel = 'moderate';
    else volatilityLevel = 'low';

    const lines = [
      `Price Trend Analysis for: ${productName} (last ${days} days)`,
      `Trend: ${trendDirection} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`,
      `Current: ${formatPrice(currentPrice, currency)}`,
      `Average: ${formatPrice(avgPrice, currency)}`,
      `High: ${formatPrice(highPrice, currency)} | Low: ${formatPrice(lowPrice, currency)}`,
      `Volatility: ${volatility.toFixed(2)}% (${volatilityLevel})`,
      `Data Points: ${prices.length}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'analyze_trend',
        layer: 'L1',
        productId,
        days,
        found: true,
        name: productName,
        currency,
        currentPrice,
        avgPrice: parseFloat(avgPrice.toFixed(2)),
        highPrice,
        lowPrice,
        startPrice,
        trendDirection,
        changePercent: parseFloat(change.toFixed(2)),
        volatility: parseFloat(volatility.toFixed(2)),
        volatilityLevel,
        dataPoints: prices.length,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a price monitoring operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of the VALID_ACTIONS
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  try {
    switch (action) {
      case 'check_price':
        return await handleCheckPrice(params, context);
      case 'set_alert':
        return await handleSetAlert(params, context);
      case 'list_alerts':
        return await handleListAlerts(params, context);
      case 'remove_alert':
        return await handleRemoveAlert(params, context);
      case 'price_history':
        return await handlePriceHistory(params, context);
      case 'compare_prices':
        return await handleComparePrices(params, context);
      case 'find_deals':
        return await handleFindDeals(params, context);
      case 'analyze_trend':
        return await handleAnalyzeTrend(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: 'OPERATION_FAILED', detail: error.message },
    };
  }
}
