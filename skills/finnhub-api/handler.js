/**
 * Finnhub API Skill Handler (Layer 1)
 *
 * Access stock quotes, company profiles, and market news via Finnhub API.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 30s, max 120s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'get_quote',
  'get_profile',
  'search_symbol',
  'get_news',
];

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

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
    result: 'Error: Provider client required for Finnhub API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Finnhub API access. Configure an API key or platform adapter.',
        retriable: false,
      },
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

async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, null, {
      ...opts,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }

    throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' };
  }
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
];

function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

function validateSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    return { valid: false, error: 'The "symbol" parameter is required and must be a non-empty string.' };
  }
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "symbol" parameter must not be empty.' };
  }
  if (trimmed.length > 10) {
    return { valid: false, error: 'The "symbol" parameter must not exceed 10 characters.' };
  }
  return { valid: true, value: trimmed };
}

function validateQuery(query) {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'The "query" parameter is required and must be a non-empty string.' };
  }
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "query" parameter must not be empty.' };
  }
  return { valid: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Validate export
// ---------------------------------------------------------------------------

function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'get_quote': {
      const v = validateSymbol(params.symbol);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'get_profile': {
      const v = validateSymbol(params.symbol);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'search_symbol': {
      const v = validateQuery(params.query);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'get_news':
      return { valid: true };
    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleGetQuote(params, context) {
  const v = validateSymbol(params.symbol);
  if (!v.valid) {
    return {
      result: `Error: ${v.error}`,
      metadata: { success: false, action: 'get_quote', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET', `/quote?symbol=${encodeURIComponent(v.value)}`, {}, timeoutMs
    );

    const lines = [
      `Stock Quote: ${v.value}`,
      `Current: $${data?.c ?? 'N/A'}`,
      `Change: ${data?.d ?? 'N/A'} (${data?.dp ?? 'N/A'}%)`,
      `High: $${data?.h ?? 'N/A'}`,
      `Low: $${data?.l ?? 'N/A'}`,
      `Open: $${data?.o ?? 'N/A'}`,
      `Previous Close: $${data?.pc ?? 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_quote',
        symbol: v.value,
        currentPrice: data?.c,
        change: data?.d,
        changePercent: data?.dp,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_quote', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetProfile(params, context) {
  const v = validateSymbol(params.symbol);
  if (!v.valid) {
    return {
      result: `Error: ${v.error}`,
      metadata: { success: false, action: 'get_profile', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET', `/stock/profile2?symbol=${encodeURIComponent(v.value)}`, {}, timeoutMs
    );

    const lines = [
      `Company Profile: ${data?.name || v.value}`,
      `Ticker: ${data?.ticker || v.value}`,
      `Exchange: ${data?.exchange || 'N/A'}`,
      `IPO: ${data?.ipo || 'N/A'}`,
      `Market Cap: ${data?.marketCapitalization ? `$${data.marketCapitalization.toLocaleString()}M` : 'N/A'}`,
      `Currency: ${data?.currency || 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_profile',
        symbol: v.value,
        companyName: data?.name,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_profile', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleSearchSymbol(params, context) {
  const v = validateQuery(params.query);
  if (!v.valid) {
    return {
      result: `Error: ${v.error}`,
      metadata: { success: false, action: 'search_symbol', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET', `/search?q=${encodeURIComponent(v.value)}`, {}, timeoutMs
    );

    const results = data?.result || [];
    const lines = [
      `Symbol Search Results`,
      `Query: ${v.value}`,
      `Found: ${results.length} result(s)`,
      '',
      ...results.slice(0, 20).map((r, i) => {
        return `${i + 1}. ${r.symbol || 'N/A'} — ${r.description || 'No description'}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_symbol',
        query: v.value,
        resultCount: results.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'search_symbol', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetNews(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const category = (params.category && typeof params.category === 'string') ? params.category.trim() : 'general';
  const minId = typeof params.minId === 'number' ? params.minId : null;

  try {
    let path = `/news?category=${encodeURIComponent(category)}`;
    if (minId !== null) path += `&minId=${minId}`;

    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    const articles = Array.isArray(data) ? data : (data?.articles || []);
    const lines = [
      `Market News`,
      `Category: ${category}`,
      `Articles: ${articles.length}`,
      '',
      ...articles.slice(0, 20).map((a, i) => {
        const headline = a.headline || 'No headline';
        const source = a.source || '';
        return `${i + 1}. ${headline}${source ? ` (${source})` : ''}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_news',
        category,
        articleCount: articles.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_news', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

export async function execute(params, context) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() },
    };
  }

  try {
    switch (action) {
      case 'get_quote':
        return await handleGetQuote(params, context);
      case 'get_profile':
        return await handleGetProfile(params, context);
      case 'search_symbol':
        return await handleSearchSymbol(params, context);
      case 'get_news':
        return await handleGetNews(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'finnhub-api',
  version: '1.0.0',
  description: 'Access stock quotes, company profiles, and market news via Finnhub API.',
  actions: VALID_ACTIONS,
};

// Export validate and internals for testing
export {
  validate,
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
};
