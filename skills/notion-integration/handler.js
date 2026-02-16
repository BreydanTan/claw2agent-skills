/**
 * Notion Integration Skill Handler (Layer 1)
 *
 * Interact with Notion workspaces via the Notion API: search, get/create/update
 * pages, get/query databases, create database entries, and list blocks.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://api.notion.com/...)
 * - All external access goes through context.providerClient or context.gatewayClient
 * - If no client is available: PROVIDER_NOT_CONFIGURED
 * - Enforces timeout (default 15s, max 30s)
 * - Redacts secrets from all outputs
 * - Sanitizes inputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'search', 'get_page', 'create_page', 'update_page',
  'get_database', 'query_database', 'create_database_entry', 'list_blocks',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_SEARCH_PAGE_SIZE = 10;
const DEFAULT_QUERY_PAGE_SIZE = 50;
const DEFAULT_BLOCKS_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the provider or gateway client from context.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
export function getClient(context) {
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
    result: 'Error: Provider client required for Notion API access. Configure the platform adapter.',
    metadata: {
      success: false,
      error: 'PROVIDER_NOT_CONFIGURED',
    },
  };
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
  /ntn_[A-Za-z0-9]{40,}/g,
  /secret_[A-Za-z0-9]{40,}/g,
];

/**
 * Redact sensitive tokens/keys from a string.
 *
 * @param {string} text
 * @returns {string}
 */
export function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a string input by trimming and removing control characters.
 *
 * @param {*} value
 * @returns {string|undefined}
 */
