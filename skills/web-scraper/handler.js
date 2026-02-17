/**
 * Web Scraper Skill Handler (Layer 1)
 *
 * Web scraping and content extraction via provider client. Fetch pages,
 * extract text, links, metadata, structured data, and tables using
 * cheerio-based approach through provider adapter.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 30s, max 120s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 *
 * SECURITY:
 * - URL allowlist: only http:// and https:// protocols permitted
 * - Blocked protocols: file://, javascript:, data:, ftp://
 * - Selector validation: max 500 chars, no script tags
 * - Max content length validation
 * - All inputs sanitized
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'fetch_page',
  'extract_text',
  'extract_links',
  'extract_metadata',
  'extract_structured',
  'extract_tables',
];

const DEFAULT_LINK_LIMIT = 100;
const MIN_LINK_LIMIT = 1;
const MAX_LINK_LIMIT = 500;

const MAX_SELECTOR_LENGTH = 500;
const MAX_SELECTORS_COUNT = 50;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

const BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:', 'ftp:'];

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
    result: 'Error: Provider client required for web scraping. Configure a web scraper provider adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for web scraping. Configure a web scraper provider adapter.',
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
 * Blocks file://, javascript:, data:, ftp:// and other dangerous protocols.
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
 * Validate the headers object.
 *
 * @param {*} headers
 * @returns {{ valid: boolean, sanitized?: Object, error?: string }}
 */
function validateHeaders(headers) {
  if (headers === undefined || headers === null) {
    return { valid: true, sanitized: undefined };
  }

  if (typeof headers !== 'object' || Array.isArray(headers)) {
    return { valid: false, error: 'The "headers" parameter must be a plain object.' };
  }

  // Validate all keys and values are strings
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      return { valid: false, error: 'All header keys and values must be strings.' };
    }
  }

  return { valid: true, sanitized: headers };
}

/**
 * Validate the selectors array for extract_structured.
 *
 * @param {*} selectors
 * @returns {{ valid: boolean, sanitized?: Array, error?: string }}
 */
function validateSelectors(selectors) {
  if (!selectors || !Array.isArray(selectors)) {
    return { valid: false, error: 'The "selectors" parameter is required and must be an array.' };
  }

  if (selectors.length === 0) {
    return { valid: false, error: 'The "selectors" parameter must not be empty.' };
  }

  if (selectors.length > MAX_SELECTORS_COUNT) {
    return { valid: false, error: `The "selectors" parameter must not exceed ${MAX_SELECTORS_COUNT} entries.` };
  }

  for (let i = 0; i < selectors.length; i++) {
    const entry = selectors[i];
    if (!entry || typeof entry !== 'object') {
      return { valid: false, error: `Selector at index ${i} must be an object with "name" and "selector" properties.` };
    }
    if (!entry.name || typeof entry.name !== 'string' || entry.name.trim().length === 0) {
      return { valid: false, error: `Selector at index ${i} must have a non-empty "name" string.` };
    }
    if (!entry.selector || typeof entry.selector !== 'string' || entry.selector.trim().length === 0) {
      return { valid: false, error: `Selector at index ${i} must have a non-empty "selector" string.` };
    }

    // Validate each CSS selector
    const selectorResult = validateSelector(entry.selector);
    if (!selectorResult.valid) {
      return { valid: false, error: `Selector at index ${i}: ${selectorResult.error}` };
    }

    // Validate attribute if present
    if (entry.attribute !== undefined && entry.attribute !== null) {
      if (typeof entry.attribute !== 'string') {
        return { valid: false, error: `Selector at index ${i}: "attribute" must be a string.` };
      }
    }
  }

  return { valid: true, sanitized: selectors };
}

/**
 * Validate the tableIndex parameter.
 *
 * @param {*} tableIndex
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateTableIndex(tableIndex) {
  if (tableIndex === undefined || tableIndex === null) {
    return { valid: true, value: 0 };
  }
  const num = Number(tableIndex);
  if (!Number.isInteger(num) || num < 0) {
    return { valid: false, error: 'The "tableIndex" parameter must be a non-negative integer.' };
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
    case 'fetch_page': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      if (params.headers !== undefined && params.headers !== null) {
        const headersResult = validateHeaders(params.headers);
        if (!headersResult.valid) return { valid: false, error: headersResult.error };
      }
      return { valid: true };
    }
    case 'extract_text': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      if (params.selector !== undefined && params.selector !== null) {
        const selectorResult = validateSelector(params.selector);
        if (!selectorResult.valid) return { valid: false, error: selectorResult.error };
      }
      return { valid: true };
    }
    case 'extract_links': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      if (params.limit !== undefined && params.limit !== null) {
        const limitResult = validateLinkLimit(params.limit);
        if (!limitResult.valid) return { valid: false, error: limitResult.error };
      }
      return { valid: true };
    }
    case 'extract_metadata': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      return { valid: true };
    }
    case 'extract_structured': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      const selectorsResult = validateSelectors(params.selectors);
      if (!selectorsResult.valid) return { valid: false, error: selectorsResult.error };
      return { valid: true };
    }
    case 'extract_tables': {
      const urlResult = validateUrl(params.url);
      if (!urlResult.valid) return { valid: false, error: urlResult.error };
      if (params.tableIndex !== undefined && params.tableIndex !== null) {
        const tableIndexResult = validateTableIndex(params.tableIndex);
        if (!tableIndexResult.valid) return { valid: false, error: tableIndexResult.error };
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
 * Handle fetch_page -- POST /scraper/fetch body: { url, headers }
 */
