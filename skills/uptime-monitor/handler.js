/**
 * Website Uptime Monitor Skill Handler
 *
 * Monitors website availability by registering URLs, performing HTTP
 * health checks, and tracking uptime history. Uses an in-memory Map
 * store -- no external dependencies required.
 *
 * SECURITY NOTES:
 * - Blocks requests to private/internal IP ranges (SSRF protection).
 * - Blocks non-http(s) schemes.
 * - Enforces timeout caps (default 10s, max 30s).
 * - No authentication/credential handling.
 * - No arbitrary code execution paths.
 * - No shell commands.
 */

// ---------------------------------------------------------------------------
// In-memory stores (module-level so they persist across calls)
// ---------------------------------------------------------------------------

const monitorStore = new Map();
const historyStore = new Map();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT = 10000;
const MAX_TIMEOUT = 30000;
const DEFAULT_INTERVAL = 5;
const DEFAULT_EXPECTED_STATUS = 200;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_PER_MONITOR = 100;

// ---------------------------------------------------------------------------
// SSRF Protection
// ---------------------------------------------------------------------------

/**
 * Private/internal IP patterns for SSRF protection.
 * Blocks: 127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 0.0.0.0,
 *         ::1, localhost, and link-local addresses.
 */
const PRIVATE_IP_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
];

const BLOCKED_HOSTNAMES = ['localhost', 'localhost.localdomain', '[::1]'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 string using only built-in Math.random.
 * Not cryptographically secure, but sufficient for in-memory IDs.
 *
 * @returns {string}
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate and sanitize a URL for monitoring.
 * Returns the parsed URL object or throws with an error code.
 *
 * @param {string} rawUrl - The raw URL string from the user
 * @returns {URL} Parsed and validated URL
 */
function validateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw { code: 'INVALID_URL', message: 'URL is required and must be a non-empty string.' };
  }

  const trimmed = rawUrl.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw { code: 'INVALID_URL', message: `Invalid URL format: "${trimmed}"` };
  }

  // Enforce http or https only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw {
      code: 'INVALID_URL',
      message: `Only http:// and https:// URLs are allowed. Received protocol: "${parsed.protocol}"`,
    };
  }

  // Block private/internal hostnames
  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw {
      code: 'BLOCKED_URL',
      message: `Requests to "${hostname}" are blocked for security reasons.`,
    };
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw {
        code: 'BLOCKED_URL',
        message: 'Requests to private/internal IP addresses are blocked for security reasons.',
      };
    }
  }

  return parsed;
}

/**
 * Clamp a timeout value within allowed bounds.
 *
 * @param {number|undefined} rawTimeout
 * @returns {number}
 */
function clampTimeout(rawTimeout) {
  if (rawTimeout === undefined || rawTimeout === null || typeof rawTimeout !== 'number') {
    return DEFAULT_TIMEOUT;
  }
  return Math.min(Math.max(1, rawTimeout), MAX_TIMEOUT);
}

/**
 * Format a monitor object into a human-readable string.
 *
 * @param {Object} monitor
 * @returns {string}
 */
function formatMonitor(monitor) {
  const parts = [
    `  ID: ${monitor.id}`,
    `  URL: ${monitor.url}`,
  ];
  if (monitor.name) parts.push(`  Name: ${monitor.name}`);
  parts.push(`  Interval: ${monitor.interval}min`);
  parts.push(`  Expected Status: ${monitor.expectedStatus}`);
  parts.push(`  Timeout: ${monitor.timeout}ms`);
  parts.push(`  Created: ${monitor.createdAt}`);
  return parts.join('\n');
}

/**
 * Compute uptime percentage for a monitor from its history.
 *
 * @param {string} monitorId
 * @returns {number} Uptime percentage (0-100), or 100 if no history
 */
function computeUptimePercent(monitorId) {
  const history = historyStore.get(monitorId);
  if (!history || history.length === 0) return 100;

  const upCount = history.filter((entry) => entry.isUp).length;
  return Math.round((upCount / history.length) * 10000) / 100;
}

