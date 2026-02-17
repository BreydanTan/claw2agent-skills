/**
 * CRM Connector Skill Handler (Layer 1)
 *
 * Manage CRM contacts, leads, and activity logs via provider client.
 * Supports Salesforce/HubSpot-style operations through injected client.
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
  'find_contact',
  'create_lead',
  'add_log',
  'list_deals',
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
    result: 'Error: Provider client required for CRM API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for CRM API access. Configure an API key or platform adapter.',
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
 * Validate a query parameter (non-empty string).
 *
 * @param {*} query
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
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

/**
 * Validate leadData parameter (string or object with name, email, company).
 *
 * @param {*} leadData
 * @returns {{ valid: boolean, value?: Object, error?: string }}
 */
function validateLeadData(leadData) {
  if (leadData === undefined || leadData === null) {
    return { valid: false, error: 'The "leadData" parameter is required.' };
  }

  let parsed;
  if (typeof leadData === 'string') {
    try {
      parsed = JSON.parse(leadData);
    } catch {
      return { valid: false, error: 'The "leadData" string is not valid JSON.' };
    }
  } else if (typeof leadData === 'object') {
    parsed = leadData;
  } else {
    return { valid: false, error: 'The "leadData" parameter must be a JSON string or object.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'The "leadData" must be a JSON object with lead fields.' };
  }

  return { valid: true, value: parsed };
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
    case 'find_contact': {
      const queryVal = validateQuery(params.query);
      if (!queryVal.valid) return { valid: false, error: queryVal.error };
      return { valid: true };
    }
    case 'create_lead': {
      const leadVal = validateLeadData(params.leadData);
      if (!leadVal.valid) return { valid: false, error: leadVal.error };
      return { valid: true };
    }
    case 'add_log': {
      if (!params.contactId || typeof params.contactId !== 'string') {
        return { valid: false, error: 'The "contactId" parameter is required and must be a non-empty string.' };
      }
      if (!params.logContent || typeof params.logContent !== 'string') {
        return { valid: false, error: 'The "logContent" parameter is required and must be a non-empty string.' };
      }
      return { valid: true };
    }
    case 'list_deals': {
      if (params.status && typeof params.status !== 'string') {
        return { valid: false, error: 'The "status" parameter must be a string.' };
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
 * Handle find_contact -- POST /contacts/search body: { query }
 */
async function handleFindContact(params, context) {
  const queryVal = validateQuery(params.query);
  if (!queryVal.valid) {
    return {
      result: `Error: ${queryVal.error}`,
      metadata: { success: false, action: 'find_contact', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const query = queryVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/contacts/search',
      { body: { query } },
      timeoutMs
    );

    const contacts = data?.contacts || data?.results || [];
    const lines = [
      `Contact Search Results`,
      `Query: ${query}`,
      `Found: ${contacts.length} contact(s)`,
      '',
      ...contacts.map((c, i) => {
        const name = c.name || c.fullName || 'Unknown';
        const email = c.email || '';
        return `${i + 1}. ${name}${email ? ` (${email})` : ''}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'find_contact',
        query,
        contactCount: contacts.length,
        contacts,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'find_contact', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

/**
 * Handle create_lead -- POST /leads body: leadData
 */
async function handleCreateLead(params, context) {
  const leadVal = validateLeadData(params.leadData);
  if (!leadVal.valid) {
    return {
      result: `Error: ${leadVal.error}`,
      metadata: { success: false, action: 'create_lead', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const leadData = leadVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/leads',
      { body: leadData },
      timeoutMs
    );

    const id = data?.id || data?.leadId || null;
    const lines = [
      `Lead Created`,
      id ? `ID: ${id}` : null,
      leadData.name ? `Name: ${leadData.name}` : null,
      leadData.email ? `Email: ${leadData.email}` : null,
      leadData.company ? `Company: ${leadData.company}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'create_lead',
        leadId: id,
        leadData,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'create_lead', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

/**
 * Handle add_log -- POST /contacts/{contactId}/logs body: { content }
 */
async function handleAddLog(params, context) {
  if (!params.contactId || typeof params.contactId !== 'string') {
    return {
      result: 'Error: The "contactId" parameter is required and must be a non-empty string.',
      metadata: { success: false, action: 'add_log', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }
  if (!params.logContent || typeof params.logContent !== 'string') {
    return {
      result: 'Error: The "logContent" parameter is required and must be a non-empty string.',
      metadata: { success: false, action: 'add_log', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const { contactId, logContent } = params;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      `/contacts/${contactId}/logs`,
      { body: { content: logContent } },
      timeoutMs
    );

    const logId = data?.id || data?.logId || null;
    const lines = [
      `Activity Log Added`,
      `Contact: ${contactId}`,
      logId ? `Log ID: ${logId}` : null,
      `Content: ${logContent}`,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'add_log',
        contactId,
        logId,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'add_log', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

/**
 * Handle list_deals -- GET /deals?status=xxx
 */
async function handleListDeals(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const status = (params.status && typeof params.status === 'string') ? params.status : 'all';

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/deals?status=${encodeURIComponent(status)}`,
      {},
      timeoutMs
    );

    const deals = data?.deals || data?.results || [];
    const lines = [
      `Deals List`,
      `Status filter: ${status}`,
      `Found: ${deals.length} deal(s)`,
      '',
      ...deals.map((d, i) => {
        const name = d.name || d.title || 'Untitled';
        const value = d.value || d.amount || '';
        const dealStatus = d.status || '';
        return `${i + 1}. ${name}${value ? ` - $${value}` : ''}${dealStatus ? ` [${dealStatus}]` : ''}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_deals',
        status,
        dealCount: deals.length,
        deals,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_deals', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a CRM operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: find_contact, create_lead, add_log, list_deals
 * @param {string} [params.query] - Search query (required for find_contact)
 * @param {string|Object} [params.leadData] - Lead data (required for create_lead)
 * @param {string} [params.contactId] - Contact ID (required for add_log)
 * @param {string} [params.logContent] - Activity log content (required for add_log)
 * @param {string} [params.status] - Deal status filter (optional for list_deals, default 'all')
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
      case 'find_contact':
        return await handleFindContact(params, context);
      case 'create_lead':
        return await handleCreateLead(params, context);
      case 'add_log':
        return await handleAddLog(params, context);
      case 'list_deals':
        return await handleListDeals(params, context);
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
  name: 'crm-connector',
  version: '1.0.0',
  description: 'Manage CRM contacts, leads, and activity logs via provider client. Supports Salesforce/HubSpot-style operations.',
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
  validateQuery,
  validateLeadData,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
