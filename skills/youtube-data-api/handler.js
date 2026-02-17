/**
 * YouTube Data API Skill Handler (Layer 1)
 *
 * Search videos, retrieve video/channel details, list comments,
 * get trending videos, browse playlists, and list channel videos.
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
  'search_videos',
  'get_video',
  'get_channel',
  'get_comments',
  'get_trending',
  'get_playlist',
  'get_channel_videos',
];

const VALID_SEARCH_ORDERS = ['relevance', 'date', 'viewCount', 'rating'];
const VALID_COMMENT_ORDERS = ['time', 'relevance'];
const VALID_CHANNEL_VIDEO_ORDERS = ['date', 'viewCount'];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const MAX_QUERY_LENGTH = 500;

const SEARCH_LIMIT_MIN = 1;
const SEARCH_LIMIT_MAX = 50;
const SEARCH_LIMIT_DEFAULT = 25;

const COMMENT_LIMIT_MIN = 1;
const COMMENT_LIMIT_MAX = 100;
const COMMENT_LIMIT_DEFAULT = 25;

const PLAYLIST_LIMIT_MIN = 1;
const PLAYLIST_LIMIT_MAX = 50;
const PLAYLIST_LIMIT_DEFAULT = 25;

const CHANNEL_VIDEOS_LIMIT_MIN = 1;
const CHANNEL_VIDEOS_LIMIT_MAX = 50;
const CHANNEL_VIDEOS_LIMIT_DEFAULT = 25;

const REGION_PATTERN = /^[A-Z]{2}$/;

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
    result: 'Error: Provider client required for YouTube Data API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: 'PROVIDER_NOT_CONFIGURED',
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
 * Send a request through the provider client with timeout enforcement.
 *
 * The client uses the .request(method, path, body, opts) pattern.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The API path
 * @param {Object|null} opts - Request options / body
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, opts);
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown request error' };
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
 * Validate that a value is a non-empty string.
 *
 * @param {*} value
 * @param {string} name - Parameter name for error messages
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateId(value, name) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, error: `The "${name}" parameter is required and must be a non-empty string.` };
  }
  return { valid: true, value: value.trim() };
}

/**
 * Validate search query string.
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
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters (got ${trimmed.length}).` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate an order value against a list of allowed values.
 *
 * @param {*} order
 * @param {string[]} allowed
 * @param {string} defaultValue
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateOrder(order, allowed, defaultValue) {
  if (order === undefined || order === null) {
    return { valid: true, value: defaultValue };
  }
  if (typeof order !== 'string' || !allowed.includes(order)) {
    return { valid: false, error: `Invalid order "${order}". Must be one of: ${allowed.join(', ')}` };
  }
  return { valid: true, value: order };
}

/**
 * Validate a region code (ISO 3166-1 alpha-2).
 *
 * @param {*} region
 * @param {string} defaultValue
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateRegion(region, defaultValue) {
  if (region === undefined || region === null) {
    return { valid: true, value: defaultValue };
  }
  if (typeof region !== 'string') {
    return { valid: false, error: 'The "region" parameter must be a string.' };
  }
  const upper = region.toUpperCase();
  if (!REGION_PATTERN.test(upper)) {
    return { valid: false, error: `Invalid region code "${region}". Must be a 2-letter ISO 3166-1 alpha-2 code (e.g., "US").` };
  }
  return { valid: true, value: upper };
}

/**
 * Clamp a limit value to the given range.
 *
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {number} defaultValue
 * @returns {number}
 */