/**
 * Get the last check entry for a monitor.
 *
 * @param {string} monitorId
 * @returns {Object|null}
 */
function getLastCheck(monitorId) {
  const history = historyStore.get(monitorId);
  if (!history || history.length === 0) return null;
  return history[history.length - 1];
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

/**
 * Register a new URL to monitor.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleAdd(params) {
  const { url: rawUrl, name, interval, expectedStatus, timeout } = params;

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = validateUrl(rawUrl);
  } catch (err) {
    return {
      result: `Error: ${err.message}`,
      metadata: { success: false, error: err.code || 'INVALID_URL' },
    };
  }

  const normalizedUrl = parsedUrl.toString();
  const monitorName = name && typeof name === 'string' ? name.trim() : null;
  const monitorInterval = typeof interval === 'number' && interval > 0 ? interval : DEFAULT_INTERVAL;
  const monitorExpectedStatus = typeof expectedStatus === 'number' && expectedStatus >= 100 && expectedStatus < 600
    ? expectedStatus
    : DEFAULT_EXPECTED_STATUS;
  const monitorTimeout = clampTimeout(timeout);

  const id = generateId();
  const monitor = {
    id,
    url: normalizedUrl,
    name: monitorName,
    interval: monitorInterval,
    expectedStatus: monitorExpectedStatus,
    timeout: monitorTimeout,
    createdAt: new Date().toISOString(),
  };

  monitorStore.set(id, monitor);
  historyStore.set(id, []);

  return {
    result: `Monitor registered successfully.\n\n${formatMonitor(monitor)}`,
    metadata: {
      success: true,
      action: 'add',
      monitorId: id,
      monitor,
    },
  };
}

/**
 * Remove a monitor by ID.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleRemove(params) {
  const { id } = params;

  if (!id || typeof id !== 'string') {
    return {
      result: 'Error: The "id" parameter is required for remove.',
      metadata: { success: false, error: 'MISSING_ID' },
    };
  }

  const existing = monitorStore.get(id);
  if (!existing) {
    return {
      result: `Error: No monitor found with id "${id}".`,
      metadata: { success: false, error: 'MONITOR_NOT_FOUND' },
    };
  }

  monitorStore.delete(id);
  historyStore.delete(id);

  return {
    result: `Monitor "${existing.name || existing.url}" (${id}) removed successfully.`,
    metadata: {
      success: true,
      action: 'remove',
      monitorId: id,
      removedMonitor: existing,
    },
  };
}

/**
 * Perform a single HTTP health check.
 * Accepts either a monitor ID or a raw URL.
 *
 * @param {Object} params
 * @returns {Promise<{result: string, metadata: object}>}
 */
async function handleCheck(params) {
  const { id, url: rawUrl, timeout: rawTimeout } = params;

  let targetUrl;
  let monitorId = null;
  let expectedStatus = DEFAULT_EXPECTED_STATUS;
  let timeout;

  // Resolve target: by monitor ID or by raw URL
  if (id && typeof id === 'string') {
    const monitor = monitorStore.get(id);
    if (!monitor) {
      return {
        result: `Error: No monitor found with id "${id}".`,
        metadata: { success: false, error: 'MONITOR_NOT_FOUND' },
      };
    }
    targetUrl = monitor.url;
    monitorId = id;
    expectedStatus = monitor.expectedStatus;
    timeout = clampTimeout(rawTimeout !== undefined ? rawTimeout : monitor.timeout);
  } else if (rawUrl) {
    let parsedUrl;
    try {
      parsedUrl = validateUrl(rawUrl);
    } catch (err) {
      return {
        result: `Error: ${err.message}`,
        metadata: { success: false, error: err.code || 'INVALID_URL' },
      };
    }
    targetUrl = parsedUrl.toString();
    timeout = clampTimeout(rawTimeout);
  } else {
    return {
      result: 'Error: Either "id" or "url" parameter is required for check.',
      metadata: { success: false, error: 'MISSING_TARGET' },
    };
  }

  // Perform the HTTP check
  const startTime = Date.now();
  let statusCode;
  let isUp;
  let errorMessage = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    statusCode = response.status;
    isUp = statusCode === expectedStatus;
  } catch (error) {
    if (error.name === 'AbortError') {
      statusCode = null;
      isUp = false;
      errorMessage = `Request timed out after ${timeout}ms`;
    } else {
      statusCode = null;
      isUp = false;
      errorMessage = error.message;
    }
  }

  const responseTimeMs = Date.now() - startTime;
  const timestamp = new Date().toISOString();

  const checkResult = {
    url: targetUrl,
    statusCode,
    responseTimeMs,
    isUp,
    expectedStatus,
    timestamp,
    error: errorMessage,
  };

  // Store in history if this is a registered monitor
  if (monitorId) {
    const history = historyStore.get(monitorId) || [];
    history.push(checkResult);
    // Cap history length
    if (history.length > MAX_HISTORY_PER_MONITOR) {
      history.splice(0, history.length - MAX_HISTORY_PER_MONITOR);
    }
    historyStore.set(monitorId, history);
  }

  const statusLabel = isUp ? 'UP' : 'DOWN';
  const statusLine = statusCode !== null
    ? `${statusLabel} (HTTP ${statusCode})`
    : `${statusLabel} (${errorMessage})`;

  return {
    result: `Check complete: ${targetUrl} is ${statusLine} (${responseTimeMs}ms)`,
    metadata: {
      success: true,
      action: 'check',
      monitorId,
      check: checkResult,
    },
  };
}

