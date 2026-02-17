/**
 * Reddit API Manager Skill Handler (Layer 1)
 *
 * Interact with the Reddit API to fetch posts, comments, subreddit info,
 * user profiles, search, and trending topics.
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
  'get_post',
  'list_posts',
  'search',
  'get_subreddit_info',
  'get_comments',
  'get_user_info',
  'list_trending',
];

const VALID_POST_SORTS = ['hot', 'new', 'top', 'rising'];
const VALID_SEARCH_SORTS = ['relevance', 'hot', 'top', 'new'];
const VALID_COMMENT_SORTS = ['best', 'top', 'new', 'controversial'];

const DEFAULT_POST_SORT = 'hot';
const DEFAULT_SEARCH_SORT = 'relevance';
const DEFAULT_COMMENT_SORT = 'best';
const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const SUBREDDIT_PATTERN = /^[A-Za-z0-9_]+$/;

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
    result: 'Error: Provider client required for Reddit API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Reddit API access. Configure an API key or platform adapter.',
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
 * @param {Object} opts - Additional options (query params, body, etc.)
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
 * Sanitize a subreddit name (alphanumeric + underscores only).
 *
 * @param {string} name
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function sanitizeSubreddit(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'The "subreddit" parameter is required and must be a non-empty string.' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "subreddit" parameter must not be empty.' };
  }
  if (!SUBREDDIT_PATTERN.test(trimmed)) {
    return { valid: false, error: 'The "subreddit" parameter must contain only alphanumeric characters and underscores.' };
  }
  return { valid: true, sanitized: trimmed };
}

/**
 * Validate a sort value against allowed values.
 *
 * @param {string} sort
 * @param {string[]} validValues
 * @param {string} defaultValue
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateSort(sort, validValues, defaultValue) {
  if (sort === undefined || sort === null) {
    return { valid: true, value: defaultValue };
  }
  if (typeof sort !== 'string' || !validValues.includes(sort)) {
    return { valid: false, error: `Invalid sort "${sort}". Must be one of: ${validValues.join(', ')}` };
  }
  return { valid: true, value: sort };
}

/**
 * Validate and clamp the "limit" parameter.
 *
 * @param {*} limit
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLimit(limit) {
  if (limit === undefined || limit === null) {
    return { valid: true, value: DEFAULT_LIMIT };
  }
  const num = Number(limit);
  if (!Number.isInteger(num) || num < MIN_LIMIT) {
    return { valid: false, error: `The "limit" parameter must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}.` };
  }
  return { valid: true, value: Math.min(num, MAX_LIMIT) };
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
    case 'get_post': {
      if (!params.postId || typeof params.postId !== 'string' || params.postId.trim().length === 0) {
        return { valid: false, error: 'The "postId" parameter is required for get_post.' };
      }
      return { valid: true };
    }
    case 'list_posts': {
      const sub = sanitizeSubreddit(params.subreddit);
      if (!sub.valid) return { valid: false, error: sub.error };
      return { valid: true };
    }
    case 'search': {
      if (!params.query || typeof params.query !== 'string' || params.query.trim().length === 0) {
        return { valid: false, error: 'The "query" parameter is required for search.' };
      }
      return { valid: true };
    }
    case 'get_subreddit_info': {
      const sub = sanitizeSubreddit(params.subreddit);
      if (!sub.valid) return { valid: false, error: sub.error };
      return { valid: true };
    }
    case 'get_comments': {
      if (!params.postId || typeof params.postId !== 'string' || params.postId.trim().length === 0) {
        return { valid: false, error: 'The "postId" parameter is required for get_comments.' };
      }
      return { valid: true };
    }
    case 'get_user_info': {
      if (!params.username || typeof params.username !== 'string' || params.username.trim().length === 0) {
        return { valid: false, error: 'The "username" parameter is required for get_user_info.' };
      }
      return { valid: true };
    }
    case 'list_trending': {
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
 * Handle get_post -- GET /posts/{postId}
 */