async function handleFetchPage(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const headersResult = validateHeaders(params.headers);
  if (!headersResult.valid) {
    return {
      result: `Error: ${headersResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;
  const headers = headersResult.sanitized;

  try {
    const body = { url };
    if (headers) body.headers = headers;

    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/scraper/fetch',
      { body },
      timeoutMs
    );

    const html = data?.html || data?.content || data?.body || '';
    const htmlStr = typeof html === 'string' ? html : JSON.stringify(html);
    const contentLength = htmlStr.length;

    if (contentLength > MAX_CONTENT_LENGTH) {
      return {
        result: `Error: Content length ${contentLength} exceeds maximum allowed ${MAX_CONTENT_LENGTH}.`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }

    const lines = [
      `Fetched: ${url}`,
      `Content length: ${contentLength} characters`,
      data?.statusCode ? `Status: ${data.statusCode}` : null,
      '',
      htmlStr.length > 1000 ? htmlStr.substring(0, 1000) + '... (truncated)' : htmlStr,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'fetch_page',
        layer: 'L1',
        url,
        contentLength,
        statusCode: data?.statusCode || null,
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
 * Handle extract_text -- POST /scraper/text body: { url, selector }
 */
async function handleExtractText(params, context) {
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
      '/scraper/text',
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
        action: 'extract_text',
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
 * Handle extract_links -- POST /scraper/links body: { url, limit }
 */
async function handleExtractLinks(params, context) {
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
      '/scraper/links',
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
        action: 'extract_links',
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
 * Handle extract_metadata -- POST /scraper/metadata body: { url }
 */
async function handleExtractMetadata(params, context) {
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
      '/scraper/metadata',
      { body: { url } },
      timeoutMs
    );

    const meta = data?.metadata || data || {};
    const lines = [
      `Metadata from: ${url}`,
      meta.title ? `Title: ${meta.title}` : null,
      meta.description ? `Description: ${meta.description}` : null,
      meta.ogTitle ? `OG Title: ${meta.ogTitle}` : null,
      meta.ogDescription ? `OG Description: ${meta.ogDescription}` : null,
      meta.ogImage ? `OG Image: ${meta.ogImage}` : null,
      meta.ogType ? `OG Type: ${meta.ogType}` : null,
      meta.canonical ? `Canonical: ${meta.canonical}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'extract_metadata',
        layer: 'L1',
        url,
        pageMetadata: meta,
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
 * Handle extract_structured -- POST /scraper/structured body: { url, selectors }
 */
async function handleExtractStructured(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const selectorsResult = validateSelectors(params.selectors);
  if (!selectorsResult.valid) {
    return {
      result: `Error: ${selectorsResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;
  const selectors = selectorsResult.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/scraper/structured',
      { body: { url, selectors } },
      timeoutMs
    );

    const extracted = data?.data || data?.results || data || {};
    const resultStr = typeof extracted === 'string' ? extracted : JSON.stringify(extracted, null, 2);
    const lines = [
      `Structured data from: ${url}`,
      `Selectors: ${selectors.length}`,
      '',
      resultStr,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'extract_structured',
        layer: 'L1',
        url,
        selectorCount: selectors.length,
        data: extracted,
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
 * Handle extract_tables -- POST /scraper/tables body: { url, tableIndex }
 */
async function handleExtractTables(params, context) {
  const urlResult = validateUrl(params.url);
  if (!urlResult.valid) {
    return {
      result: `Error: ${urlResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const tableIndexResult = validateTableIndex(params.tableIndex);
  if (!tableIndexResult.valid) {
    return {
      result: `Error: ${tableIndexResult.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const url = urlResult.sanitized;
  const tableIndex = tableIndexResult.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/scraper/tables',
      { body: { url, tableIndex } },
      timeoutMs
    );

    const tables = data?.tables || data?.data || [];
    const tableData = Array.isArray(tables) ? tables : [tables];
    const rowCount = tableData.length;

    const lines = [
      `Tables from: ${url}`,
      `Table index: ${tableIndex}`,
      `Rows: ${rowCount}`,
      '',
      JSON.stringify(tableData, null, 2),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'extract_tables',
        layer: 'L1',
        url,
        tableIndex,
        rowCount,
        tables: tableData,
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
 * Execute a web scraping operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: fetch_page, extract_text, extract_links, extract_metadata, extract_structured, extract_tables
 * @param {string} params.url - Target URL (http/https only)
 * @param {Object} [params.headers] - Custom headers for fetch_page
 * @param {string} [params.selector] - CSS selector for extract_text
 * @param {number} [params.limit] - Max links to return (1-500, default 100)
 * @param {Array} [params.selectors] - Selector definitions for extract_structured [{name, selector, attribute?}]
 * @param {number} [params.tableIndex] - Table index for extract_tables (default 0)
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
      case 'fetch_page':
        return await handleFetchPage(params, context);
      case 'extract_text':
        return await handleExtractText(params, context);
      case 'extract_links':
        return await handleExtractLinks(params, context);
      case 'extract_metadata':
        return await handleExtractMetadata(params, context);
      case 'extract_structured':
        return await handleExtractStructured(params, context);
      case 'extract_tables':
        return await handleExtractTables(params, context);
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
  name: 'web-scraper',
  version: '1.0.0',
  description: 'Web scraping and content extraction skill. Fetch pages, extract text, links, metadata, structured data, and tables via provider client.',
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
  validateLinkLimit,
  validateHeaders,
  validateSelectors,
  validateTableIndex,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LINK_LIMIT,
  MIN_LINK_LIMIT,
  MAX_LINK_LIMIT,
  MAX_SELECTOR_LENGTH,
  MAX_SELECTORS_COUNT,
  MAX_CONTENT_LENGTH,
  BLOCKED_PROTOCOLS,
};
