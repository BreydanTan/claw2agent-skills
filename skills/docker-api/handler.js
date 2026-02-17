/**
 * Docker Engine API Skill Handler (Layer 1)
 *
 * Interact with the Docker Engine API to list/inspect/start/stop containers,
 * list images, fetch container logs, and retrieve container resource stats.
 *
 * HIGH RISK: includes container ID sanitization to prevent injection.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 15s, max 30s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'list_containers',
  'get_container',
  'start_container',
  'stop_container',
  'list_images',
  'get_logs',
  'container_stats',
];

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const DEFAULT_STOP_TIMEOUT = 10;
const MIN_STOP_TIMEOUT = 0;
const MAX_STOP_TIMEOUT = 300;

const DEFAULT_TAIL = 100;
const MIN_TAIL = 1;
const MAX_TAIL = 1000;

const CONTAINER_ID_PATTERN = /^[A-Za-z0-9_.\-]+$/;
const MAX_CONTAINER_ID_LENGTH = 128;

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
    result: 'Error: Provider client required for Docker API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Docker API access. Configure an API key or platform adapter.',
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
 * @param {Object} opts - Additional options (query params, body, etc.)
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
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a container ID (alphanumeric, hyphens, underscores, dots; max 128 chars).
 * Prevents injection attacks via path traversal or shell metacharacters.
 *
 * @param {string} id
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function sanitizeContainerId(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'The "containerId" parameter is required and must be a non-empty string.' };
  }
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "containerId" parameter must not be empty.' };
  }
  if (trimmed.length > MAX_CONTAINER_ID_LENGTH) {
    return { valid: false, error: `The "containerId" parameter must not exceed ${MAX_CONTAINER_ID_LENGTH} characters.` };
  }
  if (!CONTAINER_ID_PATTERN.test(trimmed)) {
    return { valid: false, error: 'The "containerId" parameter must contain only alphanumeric characters, hyphens, underscores, and dots.' };
  }
  return { valid: true, sanitized: trimmed };
}

/**
 * Validate and clamp the "limit" parameter.
 *
 * @param {*} limit
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLimit(limit) {
  if (limit === undefined || limit === null) {
    return { valid: true, value: DEFAULT_LIMIT };
  }
  const num = Number(limit);
  if (!Number.isInteger(num) || num < MIN_LIMIT) {
    return { valid: false, error: `The "limit" parameter must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}.` };
  }
  return { valid: true, value: Math.min(num, MAX_LIMIT) };
}

/**
 * Validate the "timeout" parameter for stop_container (0-300 seconds).
 *
 * @param {*} timeout
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateStopTimeout(timeout) {
  if (timeout === undefined || timeout === null) {
    return { valid: true, value: DEFAULT_STOP_TIMEOUT };
  }
  const num = Number(timeout);
  if (!Number.isInteger(num) || num < MIN_STOP_TIMEOUT || num > MAX_STOP_TIMEOUT) {
    return { valid: false, error: `The "timeout" parameter must be an integer between ${MIN_STOP_TIMEOUT} and ${MAX_STOP_TIMEOUT}.` };
  }
  return { valid: true, value: num };
}

/**
 * Validate the "tail" parameter for get_logs (1-1000).
 *
 * @param {*} tail
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateTail(tail) {
  if (tail === undefined || tail === null) {
    return { valid: true, value: DEFAULT_TAIL };
  }
  const num = Number(tail);
  if (!Number.isInteger(num) || num < MIN_TAIL || num > MAX_TAIL) {
    return { valid: false, error: `The "tail" parameter must be an integer between ${MIN_TAIL} and ${MAX_TAIL}.` };
  }
  return { valid: true, value: num };
}

// ---------------------------------------------------------------------------
// Validate export (checks required params per action)
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
    case 'list_containers': {
      return { valid: true };
    }
    case 'get_container':
    case 'start_container':
    case 'stop_container':
    case 'get_logs':
    case 'container_stats': {
      const check = sanitizeContainerId(params.containerId);
      if (!check.valid) return { valid: false, error: check.error };
      return { valid: true };
    }
    case 'list_images': {
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
 * Handle list_containers -- GET /containers?all={all}&limit={limit}
 */
