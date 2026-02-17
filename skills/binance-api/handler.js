/**
 * Binance API Skill Handler (Layer 1)
 *
 * Access Binance cryptocurrency market data including prices, order books,
 * tickers, symbols, and candlestick (kline) data.
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
  'get_price',
  'get_order_book',
  'get_ticker',
  'list_symbols',
  'get_klines',
];

const VALID_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

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
    result: 'Error: Provider client required for Binance data access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: 'PROVIDER_NOT_CONFIGURED',
    },
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
// Token / key redaction
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

export function sanitizeSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return undefined;
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function resolveLimit(limit) {
  if (typeof limit === 'number' && limit > 0) {
    return Math.min(Math.floor(limit), MAX_LIMIT);
  }
  return DEFAULT_LIMIT;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleGetPrice(params, context) {
  const symbol = sanitizeSymbol(params.symbol);
  if (!symbol) {
    return {
      result: 'Error: The "symbol" parameter is required (e.g. BTCUSDT).',
      metadata: { success: false, error: 'MISSING_SYMBOL' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/ticker/price?symbol=${symbol}`,
      null,
      timeoutMs,
    );

    const price = data?.price ?? data?.lastPrice ?? null;

    return {
      result: redactSensitive(`${symbol}: ${price ?? 'N/A'}`),
      metadata: {
        success: true,
        action: 'get_price',
        layer: 'L1',
        symbol,
        price: price !== null ? parseFloat(price) : null,
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

async function handleGetOrderBook(params, context) {
  const symbol = sanitizeSymbol(params.symbol);
  if (!symbol) {
    return {
      result: 'Error: The "symbol" parameter is required (e.g. BTCUSDT).',
      metadata: { success: false, error: 'MISSING_SYMBOL' },
    };
  }

  const limit = resolveLimit(params.limit);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/depth?symbol=${symbol}&limit=${limit}`,
      null,
      timeoutMs,
    );

    const bids = Array.isArray(data?.bids) ? data.bids.slice(0, limit) : [];
    const asks = Array.isArray(data?.asks) ? data.asks.slice(0, limit) : [];

    const lines = [
      `Order Book for ${symbol}`,
      `Bids: ${bids.length} | Asks: ${asks.length}`,
      '',
      'Top Bids:',
      ...bids.slice(0, 5).map((b, i) => `  ${i + 1}. Price: ${b[0]} | Qty: ${b[1]}`),
      '',
      'Top Asks:',
      ...asks.slice(0, 5).map((a, i) => `  ${i + 1}. Price: ${a[0]} | Qty: ${a[1]}`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_order_book',
        layer: 'L1',
        symbol,
        bidCount: bids.length,
        askCount: asks.length,
        bids,
        asks,
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

async function handleGetTicker(params, context) {
  const symbol = sanitizeSymbol(params.symbol);
  if (!symbol) {
    return {
      result: 'Error: The "symbol" parameter is required (e.g. BTCUSDT).',
      metadata: { success: false, error: 'MISSING_SYMBOL' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/ticker/24hr?symbol=${symbol}`,
      null,
      timeoutMs,
    );

    const lastPrice = data?.lastPrice ?? 'N/A';
    const priceChange = data?.priceChange ?? 'N/A';
    const priceChangePercent = data?.priceChangePercent ?? 'N/A';
    const high = data?.highPrice ?? 'N/A';
    const low = data?.lowPrice ?? 'N/A';
    const volume = data?.volume ?? 'N/A';
    const quoteVolume = data?.quoteVolume ?? 'N/A';

    const lines = [
      `24h Ticker for ${symbol}`,
      `Last Price: ${lastPrice}`,
      `Change: ${priceChange} (${priceChangePercent}%)`,
      `High: ${high} | Low: ${low}`,
      `Volume: ${volume}`,
      `Quote Volume: ${quoteVolume}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_ticker',
        layer: 'L1',
        symbol,
        lastPrice: data?.lastPrice ? parseFloat(data.lastPrice) : null,
        priceChange: data?.priceChange ? parseFloat(data.priceChange) : null,
        priceChangePercent: data?.priceChangePercent ? parseFloat(data.priceChangePercent) : null,
        highPrice: data?.highPrice ? parseFloat(data.highPrice) : null,
        lowPrice: data?.lowPrice ? parseFloat(data.lowPrice) : null,
        volume: data?.volume ? parseFloat(data.volume) : null,
        quoteVolume: data?.quoteVolume ? parseFloat(data.quoteVolume) : null,
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

async function handleListSymbols(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = resolveLimit(params.limit);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      '/exchangeInfo',
      null,
      timeoutMs,
    );

    const symbols = Array.isArray(data?.symbols)
      ? data.symbols
          .filter((s) => s.status === 'TRADING' || !s.status)
          .slice(0, limit)
          .map((s) => ({
            symbol: s.symbol,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
            status: s.status || 'TRADING',
          }))
      : [];

    const lines = [
      `Trading Symbols (${symbols.length}):`,
      '',
      ...symbols.map((s) => `  ${s.symbol} (${s.baseAsset}/${s.quoteAsset})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_symbols',
        layer: 'L1',
        count: symbols.length,
        symbols,
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

async function handleGetKlines(params, context) {
  const symbol = sanitizeSymbol(params.symbol);
  if (!symbol) {
    return {
      result: 'Error: The "symbol" parameter is required (e.g. BTCUSDT).',
      metadata: { success: false, error: 'MISSING_SYMBOL' },
    };
  }

  const interval = VALID_INTERVALS.includes(params.interval) ? params.interval : '1h';
  const limit = resolveLimit(params.limit);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      null,
      timeoutMs,
    );

    const klines = Array.isArray(data) ? data : (Array.isArray(data?.klines) ? data.klines : []);

    const parsed = klines.map((k) => {
      if (Array.isArray(k)) {
        return {
          openTime: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        };
      }
      return k;
    });

    const lines = [
      `Klines for ${symbol} (${interval}, ${parsed.length} candles):`,
      '',
      ...parsed.slice(0, 10).map((k) =>
        `  O: ${k.open} H: ${k.high} L: ${k.low} C: ${k.close} V: ${k.volume}`
      ),
      parsed.length > 10 ? `  ... and ${parsed.length - 10} more` : '',
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_klines',
        layer: 'L1',
        symbol,
        interval,
        count: parsed.length,
        klines: parsed,
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
    return {
      valid: false,
      error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'binance-api',
  version: '1.0.0',
  description: 'Access Binance cryptocurrency market data including prices, order books, tickers, symbols, and kline data.',
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
    case 'get_price':
      return handleGetPrice(params, context);
    case 'get_order_book':
      return handleGetOrderBook(params, context);
    case 'get_ticker':
      return handleGetTicker(params, context);
    case 'list_symbols':
      return handleListSymbols(params, context);
    case 'get_klines':
      return handleGetKlines(params, context);
    default:
      return {
        result: `Error: Unknown action "${String(action)}".`,
        metadata: { success: false, error: 'INVALID_ACTION' },
      };
  }
}
