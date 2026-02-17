/**
 * Instagram Graph API Skill Handler (Layer 1)
 *
 * Interact with the Instagram Graph API to retrieve user profiles,
 * media posts, hashtags, insights, comments, and stories.
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
  'get_profile',
  'get_media',
  'list_media',
  'search_hashtag',
  'get_insights',
  'get_comments',
  'get_stories',
];

const VALID_METRICS = ['impressions', 'reach', 'profile_views', 'follower_count'];

const VALID_PERIODS = ['day', 'week', 'month'];

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT_MEDIA = 100;
const MAX_LIMIT_HASHTAG = 50;
const MAX_LIMIT_COMMENTS = 100;

const MAX_QUERY_LENGTH = 100;

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const DEFAULT_PERIOD = 'day';

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
    result: 'Error: Provider client required for Instagram Graph API. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Instagram Graph API. Configure an API key or platform adapter.',
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
 * @param {string} path - The resource path
 * @param {Object} opts - Additional request options
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
      code: err.code || 'UPSTREAM_ERROR',
      message: err.message || 'Unknown request error',
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
 * Validate that a value is a non-empty string (for IDs, etc.).
 *
 * @param {*} value
 * @param {string} name - Parameter name for error messages
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRequiredString(value, name) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, error: `The "${name}" parameter is required and must be a non-empty string.` };
  }
  return { valid: true };
}

/**
 * Validate and clamp a limit parameter.
 *
 * @param {*} limit
 * @param {number} min
 * @param {number} max
 * @param {number} defaultValue
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLimit(limit, min, max, defaultValue) {
  if (limit === undefined || limit === null) {
    return { valid: true, value: defaultValue };
  }

  const num = Number(limit);

  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return { valid: false, error: `The "limit" parameter must be an integer between ${min} and ${max}.` };
  }

  // Clamp to valid range
  const clamped = Math.max(min, Math.min(num, max));
  return { valid: true, value: clamped };
}

/**
 * Validate the query parameter for hashtag search.
 *
 * @param {*} query
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateQuery(query) {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'The "query" parameter is required and must be a non-empty string.' };
  }

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'The "query" parameter must not be empty.' };
  }

  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      valid: false,
      error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters (got ${trimmed.length}).`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate that metrics are all valid values.
 *
 * @param {*} metrics
 * @returns {{ valid: boolean, value?: string[], error?: string }}
 */
function validateMetrics(metrics) {
  if (metrics === undefined || metrics === null) {
    return { valid: true, value: [...VALID_METRICS] };
  }

  if (!Array.isArray(metrics)) {
    return { valid: false, error: `The "metrics" parameter must be an array. Valid values: ${VALID_METRICS.join(', ')}` };
  }

  if (metrics.length === 0) {
    return { valid: true, value: [...VALID_METRICS] };
  }

  const invalid = metrics.filter((m) => !VALID_METRICS.includes(m));
  if (invalid.length > 0) {
    return {
      valid: false,
      error: `Invalid metrics: ${invalid.join(', ')}. Valid values: ${VALID_METRICS.join(', ')}`,
    };
  }

  return { valid: true, value: [...metrics] };
}

/**
 * Validate the period parameter for insights.
 *
 * @param {*} period
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validatePeriod(period) {
  if (period === undefined || period === null) {
    return { valid: true, value: DEFAULT_PERIOD };
  }

  if (typeof period !== 'string' || !VALID_PERIODS.includes(period)) {
    return {
      valid: false,
      error: `Invalid period "${period}". Must be one of: ${VALID_PERIODS.join(', ')}`,
    };
  }

  return { valid: true, value: period };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle the "get_profile" action -- retrieve a user profile.
 */
