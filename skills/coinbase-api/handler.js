/**
 * Coinbase API Skill Handler (Layer 1)
 *
 * Access Coinbase cryptocurrency data including spot prices,
 * exchange rates, buy/sell prices, and supported currencies.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints
 * - All external access through injected providerClient or gatewayClient
 * - Enforces timeout (default 15s, max 30s)
 * - Redacts tokens/keys from outputs
 * - Validates/sanitizes all inputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'get_spot_price',
  'get_exchange_rates',
  'list_currencies',
  'get_buy_price',
  'get_sell_price',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const CURRENCY_PAIR_REGEX = /^[A-Z]{2,10}-[A-Z]{2,10}$/;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for Coinbase data access. Configure an API key or platform adapter.',
    metadata: { success: false, error: 'PROVIDER_NOT_CONFIGURED' },
  };
}

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

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

async function requestWithTimeout(client, method, path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, body, { signal: controller.signal });
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
// Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
];

export function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

export function sanitizeCurrencyPair(pair) {
  if (!pair || typeof pair !== 'string') return undefined;
  const normalized = pair.trim().toUpperCase().replace(/\//g, '-');
  if (!CURRENCY_PAIR_REGEX.test(normalized)) return undefined;
  return normalized;
}

export function sanitizeCurrency(currency) {
  if (!currency || typeof currency !== 'string') return undefined;
  const normalized = currency.trim().toUpperCase().replace(/[^A-Z]/g, '');
  return normalized.length >= 2 ? normalized : undefined;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleGetSpotPrice(params, context) {
  const pair = sanitizeCurrencyPair(params.currencyPair);
  if (!pair) {
    return {
      result: 'Error: The "currencyPair" parameter is required (e.g. BTC-USD).',
      metadata: { success: false, error: 'MISSING_CURRENCY_PAIR' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET',
      `/prices/${pair}/spot`,
      null, timeoutMs,
    );

    const amount = data?.data?.amount ?? data?.amount ?? data?.price ?? null;
    const currency = data?.data?.currency ?? data?.currency ?? pair.split('-')[1];

    return {
      result: redactSensitive(`${pair} spot price: ${amount ?? 'N/A'} ${currency}`),
      metadata: {
        success: true, action: 'get_spot_price', layer: 'L1',
        currencyPair: pair,
        amount: amount ? parseFloat(amount) : null,
        currency,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

async function handleGetExchangeRates(params, context) {
  const currency = sanitizeCurrency(params.currency) || 'USD';

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET',
      `/exchange-rates?currency=${currency}`,
      null, timeoutMs,
    );

    const rates = data?.data?.rates ?? data?.rates ?? {};
    const rateEntries = Object.entries(rates);

    const lines = [
      `Exchange Rates (base: ${currency})`,
      `Pairs: ${rateEntries.length}`,
      '',
      ...rateEntries.slice(0, 20).map(([k, v]) => `  ${k}: ${v}`),
      rateEntries.length > 20 ? `  ... and ${rateEntries.length - 20} more` : '',
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true, action: 'get_exchange_rates', layer: 'L1',
        baseCurrency: currency,
        rateCount: rateEntries.length,
        rates,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

async function handleListCurrencies(_params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET', '/currencies', null, timeoutMs,
    );

    const currencies = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.currencies) ? data.currencies : []);

    const lines = [
      `Supported Currencies (${currencies.length}):`,
      '',
      ...currencies.slice(0, 30).map((c) => `  ${c.id || c.code || 'N/A'}: ${c.name || 'N/A'}`),
      currencies.length > 30 ? `  ... and ${currencies.length - 30} more` : '',
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true, action: 'list_currencies', layer: 'L1',
        count: currencies.length,
        currencies,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

async function handleGetBuyPrice(params, context) {
  const pair = sanitizeCurrencyPair(params.currencyPair);
  if (!pair) {
    return {
      result: 'Error: The "currencyPair" parameter is required (e.g. BTC-USD).',
      metadata: { success: false, error: 'MISSING_CURRENCY_PAIR' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET',
      `/prices/${pair}/buy`,
      null, timeoutMs,
    );

    const amount = data?.data?.amount ?? data?.amount ?? null;
    const currency = data?.data?.currency ?? data?.currency ?? pair.split('-')[1];

    return {
      result: redactSensitive(`${pair} buy price: ${amount ?? 'N/A'} ${currency}`),
      metadata: {
        success: true, action: 'get_buy_price', layer: 'L1',
        currencyPair: pair,
        amount: amount ? parseFloat(amount) : null,
        currency,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

async function handleGetSellPrice(params, context) {
  const pair = sanitizeCurrencyPair(params.currencyPair);
  if (!pair) {
    return {
      result: 'Error: The "currencyPair" parameter is required (e.g. BTC-USD).',
      metadata: { success: false, error: 'MISSING_CURRENCY_PAIR' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET',
      `/prices/${pair}/sell`,
      null, timeoutMs,
    );

    const amount = data?.data?.amount ?? data?.amount ?? null;
    const currency = data?.data?.currency ?? data?.currency ?? pair.split('-')[1];

    return {
      result: redactSensitive(`${pair} sell price: ${amount ?? 'N/A'} ${currency}`),
      metadata: {
        success: true, action: 'get_sell_price', layer: 'L1',
        currencyPair: pair,
        amount: amount ? parseFloat(amount) : null,
        currency,
        timestamp: new Date().toISOString(),
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
// Validate
// ---------------------------------------------------------------------------

export function validate(params) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'coinbase-api',
  version: '1.0.0',
  description: 'Access Coinbase cryptocurrency data including spot prices, exchange rates, buy/sell prices, and supported currencies.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

export async function execute(params, context) {
  const { action } = params || {};

  if (!action) {
    return {
      result: 'Error: The "action" parameter is required. Supported actions: ' + VALID_ACTIONS.join(', ') + '.',
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  if (!VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Unknown action "${String(action)}". Supported actions: ${VALID_ACTIONS.join(', ')}.`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  switch (action) {
    case 'get_spot_price': return handleGetSpotPrice(params, context);
    case 'get_exchange_rates': return handleGetExchangeRates(params, context);
    case 'list_currencies': return handleListCurrencies(params, context);
    case 'get_buy_price': return handleGetBuyPrice(params, context);
    case 'get_sell_price': return handleGetSellPrice(params, context);
    default:
      return { result: `Error: Unknown action "${String(action)}".`, metadata: { success: false, error: 'INVALID_ACTION' } };
  }
}