async function handleListContainers(params, context) {
  const limitValidation = validateLimit(params.limit);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = limitValidation.value;
  const all = params.all === true || params.all === 'true' ? 'true' : 'false';

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/containers?all=${all}&limit=${limit}`,
      {},
      timeoutMs
    );

    const containers = data?.containers || data?.data || [];
    const lines = [
      `Containers (${containers.length} results, all=${all})`,
      '',
      ...containers.map((c, i) => `${i + 1}. ${c.name || c.id || 'unknown'} [${c.status || 'unknown'}]`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_containers',
        layer: 'L1',
        all: all === 'true',
        limit,
        containerCount: containers.length,
        containers,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle get_container -- GET /containers/{containerId}
 */
async function handleGetContainer(params, context) {
  const idCheck = sanitizeContainerId(params.containerId);
  if (!idCheck.valid) {
    return {
      result: `Error: ${idCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const containerId = idCheck.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/containers/${containerId}`,
      {},
      timeoutMs
    );

    const container = data?.container || data || {};
    const lines = [
      `Container: ${container.name || containerId}`,
      container.id ? `ID: ${container.id}` : null,
      container.image ? `Image: ${container.image}` : null,
      container.status ? `Status: ${container.status}` : null,
      container.state ? `State: ${container.state}` : null,
      container.created ? `Created: ${container.created}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_container',
        layer: 'L1',
        containerId,
        container,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle start_container -- POST /containers/{containerId}/start
 */
async function handleStartContainer(params, context) {
  const idCheck = sanitizeContainerId(params.containerId);
  if (!idCheck.valid) {
    return {
      result: `Error: ${idCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const containerId = idCheck.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      `/containers/${containerId}/start`,
      {},
      timeoutMs
    );

    return {
      result: redactSensitive(`Container ${containerId} started successfully.`),
      metadata: {
        success: true,
        action: 'start_container',
        layer: 'L1',
        containerId,
        response: data || {},
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle stop_container -- POST /containers/{containerId}/stop?timeout={timeout}
 */
async function handleStopContainer(params, context) {
  const idCheck = sanitizeContainerId(params.containerId);
  if (!idCheck.valid) {
    return {
      result: `Error: ${idCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const timeoutValidation = validateStopTimeout(params.timeout);
  if (!timeoutValidation.valid) {
    return {
      result: `Error: ${timeoutValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const containerId = idCheck.sanitized;
  const stopTimeout = timeoutValidation.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      `/containers/${containerId}/stop?timeout=${stopTimeout}`,
      {},
      timeoutMs
    );

    return {
      result: redactSensitive(`Container ${containerId} stopped successfully (timeout=${stopTimeout}s).`),
      metadata: {
        success: true,
        action: 'stop_container',
        layer: 'L1',
        containerId,
        timeout: stopTimeout,
        response: data || {},
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle list_images -- GET /images?limit={limit}
 */
async function handleListImages(params, context) {
  const limitValidation = validateLimit(params.limit);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = limitValidation.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/images?limit=${limit}`,
      {},
      timeoutMs
    );

    const images = data?.images || data?.data || [];
    const lines = [
      `Images (${images.length} results)`,
      '',
      ...images.map((img, i) => `${i + 1}. ${img.repository || img.id || 'unknown'}:${img.tag || 'latest'} (${img.size || 'unknown'})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_images',
        layer: 'L1',
        limit,
        imageCount: images.length,
        images,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle get_logs -- GET /containers/{containerId}/logs?tail={tail}&timestamps={timestamps}
 */
async function handleGetLogs(params, context) {
  const idCheck = sanitizeContainerId(params.containerId);
  if (!idCheck.valid) {
    return {
      result: `Error: ${idCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const tailValidation = validateTail(params.tail);
  if (!tailValidation.valid) {
    return {
      result: `Error: ${tailValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const containerId = idCheck.sanitized;
  const tail = tailValidation.value;
  const timestamps = params.timestamps === false || params.timestamps === 'false' ? 'false' : 'true';

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/containers/${containerId}/logs?tail=${tail}&timestamps=${timestamps}`,
      {},
      timeoutMs
    );

    const logs = data?.logs || data?.output || data || '';
    const logText = typeof logs === 'string' ? logs : JSON.stringify(logs);

    const lines = [
      `Logs for container ${containerId} (tail=${tail}, timestamps=${timestamps})`,
      '',
      logText,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_logs',
        layer: 'L1',
        containerId,
        tail,
        timestamps: timestamps === 'true',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle container_stats -- GET /containers/{containerId}/stats
 */
async function handleContainerStats(params, context) {
  const idCheck = sanitizeContainerId(params.containerId);
  if (!idCheck.valid) {
    return {
      result: `Error: ${idCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const containerId = idCheck.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/containers/${containerId}/stats`,
      {},
      timeoutMs
    );

    const stats = data?.stats || data || {};
    const lines = [
      `Stats for container ${containerId}`,
      stats.cpu_percent !== undefined ? `CPU: ${stats.cpu_percent}%` : null,
      stats.memory_usage !== undefined ? `Memory: ${stats.memory_usage}` : null,
      stats.memory_limit !== undefined ? `Memory Limit: ${stats.memory_limit}` : null,
      stats.network_rx !== undefined ? `Network RX: ${stats.network_rx}` : null,
      stats.network_tx !== undefined ? `Network TX: ${stats.network_tx}` : null,
      stats.pids !== undefined ? `PIDs: ${stats.pids}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'container_stats',
        layer: 'L1',
        containerId,
        stats,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Docker API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: list_containers, get_container, start_container, stop_container, list_images, get_logs, container_stats
 * @param {string} [params.containerId] - Container ID or name (required for get_container, start_container, stop_container, get_logs, container_stats)
 * @param {boolean} [params.all=false] - Include stopped containers (list_containers)
 * @param {number} [params.limit=25] - Number of results (1-100)
 * @param {number} [params.timeout=10] - Stop timeout in seconds (0-300)
 * @param {number} [params.tail=100] - Number of log lines (1-1000)
 * @param {boolean} [params.timestamps=true] - Include timestamps in logs
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
      case 'list_containers':
        return await handleListContainers(params, context);
      case 'get_container':
        return await handleGetContainer(params, context);
      case 'start_container':
        return await handleStartContainer(params, context);
      case 'stop_container':
        return await handleStopContainer(params, context);
      case 'list_images':
        return await handleListImages(params, context);
      case 'get_logs':
        return await handleGetLogs(params, context);
      case 'container_stats':
        return await handleContainerStats(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: 'UPSTREAM_ERROR', detail: error.message },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'docker-api',
  version: '1.0.0',
  description: 'Docker Engine API interaction skill. List/inspect/start/stop containers, list images, fetch logs, and get container stats via provider client.',
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
  sanitizeContainerId,
  validateLimit,
  validateStopTimeout,
  validateTail,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
  DEFAULT_STOP_TIMEOUT,
  MIN_STOP_TIMEOUT,
  MAX_STOP_TIMEOUT,
  DEFAULT_TAIL,
  MIN_TAIL,
  MAX_TAIL,
  MAX_CONTAINER_ID_LENGTH,
};
