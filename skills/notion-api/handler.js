/**
 * Notion API Skill Handler (Layer 1)
 *
 * Interact with the Notion API to manage pages, databases, blocks,
 * and search across workspaces.
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
  'get_page',
  'create_page',
  'update_page',
  'search',
  'get_database',
  'query_database',
  'get_block_children',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const MAX_TITLE_LENGTH = 2000;
const MAX_QUERY_LENGTH = 500;

const VALID_PARENT_TYPES = ['database', 'page'];
const VALID_SEARCH_FILTERS = ['page', 'database'];
const VALID_SORT_VALUES = ['last_edited_time', 'created_time'];

const DEFAULT_SEARCH_LIMIT = 25;
const DEFAULT_QUERY_LIMIT = 25;
const DEFAULT_BLOCK_CHILDREN_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

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
    result: 'Error: Provider client required for Notion API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Notion API access. Configure an API key or platform adapter.',
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
 * Send a request through the provider client with timeout.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, PATCH, etc.)
 * @param {string} path - The API path
 * @param {Object|null} body - Request body (null for GET)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
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
 * Validate a UUID string (32 hex chars, with or without hyphens).
 *
 * @param {string} id
 * @returns {boolean}
 */
function validateUUID(id) {
  if (typeof id !== 'string') return false;
  const stripped = id.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(stripped);
}

/**
 * Clamp a numeric limit value within [min, max], returning a default if not provided.
 *
 * @param {*} value - The raw limit value
 * @param {number} defaultVal - Default when value is undefined/null
 * @param {number} [min=1] - Minimum allowed value
 * @param {number} [max=100] - Maximum allowed value
 * @returns {number}
 */
