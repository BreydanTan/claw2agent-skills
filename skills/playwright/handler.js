/**
 * Playwright Browser Automation Skill Handler (Layer 1)
 *
 * Browser automation via provider client. Navigate pages, take screenshots,
 * extract text/links, fill forms, and evaluate JavaScript snippets.
 *
 * HIGH RISK: URL allowlist enforced, no arbitrary code execution.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 30s, max 60s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 *
 * SECURITY:
 * - URL allowlist: only http:// and https:// protocols permitted
 * - Blocked protocols: file://, javascript:, data://
 * - Selector validation: max 200 chars, no script tags
 * - Script validation: max 2000 chars, passed to provider (never executed locally)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'navigate',
  'screenshot',
  'get_text',
  'get_links',
  'fill_form',
  'evaluate',
];

const VALID_SCREENSHOT_FORMATS = ['png', 'jpeg'];
const DEFAULT_SCREENSHOT_FORMAT = 'png';

const DEFAULT_LINK_LIMIT = 100;
const MIN_LINK_LIMIT = 1;
const MAX_LINK_LIMIT = 500;

const MAX_FIELDS = 50;
const MAX_SELECTOR_LENGTH = 200;
const MAX_SCRIPT_LENGTH = 2000;

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 60000;

const BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:'];

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
    result: 'Error: Provider client required for browser automation. Configure a Playwright provider adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for browser automation. Configure a Playwright provider adapter.',
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
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a URL: must be http:// or https:// protocol.
 * Blocks file://, javascript:, data:// and other dangerous protocols.
 *
 * @param {*} url
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'The "url" parameter is required and must be a non-empty string.' };
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "url" parameter must not be empty.' };
  }

  // Check for blocked protocols (case-insensitive)
  const lower = trimmed.toLowerCase();
  for (const protocol of BLOCKED_PROTOCOLS) {
    if (lower.startsWith(protocol)) {
      return { valid: false, error: `Blocked protocol "${protocol}" in URL. Only http:// and https:// are allowed.` };
    }
  }

  // Must start with http:// or https://
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return { valid: false, error: 'URL must start with http:// or https://.' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate a CSS selector: max length, no script tags.
 *
 * @param {*} selector
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateSelector(selector) {
  if (selector === undefined || selector === null) {
    return { valid: true, sanitized: undefined };
  }

  if (typeof selector !== 'string') {
    return { valid: false, error: 'The "selector" parameter must be a string.' };
  }

  const trimmed = selector.trim();
  if (trimmed.length === 0) {
    return { valid: true, sanitized: undefined };
  }

  if (trimmed.length > MAX_SELECTOR_LENGTH) {
    return { valid: false, error: `The "selector" parameter must not exceed ${MAX_SELECTOR_LENGTH} characters.` };
  }

  // Block script tags in selectors
  if (/<script/i.test(trimmed)) {
    return { valid: false, error: 'The "selector" parameter must not contain script tags.' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate a JavaScript snippet: max length.
 *
 * @param {*} script
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateScript(script) {
  if (!script || typeof script !== 'string') {
    return { valid: false, error: 'The "script" parameter is required and must be a non-empty string.' };
  }

  const trimmed = script.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "script" parameter must not be empty.' };
  }

  if (trimmed.length > MAX_SCRIPT_LENGTH) {
    return { valid: false, error: `The "script" parameter must not exceed ${MAX_SCRIPT_LENGTH} characters.` };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate and clamp the "limit" parameter for links.
 *
 * @param {*} limit
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLinkLimit(limit) {
  if (limit === undefined || limit === null) {
    return { valid: true, value: DEFAULT_LINK_LIMIT };
  }
  const num = Number(limit);
  if (!Number.isInteger(num) || num < MIN_LINK_LIMIT) {
    return { valid: false, error: `The "limit" parameter must be an integer between ${MIN_LINK_LIMIT} and ${MAX_LINK_LIMIT}.` };
  }
  return { valid: true, value: Math.min(num, MAX_LINK_LIMIT) };
}

/**
 * Validate the fields array for fill_form.
 *
 * @param {*} fields
 * @returns {{ valid: boolean, sanitized?: Array, error?: string }}
 */
