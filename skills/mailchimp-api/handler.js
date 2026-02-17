/**
 * Mailchimp Marketing API Skill Handler (Layer 1)
 *
 * Interact with the Mailchimp Marketing API to manage campaigns, audiences,
 * subscribers, and reporting.
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
  'list_campaigns',
  'get_campaign',
  'create_campaign',
  'list_audiences',
  'add_subscriber',
  'get_campaign_report',
  'search_members',
];

const VALID_CAMPAIGN_STATUSES = ['save', 'paused', 'schedule', 'sending', 'sent'];

const VALID_CAMPAIGN_TYPES = ['regular', 'plaintext'];

const VALID_SUBSCRIBER_STATUSES = ['subscribed', 'unsubscribed', 'pending'];

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const MAX_QUERY_LENGTH = 200;

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

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
    result: 'Error: Provider client required for Mailchimp API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Mailchimp API access. Configure an API key or platform adapter.',
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
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The API path
 * @param {Object} opts - Request options (body, query params, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, opts?.body || null, {
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
 * Validate an email address (basic format check).
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (typeof email !== 'string' || email.trim().length === 0) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Clamp a limit value to the valid range.
 *
 * @param {*} limit
 * @returns {number}
 */
function clampLimit(limit) {
  if (limit === undefined || limit === null) return DEFAULT_LIMIT;
  const num = Number(limit);
  if (!Number.isFinite(num) || num < MIN_LIMIT) return MIN_LIMIT;
  if (num > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(num);
}

// ---------------------------------------------------------------------------
// Validate function (exported)
// ---------------------------------------------------------------------------

/**
 * Validate params for a given action.
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
    case 'get_campaign':
      if (!params.campaignId || typeof params.campaignId !== 'string' || params.campaignId.trim().length === 0) {
        return { valid: false, error: 'The "campaignId" parameter is required.' };
      }
      break;

    case 'create_campaign':
      if (!params.subjectLine || typeof params.subjectLine !== 'string' || params.subjectLine.trim().length === 0) {
        return { valid: false, error: 'The "subjectLine" parameter is required.' };
      }
      if (!params.fromName || typeof params.fromName !== 'string' || params.fromName.trim().length === 0) {
        return { valid: false, error: 'The "fromName" parameter is required.' };
      }
      if (!params.replyTo || !isValidEmail(params.replyTo)) {
        return { valid: false, error: 'The "replyTo" parameter is required and must be a valid email address.' };
      }
      if (!params.listId || typeof params.listId !== 'string' || params.listId.trim().length === 0) {
        return { valid: false, error: 'The "listId" parameter is required.' };
      }
      if (params.type && !VALID_CAMPAIGN_TYPES.includes(params.type)) {
        return { valid: false, error: `Invalid campaign type "${params.type}". Must be one of: ${VALID_CAMPAIGN_TYPES.join(', ')}` };
      }
      break;

    case 'add_subscriber':
      if (!params.listId || typeof params.listId !== 'string' || params.listId.trim().length === 0) {
        return { valid: false, error: 'The "listId" parameter is required.' };
      }
      if (!params.email || !isValidEmail(params.email)) {
        return { valid: false, error: 'The "email" parameter is required and must be a valid email address.' };
      }
      if (params.status && !VALID_SUBSCRIBER_STATUSES.includes(params.status)) {
        return { valid: false, error: `Invalid subscriber status "${params.status}". Must be one of: ${VALID_SUBSCRIBER_STATUSES.join(', ')}` };
      }
      break;

    case 'get_campaign_report':
      if (!params.campaignId || typeof params.campaignId !== 'string' || params.campaignId.trim().length === 0) {
        return { valid: false, error: 'The "campaignId" parameter is required.' };
      }
      break;

    case 'search_members':
      if (!params.query || typeof params.query !== 'string' || params.query.trim().length === 0) {
        return { valid: false, error: 'The "query" parameter is required.' };
      }
      if (params.query.trim().length > MAX_QUERY_LENGTH) {
        return { valid: false, error: `The "query" parameter must not exceed ${MAX_QUERY_LENGTH} characters.` };
      }
      break;

    case 'list_campaigns':
      if (params.status && !VALID_CAMPAIGN_STATUSES.includes(params.status)) {
        return { valid: false, error: `Invalid campaign status "${params.status}". Must be one of: ${VALID_CAMPAIGN_STATUSES.join(', ')}` };
      }
      break;

    case 'list_audiences':
      // No required params
      break;
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle list_campaigns action -- list email campaigns.
 */
async function handleListCampaigns(params, context) {
  const { status } = params;

  if (status && !VALID_CAMPAIGN_STATUSES.includes(status)) {
    return {
      result: `Error: Invalid campaign status "${status}". Must be one of: ${VALID_CAMPAIGN_STATUSES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = clampLimit(params.limit);

  let path = `/campaigns?limit=${limit}`;
  if (status) {
    path += `&status=${status}`;
  }

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    const campaigns = data?.campaigns || [];
    const totalItems = data?.total_items || campaigns.length;

    const lines = [
      `Found ${totalItems} campaign(s)`,
      `Showing: ${campaigns.length} (limit: ${limit})`,
      '',
    ];

    for (const c of campaigns) {
      lines.push(`- ${c.settings?.subject_line || c.id || 'Untitled'} [${c.status || 'unknown'}]`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_campaigns',
        layer: 'L1',
        totalItems,
        count: campaigns.length,
        limit,
        status: status || null,
        campaigns: campaigns.map((c) => ({
          id: c.id,
          status: c.status,
          subject: c.settings?.subject_line,
        })),
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
 * Handle get_campaign action -- get campaign details.
 */
async function handleGetCampaign(params, context) {
  const { campaignId } = params;

  if (!campaignId || typeof campaignId !== 'string' || campaignId.trim().length === 0) {
    return {
      result: 'Error: The "campaignId" parameter is required.',
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
      `/campaigns/${campaignId.trim()}`,
      {},
      timeoutMs
    );

    const lines = [
      `Campaign: ${data.settings?.subject_line || data.id || campaignId}`,
      `Status: ${data.status || 'unknown'}`,
      `Type: ${data.type || 'unknown'}`,
      `List ID: ${data.recipients?.list_id || 'N/A'}`,
      `From: ${data.settings?.from_name || 'N/A'} <${data.settings?.reply_to || 'N/A'}>`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_campaign',
        layer: 'L1',
        campaignId: data.id || campaignId,
        status: data.status,
        type: data.type,
        campaign: data,
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
 * Handle create_campaign action -- create a new campaign.
 */
async function handleCreateCampaign(params, context) {
  const {
    type = 'regular',
    subjectLine,
    fromName,
    replyTo,
    listId,
  } = params;

  if (!VALID_CAMPAIGN_TYPES.includes(type)) {
    return {
      result: `Error: Invalid campaign type "${type}". Must be one of: ${VALID_CAMPAIGN_TYPES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!subjectLine || typeof subjectLine !== 'string' || subjectLine.trim().length === 0) {
    return {
      result: 'Error: The "subjectLine" parameter is required.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!fromName || typeof fromName !== 'string' || fromName.trim().length === 0) {
    return {
      result: 'Error: The "fromName" parameter is required.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!replyTo || !isValidEmail(replyTo)) {
    return {
      result: 'Error: The "replyTo" parameter is required and must be a valid email address.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!listId || typeof listId !== 'string' || listId.trim().length === 0) {
    return {
      result: 'Error: The "listId" parameter is required.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const body = {
    type,
    settings: {
      subject_line: subjectLine.trim(),
      from_name: fromName.trim(),
      reply_to: replyTo.trim(),
    },
    recipients: {
      list_id: listId.trim(),
    },
  };

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/campaigns',
      { body },
      timeoutMs
    );

    const lines = [
      `Campaign created successfully`,
      `ID: ${data.id || 'N/A'}`,
      `Type: ${type}`,
      `Subject: ${subjectLine.trim()}`,
      `From: ${fromName.trim()} <${replyTo.trim()}>`,
      `List: ${listId.trim()}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'create_campaign',
        layer: 'L1',
        campaignId: data.id,
        type,
        subjectLine: subjectLine.trim(),
        fromName: fromName.trim(),
        replyTo: replyTo.trim(),
        listId: listId.trim(),
        campaign: data,
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
 * Handle list_audiences action -- list audiences/lists.
 */
async function handleListAudiences(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = clampLimit(params.limit);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/lists?limit=${limit}`,
      {},
      timeoutMs
    );

    const lists = data?.lists || [];
    const totalItems = data?.total_items || lists.length;

    const lines = [
      `Found ${totalItems} audience(s)`,
      `Showing: ${lists.length} (limit: ${limit})`,
      '',
    ];

    for (const l of lists) {
      lines.push(`- ${l.name || l.id || 'Unnamed'} (${l.stats?.member_count || 0} members)`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_audiences',
        layer: 'L1',
        totalItems,
        count: lists.length,
        limit,
        audiences: lists.map((l) => ({
          id: l.id,
          name: l.name,
          memberCount: l.stats?.member_count || 0,
        })),
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
 * Handle add_subscriber action -- add a subscriber to a list.
 */
async function handleAddSubscriber(params, context) {
  const {
    listId,
    email,
    status = 'pending',
    firstName,
    lastName,
  } = params;

  if (!listId || typeof listId !== 'string' || listId.trim().length === 0) {
    return {
      result: 'Error: The "listId" parameter is required.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!email || !isValidEmail(email)) {
    return {
      result: 'Error: The "email" parameter is required and must be a valid email address.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!VALID_SUBSCRIBER_STATUSES.includes(status)) {
    return {
      result: `Error: Invalid subscriber status "${status}". Must be one of: ${VALID_SUBSCRIBER_STATUSES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const body = {
    email_address: email.trim(),
    status,
    merge_fields: {},
  };

  if (firstName && typeof firstName === 'string') {
    body.merge_fields.FNAME = firstName.trim();
  }
  if (lastName && typeof lastName === 'string') {
    body.merge_fields.LNAME = lastName.trim();
  }

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      `/lists/${listId.trim()}/members`,
      { body },
      timeoutMs
    );

    const lines = [
      `Subscriber added successfully`,
      `Email: ${email.trim()}`,
      `Status: ${status}`,
      `List: ${listId.trim()}`,
      `ID: ${data.id || 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'add_subscriber',
        layer: 'L1',
        subscriberId: data.id,
        email: email.trim(),
        status,
        listId: listId.trim(),
        subscriber: data,
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
 * Handle get_campaign_report action -- get campaign performance report.
 */
async function handleGetCampaignReport(params, context) {
  const { campaignId } = params;

  if (!campaignId || typeof campaignId !== 'string' || campaignId.trim().length === 0) {
    return {
      result: 'Error: The "campaignId" parameter is required.',
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
      `/reports/${campaignId.trim()}`,
      {},
      timeoutMs
    );

    const lines = [
      `Campaign Report: ${data.campaign_title || campaignId}`,
      `Emails Sent: ${data.emails_sent || 0}`,
      `Opens: ${data.opens?.unique_opens || 0} unique / ${data.opens?.opens_total || 0} total`,
      `Clicks: ${data.clicks?.unique_clicks || 0} unique / ${data.clicks?.clicks_total || 0} total`,
      `Unsubscribes: ${data.unsubscribed || 0}`,
      `Bounce Rate: ${data.bounces?.hard_bounces || 0} hard / ${data.bounces?.soft_bounces || 0} soft`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_campaign_report',
        layer: 'L1',
        campaignId: data.id || campaignId,
        emailsSent: data.emails_sent || 0,
        opens: data.opens || {},
        clicks: data.clicks || {},
        unsubscribed: data.unsubscribed || 0,
        bounces: data.bounces || {},
        report: data,
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
 * Handle search_members action -- search members across lists.
 */
async function handleSearchMembers(params, context) {
  const { query, listId } = params;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      result: 'Error: The "query" parameter is required.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const trimmedQuery = query.trim();

  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    return {
      result: `Error: The "query" parameter must not exceed ${MAX_QUERY_LENGTH} characters.`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  let path = `/search-members?query=${encodeURIComponent(trimmedQuery)}`;
  if (listId && typeof listId === 'string' && listId.trim().length > 0) {
    path += `&list_id=${encodeURIComponent(listId.trim())}`;
  }

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    const members = data?.exact_matches?.members || data?.full_search?.members || data?.members || [];
    const totalItems = data?.exact_matches?.total_items || data?.full_search?.total_items || members.length;

    const lines = [
      `Search results for "${trimmedQuery}"`,
      `Found ${totalItems} member(s)`,
      '',
    ];

    for (const m of members) {
      lines.push(`- ${m.email_address || 'unknown'} (${m.status || 'unknown'})`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_members',
        layer: 'L1',
        query: trimmedQuery,
        listId: listId || null,
        totalItems,
        count: members.length,
        members: members.map((m) => ({
          id: m.id,
          email: m.email_address,
          status: m.status,
        })),
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
// Meta export
// ---------------------------------------------------------------------------

const meta = {
  name: 'mailchimp-api',
  version: '1.0.0',
  description: 'Mailchimp Marketing API interaction skill. Manage campaigns, audiences, subscribers, and reporting.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Mailchimp Marketing API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: list_campaigns, get_campaign, create_campaign, list_audiences, add_subscriber, get_campaign_report, search_members
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
      case 'list_campaigns':
        return await handleListCampaigns(params, context);
      case 'get_campaign':
        return await handleGetCampaign(params, context);
      case 'create_campaign':
        return await handleCreateCampaign(params, context);
      case 'list_audiences':
        return await handleListAudiences(params, context);
      case 'add_subscriber':
        return await handleAddSubscriber(params, context);
      case 'get_campaign_report':
        return await handleGetCampaignReport(params, context);
      case 'search_members':
        return await handleSearchMembers(params, context);
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

// Export internals for testing
export {
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  isValidEmail,
  clampLimit,
  validate,
  meta,
  VALID_ACTIONS,
  VALID_CAMPAIGN_STATUSES,
  VALID_CAMPAIGN_TYPES,
  VALID_SUBSCRIBER_STATUSES,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
