/**
 * Stock & Crypto Analyzer Skill Handler (Layer 2)
 *
 * Provides real-time market quotes, technical analysis, symbol comparison,
 * and price alert watchlists for stocks and cryptocurrencies.
 *
 * L2 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external data access goes through injected gateway/provider clients
 * - Enforces timeout, retry with exponential backoff + jitter, and cost limits
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'quote', 'analyze', 'compare',
  'watchlist_add', 'watchlist_remove', 'watchlist_list',
  'alert',
];

const EXTERNAL_ACTIONS = ['quote', 'analyze', 'compare', 'alert'];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

const VALID_PERIODS = ['1w', '1m', '3m', '6m', '1y'];
const VALID_TYPES = ['stock', 'crypto'];

// ---------------------------------------------------------------------------
// In-memory watchlist (module-level Map, persists for process lifetime)
// ---------------------------------------------------------------------------

const watchlist = new Map();

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the gateway or provider client from context.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
function getClient(context) {
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  return null;
}

/**
 * Return the standard PROVIDER_NOT_CONFIGURED error response.
 *
 * @returns {{ result: string, metadata: Object }}
 */
function providerNotConfiguredError() {
  return {
    result: 'Error: Gateway client required for market data access. Configure the platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Gateway client required for market data access. Configure the platform adapter.',
        retriable: false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

/**
 * Check whether the estimated cost is within budget.
 *
 * @param {Object} context - Execution context with optional config.maxCostUsd
 * @param {number} estimatedCost - Estimated cost in USD for this call
 * @returns {{ ok: boolean, error?: Object }}
 */
function checkCostLimit(context, estimatedCost) {
  const maxCost = context?.config?.maxCostUsd;
  if (maxCost !== undefined && maxCost !== null && estimatedCost > maxCost) {
    return {
      ok: false,
      error: {
        result: `Error: Estimated cost $${estimatedCost.toFixed(4)} exceeds limit $${maxCost.toFixed(2)}.`,
        metadata: {
          success: false,
          error: {
            code: 'COST_LIMIT_EXCEEDED',
            message: `Estimated cost $${estimatedCost.toFixed(4)} exceeds configured limit of $${maxCost.toFixed(2)}.`,
            retriable: false,
          },
        },
      },
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fetch with timeout, retry, exponential backoff + jitter
// ---------------------------------------------------------------------------

/**
 * Sleep for a given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute backoff with jitter.
 *
 * @param {number} attempt - Zero-indexed attempt number
 * @returns {number} Delay in ms
 */
function backoffWithJitter(attempt) {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.random() * base * 0.5;
  return Math.min(base + jitter, MAX_TIMEOUT_MS);
}

/**
 * Fetch data through the gateway client with timeout, retry, and backoff.
 *
 * @param {Object} client - The gateway or provider client (must have .fetch())
 * @param {string} endpoint - The resource/endpoint identifier
 * @param {Object} options - Fetch options (params, etc.)
 * @param {number} timeoutMs - Timeout per attempt in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On unrecoverable failure
 */
async function fetchWithRetry(client, endpoint, options, timeoutMs) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(backoffWithJitter(attempt - 1));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await client.fetch(endpoint, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timer);
      return response;
    } catch (err) {
      lastError = err;

      // Abort = timeout, do not retry
      if (err.name === 'AbortError') {
        throw {
          code: 'TIMEOUT',
          message: `Request timed out after ${timeoutMs}ms.`,
        };
      }

      // Last attempt: throw
      if (attempt === MAX_RETRIES) {
        break;
      }
    }
  }

  throw {
    code: 'NETWORK_ERROR',
    message: `Network error after ${MAX_RETRIES + 1} attempts: ${lastError?.message || 'unknown'}`,
  };
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
];

/**
 * Redact sensitive tokens/keys from a string.
 *
 * @param {string} text
 * @returns {string}
 */
function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Technical analysis helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Compute Simple Moving Average over the last N data points.
 *
 * @param {number[]} data - Array of numeric values (closing prices)
 * @param {number} period - Number of periods
 * @returns {number|null} SMA value or null if insufficient data
 */
export function computeSMA(data, period) {
  if (!Array.isArray(data) || data.length < period || period <= 0) return null;
  const slice = data.slice(data.length - period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / period;
}

/**
 * Compute Relative Strength Index (RSI).
 *
 * @param {number[]} data - Array of closing prices
 * @param {number} [period=14] - RSI period
 * @returns {number|null} RSI value (0-100) or null if insufficient data
 */
export function computeRSI(data, period = 14) {
  if (!Array.isArray(data) || data.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smooth with Wilder's method for remaining data
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Compute MACD (Moving Average Convergence Divergence).
 *
 * @param {number[]} data - Array of closing prices
 * @param {number} [fast=12] - Fast EMA period
 * @param {number} [slow=26] - Slow EMA period
 * @param {number} [signal=9] - Signal line period
 * @returns {{ macdLine: number, signalLine: number, histogram: number }|null}
 */
export function computeMACD(data, fast = 12, slow = 26, signal = 9) {
  if (!Array.isArray(data) || data.length < slow + signal) return null;

  function ema(values, period) {
    const k = 2 / (period + 1);
    let emaCurrent = values[0];
    const result = [emaCurrent];
    for (let i = 1; i < values.length; i++) {
      emaCurrent = values[i] * k + emaCurrent * (1 - k);
      result.push(emaCurrent);
    }
    return result;
  }

  const fastEma = ema(data, fast);
  const slowEma = ema(data, slow);

  // MACD line = fastEMA - slowEMA
  const macdLine = fastEma.map((v, i) => v - slowEma[i]);

  // Signal line = EMA of MACD line
  const signalEma = ema(macdLine, signal);

  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalEma[signalEma.length - 1];

  return {
    macdLine: lastMacd,
    signalLine: lastSignal,
    histogram: lastMacd - lastSignal,
  };
}

/**
 * Compute Bollinger Bands (20-period SMA +/- 2 standard deviations).
 *
 * @param {number[]} data - Array of closing prices
 * @param {number} [period=20] - SMA period
 * @param {number} [multiplier=2] - Standard deviation multiplier
 * @returns {{ upper: number, middle: number, lower: number }|null}
 */
export function computeBollingerBands(data, period = 20, multiplier = 2) {
  if (!Array.isArray(data) || data.length < period || period <= 0) return null;

  const slice = data.slice(data.length - period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: middle + multiplier * stdDev,
    middle,
    lower: middle - multiplier * stdDev,
  };
}

/**
 * Detect simple support and resistance levels from price data.
 *
 * @param {number[]} data - Array of closing prices
 * @returns {{ support: number, resistance: number }}
 */
export function computeSupportResistance(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { support: 0, resistance: 0 };
  }

  const recent = data.slice(-60);
  const support = Math.min(...recent);
  const resistance = Math.max(...recent);
  return { support, resistance };
}

/**
 * Generate a recommendation based on technical indicators.
 *
 * @param {Object} indicators
 * @returns {"strong_buy"|"buy"|"hold"|"sell"|"strong_sell"}
 */
export function generateRecommendation(indicators) {
  let score = 0;
  const { rsi, macd, sma20, sma50, sma200, price, bollingerBands } = indicators;

  // RSI signals
  if (rsi !== null && rsi !== undefined) {
    if (rsi < 30) score += 2;       // oversold = buy signal
    else if (rsi < 40) score += 1;
    else if (rsi > 70) score -= 2;  // overbought = sell signal
    else if (rsi > 60) score -= 1;
  }

  // MACD signals
  if (macd) {
    if (macd.histogram > 0) score += 1;  // bullish
    else if (macd.histogram < 0) score -= 1;  // bearish

    if (macd.macdLine > macd.signalLine) score += 1;
    else score -= 1;
  }

  // Price vs SMA signals
  if (price && sma20) {
    if (price > sma20) score += 1;
    else score -= 1;
  }
  if (price && sma50) {
    if (price > sma50) score += 1;
    else score -= 1;
  }
  if (price && sma200) {
    if (price > sma200) score += 1;
    else score -= 1;
  }

  // Bollinger Band signals
  if (bollingerBands && price) {
    if (price <= bollingerBands.lower) score += 1;  // near lower band = potential buy
    else if (price >= bollingerBands.upper) score -= 1;  // near upper band = potential sell
  }

  if (score >= 5) return 'strong_buy';
  if (score >= 2) return 'buy';
  if (score <= -5) return 'strong_sell';
  if (score <= -2) return 'sell';
  return 'hold';
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
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle the "quote" action - get current price/quote for a symbol.
 */
async function handleQuote(params, context) {
  const { symbol, type = 'stock' } = params;

  if (!symbol || typeof symbol !== 'string') {
    return {
      result: 'Error: The "symbol" parameter is required for quote action.',
      metadata: { success: false, error: 'MISSING_SYMBOL' },
    };
  }

  if (!VALID_TYPES.includes(type)) {
    return {
      result: `Error: Invalid type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_TYPE' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const costCheck = checkCostLimit(context, 0.01);
  if (!costCheck.ok) return costCheck.error;

  const timeoutMs = resolveTimeout(context);
  const normalizedSymbol = symbol.toUpperCase().trim();

  try {
    const data = await fetchWithRetry(
      resolved.client,
      'market-data/quote',
      { params: { symbol: normalizedSymbol, type } },
      timeoutMs
    );

    const quote = data?.quote || data || {};

    const result = [
      `${normalizedSymbol} (${type.toUpperCase()}) Quote`,
      `Price: $${quote.price ?? 'N/A'}`,
      `Change: ${quote.change ?? 'N/A'} (${quote.changePercent ?? 'N/A'}%)`,
      `Volume: ${quote.volume ?? 'N/A'}`,
      `High: $${quote.high ?? 'N/A'} | Low: $${quote.low ?? 'N/A'}`,
      `Open: $${quote.open ?? 'N/A'} | Prev Close: $${quote.previousClose ?? 'N/A'}`,
      `Market Cap: ${quote.marketCap ?? 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'quote',
        layer: 'L2',
        symbol: normalizedSymbol,
        type,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: quote.volume,
        high: quote.high,
        low: quote.low,
        open: quote.open,
        previousClose: quote.previousClose,
        marketCap: quote.marketCap,
        timestamp: quote.timestamp || new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * Handle the "analyze" action - technical analysis of a symbol.
 */
async function handleAnalyze(params, context) {
  const { symbol, type = 'stock', period = '1m' } = params;

  if (!symbol || typeof symbol !== 'string') {
    return {
      result: 'Error: The "symbol" parameter is required for analyze action.',
      metadata: { success: false, error: 'MISSING_SYMBOL' },
    };
  }

  if (!VALID_TYPES.includes(type)) {
    return {
      result: `Error: Invalid type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_TYPE' },
    };
  }

  if (!VALID_PERIODS.includes(period)) {
    return {
      result: `Error: Invalid period "${period}". Must be one of: ${VALID_PERIODS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_PERIOD' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const costCheck = checkCostLimit(context, 0.05);
  if (!costCheck.ok) return costCheck.error;

  const timeoutMs = resolveTimeout(context);
  const normalizedSymbol = symbol.toUpperCase().trim();

  try {
    const data = await fetchWithRetry(
      resolved.client,
      'market-data/historical',
      { params: { symbol: normalizedSymbol, type, period } },
      timeoutMs
    );

    const prices = data?.prices || data?.closingPrices || data || [];

    if (!Array.isArray(prices) || prices.length === 0) {
      return {
        result: `Error: No historical data available for ${normalizedSymbol}.`,
        metadata: { success: false, error: 'NO_DATA' },
      };
    }

    const currentPrice = prices[prices.length - 1];
    const sma20 = computeSMA(prices, 20);
    const sma50 = computeSMA(prices, 50);
    const sma200 = computeSMA(prices, 200);
    const rsi = computeRSI(prices);
    const macd = computeMACD(prices);
    const bollingerBands = computeBollingerBands(prices);
    const { support, resistance } = computeSupportResistance(prices);

    const recommendation = generateRecommendation({
      rsi, macd, sma20, sma50, sma200, price: currentPrice, bollingerBands,
    });

    const lines = [
      `Technical Analysis: ${normalizedSymbol} (${type.toUpperCase()}) - ${period}`,
      `Current Price: $${currentPrice.toFixed(2)}`,
      '',
      '--- Moving Averages ---',
      `SMA(20): ${sma20 !== null ? '$' + sma20.toFixed(2) : 'N/A'}`,
      `SMA(50): ${sma50 !== null ? '$' + sma50.toFixed(2) : 'N/A'}`,
      `SMA(200): ${sma200 !== null ? '$' + sma200.toFixed(2) : 'N/A'}`,
      '',
      '--- Oscillators ---',
      `RSI(14): ${rsi !== null ? rsi.toFixed(2) : 'N/A'}`,
      `MACD: ${macd ? macd.macdLine.toFixed(4) : 'N/A'}`,
      `MACD Signal: ${macd ? macd.signalLine.toFixed(4) : 'N/A'}`,
      `MACD Histogram: ${macd ? macd.histogram.toFixed(4) : 'N/A'}`,
      '',
      '--- Bollinger Bands ---',
      `Upper: ${bollingerBands ? '$' + bollingerBands.upper.toFixed(2) : 'N/A'}`,
      `Middle: ${bollingerBands ? '$' + bollingerBands.middle.toFixed(2) : 'N/A'}`,
      `Lower: ${bollingerBands ? '$' + bollingerBands.lower.toFixed(2) : 'N/A'}`,
      '',
      '--- Support / Resistance ---',
      `Support: $${support.toFixed(2)}`,
      `Resistance: $${resistance.toFixed(2)}`,
      '',
      `Recommendation: ${recommendation.toUpperCase()}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'analyze',
        layer: 'L2',
        symbol: normalizedSymbol,
        type,
        period,
        currentPrice,
        indicators: {
          sma20, sma50, sma200,
          rsi,
          macd,
          bollingerBands,
          support,
          resistance,
        },
        recommendation,
        dataPoints: prices.length,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * Handle the "compare" action - compare multiple symbols.
 */
async function handleCompare(params, context) {
  const { symbols, type = 'stock', period = '1m' } = params;

  if (!Array.isArray(symbols) || symbols.length < 2) {
    return {
      result: 'Error: The "symbols" parameter must be an array of at least 2 symbols.',
      metadata: { success: false, error: 'INVALID_SYMBOLS' },
    };
  }

  if (!VALID_TYPES.includes(type)) {
    return {
      result: `Error: Invalid type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_TYPE' },
    };
  }

  if (!VALID_PERIODS.includes(period)) {
    return {
      result: `Error: Invalid period "${period}". Must be one of: ${VALID_PERIODS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_PERIOD' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const costPerSymbol = 0.02;
  const totalCost = costPerSymbol * symbols.length;
  const costCheck = checkCostLimit(context, totalCost);
  if (!costCheck.ok) return costCheck.error;

  const timeoutMs = resolveTimeout(context);
  const comparisons = [];

  for (const rawSymbol of symbols) {
    const sym = rawSymbol.toUpperCase().trim();
    try {
      const data = await fetchWithRetry(
        resolved.client,
        'market-data/historical',
        { params: { symbol: sym, type, period } },
        timeoutMs
      );

      const prices = data?.prices || data?.closingPrices || data || [];

      if (Array.isArray(prices) && prices.length >= 2) {
        const first = prices[0];
        const last = prices[prices.length - 1];
        const changePercent = ((last - first) / first) * 100;
        const volume = data?.volume ?? null;

        comparisons.push({
          symbol: sym,
          startPrice: first,
          endPrice: last,
          changePercent,
          volume,
          dataPoints: prices.length,
        });
      } else {
        comparisons.push({
          symbol: sym,
          error: 'Insufficient data',
        });
      }
    } catch (err) {
      comparisons.push({
        symbol: sym,
        error: redactSensitive(err.message || 'Fetch failed'),
      });
    }
  }

  // Sort by performance (best first)
  const ranked = [...comparisons]
    .filter((c) => !c.error)
    .sort((a, b) => b.changePercent - a.changePercent);

  const lines = [
    `Symbol Comparison (${type.toUpperCase()}) - ${period}`,
    '',
  ];

  for (let i = 0; i < comparisons.length; i++) {
    const c = comparisons[i];
    if (c.error) {
      lines.push(`${c.symbol}: Error - ${c.error}`);
    } else {
      const rank = ranked.findIndex((r) => r.symbol === c.symbol) + 1;
      lines.push(
        `${c.symbol}: $${c.startPrice.toFixed(2)} -> $${c.endPrice.toFixed(2)} ` +
        `(${c.changePercent >= 0 ? '+' : ''}${c.changePercent.toFixed(2)}%) ` +
        `${c.volume !== null ? '| Vol: ' + c.volume : ''}` +
        ` [Rank: ${rank}/${ranked.length}]`
      );
    }
  }

  return {
    result: redactSensitive(lines.join('\n')),
    metadata: {
      success: true,
      action: 'compare',
      layer: 'L2',
      type,
      period,
      comparisons,
      ranking: ranked.map((r) => r.symbol),
    },
  };
}

/**
 * Handle watchlist_add - add a symbol to the in-memory watchlist.
 */
function handleWatchlistAdd(params) {
  const { symbol, type = 'stock', targetPrice, alertType = 'above' } = params;

  if (!symbol || typeof symbol !== 'string') {
    return {
      result: 'Error: The "symbol" parameter is required for watchlist_add.',
      metadata: { success: false, error: 'MISSING_SYMBOL' },
    };
  }

  const normalizedSymbol = symbol.toUpperCase().trim();

  const entry = {
    symbol: normalizedSymbol,
    type,
    addedAt: new Date().toISOString(),
  };

  if (targetPrice !== undefined && targetPrice !== null) {
    entry.targetPrice = targetPrice;
    entry.alertType = alertType === 'below' ? 'below' : 'above';
  }

  watchlist.set(normalizedSymbol, entry);

  return {
    result: `Added ${normalizedSymbol} to watchlist.` +
      (entry.targetPrice ? ` Alert when price goes ${entry.alertType} $${entry.targetPrice}.` : ''),
    metadata: {
      success: true,
      action: 'watchlist_add',
      layer: 'L2',
      symbol: normalizedSymbol,
      entry,
    },
  };
}

/**
 * Handle watchlist_remove - remove a symbol from the watchlist.
 */
function handleWatchlistRemove(params) {
  const { symbol } = params;

  if (!symbol || typeof symbol !== 'string') {
    return {
      result: 'Error: The "symbol" parameter is required for watchlist_remove.',
      metadata: { success: false, error: 'MISSING_SYMBOL' },
    };
  }

  const normalizedSymbol = symbol.toUpperCase().trim();

  if (!watchlist.has(normalizedSymbol)) {
    return {
      result: `Symbol ${normalizedSymbol} is not in the watchlist.`,
      metadata: {
        success: false,
        error: 'NOT_FOUND',
        symbol: normalizedSymbol,
      },
    };
  }

  watchlist.delete(normalizedSymbol);

  return {
    result: `Removed ${normalizedSymbol} from watchlist.`,
    metadata: {
      success: true,
      action: 'watchlist_remove',
      layer: 'L2',
      symbol: normalizedSymbol,
    },
  };
}

/**
 * Handle watchlist_list - list all watchlist entries.
 */
function handleWatchlistList() {
  const entries = Array.from(watchlist.values());

  if (entries.length === 0) {
    return {
      result: 'Watchlist is empty.',
      metadata: {
        success: true,
        action: 'watchlist_list',
        layer: 'L2',
        count: 0,
        entries: [],
      },
    };
  }

  const lines = entries.map((e) => {
    let line = `${e.symbol} (${e.type})`;
    if (e.targetPrice !== undefined) {
      line += ` | Alert: ${e.alertType} $${e.targetPrice}`;
    }
    return line;
  });

  return {
    result: `Watchlist (${entries.length} symbol(s)):\n${lines.join('\n')}`,
    metadata: {
      success: true,
      action: 'watchlist_list',
      layer: 'L2',
      count: entries.length,
      entries,
    },
  };
}

/**
 * Handle the "alert" action - check if watchlist symbols hit their targets.
 */
async function handleAlert(context) {
  const entries = Array.from(watchlist.values()).filter(
    (e) => e.targetPrice !== undefined
  );

  if (entries.length === 0) {
    return {
      result: 'No alerts configured. Add symbols with targetPrice to the watchlist first.',
      metadata: {
        success: true,
        action: 'alert',
        layer: 'L2',
        triggered: [],
        checked: 0,
      },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const costPerSymbol = 0.01;
  const totalCost = costPerSymbol * entries.length;
  const costCheck = checkCostLimit(context, totalCost);
  if (!costCheck.ok) return costCheck.error;

  const timeoutMs = resolveTimeout(context);
  const triggered = [];

  for (const entry of entries) {
    try {
      const data = await fetchWithRetry(
        resolved.client,
        'market-data/quote',
        { params: { symbol: entry.symbol, type: entry.type } },
        timeoutMs
      );

      const price = data?.quote?.price ?? data?.price ?? null;

      if (price !== null) {
        const isTriggered =
          (entry.alertType === 'above' && price >= entry.targetPrice) ||
          (entry.alertType === 'below' && price <= entry.targetPrice);

        if (isTriggered) {
          triggered.push({
            symbol: entry.symbol,
            type: entry.type,
            currentPrice: price,
            targetPrice: entry.targetPrice,
            alertType: entry.alertType,
          });
        }
      }
    } catch {
      // Skip symbols that fail to fetch
    }
  }

  if (triggered.length === 0) {
    return {
      result: `Checked ${entries.length} alert(s). No alerts triggered.`,
      metadata: {
        success: true,
        action: 'alert',
        layer: 'L2',
        triggered: [],
        checked: entries.length,
      },
    };
  }

  const lines = triggered.map(
    (t) =>
      `${t.symbol}: $${t.currentPrice} has gone ${t.alertType} target $${t.targetPrice}`
  );

  return {
    result: `${triggered.length} alert(s) triggered:\n${lines.join('\n')}`,
    metadata: {
      success: true,
      action: 'alert',
      layer: 'L2',
      triggered,
      checked: entries.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a stock/crypto analyzer operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: quote, analyze, compare, watchlist_add, watchlist_remove, watchlist_list, alert
 * @param {string} [params.symbol] - Ticker symbol
 * @param {string[]} [params.symbols] - Array of symbols for compare
 * @param {string} [params.type="stock"] - "stock" or "crypto"
 * @param {string} [params.period="1m"] - Historical period
 * @param {number} [params.targetPrice] - Target price for watchlist alert
 * @param {string} [params.alertType="above"] - "above" or "below"
 * @param {Object} context - Execution context (must contain gatewayClient or providerClient for L2 actions)
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
      case 'quote':
        return await handleQuote(params, context);
      case 'analyze':
        return await handleAnalyze(params, context);
      case 'compare':
        return await handleCompare(params, context);
      case 'watchlist_add':
        return handleWatchlistAdd(params);
      case 'watchlist_remove':
        return handleWatchlistRemove(params);
      case 'watchlist_list':
        return handleWatchlistList();
      case 'alert':
        return await handleAlert(context);
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

// Export internals for testing
export {
  getClient,
  checkCostLimit,
  redactSensitive,
  fetchWithRetry,
  backoffWithJitter,
  watchlist,
  sleep,
};