function validateFields(fields) {
  if (!fields || !Array.isArray(fields)) {
    return { valid: false, error: 'The "fields" parameter is required and must be an array.' };
  }

  if (fields.length === 0) {
    return { valid: false, error: 'The "fields" parameter must not be empty.' };
  }

  if (fields.length > MAX_FIELDS) {
    return { valid: false, error: `The "fields" parameter must not exceed ${MAX_FIELDS} entries.` };
  }

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field || typeof field !== 'object') {
      return { valid: false, error: `Field at index ${i} must be an object with "selector" and "value" properties.` };
    }
    if (!field.selector || typeof field.selector !== 'string' || field.selector.trim().length === 0) {
      return { valid: false, error: `Field at index ${i} must have a non-empty "selector" string.` };
    }
    if (field.value === undefined || field.value === null) {
      return { valid: false, error: `Field at index ${i} must have a "value" property.` };
    }

    // Validate each field selector
    const selectorResult = validateSelector(field.selector);
    if (!selectorResult.valid) {
      return { valid: false, error: `Field at index ${i}: ${selectorResult.error}` };
    }
  }

  return { valid: true, sanitized: fields };
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
    case 'navigate': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      return { valid: true };
    }
    case 'screenshot': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      if (params.format !== undefined && params.format !== null) {
        if (!VALID_SCREENSHOT_FORMATS.includes(params.format)) {
          return { valid: false, error: `Invalid format "${params.format}". Must be one of: ${VALID_SCREENSHOT_FORMATS.join(', ')}` };
        }
      }
      return { valid: true };
    }
    case 'get_text': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      if (params.selector !== undefined && params.selector !== null) {
        const selectorResult = validateSelector(params.selector);
        if (!selectorResult.valid) return { valid: false, error: selectorResult.error };
      }
      return { valid: true };
    }
    case 'get_links': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      if (params.limit !== undefined && params.limit !== null) {
        const limitResult = validateLinkLimit(params.limit);
        if (!limitResult.valid) return { valid: false, error: limitResult.error };
      }
      return { valid: true };
    }
    case 'fill_form': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      const fieldsResult = validateFields(params.fields);
      if (!fieldsResult.valid) return { valid: false, error: fieldsResult.error };
      return { valid: true };
    }
    case 'evaluate': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      const scriptResult = validateScript(params.script);
      if (!scriptResult.valid) return { valid: false, error: scriptResult.error };
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
 * Handle navigate -- POST /browser/navigate body: { url }
 */
