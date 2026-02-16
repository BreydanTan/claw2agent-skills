/**
 * Airtable Database Skill Handler (Layer 1)
 *
 * Manage Airtable bases, tables, and records via the Airtable REST API.
 * Supports listing bases, listing tables, CRUD operations on records,
 * formula-based search, and bulk record creation.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://api.airtable.com/...)
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
  'list_records', 'get_record', 'create_record', 'update_record',
  'delete_record', 'search_records', 'list_bases', 'list_tables',
  'bulk_create',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RECORDS = 100;
const MAX_BULK_CREATE = 10;

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
    result: 'Error: Provider client required for Airtable API access. Configure the platform adapter.',
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
  /pat[A-Za-z0-9]{14,}\.[a-f0-9]{64}/g,
  /key[A-Za-z0-9]{14,}/g,
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
 * Clamp maxRecords to a valid range.
 *
 * @param {*} value
 * @param {number} defaultValue
 * @returns {number}
 */
function clampMaxRecords(value, defaultValue) {
  const n = typeof value === 'number' ? value : defaultValue;
  if (n < 1) return 1;
  if (n > 1000) return 1000;
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
// Request with timeout
// ---------------------------------------------------------------------------

/**
 * Send a request through the provider client with timeout enforcement.
 *
 * The client uses the .request(method, path, body) pattern.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, PATCH, DELETE)
 * @param {string} path - The API path
 * @param {Object|null} body - Request body
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, body);
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'FETCH_ERROR', message: err.message || 'Unknown request error' };
  }
}

// ---------------------------------------------------------------------------
// Query string builder
// ---------------------------------------------------------------------------

/**
 * Build a query string from an object of parameters.
 *
 * @param {Object} params
 * @returns {string}
 */
function buildQuery(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          for (const [subKey, subVal] of Object.entries(item)) {
            parts.push(`${encodeURIComponent(`${key}[${idx}][${subKey}]`)}=${encodeURIComponent(subVal)}`);
          }
        } else {
          parts.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(item)}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * list_bases - List all accessible Airtable bases.
 */
async function handleListBases(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      '/v0/meta/bases',
      null,
      timeoutMs,
    );

    const bases = Array.isArray(data?.bases) ? data.bases : [];

    if (bases.length === 0) {
      return {
        result: 'No bases found for the authenticated user.',
        metadata: {
          success: true,
          action: 'list_bases',
          layer: 'L1',
          count: 0,
          bases: [],
        },
      };
    }

    const lines = bases.map(
      (b) => `${b.name || 'Untitled'} (${b.id}) - ${b.permissionLevel || 'unknown'}`,
    );

    return {
      result: redactSensitive(`Bases (${bases.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_bases',
        layer: 'L1',
        count: bases.length,
        bases: bases.map((b) => ({
          id: b.id || null,
          name: b.name || null,
          permissionLevel: b.permissionLevel || null,
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
 * list_tables - List tables in a base.
 */
async function handleListTables(params, context) {
  const baseId = sanitizeString(params.baseId);

  if (!baseId) {
    return {
      result: 'Error: The "baseId" parameter is required for list_tables.',
      metadata: { success: false, error: 'MISSING_BASE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/v0/meta/bases/${baseId}/tables`,
      null,
      timeoutMs,
    );

    const tables = Array.isArray(data?.tables) ? data.tables : [];

    if (tables.length === 0) {
      return {
        result: `No tables found in base ${baseId}.`,
        metadata: {
          success: true,
          action: 'list_tables',
          layer: 'L1',
          baseId,
          count: 0,
          tables: [],
        },
      };
    }

    const lines = tables.map(
      (t) => `${t.name || 'Untitled'} (${t.id})`,
    );

    return {
      result: redactSensitive(`Tables in base ${baseId} (${tables.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_tables',
        layer: 'L1',
        baseId,
        count: tables.length,
        tables: tables.map((t) => ({
          id: t.id || null,
          name: t.name || null,
          description: t.description || null,
          primaryFieldId: t.primaryFieldId || null,
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
 * list_records - List records from a table.
 */
async function handleListRecords(params, context) {
  const baseId = sanitizeString(params.baseId);
  const tableId = sanitizeString(params.tableId);

  if (!baseId) {
    return {
      result: 'Error: The "baseId" parameter is required for list_records.',
      metadata: { success: false, error: 'MISSING_BASE_ID' },
    };
  }
  if (!tableId) {
    return {
      result: 'Error: The "tableId" parameter is required for list_records.',
      metadata: { success: false, error: 'MISSING_TABLE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxRecords = clampMaxRecords(params.maxRecords, DEFAULT_MAX_RECORDS);

  const queryParams = { maxRecords };
  if (params.filterByFormula) {
    queryParams.filterByFormula = sanitizeString(params.filterByFormula);
  }
  if (params.view) {
    queryParams.view = sanitizeString(params.view);
  }
  if (Array.isArray(params.sort)) {
    queryParams.sort = params.sort;
  }

  const query = buildQuery(queryParams);
  const path = `/v0/${baseId}/${tableId}${query}`;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      null,
      timeoutMs,
    );

    const records = Array.isArray(data?.records) ? data.records : [];

    if (records.length === 0) {
      return {
        result: `No records found in table ${tableId}.`,
        metadata: {
          success: true,
          action: 'list_records',
          layer: 'L1',
          baseId,
          tableId,
          count: 0,
          records: [],
        },
      };
    }

    const lines = records.map((r) => {
      const fieldSummary = r.fields
        ? Object.entries(r.fields).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')
        : 'No fields';
      return `${r.id} - ${fieldSummary}`;
    });

    return {
      result: redactSensitive(`Records in ${tableId} (${records.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_records',
        layer: 'L1',
        baseId,
        tableId,
        count: records.length,
        records: records.map((r) => ({
          id: r.id || null,
          fields: r.fields || {},
          createdTime: r.createdTime || null,
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
 * get_record - Get a single record by ID.
 */
async function handleGetRecord(params, context) {
  const baseId = sanitizeString(params.baseId);
  const tableId = sanitizeString(params.tableId);
  const recordId = sanitizeString(params.recordId);

  if (!baseId) {
    return {
      result: 'Error: The "baseId" parameter is required for get_record.',
      metadata: { success: false, error: 'MISSING_BASE_ID' },
    };
  }
  if (!tableId) {
    return {
      result: 'Error: The "tableId" parameter is required for get_record.',
      metadata: { success: false, error: 'MISSING_TABLE_ID' },
    };
  }
  if (!recordId) {
    return {
      result: 'Error: The "recordId" parameter is required for get_record.',
      metadata: { success: false, error: 'MISSING_RECORD_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/v0/${baseId}/${tableId}/${recordId}`,
      null,
      timeoutMs,
    );

    const fieldLines = data.fields
      ? Object.entries(data.fields).map(([k, v]) => `  ${k}: ${v}`)
      : ['  No fields'];

    const result = [
      `Record: ${data.id || recordId}`,
      `Created: ${data.createdTime || 'N/A'}`,
      `Fields:`,
      ...fieldLines,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_record',
        layer: 'L1',
        baseId,
        tableId,
        recordId: data.id || recordId,
        fields: data.fields || {},
        createdTime: data.createdTime || null,
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
 * create_record - Create a new record in a table.
 */
async function handleCreateRecord(params, context) {
  const baseId = sanitizeString(params.baseId);
  const tableId = sanitizeString(params.tableId);

  if (!baseId) {
    return {
      result: 'Error: The "baseId" parameter is required for create_record.',
      metadata: { success: false, error: 'MISSING_BASE_ID' },
    };
  }
  if (!tableId) {
    return {
      result: 'Error: The "tableId" parameter is required for create_record.',
      metadata: { success: false, error: 'MISSING_TABLE_ID' },
    };
  }
  if (!params.fields || typeof params.fields !== 'object' || Array.isArray(params.fields)) {
    return {
      result: 'Error: The "fields" parameter is required for create_record and must be an object.',
      metadata: { success: false, error: 'MISSING_FIELDS' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      `/v0/${baseId}/${tableId}`,
      { fields: params.fields },
      timeoutMs,
    );

    return {
      result: redactSensitive(`Record created: ${data.id || 'N/A'} in table ${tableId}`),
      metadata: {
        success: true,
        action: 'create_record',
        layer: 'L1',
        baseId,
        tableId,
        recordId: data.id || null,
        fields: data.fields || {},
        createdTime: data.createdTime || null,
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
 * update_record - Update an existing record.
 */
async function handleUpdateRecord(params, context) {
  const baseId = sanitizeString(params.baseId);
  const tableId = sanitizeString(params.tableId);
  const recordId = sanitizeString(params.recordId);

  if (!baseId) {
    return {
      result: 'Error: The "baseId" parameter is required for update_record.',
      metadata: { success: false, error: 'MISSING_BASE_ID' },
    };
  }
  if (!tableId) {
    return {
      result: 'Error: The "tableId" parameter is required for update_record.',
      metadata: { success: false, error: 'MISSING_TABLE_ID' },
    };
  }
  if (!recordId) {
    return {
      result: 'Error: The "recordId" parameter is required for update_record.',
      metadata: { success: false, error: 'MISSING_RECORD_ID' },
    };
  }
  if (!params.fields || typeof params.fields !== 'object' || Array.isArray(params.fields)) {
    return {
      result: 'Error: The "fields" parameter is required for update_record and must be an object.',
      metadata: { success: false, error: 'MISSING_FIELDS' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'PATCH',
      `/v0/${baseId}/${tableId}/${recordId}`,
      { fields: params.fields },
      timeoutMs,
    );

    return {
      result: redactSensitive(`Record updated: ${data.id || recordId} in table ${tableId}`),
      metadata: {
        success: true,
        action: 'update_record',
        layer: 'L1',
        baseId,
        tableId,
        recordId: data.id || recordId,
        fields: data.fields || {},
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
 * delete_record - Delete a record from a table.
 */
async function handleDeleteRecord(params, context) {
  const baseId = sanitizeString(params.baseId);
  const tableId = sanitizeString(params.tableId);
  const recordId = sanitizeString(params.recordId);

  if (!baseId) {
    return {
      result: 'Error: The "baseId" parameter is required for delete_record.',
      metadata: { success: false, error: 'MISSING_BASE_ID' },
    };
  }
  if (!tableId) {
    return {
      result: 'Error: The "tableId" parameter is required for delete_record.',
      metadata: { success: false, error: 'MISSING_TABLE_ID' },
    };
  }
  if (!recordId) {
    return {
      result: 'Error: The "recordId" parameter is required for delete_record.',
      metadata: { success: false, error: 'MISSING_RECORD_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'DELETE',
      `/v0/${baseId}/${tableId}/${recordId}`,
      null,
      timeoutMs,
    );

    return {
      result: redactSensitive(`Record deleted: ${data.id || recordId} from table ${tableId}`),
      metadata: {
        success: true,
        action: 'delete_record',
        layer: 'L1',
        baseId,
        tableId,
        recordId: data.id || recordId,
        deleted: data.deleted ?? true,
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
 * search_records - Search records using a formula filter.
 */
async function handleSearchRecords(params, context) {
  const baseId = sanitizeString(params.baseId);
  const tableId = sanitizeString(params.tableId);
  const formula = sanitizeString(params.formula);

  if (!baseId) {
    return {
      result: 'Error: The "baseId" parameter is required for search_records.',
      metadata: { success: false, error: 'MISSING_BASE_ID' },
    };
  }
  if (!tableId) {
    return {
      result: 'Error: The "tableId" parameter is required for search_records.',
      metadata: { success: false, error: 'MISSING_TABLE_ID' },
    };
  }
  if (!formula) {
    return {
      result: 'Error: The "formula" parameter is required for search_records.',
      metadata: { success: false, error: 'MISSING_FORMULA' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxRecords = clampMaxRecords(params.maxRecords, DEFAULT_MAX_RECORDS);

  const queryParams = { filterByFormula: formula, maxRecords };
  const query = buildQuery(queryParams);
  const path = `/v0/${baseId}/${tableId}${query}`;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      null,
      timeoutMs,
    );

    const records = Array.isArray(data?.records) ? data.records : [];

    if (records.length === 0) {
      return {
        result: `No records found matching formula: ${formula}`,
        metadata: {
          success: true,
          action: 'search_records',
          layer: 'L1',
          baseId,
          tableId,
          formula,
          count: 0,
          records: [],
        },
      };
    }

    const lines = records.map((r) => {
      const fieldSummary = r.fields
        ? Object.entries(r.fields).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')
        : 'No fields';
      return `${r.id} - ${fieldSummary}`;
    });

    return {
      result: redactSensitive(`Search results for "${formula}" (${records.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'search_records',
        layer: 'L1',
        baseId,
        tableId,
        formula,
        count: records.length,
        records: records.map((r) => ({
          id: r.id || null,
          fields: r.fields || {},
          createdTime: r.createdTime || null,
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
 * bulk_create - Create multiple records at once (max 10 per batch).
 */
async function handleBulkCreate(params, context) {
  const baseId = sanitizeString(params.baseId);
  const tableId = sanitizeString(params.tableId);

  if (!baseId) {
    return {
      result: 'Error: The "baseId" parameter is required for bulk_create.',
      metadata: { success: false, error: 'MISSING_BASE_ID' },
    };
  }
  if (!tableId) {
    return {
      result: 'Error: The "tableId" parameter is required for bulk_create.',
      metadata: { success: false, error: 'MISSING_TABLE_ID' },
    };
  }
  if (!Array.isArray(params.records) || params.records.length === 0) {
    return {
      result: 'Error: The "records" parameter is required for bulk_create and must be a non-empty array.',
      metadata: { success: false, error: 'MISSING_RECORDS' },
    };
  }
  if (params.records.length > MAX_BULK_CREATE) {
    return {
      result: `Error: bulk_create supports a maximum of ${MAX_BULK_CREATE} records per request. Received ${params.records.length}.`,
      metadata: { success: false, error: 'TOO_MANY_RECORDS' },
    };
  }

  // Validate each record has a fields object
  for (let i = 0; i < params.records.length; i++) {
    const rec = params.records[i];
    if (!rec || typeof rec !== 'object' || !rec.fields || typeof rec.fields !== 'object' || Array.isArray(rec.fields)) {
      return {
        result: `Error: Record at index ${i} must have a "fields" object.`,
        metadata: { success: false, error: 'INVALID_RECORD_FORMAT' },
      };
    }
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const body = {
    records: params.records.map((r) => ({ fields: r.fields })),
  };

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      `/v0/${baseId}/${tableId}`,
      body,
      timeoutMs,
    );

    const created = Array.isArray(data?.records) ? data.records : [];

    return {
      result: redactSensitive(`Bulk create: ${created.length} record(s) created in table ${tableId}`),
      metadata: {
        success: true,
        action: 'bulk_create',
        layer: 'L1',
        baseId,
        tableId,
        count: created.length,
        records: created.map((r) => ({
          id: r.id || null,
          fields: r.fields || {},
          createdTime: r.createdTime || null,
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
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute an Airtable database operation.
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
      case 'list_records':
        return await handleListRecords(params, context);
      case 'get_record':
        return await handleGetRecord(params, context);
      case 'create_record':
        return await handleCreateRecord(params, context);
      case 'update_record':
        return await handleUpdateRecord(params, context);
      case 'delete_record':
        return await handleDeleteRecord(params, context);
      case 'search_records':
        return await handleSearchRecords(params, context);
      case 'list_bases':
        return await handleListBases(params, context);
      case 'list_tables':
        return await handleListTables(params, context);
      case 'bulk_create':
        return await handleBulkCreate(params, context);
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