function clampLimit(value, defaultVal, min = MIN_LIMIT, max = MAX_LIMIT) {
  if (value === undefined || value === null) return defaultVal;
  const num = Number(value);
  if (isNaN(num) || !Number.isFinite(num)) return defaultVal;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle get_page: GET /pages/{pageId}
 */
async function handleGetPage(params, context) {
  const { pageId } = params;

  if (!pageId || !validateUUID(pageId)) {
    return {
      result: 'Error: The "pageId" parameter is required and must be a valid UUID.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/pages/${pageId}`,
      null,
      timeoutMs
    );

    const title = extractPageTitle(data);
    const lines = [
      `Page: ${title}`,
      `ID: ${data?.id || pageId}`,
      `Created: ${data?.created_time || 'unknown'}`,
      `Last edited: ${data?.last_edited_time || 'unknown'}`,
      `URL: ${data?.url || 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_page',
        layer: 'L1',
        pageId: data?.id || pageId,
        page: data,
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
 * Handle create_page: POST /pages
 */
async function handleCreatePage(params, context) {
  const { parentId, title, content, parentType = 'page' } = params;

  if (!parentId || !validateUUID(parentId)) {
    return {
      result: 'Error: The "parentId" parameter is required and must be a valid UUID.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return {
      result: 'Error: The "title" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    return {
      result: `Error: Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters (got ${trimmedTitle.length}).`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!VALID_PARENT_TYPES.includes(parentType)) {
    return {
      result: `Error: Invalid parentType "${parentType}". Must be one of: ${VALID_PARENT_TYPES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const parent =
    parentType === 'database'
      ? { database_id: parentId }
      : { page_id: parentId };

  const properties = {
    title: {
      title: [{ text: { content: trimmedTitle } }],
    },
  };

  const children = [];
  if (content && typeof content === 'string' && content.trim().length > 0) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: content.trim() } }],
      },
    });
  }

  const body = { parent, properties };
  if (children.length > 0) body.children = children;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/pages',
      body,
      timeoutMs
    );

    const lines = [
      `Page created successfully`,
      `ID: ${data?.id || 'unknown'}`,
      `Title: ${trimmedTitle}`,
      `Parent: ${parentId} (${parentType})`,
      `URL: ${data?.url || 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'create_page',
        layer: 'L1',
        pageId: data?.id || null,
        parentId,
        parentType,
        title: trimmedTitle,
        page: data,
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
 * Handle update_page: PATCH /pages/{pageId}
 */
async function handleUpdatePage(params, context) {
  const { pageId, properties } = params;

  if (!pageId || !validateUUID(pageId)) {
    return {
      result: 'Error: The "pageId" parameter is required and must be a valid UUID.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {
      result: 'Error: The "properties" parameter is required and must be a non-empty object.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (Object.keys(properties).length === 0) {
    return {
      result: 'Error: The "properties" parameter must be a non-empty object.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'PATCH',
      `/pages/${pageId}`,
      { properties },
      timeoutMs
    );

    const title = extractPageTitle(data);
    const lines = [
      `Page updated successfully`,
      `ID: ${data?.id || pageId}`,
      `Title: ${title}`,
      `Last edited: ${data?.last_edited_time || 'unknown'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'update_page',
        layer: 'L1',
        pageId: data?.id || pageId,
        page: data,
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
 * Handle search: POST /search
 */
async function handleSearch(params, context) {
  const {
    query,
    filter,
    sort = 'last_edited_time',
  } = params;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      result: 'Error: The "query" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    return {
      result: `Error: Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters (got ${trimmedQuery.length}).`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (filter !== undefined && filter !== null && !VALID_SEARCH_FILTERS.includes(filter)) {
    return {
      result: `Error: Invalid filter "${filter}". Must be one of: ${VALID_SEARCH_FILTERS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!VALID_SORT_VALUES.includes(sort)) {
    return {
      result: `Error: Invalid sort "${sort}". Must be one of: ${VALID_SORT_VALUES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limit = clampLimit(params.limit, DEFAULT_SEARCH_LIMIT);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const body = {
    query: trimmedQuery,
    sort: {
      direction: 'descending',
      timestamp: sort,
    },
    page_size: limit,
  };

  if (filter) {
    body.filter = { value: filter, property: 'object' };
  }

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/search',
      body,
      timeoutMs
    );

    const results = data?.results || [];
    const lines = [
      `Search results for "${trimmedQuery}"`,
      `Found: ${results.length} result(s)`,
      '',
    ];

    for (const item of results) {
      const itemTitle = extractPageTitle(item) || item?.id || 'Untitled';
      lines.push(`- [${item?.object || 'unknown'}] ${itemTitle} (${item?.id || 'N/A'})`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search',
        layer: 'L1',
        query: trimmedQuery,
        filter: filter || null,
        sort,
        limit,
        resultCount: results.length,
        results: data?.results || [],
        hasMore: data?.has_more || false,
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
 * Handle get_database: GET /databases/{databaseId}
 */
async function handleGetDatabase(params, context) {
  const { databaseId } = params;

  if (!databaseId || !validateUUID(databaseId)) {
    return {
      result: 'Error: The "databaseId" parameter is required and must be a valid UUID.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/databases/${databaseId}`,
      null,
      timeoutMs
    );

    const title = extractDatabaseTitle(data);
    const propNames = data?.properties ? Object.keys(data.properties) : [];

    const lines = [
      `Database: ${title}`,
      `ID: ${data?.id || databaseId}`,
      `Created: ${data?.created_time || 'unknown'}`,
      `Last edited: ${data?.last_edited_time || 'unknown'}`,
      `Properties: ${propNames.length > 0 ? propNames.join(', ') : 'none'}`,
      `URL: ${data?.url || 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_database',
        layer: 'L1',
        databaseId: data?.id || databaseId,
        database: data,
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
 * Handle query_database: POST /databases/{databaseId}/query
 */
async function handleQueryDatabase(params, context) {
  const { databaseId, filter, sorts } = params;

  if (!databaseId || !validateUUID(databaseId)) {
    return {
      result: 'Error: The "databaseId" parameter is required and must be a valid UUID.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (filter !== undefined && filter !== null && (typeof filter !== 'object' || Array.isArray(filter))) {
    return {
      result: 'Error: The "filter" parameter must be an object when provided.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (sorts !== undefined && sorts !== null && !Array.isArray(sorts)) {
    return {
      result: 'Error: The "sorts" parameter must be an array when provided.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limit = clampLimit(params.limit, DEFAULT_QUERY_LIMIT);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const body = { page_size: limit };
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      `/databases/${databaseId}/query`,
      body,
      timeoutMs
    );

    const results = data?.results || [];
    const lines = [
      `Database query results`,
      `Database: ${databaseId}`,
      `Found: ${results.length} result(s)`,
      '',
    ];

    for (const item of results) {
      const itemTitle = extractPageTitle(item) || item?.id || 'Untitled';
      lines.push(`- ${itemTitle} (${item?.id || 'N/A'})`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'query_database',
        layer: 'L1',
        databaseId,
        limit,
        resultCount: results.length,
        results: data?.results || [],
        hasMore: data?.has_more || false,
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
 * Handle get_block_children: GET /blocks/{blockId}/children?page_size={limit}
 */
async function handleGetBlockChildren(params, context) {
  const { blockId } = params;

  if (!blockId || !validateUUID(blockId)) {
    return {
      result: 'Error: The "blockId" parameter is required and must be a valid UUID.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limit = clampLimit(params.limit, DEFAULT_BLOCK_CHILDREN_LIMIT);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/blocks/${blockId}/children?page_size=${limit}`,
      null,
      timeoutMs
    );

    const results = data?.results || [];
    const lines = [
      `Block children`,
      `Block: ${blockId}`,
      `Found: ${results.length} child block(s)`,
      '',
    ];

    for (const block of results) {
      lines.push(`- [${block?.type || 'unknown'}] ${block?.id || 'N/A'}`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_block_children',
        layer: 'L1',
        blockId,
        limit,
        resultCount: results.length,
        blocks: data?.results || [],
        hasMore: data?.has_more || false,
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
// Title extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract a page title from a Notion page object.
 *
 * @param {Object} page
 * @returns {string}
 */
function extractPageTitle(page) {
  if (!page?.properties) return 'Untitled';
  const props = page.properties;
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop?.type === 'title' && Array.isArray(prop.title) && prop.title.length > 0) {
      return prop.title.map((t) => t?.plain_text || t?.text?.content || '').join('');
    }
  }
  return 'Untitled';
}

/**
 * Extract a database title from a Notion database object.
 *
 * @param {Object} db
 * @returns {string}
 */
function extractDatabaseTitle(db) {
  if (Array.isArray(db?.title) && db.title.length > 0) {
    return db.title.map((t) => t?.plain_text || t?.text?.content || '').join('');
  }
  return 'Untitled';
}

// ---------------------------------------------------------------------------
// Validation function
// ---------------------------------------------------------------------------

/**
 * Validate params before execution.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
export function validate(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Params must be a non-null object.' };
  }

  const { action } = params;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      valid: false,
      error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const meta = {
  name: 'notion-api',
  displayName: 'Notion API',
  version: '1.0.0',
  layer: 'L1',
  actions: VALID_ACTIONS,
  description: 'Interact with the Notion API to manage pages, databases, and blocks.',
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Notion API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: get_page, create_page, update_page, search, get_database, query_database, get_block_children
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  try {
    switch (action) {
      case 'get_page':
        return await handleGetPage(params, context);
      case 'create_page':
        return await handleCreatePage(params, context);
      case 'update_page':
        return await handleUpdatePage(params, context);
      case 'search':
        return await handleSearch(params, context);
      case 'get_database':
        return await handleGetDatabase(params, context);
      case 'query_database':
        return await handleQueryDatabase(params, context);
      case 'get_block_children':
        return await handleGetBlockChildren(params, context);
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

// ---------------------------------------------------------------------------
// Export internals for testing
// ---------------------------------------------------------------------------
export {
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  validateUUID,
  clampLimit,
  extractPageTitle,
  extractDatabaseTitle,
  VALID_ACTIONS,
  VALID_PARENT_TYPES,
  VALID_SEARCH_FILTERS,
  VALID_SORT_VALUES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_TITLE_LENGTH,
  MAX_QUERY_LENGTH,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_QUERY_LIMIT,
  DEFAULT_BLOCK_CHILDREN_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
};
