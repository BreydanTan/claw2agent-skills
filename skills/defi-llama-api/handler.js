/**
 * DeFi Llama API Skill Handler (Layer 1)
 *
 * Query DeFi protocol TVL, yields, and chain data via DeFiLlama API.
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
  'get_protocol_tvl',
  'list_protocols',
  'get_chain_tvl',
  'get_yields',
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
    result: 'Error: Provider client required for DeFi Llama API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for DeFi Llama API access. Configure an API key or platform adapter.',
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
      throw {
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms.`,
      };
    }

    throw {
      code: 'UPSTREAM_ERROR',
      message: err.message || 'Unknown upstream error',
    };
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

function validateProtocol(protocol) {
  if (!protocol || typeof protocol !== 'string') {
    return { valid: false, error: 'The "protocol" parameter is required and must be a non-empty string.' };
  }
  const trimmed = protocol.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "protocol" parameter must not be empty.' };
  }
  return { valid: true, value: trimmed };
}

function validateChain(chain) {
  if (!chain || typeof chain !== 'string') {
    return { valid: false, error: 'The "chain" parameter is required and must be a non-empty string.' };
  }
  const trimmed = chain.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "chain" parameter must not be empty.' };
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
    case 'get_protocol_tvl': {
      const v = validateProtocol(params.protocol);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'list_protocols':
      return { valid: true };
    case 'get_chain_tvl': {
      const v = validateChain(params.chain);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'get_yields':
      return { valid: true };
    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleGetProtocolTvl(params, context) {
  const v = validateProtocol(params.protocol);
  if (!v.valid) {
    return {
      result: `Error: ${v.error}`,
      metadata: { success: false, action: 'get_protocol_tvl', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET', `/protocol/${encodeURIComponent(v.value)}`, {}, timeoutMs
    );

    const name = data?.name || v.value;
    const tvl = data?.tvl ?? 'N/A';
    const chains = data?.chains || [];
    const lines = [
      `Protocol TVL`,
      `Name: ${name}`,
      `TVL: $${typeof tvl === 'number' ? tvl.toLocaleString() : tvl}`,
      `Chains: ${chains.length > 0 ? chains.join(', ') : 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_protocol_tvl',
        protocol: v.value,
        tvl,
        chainCount: chains.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_protocol_tvl', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleListProtocols(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', '/protocols', {}, timeoutMs);

    const protocols = Array.isArray(data) ? data : (data?.protocols || []);
    const lines = [
      `Protocol List`,
      `Total: ${protocols.length} protocol(s)`,
      '',
      ...protocols.slice(0, 50).map((p, i) => {
        const name = p.name || 'Unknown';
        const tvl = typeof p.tvl === 'number' ? `$${p.tvl.toLocaleString()}` : 'N/A';
        const chain = p.chain || '';
        return `${i + 1}. ${name} — TVL: ${tvl}${chain ? ` (${chain})` : ''}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_protocols',
        protocolCount: protocols.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_protocols', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetChainTvl(params, context) {
  const v = validateChain(params.chain);
  if (!v.valid) {
    return {
      result: `Error: ${v.error}`,
      metadata: { success: false, action: 'get_chain_tvl', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET', `/v2/historicalChainTvl/${encodeURIComponent(v.value)}`, {}, timeoutMs
    );

    const points = Array.isArray(data) ? data : (data?.data || []);
    const lines = [
      `Chain TVL History`,
      `Chain: ${v.value}`,
      `Data points: ${points.length}`,
      '',
      ...points.slice(-10).map((p) => {
        const date = p.date ? new Date(p.date * 1000).toISOString().split('T')[0] : 'N/A';
        const tvl = typeof p.tvl === 'number' ? `$${p.tvl.toLocaleString()}` : 'N/A';
        return `${date}: ${tvl}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_chain_tvl',
        chain: v.value,
        dataPoints: points.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_chain_tvl', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetYields(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const pool = params.pool && typeof params.pool === 'string' ? params.pool.trim() : null;

  try {
    const path = pool ? `/pools?pool=${encodeURIComponent(pool)}` : '/pools';
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    const pools = data?.data || (Array.isArray(data) ? data : []);
    const lines = [
      `Yield Data`,
      pool ? `Pool filter: ${pool}` : 'All pools',
      `Results: ${pools.length} pool(s)`,
      '',
      ...pools.slice(0, 30).map((p, i) => {
        const project = p.project || 'Unknown';
        const chain = p.chain || '';
        const apy = typeof p.apy === 'number' ? `${p.apy.toFixed(2)}%` : 'N/A';
        return `${i + 1}. ${project}${chain ? ` (${chain})` : ''} — APY: ${apy}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_yields',
        poolFilter: pool,
        poolCount: pools.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_yields', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
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
      case 'get_protocol_tvl':
        return await handleGetProtocolTvl(params, context);
      case 'list_protocols':
        return await handleListProtocols(params, context);
      case 'get_chain_tvl':
        return await handleGetChainTvl(params, context);
      case 'get_yields':
        return await handleGetYields(params, context);
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
  name: 'defi-llama-api',
  version: '1.0.0',
  description: 'Query DeFi protocol TVL, yields, and chain data via DeFiLlama API.',
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
  validateProtocol,
  validateChain,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