async function handleGetProfile(params, context) {
  const userIdCheck = validateRequiredString(params.userId, 'userId');
  if (!userIdCheck.valid) {
    return {
      result: `Error: ${userIdCheck.error}`,
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
      `/users/${params.userId}`,
      {},
      timeoutMs
    );

    const lines = [
      `Profile: ${data.name || data.username || params.userId}`,
      data.username ? `Username: @${data.username}` : null,
      data.biography ? `Bio: ${data.biography}` : null,
      data.followers_count !== undefined ? `Followers: ${data.followers_count}` : null,
      data.follows_count !== undefined ? `Following: ${data.follows_count}` : null,
      data.media_count !== undefined ? `Posts: ${data.media_count}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_profile',
        layer: 'L1',
        userId: params.userId,
        profile: data,
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
 * Handle the "get_media" action -- retrieve a specific media post.
 */
async function handleGetMedia(params, context) {
  const mediaIdCheck = validateRequiredString(params.mediaId, 'mediaId');
  if (!mediaIdCheck.valid) {
    return {
      result: `Error: ${mediaIdCheck.error}`,
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
      `/media/${params.mediaId}`,
      {},
      timeoutMs
    );

    const lines = [
      `Media: ${data.id || params.mediaId}`,
      data.media_type ? `Type: ${data.media_type}` : null,
      data.caption ? `Caption: ${data.caption}` : null,
      data.timestamp ? `Posted: ${data.timestamp}` : null,
      data.like_count !== undefined ? `Likes: ${data.like_count}` : null,
      data.comments_count !== undefined ? `Comments: ${data.comments_count}` : null,
      data.media_url ? `URL: ${data.media_url}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_media',
        layer: 'L1',
        mediaId: params.mediaId,
        media: data,
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
 * Handle the "list_media" action -- list a user's media posts.
 */
async function handleListMedia(params, context) {
  const userIdCheck = validateRequiredString(params.userId, 'userId');
  if (!userIdCheck.valid) {
    return {
      result: `Error: ${userIdCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitCheck = validateLimit(params.limit, MIN_LIMIT, MAX_LIMIT_MEDIA, DEFAULT_LIMIT);
  if (!limitCheck.valid) {
    return {
      result: `Error: ${limitCheck.error}`,
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
      `/users/${params.userId}/media?limit=${limitCheck.value}`,
      {},
      timeoutMs
    );

    const items = data?.data || data?.media || [];
    const lines = [
      `Media for user ${params.userId} (${items.length} item(s), limit: ${limitCheck.value})`,
      '',
      ...items.map((item, i) => {
        const parts = [`${i + 1}. ${item.id || 'unknown'}`];
        if (item.media_type) parts.push(`[${item.media_type}]`);
        if (item.caption) parts.push(`- ${item.caption.substring(0, 80)}`);
        return parts.join(' ');
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_media',
        layer: 'L1',
        userId: params.userId,
        limit: limitCheck.value,
        count: items.length,
        media: items,
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
 * Handle the "search_hashtag" action -- search for a hashtag.
 */
async function handleSearchHashtag(params, context) {
  const queryCheck = validateQuery(params.query);
  if (!queryCheck.valid) {
    return {
      result: `Error: ${queryCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitCheck = validateLimit(params.limit, MIN_LIMIT, MAX_LIMIT_HASHTAG, DEFAULT_LIMIT);
  if (!limitCheck.valid) {
    return {
      result: `Error: ${limitCheck.error}`,
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
      `/hashtags/search?q=${encodeURIComponent(queryCheck.sanitized)}&limit=${limitCheck.value}`,
      {},
      timeoutMs
    );

    const items = data?.data || data?.hashtags || [];
    const lines = [
      `Hashtag search: "${queryCheck.sanitized}" (${items.length} result(s))`,
      '',
      ...items.map((item, i) => {
        const parts = [`${i + 1}. #${item.name || item.id || 'unknown'}`];
        if (item.media_count !== undefined) parts.push(`(${item.media_count} posts)`);
        return parts.join(' ');
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_hashtag',
        layer: 'L1',
        query: queryCheck.sanitized,
        limit: limitCheck.value,
        count: items.length,
        hashtags: items,
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
 * Handle the "get_insights" action -- retrieve account insights/analytics.
 */
async function handleGetInsights(params, context) {
  const userIdCheck = validateRequiredString(params.userId, 'userId');
  if (!userIdCheck.valid) {
    return {
      result: `Error: ${userIdCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const metricsCheck = validateMetrics(params.metrics);
  if (!metricsCheck.valid) {
    return {
      result: `Error: ${metricsCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const periodCheck = validatePeriod(params.period);
  if (!periodCheck.valid) {
    return {
      result: `Error: ${periodCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const metricsStr = metricsCheck.value.join(',');
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/users/${params.userId}/insights?metrics=${metricsStr}&period=${periodCheck.value}`,
      {},
      timeoutMs
    );

    const insights = data?.data || data?.insights || [];
    const lines = [
      `Insights for user ${params.userId}`,
      `Period: ${periodCheck.value} | Metrics: ${metricsCheck.value.join(', ')}`,
      '',
      ...insights.map((item) => {
        const value = item.values?.[0]?.value ?? item.value ?? 'N/A';
        return `${item.name || item.title || 'unknown'}: ${value}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_insights',
        layer: 'L1',
        userId: params.userId,
        metrics: metricsCheck.value,
        period: periodCheck.value,
        insights,
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
 * Handle the "get_comments" action -- get comments on a media post.
 */
async function handleGetComments(params, context) {
  const mediaIdCheck = validateRequiredString(params.mediaId, 'mediaId');
  if (!mediaIdCheck.valid) {
    return {
      result: `Error: ${mediaIdCheck.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitCheck = validateLimit(params.limit, MIN_LIMIT, MAX_LIMIT_COMMENTS, DEFAULT_LIMIT);
  if (!limitCheck.valid) {
    return {
      result: `Error: ${limitCheck.error}`,
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
      `/media/${params.mediaId}/comments?limit=${limitCheck.value}`,
      {},
      timeoutMs
    );

    const comments = data?.data || data?.comments || [];
    const lines = [
      `Comments on media ${params.mediaId} (${comments.length} comment(s), limit: ${limitCheck.value})`,
      '',
      ...comments.map((c, i) => {
        const author = c.username || c.from?.username || 'anonymous';
        const text = c.text || c.message || '';
        return `${i + 1}. @${author}: ${text.substring(0, 120)}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_comments',
        layer: 'L1',
        mediaId: params.mediaId,
        limit: limitCheck.value,
        count: comments.length,
        comments,
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
 * Handle the "get_stories" action -- get a user's active stories.
 */
async function handleGetStories(params, context) {
  const userIdCheck = validateRequiredString(params.userId, 'userId');
  if (!userIdCheck.valid) {
    return {
      result: `Error: ${userIdCheck.error}`,
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
      `/users/${params.userId}/stories`,
      {},
      timeoutMs
    );

    const stories = data?.data || data?.stories || [];
    const lines = [
      `Stories for user ${params.userId} (${stories.length} active story/stories)`,
      '',
      ...stories.map((s, i) => {
        const parts = [`${i + 1}. ${s.id || 'unknown'}`];
        if (s.media_type) parts.push(`[${s.media_type}]`);
        if (s.timestamp) parts.push(`(${s.timestamp})`);
        return parts.join(' ');
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_stories',
        layer: 'L1',
        userId: params.userId,
        count: stories.length,
        stories,
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
// validate() export
// ---------------------------------------------------------------------------

/**
 * Validate params for a given action without executing.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
export function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'get_profile': {
      const check = validateRequiredString(params.userId, 'userId');
      if (!check.valid) return { valid: false, error: check.error };
      return { valid: true };
    }

    case 'get_media': {
      const check = validateRequiredString(params.mediaId, 'mediaId');
      if (!check.valid) return { valid: false, error: check.error };
      return { valid: true };
    }

    case 'list_media': {
      const idCheck = validateRequiredString(params.userId, 'userId');
      if (!idCheck.valid) return { valid: false, error: idCheck.error };
      const limitCheck = validateLimit(params.limit, MIN_LIMIT, MAX_LIMIT_MEDIA, DEFAULT_LIMIT);
      if (!limitCheck.valid) return { valid: false, error: limitCheck.error };
      return { valid: true };
    }

    case 'search_hashtag': {
      const qCheck = validateQuery(params.query);
      if (!qCheck.valid) return { valid: false, error: qCheck.error };
      const limitCheck = validateLimit(params.limit, MIN_LIMIT, MAX_LIMIT_HASHTAG, DEFAULT_LIMIT);
      if (!limitCheck.valid) return { valid: false, error: limitCheck.error };
      return { valid: true };
    }

    case 'get_insights': {
      const idCheck = validateRequiredString(params.userId, 'userId');
      if (!idCheck.valid) return { valid: false, error: idCheck.error };
      const metricsCheck = validateMetrics(params.metrics);
      if (!metricsCheck.valid) return { valid: false, error: metricsCheck.error };
      const periodCheck = validatePeriod(params.period);
      if (!periodCheck.valid) return { valid: false, error: periodCheck.error };
      return { valid: true };
    }

    case 'get_comments': {
      const idCheck = validateRequiredString(params.mediaId, 'mediaId');
      if (!idCheck.valid) return { valid: false, error: idCheck.error };
      const limitCheck = validateLimit(params.limit, MIN_LIMIT, MAX_LIMIT_COMMENTS, DEFAULT_LIMIT);
      if (!limitCheck.valid) return { valid: false, error: limitCheck.error };
      return { valid: true };
    }

    case 'get_stories': {
      const check = validateRequiredString(params.userId, 'userId');
      if (!check.valid) return { valid: false, error: check.error };
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'instagram-graph-api',
  version: '1.0.0',
  description: 'Instagram Graph API interaction skill. Retrieve profiles, media, hashtags, insights, comments, and stories. Layer 1 skill using provider client for API access.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute an Instagram Graph API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: get_profile, get_media, list_media, search_hashtag, get_insights, get_comments, get_stories
 * @param {string} [params.userId] - User ID (required for profile/media/insights/stories)
 * @param {string} [params.mediaId] - Media ID (required for get_media/get_comments)
 * @param {string} [params.query] - Search query (required for search_hashtag)
 * @param {number} [params.limit] - Result limit
 * @param {string[]} [params.metrics] - Metrics for insights
 * @param {string} [params.period] - Period for insights (day/week/month)
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
      case 'get_profile':
        return await handleGetProfile(params, context);
      case 'get_media':
        return await handleGetMedia(params, context);
      case 'list_media':
        return await handleListMedia(params, context);
      case 'search_hashtag':
        return await handleSearchHashtag(params, context);
      case 'get_insights':
        return await handleGetInsights(params, context);
      case 'get_comments':
        return await handleGetComments(params, context);
      case 'get_stories':
        return await handleGetStories(params, context);
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
// Export internals for testing
// ---------------------------------------------------------------------------

export {
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  validateRequiredString,
  validateLimit,
  validateQuery,
  validateMetrics,
  validatePeriod,
  VALID_ACTIONS,
  VALID_METRICS,
  VALID_PERIODS,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT_MEDIA,
  MAX_LIMIT_HASHTAG,
  MAX_LIMIT_COMMENTS,
  MAX_QUERY_LENGTH,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_PERIOD,
};