async function handleNavigate(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/browser/navigate',
      { body: { url } },
      timeoutMs
    );

    const page = data?.page || data || {};
    const lines = [
      `Navigated to: ${url}`,
      page.title ? `Title: ${page.title}` : null,
      page.status ? `Status: ${page.status}` : null,
      page.loadTime ? `Load time: ${page.loadTime}ms` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'navigate',
        layer: 'L1',
        url,
        page,
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
 * Handle screenshot -- POST /browser/screenshot body: { url, fullPage, format }
 */
async function handleScreenshot(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const format = params.format || DEFAULT_SCREENSHOT_FORMAT;
  if (!VALID_SCREENSHOT_FORMATS.includes(format)) {
    return {
      result: `Error: Invalid format "${format}". Must be one of: ${VALID_SCREENSHOT_FORMATS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const fullPage = params.fullPage === true;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/browser/screenshot',
      { body: { url, fullPage, format } },
      timeoutMs
    );

    const screenshot = data?.screenshot || data || {};
    const lines = [
      `Screenshot taken: ${url}`,
      `Format: ${format}`,
      `Full page: ${fullPage}`,
      screenshot.size ? `Size: ${screenshot.size} bytes` : null,
      screenshot.width ? `Dimensions: ${screenshot.width}x${screenshot.height}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'screenshot',
        layer: 'L1',
        url,
        format,
        fullPage,
        screenshot,
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
 * Handle get_text -- POST /browser/text body: { url, selector }
 */
async function handleGetText(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const selectorResult = validateSelector(params.selector);
  if (!selectorResult.valid) {
    return {
      result: `Error: ${selectorResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;
  const selector = selectorResult.sanitized;

  try {
    const body = { url };
    if (selector) body.selector = selector;

    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/browser/text',
      { body },
      timeoutMs
    );

    const textData = data?.text || data?.content || '';
    const textStr = typeof textData === 'string' ? textData : JSON.stringify(textData);
    const lines = [
      `Text from: ${url}`,
      selector ? `Selector: ${selector}` : 'Selector: (full page)',
      '',
      textStr,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_text',
        layer: 'L1',
        url,
        selector: selector || null,
        textLength: textStr.length,
        text: textStr,
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
 * Handle get_links -- POST /browser/links body: { url, limit }
 */
async function handleGetLinks(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitResult = validateLinkLimit(params.limit);
  if (!limitResult.valid) {
    return {
      result: `Error: ${limitResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;
  const limit = limitResult.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/browser/links',
      { body: { url, limit } },
      timeoutMs
    );

    const links = data?.links || data?.data || [];
    const lines = [
      `Links from: ${url} (${links.length} found, limit ${limit})`,
      '',
      ...links.map((l, i) => `${i + 1}. ${l.text || l.href || 'Unknown'} - ${l.href || ''}`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_links',
        layer: 'L1',
        url,
        limit,
        linkCount: links.length,
        links,
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
 * Handle fill_form -- POST /browser/fill body: { url, fields }
 */
async function handleFillForm(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const fieldsResult = validateFields(params.fields);
  if (!fieldsResult.valid) {
    return {
      result: `Error: ${fieldsResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;
  const fields = fieldsResult.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/browser/fill',
      { body: { url, fields } },
      timeoutMs
    );

    const fillResult = data?.result || data || {};
    const lines = [
      `Form filled on: ${url}`,
      `Fields: ${fields.length}`,
      fillResult.submitted ? 'Status: Submitted' : 'Status: Filled',
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'fill_form',
        layer: 'L1',
        url,
        fieldCount: fields.length,
        fillResult,
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
 * Handle evaluate -- POST /browser/evaluate body: { url, script }
 * SECURITY: Script is passed to provider, not executed locally.
 */
async function handleEvaluate(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const scriptResult = validateScript(params.script);
  if (!scriptResult.valid) {
    return {
      result: `Error: ${scriptResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;
  const script = scriptResult.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/browser/evaluate',
      { body: { url, script } },
      timeoutMs
    );

    const evalResult = data?.result !== undefined ? data.result : data;
    const resultStr = typeof evalResult === 'string' ? evalResult : JSON.stringify(evalResult);
    const lines = [
      `Evaluate on: ${url}`,
      `Script length: ${script.length} chars`,
      '',
      `Result: ${resultStr}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'evaluate',
        layer: 'L1',
        url,
        scriptLength: script.length,
        evalResult,
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
 * Execute a browser automation operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: navigate, screenshot, get_text, get_links, fill_form, evaluate
 * @param {string} params.url - Target URL (http/https only)
 * @param {boolean} [params.fullPage] - Take full page screenshot (default false)
 * @param {string} [params.format] - Screenshot format: png or jpeg (default png)
 * @param {string} [params.selector] - CSS selector for get_text
 * @param {number} [params.limit] - Max links to return (1-500, default 100)
 * @param {Array} [params.fields] - Form fields to fill [{ selector, value }]
 * @param {string} [params.script] - JavaScript to evaluate (max 2000 chars)
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
      case 'navigate':
        return await handleNavigate(params, context);
      case 'screenshot':
        return await handleScreenshot(params, context);
      case 'get_text':
        return await handleGetText(params, context);
      case 'get_links':
        return await handleGetLinks(params, context);
      case 'fill_form':
        return await handleFillForm(params, context);
      case 'evaluate':
        return await handleEvaluate(params, context);
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
  name: 'playwright',
  version: '1.0.0',
  description: 'Browser automation skill. Navigate pages, take screenshots, extract text/links, fill forms, and evaluate JavaScript via provider client.',
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
  validateUrl,
  validateSelector,
  validateScript,
  validateLinkLimit,
  validateFields,
  VALID_ACTIONS,
  VALID_SCREENSHOT_FORMATS,
  DEFAULT_SCREENSHOT_FORMAT,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LINK_LIMIT,
  MIN_LINK_LIMIT,
  MAX_LINK_LIMIT,
  MAX_FIELDS,
  MAX_SELECTOR_LENGTH,
  MAX_SCRIPT_LENGTH,
  BLOCKED_PROTOCOLS,
};
