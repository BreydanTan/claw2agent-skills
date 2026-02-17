/**
 * Zapier Bridge Skill Handler (Layer 1)
 *
 * Manage and trigger Zapier Zaps, list executions, and check Zap status
 * via provider client.
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
  'list_zaps',
  'run_zap',
  'get_zap_status',
  'list_executions',
];

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the provider or gateway client from context.
 * L1 prefers providerClient; falls back to gatewayClient.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
function getClient(context) {
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
    result: 'Error: Provider client required for Zapier API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Zapier API access. Configure an API key or platform adapter.',
        retriable: false,
      },
    },
  };
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
 * Make a request through the provider client with timeout.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The resource path
 * @param {Object} opts - Additional options (body, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
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
// Input validation
// ---------------------------------------------------------------------------

/**
 * Validate params for a given action. Returns { valid: true } or { valid: false, error: string }.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'list_zaps': {
      // status is optional, no required params
      return { valid: true };
    }
    case 'run_zap': {
      if (!params.zapId || typeof params.zapId !== 'string') {
        return { valid: false, error: 'The "zapId" parameter is required and must be a non-empty string.' };
      }
      // If payload is a string, validate it is parseable JSON
      if (params.payload !== undefined && params.payload !== null && typeof params.payload === 'string') {
        try {
          JSON.parse(params.payload);
        } catch (_e) {
          return { valid: false, error: 'The "payload" parameter must be valid JSON when provided as a string.' };
        }
      }
      return { valid: true };
    }
    case 'get_zap_status': {
      if (!params.zapId || typeof params.zapId !== 'string') {
        return { valid: false, error: 'The "zapId" parameter is required and must be a non-empty string.' };
      }
      return { valid: true };
    }
    case 'list_executions': {
      if (!params.zapId || typeof params.zapId !== 'string') {
        return { valid: false, error: 'The "zapId" parameter is required and must be a non-empty string.' };
      }
      return { valid: true };
    }
    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle list_zaps -- GET /zaps?status=xxx
 */
async function handleListZaps(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const status = params.status || 'all';
  const path = `/zaps?status=${encodeURIComponent(status)}`;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      {},
      timeoutMs
    );

    const zaps = data?.zaps || [];
    const lines = [
      `Zapier Zaps (status: ${status})`,
      `Total: ${zaps.length}`,
      '',
      ...zaps.map((z, i) => {
        const stepsCount = z.steps ? z.steps.length : 0;
        return `${i + 1}. ${z.title || z.id} (${z.enabled ? 'enabled' : 'disabled'}, ${stepsCount} steps)`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_zaps',
        timestamp: new Date().toISOString(),
        status,
        zapCount: zaps.length,
        zaps,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_zaps', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

/**
 * Handle run_zap -- POST /zaps/{zapId}/execute body: payload
 */
async function handleRunZap(params, context) {
  if (!params.zapId || typeof params.zapId !== 'string') {
    return {
      result: 'Error: The "zapId" parameter is required and must be a non-empty string.',
      metadata: { success: false, action: 'run_zap', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const zapId = params.zapId;

  // Resolve payload
  let payload = params.payload || null;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_e) {
      return {
        result: 'Error: The "payload" parameter must be valid JSON when provided as a string.',
        metadata: { success: false, action: 'run_zap', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
      };
    }
  }

  const path = `/zaps/${encodeURIComponent(zapId)}/execute`;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      path,
      { body: payload },
      timeoutMs
    );

    const attemptId = data?.attempt_id || null;
    const lines = [
      `Zap Executed`,
      `Zap ID: ${zapId}`,
      `Status: ${data?.status || 'success'}`,
      attemptId ? `Execution ID: ${attemptId}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'run_zap',
        timestamp: new Date().toISOString(),
        zapId,
        attemptId,
        status: data?.status || 'success',
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'run_zap', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

/**
 * Handle get_zap_status -- GET /zaps/{zapId}
 */
async function handleGetZapStatus(params, context) {
  if (!params.zapId || typeof params.zapId !== 'string') {
    return {
      result: 'Error: The "zapId" parameter is required and must be a non-empty string.',
      metadata: { success: false, action: 'get_zap_status', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const zapId = params.zapId;
  const path = `/zaps/${encodeURIComponent(zapId)}`;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      {},
      timeoutMs
    );

    const enabled = data?.enabled ?? false;
    const status = data?.status || (enabled ? 'on' : 'off');
    const title = data?.title || zapId;

    const lines = [
      `Zap Status`,
      `ID: ${data?.id || zapId}`,
      `Title: ${title}`,
      `Enabled: ${enabled}`,
      `Status: ${status}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_zap_status',
        timestamp: new Date().toISOString(),
        zapId,
        enabled,
        status,
        title,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_zap_status', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

/**
 * Handle list_executions -- GET /zaps/{zapId}/executions?limit=xxx
 */
async function handleListExecutions(params, context) {
  if (!params.zapId || typeof params.zapId !== 'string') {
    return {
      result: 'Error: The "zapId" parameter is required and must be a non-empty string.',
      metadata: { success: false, action: 'list_executions', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const zapId = params.zapId;
  const limit = (typeof params.limit === 'number' && params.limit > 0) ? params.limit : 10;
  const path = `/zaps/${encodeURIComponent(zapId)}/executions?limit=${limit}`;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      {},
      timeoutMs
    );

    const executions = data?.executions || [];
    const lines = [
      `Zap Executions (${zapId})`,
      `Showing: ${executions.length} (limit: ${limit})`,
      '',
      ...executions.map((ex, i) => {
        const parts = [
          `${i + 1}. ${ex.id}`,
          `status=${ex.status}`,
          ex.started_at ? `started=${ex.started_at}` : null,
          ex.ended_at ? `ended=${ex.ended_at}` : null,
        ].filter(Boolean);
        return parts.join(' ');
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_executions',
        timestamp: new Date().toISOString(),
        zapId,
        limit,
        executionCount: executions.length,
        executions,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_executions', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Zapier Bridge operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: list_zaps, run_zap, get_zap_status, list_executions
 * @param {string} [params.status] - Filter by zap status (list_zaps only)
 * @param {string} [params.zapId] - The Zap identifier (required for run_zap, get_zap_status, list_executions)
 * @param {string|Object} [params.payload] - JSON payload for run_zap
 * @param {number} [params.limit] - Max results for list_executions
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() },
    };
  }

  try {
    switch (action) {
      case 'list_zaps':
        return await handleListZaps(params, context);
      case 'run_zap':
        return await handleRunZap(params, context);
      case 'get_zap_status':
        return await handleGetZapStatus(params, context);
      case 'list_executions':
        return await handleListExecutions(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, action, error: 'UPSTREAM_ERROR', detail: error.message, timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'zapier-bridge',
  version: '1.0.0',
  description: 'Manage and trigger Zapier Zaps, list executions, and check Zap status via provider client.',
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
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