export function sanitizeString(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return String(value);
  // eslint-disable-next-line no-control-regex
  return value.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Clamp pageSize to valid range.
 *
 * @param {*} value
 * @param {number} defaultSize
 * @returns {number}
 */
function clampPageSize(value, defaultSize) {
  const n = typeof value === 'number' ? value : defaultSize;
  if (n < 1) return 1;
  if (n > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return Math.floor(n);
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
// Fetch with timeout
// ---------------------------------------------------------------------------

/**
 * Fetch data through the provider client with timeout enforcement.
 *
 * @param {Object} client - The provider or gateway client (must have .fetch())
 * @param {string} endpoint - The resource/endpoint identifier
 * @param {Object} options - Fetch options (params, method, body, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function fetchWithTimeout(client, endpoint, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.fetch(endpoint, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'FETCH_ERROR', message: err.message || 'Unknown fetch error' };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * search - Search Notion workspace.
 */
async function handleSearch(params, context) {
  const query = sanitizeString(params.query);

  if (!query) {
    return {
      result: 'Error: The "query" parameter is required for search.',
      metadata: { success: false, error: 'MISSING_QUERY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const pageSize = clampPageSize(params.pageSize, DEFAULT_SEARCH_PAGE_SIZE);
  const sort = params.sort || 'last_edited';
  const fetchParams = { query, page_size: pageSize, sort };
  if (params.filter) {
    fetchParams.filter = sanitizeString(params.filter);
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'notion/search',
      { params: fetchParams },
      timeoutMs
    );

    const results = Array.isArray(data?.results) ? data.results : [];

    if (results.length === 0) {
      return {
        result: `No results found for "${query}".`,
        metadata: {
          success: true,
          action: 'search',
          layer: 'L1',
          query,
          count: 0,
          results: [],
        },
      };
    }

    const lines = results.map((item) => {
      const title = extractTitle(item);
      return `[${item.object || 'unknown'}] ${title} (${item.id || 'N/A'})`;
    });

    return {
      result: redactSensitive(`Search results for "${query}" (${results.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'search',
        layer: 'L1',
        query,
        count: results.length,
        results: results.map((item) => ({
          id: item.id || null,
          object: item.object || null,
          title: extractTitle(item),
          url: item.url || null,
          last_edited_time: item.last_edited_time || null,
        })),
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
 * get_page - Get a Notion page.
 */
async function handleGetPage(params, context) {
  const pageId = sanitizeString(params.pageId);

  if (!pageId) {
    return {
      result: 'Error: The "pageId" parameter is required for get_page.',
      metadata: { success: false, error: 'MISSING_PAGE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `notion/pages/${pageId}`,
      { params: {} },
      timeoutMs
    );

    const title = extractTitle(data);
    const result = [
      `Page: ${title}`,
      `ID: ${data.id || pageId}`,
      `Created: ${data.created_time || 'N/A'}`,
      `Last Edited: ${data.last_edited_time || 'N/A'}`,
      `URL: ${data.url || 'N/A'}`,
      `Archived: ${data.archived ?? 'N/A'}`,
      `Icon: ${data.icon?.emoji || data.icon?.external?.url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_page',
        layer: 'L1',
        pageId: data.id || pageId,
        title,
        created_time: data.created_time || null,
        last_edited_time: data.last_edited_time || null,
        url: data.url || null,
        archived: data.archived ?? null,
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
 * create_page - Create a new Notion page.
 */
async function handleCreatePage(params, context) {
  const parentId = sanitizeString(params.parentId);
  const title = sanitizeString(params.title);

  if (!parentId) {
    return {
      result: 'Error: The "parentId" parameter is required for create_page.',
      metadata: { success: false, error: 'MISSING_PARENT_ID' },
    };
  }
  if (!title) {
    return {
      result: 'Error: The "title" parameter is required for create_page.',
      metadata: { success: false, error: 'MISSING_TITLE' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const content = sanitizeString(params.content) || '';
  const icon = sanitizeString(params.icon) || undefined;
  const cover = sanitizeString(params.cover) || undefined;

  const fetchParams = {
    parent_id: parentId,
    title,
    content,
  };
  if (icon) fetchParams.icon = icon;
  if (cover) fetchParams.cover = cover;

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'notion/pages',
      {
        method: 'POST',
        params: fetchParams,
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Page created: ${data.id || 'N/A'}\nTitle: ${title}\nURL: ${data.url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'create_page',
        layer: 'L1',
        pageId: data.id || null,
        title,
        parentId,
        url: data.url || null,
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
 * update_page - Update page properties.
 */
async function handleUpdatePage(params, context) {
  const pageId = sanitizeString(params.pageId);

  if (!pageId) {
    return {
      result: 'Error: The "pageId" parameter is required for update_page.',
      metadata: { success: false, error: 'MISSING_PAGE_ID' },
    };
  }
  if (!params.properties || typeof params.properties !== 'object' || Array.isArray(params.properties)) {
    return {
      result: 'Error: The "properties" parameter is required for update_page and must be an object.',
      metadata: { success: false, error: 'MISSING_PROPERTIES' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `notion/pages/${pageId}`,
      {
        method: 'PATCH',
        params: { properties: params.properties },
      },
      timeoutMs
    );

    const title = extractTitle(data);

    return {
      result: redactSensitive(`Page updated: ${data.id || pageId}\nTitle: ${title}\nURL: ${data.url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'update_page',
        layer: 'L1',
        pageId: data.id || pageId,
        title,
        url: data.url || null,
        updatedProperties: Object.keys(params.properties),
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
 * get_database - Get database info.
 */
async function handleGetDatabase(params, context) {
  const databaseId = sanitizeString(params.databaseId);

  if (!databaseId) {
    return {
      result: 'Error: The "databaseId" parameter is required for get_database.',
      metadata: { success: false, error: 'MISSING_DATABASE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `notion/databases/${databaseId}`,
      { params: {} },
      timeoutMs
    );

    const title = extractDatabaseTitle(data);
    const propertyNames = data.properties ? Object.keys(data.properties) : [];

    const result = [
      `Database: ${title}`,
      `ID: ${data.id || databaseId}`,
      `Created: ${data.created_time || 'N/A'}`,
      `Last Edited: ${data.last_edited_time || 'N/A'}`,
      `URL: ${data.url || 'N/A'}`,
      `Properties: ${propertyNames.length > 0 ? propertyNames.join(', ') : 'N/A'}`,
      `Archived: ${data.archived ?? 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_database',
        layer: 'L1',
        databaseId: data.id || databaseId,
        title,
        created_time: data.created_time || null,
        last_edited_time: data.last_edited_time || null,
        url: data.url || null,
        properties: propertyNames,
        archived: data.archived ?? null,
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
 * query_database - Query a Notion database.
 */
async function handleQueryDatabase(params, context) {
  const databaseId = sanitizeString(params.databaseId);

  if (!databaseId) {
    return {
      result: 'Error: The "databaseId" parameter is required for query_database.',
      metadata: { success: false, error: 'MISSING_DATABASE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const pageSize = clampPageSize(params.pageSize, DEFAULT_QUERY_PAGE_SIZE);
  const fetchParams = { page_size: pageSize };
  if (params.filter) fetchParams.filter = params.filter;
  if (Array.isArray(params.sorts)) fetchParams.sorts = params.sorts;

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `notion/databases/${databaseId}/query`,
      {
        method: 'POST',
        params: fetchParams,
      },
      timeoutMs
    );

    const results = Array.isArray(data?.results) ? data.results : [];

    if (results.length === 0) {
      return {
        result: `No entries found in database ${databaseId}.`,
        metadata: {
          success: true,
          action: 'query_database',
          layer: 'L1',
          databaseId,
          count: 0,
          hasMore: data?.has_more ?? false,
          results: [],
        },
      };
    }

    const lines = results.map((item) => {
      const title = extractTitle(item);
      return `${title} (${item.id || 'N/A'})`;
    });

    return {
      result: redactSensitive(`Database query results (${results.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'query_database',
        layer: 'L1',
        databaseId,
        count: results.length,
        hasMore: data?.has_more ?? false,
        results: results.map((item) => ({
          id: item.id || null,
          title: extractTitle(item),
          created_time: item.created_time || null,
          last_edited_time: item.last_edited_time || null,
          url: item.url || null,
        })),
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
 * create_database_entry - Add a new entry to a database.
 */
async function handleCreateDatabaseEntry(params, context) {
  const databaseId = sanitizeString(params.databaseId);

  if (!databaseId) {
    return {
      result: 'Error: The "databaseId" parameter is required for create_database_entry.',
      metadata: { success: false, error: 'MISSING_DATABASE_ID' },
    };
  }
  if (!params.properties || typeof params.properties !== 'object' || Array.isArray(params.properties)) {
    return {
      result: 'Error: The "properties" parameter is required for create_database_entry and must be an object.',
      metadata: { success: false, error: 'MISSING_PROPERTIES' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `notion/databases/${databaseId}/entries`,
      {
        method: 'POST',
        params: {
          database_id: databaseId,
          properties: params.properties,
        },
      },
      timeoutMs
    );

    const title = extractTitle(data);

    return {
      result: redactSensitive(`Entry created in database ${databaseId}\nID: ${data.id || 'N/A'}\nTitle: ${title}\nURL: ${data.url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'create_database_entry',
        layer: 'L1',
        databaseId,
        entryId: data.id || null,
        title,
        url: data.url || null,
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
 * list_blocks - List child blocks of a page/block.
 */
async function handleListBlocks(params, context) {
  const blockId = sanitizeString(params.blockId);

  if (!blockId) {
    return {
      result: 'Error: The "blockId" parameter is required for list_blocks.',
      metadata: { success: false, error: 'MISSING_BLOCK_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const pageSize = clampPageSize(params.pageSize, DEFAULT_BLOCKS_PAGE_SIZE);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `notion/blocks/${blockId}/children`,
      { params: { page_size: pageSize } },
      timeoutMs
    );

    const results = Array.isArray(data?.results) ? data.results : [];

    if (results.length === 0) {
      return {
        result: `No child blocks found for ${blockId}.`,
        metadata: {
          success: true,
          action: 'list_blocks',
          layer: 'L1',
          blockId,
          count: 0,
          hasMore: data?.has_more ?? false,
          blocks: [],
        },
      };
    }

    const lines = results.map((block) => {
      const type = block.type || 'unknown';
      const text = extractBlockText(block);
      return `[${type}] ${text}`;
    });

    return {
      result: redactSensitive(`Blocks for ${blockId} (${results.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_blocks',
        layer: 'L1',
        blockId,
        count: results.length,
        hasMore: data?.has_more ?? false,
        blocks: results.map((block) => ({
          id: block.id || null,
          type: block.type || null,
          has_children: block.has_children ?? false,
          text: extractBlockText(block),
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Title extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract a human-readable title from a Notion page or search result object.
 *
 * @param {Object} item - A Notion page/database object
 * @returns {string}
 */
function extractTitle(item) {
  if (!item) return 'Untitled';

  // Try properties.Name or properties.title (common page title fields)
  if (item.properties) {
    for (const key of Object.keys(item.properties)) {
      const prop = item.properties[key];
      if (prop?.type === 'title' && Array.isArray(prop.title) && prop.title.length > 0) {
        return prop.title.map((t) => t.plain_text || '').join('');
      }
    }
  }

  // Fallback: top-level title array (database objects)
  if (Array.isArray(item.title) && item.title.length > 0) {
    return item.title.map((t) => t.plain_text || '').join('');
  }

  return 'Untitled';
}

/**
 * Extract title from a Notion database object.
 *
 * @param {Object} db - A Notion database object
 * @returns {string}
 */
function extractDatabaseTitle(db) {
  if (!db) return 'Untitled';

  if (Array.isArray(db.title) && db.title.length > 0) {
    return db.title.map((t) => t.plain_text || '').join('');
  }

  return extractTitle(db);
}

/**
 * Extract plain text from a Notion block.
 *
 * @param {Object} block - A Notion block object
 * @returns {string}
 */
function extractBlockText(block) {
  if (!block || !block.type) return '';

  const content = block[block.type];
  if (!content) return '';

  if (Array.isArray(content.rich_text)) {
    return content.rich_text.map((t) => t.plain_text || '').join('');
  }
  if (Array.isArray(content.text)) {
    return content.text.map((t) => t.plain_text || '').join('');
  }

  return '';
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Notion workspace operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of the VALID_ACTIONS
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
      case 'search':
        return await handleSearch(params, context);
      case 'get_page':
        return await handleGetPage(params, context);
      case 'create_page':
        return await handleCreatePage(params, context);
      case 'update_page':
        return await handleUpdatePage(params, context);
      case 'get_database':
        return await handleGetDatabase(params, context);
      case 'query_database':
        return await handleQueryDatabase(params, context);
      case 'create_database_entry':
        return await handleCreateDatabaseEntry(params, context);
      case 'list_blocks':
        return await handleListBlocks(params, context);
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