/**
 * Get current status of all monitors or a specific one.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleStatus(params) {
  const { id } = params;

  if (id && typeof id === 'string') {
    // Status for a specific monitor
    const monitor = monitorStore.get(id);
    if (!monitor) {
      return {
        result: `Error: No monitor found with id "${id}".`,
        metadata: { success: false, error: 'MONITOR_NOT_FOUND' },
      };
    }

    const lastCheck = getLastCheck(id);
    const uptimePercent = computeUptimePercent(id);

    const status = {
      id: monitor.id,
      url: monitor.url,
      name: monitor.name,
      lastCheck: lastCheck ? lastCheck.timestamp : null,
      statusCode: lastCheck ? lastCheck.statusCode : null,
      responseTimeMs: lastCheck ? lastCheck.responseTimeMs : null,
      isUp: lastCheck ? lastCheck.isUp : null,
      uptimePercent,
      error: lastCheck ? lastCheck.error : null,
    };

    const statusLabel = lastCheck
      ? (lastCheck.isUp ? 'UP' : 'DOWN')
      : 'UNKNOWN';

    const lines = [
      `${monitor.name || monitor.url}: ${statusLabel}`,
      `  URL: ${monitor.url}`,
      `  Uptime: ${uptimePercent}%`,
    ];
    if (lastCheck) {
      lines.push(`  Last Check: ${lastCheck.timestamp}`);
      lines.push(`  Status Code: ${lastCheck.statusCode || 'N/A'}`);
      lines.push(`  Response Time: ${lastCheck.responseTimeMs}ms`);
    } else {
      lines.push('  Last Check: never');
    }

    return {
      result: lines.join('\n'),
      metadata: {
        success: true,
        action: 'status',
        monitorId: id,
        status,
      },
    };
  }

  // Status for all monitors
  const monitors = [...monitorStore.values()];

  if (monitors.length === 0) {
    return {
      result: 'No monitors registered.',
      metadata: { success: true, action: 'status', count: 0, statuses: [] },
    };
  }

  const statuses = monitors.map((monitor) => {
    const lastCheck = getLastCheck(monitor.id);
    const uptimePercent = computeUptimePercent(monitor.id);

    return {
      id: monitor.id,
      url: monitor.url,
      name: monitor.name,
      lastCheck: lastCheck ? lastCheck.timestamp : null,
      statusCode: lastCheck ? lastCheck.statusCode : null,
      responseTimeMs: lastCheck ? lastCheck.responseTimeMs : null,
      isUp: lastCheck ? lastCheck.isUp : null,
      uptimePercent,
      error: lastCheck ? lastCheck.error : null,
    };
  });

  const lines = statuses.map((s, i) => {
    const label = s.isUp === null ? 'UNKNOWN' : s.isUp ? 'UP' : 'DOWN';
    return `${i + 1}. ${s.name || s.url}: ${label} (uptime: ${s.uptimePercent}%)`;
  });

  return {
    result: `${statuses.length} monitor(s):\n\n${lines.join('\n')}`,
    metadata: {
      success: true,
      action: 'status',
      count: statuses.length,
      statuses,
    },
  };
}

/**
 * List all registered monitors.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleList(params) {
  const monitors = [...monitorStore.values()];

  if (monitors.length === 0) {
    return {
      result: 'No monitors registered.',
      metadata: { success: true, action: 'list', count: 0, monitors: [] },
    };
  }

  const formatted = monitors.map((m, i) => `${i + 1}.\n${formatMonitor(m)}`).join('\n\n');

  return {
    result: `${monitors.length} monitor(s) registered:\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'list',
      count: monitors.length,
      monitors,
    },
  };
}

/**
 * Get check history for a monitor.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleHistory(params) {
  const { id, limit: rawLimit } = params;

  if (!id || typeof id !== 'string') {
    return {
      result: 'Error: The "id" parameter is required for history.',
      metadata: { success: false, error: 'MISSING_ID' },
    };
  }

  const monitor = monitorStore.get(id);
  if (!monitor) {
    return {
      result: `Error: No monitor found with id "${id}".`,
      metadata: { success: false, error: 'MONITOR_NOT_FOUND' },
    };
  }

  const history = historyStore.get(id) || [];
  const limit = typeof rawLimit === 'number' && rawLimit > 0 ? rawLimit : DEFAULT_HISTORY_LIMIT;
  const entries = history.slice(-limit);

  if (entries.length === 0) {
    return {
      result: `No check history for monitor "${monitor.name || monitor.url}".`,
      metadata: {
        success: true,
        action: 'history',
        monitorId: id,
        count: 0,
        entries: [],
      },
    };
  }

  const lines = entries.map((entry, i) => {
    const label = entry.isUp ? 'UP' : 'DOWN';
    const status = entry.statusCode !== null ? `HTTP ${entry.statusCode}` : (entry.error || 'N/A');
    return `${i + 1}. [${entry.timestamp}] ${label} - ${status} (${entry.responseTimeMs}ms)`;
  });

  return {
    result: `History for "${monitor.name || monitor.url}" (last ${entries.length}):\n\n${lines.join('\n')}`,
    metadata: {
      success: true,
      action: 'history',
      monitorId: id,
      count: entries.length,
      entries,
    },
  };
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

/**
 * Clear all monitors and history from the stores. Exposed for test isolation.
 */
export function _clearStore() {
  monitorStore.clear();
  historyStore.clear();
}

/**
 * Get the current number of monitors. Exposed for test assertions.
 *
 * @returns {number}
 */
export function _storeSize() {
  return monitorStore.size;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute an uptime monitoring operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: add, remove, check, status, list, history
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  const validActions = ['add', 'remove', 'check', 'status', 'list', 'history'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  try {
    switch (action) {
      case 'add':
        return handleAdd(params);
      case 'remove':
        return handleRemove(params);
      case 'check':
        return await handleCheck(params);
      case 'status':
        return handleStatus(params);
      case 'list':
        return handleList(params);
      case 'history':
        return handleHistory(params);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: `Error during ${action} operation: ${error.message}`,
      metadata: { success: false, error: 'OPERATION_FAILED', detail: error.message },
    };
  }
}