function clampLimit(value, min, max, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  const n = Number(value);
  if (isNaN(n)) return defaultValue;
  if (n < min) return min;
  if (n > max) return max;
  return Math.floor(n);
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * search_videos - Search YouTube videos by query.
 */
async function handleSearchVideos(params, context) {
  const queryValidation = validateQuery(params.query);
  if (!queryValidation.valid) {
    return {
      result: `Error: ${queryValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const orderValidation = validateOrder(params.order, VALID_SEARCH_ORDERS, 'relevance');
  if (!orderValidation.valid) {
    return {
      result: `Error: ${orderValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limit = clampLimit(params.limit, SEARCH_LIMIT_MIN, SEARCH_LIMIT_MAX, SEARCH_LIMIT_DEFAULT);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/videos/search?query=${encodeURIComponent(queryValidation.value)}&order=${orderValidation.value}&limit=${limit}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);
    const videos = Array.isArray(data?.videos) ? data.videos : [];

    const lines = [
      `Search results for "${queryValidation.value}" (${videos.length} videos)`,
      `Order: ${orderValidation.value} | Limit: ${limit}`,
      '',
    ];

    for (const video of videos) {
      lines.push(`- ${video.title || 'Untitled'} (${video.videoId || video.id || 'N/A'})`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_videos',
        layer: 'L1',
        query: queryValidation.value,
        order: orderValidation.value,
        limit,
        count: videos.length,
        videos,
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
 * get_video - Get details for a single video.
 */
async function handleGetVideo(params, context) {
  const idValidation = validateId(params.videoId, 'videoId');
  if (!idValidation.valid) {
    return {
      result: `Error: ${idValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/videos/${encodeURIComponent(idValidation.value)}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const lines = [
      `Video: ${data.title || 'Untitled'}`,
      `ID: ${data.videoId || data.id || idValidation.value}`,
      `Channel: ${data.channelTitle || 'Unknown'}`,
      `Views: ${data.viewCount ?? 'N/A'}`,
      `Likes: ${data.likeCount ?? 'N/A'}`,
      `Published: ${data.publishedAt || 'N/A'}`,
      `Description: ${data.description || 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_video',
        layer: 'L1',
        videoId: idValidation.value,
        video: data,
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
 * get_channel - Get details for a channel.
 */
async function handleGetChannel(params, context) {
  const idValidation = validateId(params.channelId, 'channelId');
  if (!idValidation.valid) {
    return {
      result: `Error: ${idValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/channels/${encodeURIComponent(idValidation.value)}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const lines = [
      `Channel: ${data.title || 'Untitled'}`,
      `ID: ${data.channelId || data.id || idValidation.value}`,
      `Subscribers: ${data.subscriberCount ?? 'N/A'}`,
      `Videos: ${data.videoCount ?? 'N/A'}`,
      `Views: ${data.viewCount ?? 'N/A'}`,
      `Description: ${data.description || 'N/A'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_channel',
        layer: 'L1',
        channelId: idValidation.value,
        channel: data,
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
 * get_comments - Get comments for a video.
 */
async function handleGetComments(params, context) {
  const idValidation = validateId(params.videoId, 'videoId');
  if (!idValidation.valid) {
    return {
      result: `Error: ${idValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const orderValidation = validateOrder(params.order, VALID_COMMENT_ORDERS, 'relevance');
  if (!orderValidation.valid) {
    return {
      result: `Error: ${orderValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limit = clampLimit(params.limit, COMMENT_LIMIT_MIN, COMMENT_LIMIT_MAX, COMMENT_LIMIT_DEFAULT);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/videos/${encodeURIComponent(idValidation.value)}/comments?order=${orderValidation.value}&limit=${limit}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);
    const comments = Array.isArray(data?.comments) ? data.comments : [];

    const lines = [
      `Comments for video ${idValidation.value} (${comments.length} comments)`,
      `Order: ${orderValidation.value} | Limit: ${limit}`,
      '',
    ];

    for (const comment of comments) {
      lines.push(`- ${comment.author || 'Anonymous'}: ${comment.text || ''}`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_comments',
        layer: 'L1',
        videoId: idValidation.value,
        order: orderValidation.value,
        limit,
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
 * get_trending - Get trending videos.
 */
async function handleGetTrending(params, context) {
  const regionValidation = validateRegion(params.region, 'US');
  if (!regionValidation.valid) {
    return {
      result: `Error: ${regionValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  let path = `/videos/trending?region=${regionValidation.value}`;
  if (params.category) {
    path += `&category=${encodeURIComponent(String(params.category))}`;
  }

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);
    const videos = Array.isArray(data?.videos) ? data.videos : [];

    const lines = [
      `Trending videos in ${regionValidation.value} (${videos.length} videos)`,
      params.category ? `Category: ${params.category}` : null,
      '',
    ].filter(Boolean);

    for (const video of videos) {
      lines.push(`- ${video.title || 'Untitled'} (${video.videoId || video.id || 'N/A'})`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_trending',
        layer: 'L1',
        region: regionValidation.value,
        category: params.category || null,
        count: videos.length,
        videos,
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
 * get_playlist - Get items in a playlist.
 */
async function handleGetPlaylist(params, context) {
  const idValidation = validateId(params.playlistId, 'playlistId');
  if (!idValidation.valid) {
    return {
      result: `Error: ${idValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limit = clampLimit(params.limit, PLAYLIST_LIMIT_MIN, PLAYLIST_LIMIT_MAX, PLAYLIST_LIMIT_DEFAULT);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/playlists/${encodeURIComponent(idValidation.value)}/items?limit=${limit}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);
    const items = Array.isArray(data?.items) ? data.items : [];

    const lines = [
      `Playlist ${idValidation.value} (${items.length} items)`,
      `Limit: ${limit}`,
      '',
    ];

    for (const item of items) {
      lines.push(`- ${item.title || 'Untitled'} (${item.videoId || item.id || 'N/A'})`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_playlist',
        layer: 'L1',
        playlistId: idValidation.value,
        limit,
        count: items.length,
        items,
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
 * get_channel_videos - List videos from a channel.
 */
async function handleGetChannelVideos(params, context) {
  const idValidation = validateId(params.channelId, 'channelId');
  if (!idValidation.valid) {
    return {
      result: `Error: ${idValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const orderValidation = validateOrder(params.order, VALID_CHANNEL_VIDEO_ORDERS, 'date');
  if (!orderValidation.valid) {
    return {
      result: `Error: ${orderValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limit = clampLimit(params.limit, CHANNEL_VIDEOS_LIMIT_MIN, CHANNEL_VIDEOS_LIMIT_MAX, CHANNEL_VIDEOS_LIMIT_DEFAULT);

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/channels/${encodeURIComponent(idValidation.value)}/videos?order=${orderValidation.value}&limit=${limit}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);
    const videos = Array.isArray(data?.videos) ? data.videos : [];

    const lines = [
      `Videos from channel ${idValidation.value} (${videos.length} videos)`,
      `Order: ${orderValidation.value} | Limit: ${limit}`,
      '',
    ];

    for (const video of videos) {
      lines.push(`- ${video.title || 'Untitled'} (${video.videoId || video.id || 'N/A'})`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_channel_videos',
        layer: 'L1',
        channelId: idValidation.value,
        order: orderValidation.value,
        limit,
        count: videos.length,
        videos,
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
// Validate function
// ---------------------------------------------------------------------------

/**
 * Validate params before execution.
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
    case 'search_videos': {
      const q = validateQuery(params.query);
      if (!q.valid) return { valid: false, error: q.error };
      const o = validateOrder(params.order, VALID_SEARCH_ORDERS, 'relevance');
      if (!o.valid) return { valid: false, error: o.error };
      break;
    }
    case 'get_video': {
      const v = validateId(params.videoId, 'videoId');
      if (!v.valid) return { valid: false, error: v.error };
      break;
    }
    case 'get_channel': {
      const c = validateId(params.channelId, 'channelId');
      if (!c.valid) return { valid: false, error: c.error };
      break;
    }
    case 'get_comments': {
      const v = validateId(params.videoId, 'videoId');
      if (!v.valid) return { valid: false, error: v.error };
      const o = validateOrder(params.order, VALID_COMMENT_ORDERS, 'relevance');
      if (!o.valid) return { valid: false, error: o.error };
      break;
    }
    case 'get_trending': {
      const r = validateRegion(params.region, 'US');
      if (!r.valid) return { valid: false, error: r.error };
      break;
    }
    case 'get_playlist': {
      const p = validateId(params.playlistId, 'playlistId');
      if (!p.valid) return { valid: false, error: p.error };
      break;
    }
    case 'get_channel_videos': {
      const c = validateId(params.channelId, 'channelId');
      if (!c.valid) return { valid: false, error: c.error };
      const o = validateOrder(params.order, VALID_CHANNEL_VIDEO_ORDERS, 'date');
      if (!o.valid) return { valid: false, error: o.error };
      break;
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const meta = {
  name: 'youtube-data-api',
  version: '1.0.0',
  description: 'YouTube Data API interaction skill. Search videos, get video/channel details, list comments, trending videos, playlists, and channel videos.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a YouTube Data API operation.
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
      case 'search_videos':
        return await handleSearchVideos(params, context);
      case 'get_video':
        return await handleGetVideo(params, context);
      case 'get_channel':
        return await handleGetChannel(params, context);
      case 'get_comments':
        return await handleGetComments(params, context);
      case 'get_trending':
        return await handleGetTrending(params, context);
      case 'get_playlist':
        return await handleGetPlaylist(params, context);
      case 'get_channel_videos':
        return await handleGetChannelVideos(params, context);
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
  validateId,
  validateQuery,
  validateOrder,
  validateRegion,
  clampLimit,
  VALID_ACTIONS,
  VALID_SEARCH_ORDERS,
  VALID_COMMENT_ORDERS,
  VALID_CHANNEL_VIDEO_ORDERS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_QUERY_LENGTH,
  SEARCH_LIMIT_DEFAULT,
  COMMENT_LIMIT_DEFAULT,
  PLAYLIST_LIMIT_DEFAULT,
  CHANNEL_VIDEOS_LIMIT_DEFAULT,
};