async function handleGetPost(params, context) {
  if (!params.postId || typeof params.postId !== 'string' || params.postId.trim().length === 0) {
    return {
      result: 'Error: The "postId" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const postId = params.postId.trim();
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/posts/${postId}`,
      {},
      timeoutMs
    );

    const post = data?.post || data || {};
    const lines = [
      `Post: ${post.title || postId}`,
      post.author ? `Author: ${post.author}` : null,
      post.subreddit ? `Subreddit: r/${post.subreddit}` : null,
      post.score !== undefined ? `Score: ${post.score}` : null,
      post.url ? `URL: ${post.url}` : null,
      post.selftext ? `\n${post.selftext}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_post',
        layer: 'L1',
        postId,
        post,
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
 * Handle list_posts -- GET /subreddits/{subreddit}/posts?sort={sort}&limit={limit}
 */
async function handleListPosts(params, context) {
  const subValidation = sanitizeSubreddit(params.subreddit);
  if (!subValidation.valid) {
    return {
      result: `Error: ${subValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const sortValidation = validateSort(params.sort, VALID_POST_SORTS, DEFAULT_POST_SORT);
  if (!sortValidation.valid) {
    return {
      result: `Error: ${sortValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitValidation = validateLimit(params.limit);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const subreddit = subValidation.sanitized;
  const sort = sortValidation.value;
  const limit = limitValidation.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/subreddits/${subreddit}/posts?sort=${sort}&limit=${limit}`,
      {},
      timeoutMs
    );

    const posts = data?.posts || data?.data || [];
    const lines = [
      `r/${subreddit} - ${sort} posts (${posts.length} results)`,
      '',
      ...posts.map((p, i) => `${i + 1}. ${p.title || 'Untitled'} (score: ${p.score ?? 0})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_posts',
        layer: 'L1',
        subreddit,
        sort,
        limit,
        postCount: posts.length,
        posts,
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
 * Handle search -- GET /search?q={query}&subreddit={subreddit}&sort={sort}&limit={limit}
 */
async function handleSearch(params, context) {
  if (!params.query || typeof params.query !== 'string' || params.query.trim().length === 0) {
    return {
      result: 'Error: The "query" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const query = params.query.trim();

  // Optional subreddit filter
  let subreddit = null;
  if (params.subreddit) {
    const subValidation = sanitizeSubreddit(params.subreddit);
    if (!subValidation.valid) {
      return {
        result: `Error: ${subValidation.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
    subreddit = subValidation.sanitized;
  }

  const sortValidation = validateSort(params.sort, VALID_SEARCH_SORTS, DEFAULT_SEARCH_SORT);
  if (!sortValidation.valid) {
    return {
      result: `Error: ${sortValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitValidation = validateLimit(params.limit);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const sort = sortValidation.value;
  const limit = limitValidation.value;

  let path = `/search?q=${encodeURIComponent(query)}&sort=${sort}&limit=${limit}`;
  if (subreddit) {
    path += `&subreddit=${subreddit}`;
  }

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      {},
      timeoutMs
    );

    const results = data?.results || data?.data || [];
    const lines = [
      `Search: "${query}"${subreddit ? ` in r/${subreddit}` : ''} (${results.length} results)`,
      `Sort: ${sort}`,
      '',
      ...results.map((r, i) => `${i + 1}. ${r.title || 'Untitled'} - r/${r.subreddit || 'unknown'}`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search',
        layer: 'L1',
        query,
        subreddit,
        sort,
        limit,
        resultCount: results.length,
        results,
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
 * Handle get_subreddit_info -- GET /subreddits/{subreddit}
 */
async function handleGetSubredditInfo(params, context) {
  const subValidation = sanitizeSubreddit(params.subreddit);
  if (!subValidation.valid) {
    return {
      result: `Error: ${subValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const subreddit = subValidation.sanitized;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/subreddits/${subreddit}`,
      {},
      timeoutMs
    );

    const info = data?.subreddit || data || {};
    const lines = [
      `r/${info.name || subreddit}`,
      info.title ? `Title: ${info.title}` : null,
      info.description ? `Description: ${info.description}` : null,
      info.subscribers !== undefined ? `Subscribers: ${info.subscribers}` : null,
      info.created ? `Created: ${info.created}` : null,
      info.nsfw !== undefined ? `NSFW: ${info.nsfw}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_subreddit_info',
        layer: 'L1',
        subreddit,
        info,
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
 * Handle get_comments -- GET /posts/{postId}/comments?sort={sort}&limit={limit}
 */
async function handleGetComments(params, context) {
  if (!params.postId || typeof params.postId !== 'string' || params.postId.trim().length === 0) {
    return {
      result: 'Error: The "postId" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const postId = params.postId.trim();

  const sortValidation = validateSort(params.sort, VALID_COMMENT_SORTS, DEFAULT_COMMENT_SORT);
  if (!sortValidation.valid) {
    return {
      result: `Error: ${sortValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitValidation = validateLimit(params.limit);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const sort = sortValidation.value;
  const limit = limitValidation.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/posts/${postId}/comments?sort=${sort}&limit=${limit}`,
      {},
      timeoutMs
    );

    const comments = data?.comments || data?.data || [];
    const lines = [
      `Comments on post ${postId} (${comments.length} results, sorted by ${sort})`,
      '',
      ...comments.map((c, i) => `${i + 1}. [${c.author || 'anonymous'}] ${c.body || ''} (score: ${c.score ?? 0})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_comments',
        layer: 'L1',
        postId,
        sort,
        limit,
        commentCount: comments.length,
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
 * Handle get_user_info -- GET /users/{username}
 */
async function handleGetUserInfo(params, context) {
  if (!params.username || typeof params.username !== 'string' || params.username.trim().length === 0) {
    return {
      result: 'Error: The "username" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const username = params.username.trim();
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/users/${username}`,
      {},
      timeoutMs
    );

    const user = data?.user || data || {};
    const lines = [
      `u/${user.name || username}`,
      user.karma !== undefined ? `Karma: ${user.karma}` : null,
      user.created ? `Account created: ${user.created}` : null,
      user.description ? `Bio: ${user.description}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_user_info',
        layer: 'L1',
        username,
        user,
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
 * Handle list_trending -- GET /trending
 */
async function handleListTrending(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      '/trending',
      {},
      timeoutMs
    );

    const trending = data?.trending || data?.data || [];
    const lines = [
      `Trending on Reddit (${trending.length} topics)`,
      '',
      ...trending.map((t, i) => `${i + 1}. ${t.title || t.name || 'Unknown'} - ${t.description || ''}`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_trending',
        layer: 'L1',
        trendingCount: trending.length,
        trending,
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
 * Execute a Reddit API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: get_post, list_posts, search, get_subreddit_info, get_comments, get_user_info, list_trending
 * @param {string} [params.postId] - Post ID (required for get_post, get_comments)
 * @param {string} [params.subreddit] - Subreddit name (required for list_posts, get_subreddit_info; optional for search)
 * @param {string} [params.query] - Search query (required for search)
 * @param {string} [params.username] - Username (required for get_user_info)
 * @param {string} [params.sort] - Sort order (varies by action)
 * @param {number} [params.limit=25] - Number of results (1-100)
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
      case 'get_post':
        return await handleGetPost(params, context);
      case 'list_posts':
        return await handleListPosts(params, context);
      case 'search':
        return await handleSearch(params, context);
      case 'get_subreddit_info':
        return await handleGetSubredditInfo(params, context);
      case 'get_comments':
        return await handleGetComments(params, context);
      case 'get_user_info':
        return await handleGetUserInfo(params, context);
      case 'list_trending':
        return await handleListTrending(params, context);
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
  name: 'reddit-api-manager',
  version: '1.0.0',
  description: 'Reddit API interaction skill. Fetch posts, comments, subreddit info, user profiles, search, and trending topics via provider client.',
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
  sanitizeSubreddit,
  validateSort,
  validateLimit,
  VALID_ACTIONS,
  VALID_POST_SORTS,
  VALID_SEARCH_SORTS,
  VALID_COMMENT_SORTS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
};
