/**
 * X/Twitter API Skill Handler (Layer 1)
 *
 * Interact with the X/Twitter API: fetch tweets, search, get user profiles,
 * timelines, post tweets, trending topics, and tweet likes.
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
  'get_tweet',
  'search_tweets',
  'get_user',
  'get_timeline',
  'post_tweet',
  'get_trending',
  'get_likes',
];

const VALID_SORT_VALUES = ['recency', 'relevancy'];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const MAX_TWEET_LENGTH = 280;
const MAX_QUERY_LENGTH = 512;
const MAX_USERNAME_LENGTH = 15;
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

const DEFAULT_SORT = 'recency';
const DEFAULT_LIMIT = 25;
const DEFAULT_LOCATION = 'worldwide';

// Limit ranges per action
const SEARCH_LIMIT_MIN = 1;
const SEARCH_LIMIT_MAX = 100;
const TIMELINE_LIMIT_MIN = 1;
const TIMELINE_LIMIT_MAX = 100;
const LIKES_LIMIT_MIN = 1;
const LIKES_LIMIT_MAX = 50;

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
    result: 'Error: Provider client required for X/Twitter API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for X/Twitter API access. Configure an API key or platform adapter.',
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
 * @param {Object} opts - Request options (body, query params, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, opts?.body ?? null, {
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
 * Validate and sanitize a Twitter/X username.
 *
 * @param {string} username
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'The "username" parameter is required and must be a non-empty string.' };
  }

  // Strip leading @ if present
  let sanitized = username.trim();
  if (sanitized.startsWith('@')) {
    sanitized = sanitized.slice(1);
  }

  if (sanitized.length === 0) {
    return { valid: false, error: 'The "username" parameter must not be empty.' };
  }

  if (sanitized.length > MAX_USERNAME_LENGTH) {
    return {
      valid: false,
      error: `Username exceeds maximum length of ${MAX_USERNAME_LENGTH} characters (got ${sanitized.length}).`,
    };
  }

  if (!USERNAME_PATTERN.test(sanitized)) {
    return {
      valid: false,
      error: 'Username must contain only alphanumeric characters and underscores.',
    };
  }

  return { valid: true, sanitized };
}

/**
 * Validate tweet text for posting.
 *
 * @param {string} text
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateTweetText(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'The "text" parameter is required and must be a non-empty string.' };
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'The "text" parameter must not be empty.' };
  }

  if (trimmed.length > MAX_TWEET_LENGTH) {
    return {
      valid: false,
      error: `Tweet text exceeds maximum length of ${MAX_TWEET_LENGTH} characters (got ${trimmed.length}).`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate search query.
 *
 * @param {string} query
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
  const clamped = Math.max(min, Math.min(max, num));
  return { valid: true, value: clamped };
}

/**
 * Validate a tweet ID.
 *
 * @param {string} tweetId
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateTweetId(tweetId) {
  if (!tweetId || typeof tweetId !== 'string') {
    return { valid: false, error: 'The "tweetId" parameter is required and must be a non-empty string.' };
  }

  const trimmed = tweetId.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'The "tweetId" parameter must not be empty.' };
  }

  return { valid: true, sanitized: trimmed };
}

// ---------------------------------------------------------------------------
// Validate export (check required params per action)
// ---------------------------------------------------------------------------

/**
 * Validate params for a given action without executing.
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
    case 'get_tweet': {
      const v = validateTweetId(params.tweetId);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'search_tweets': {
      const v = validateQuery(params.query);
      if (!v.valid) return { valid: false, error: v.error };
      if (params.sort && !VALID_SORT_VALUES.includes(params.sort)) {
        return { valid: false, error: `Invalid sort value "${params.sort}". Must be one of: ${VALID_SORT_VALUES.join(', ')}` };
      }
      return { valid: true };
    }
    case 'get_user': {
      const v = validateUsername(params.username);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'get_timeline': {
      const v = validateUsername(params.username);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'post_tweet': {
      const v = validateTweetText(params.text);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'get_trending': {
      return { valid: true };
    }
    case 'get_likes': {
      const v = validateTweetId(params.tweetId);
      if (!v.valid) return { valid: false, error: v.error };
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
 * Handle the "get_tweet" action -- fetch a tweet by ID.
 */
async function handleGetTweet(params, context) {
  const idValidation = validateTweetId(params.tweetId);
  if (!idValidation.valid) {
    return {
      result: `Error: ${idValidation.error}`,
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
      `/tweets/${idValidation.sanitized}`,
      {},
      timeoutMs
    );

    const tweet = data?.tweet || data?.data || data;

    const lines = [
      `Tweet ${idValidation.sanitized}`,
      `Author: @${tweet.author || tweet.user?.username || 'unknown'}`,
      `Text: ${tweet.text || tweet.content || ''}`,
      `Likes: ${tweet.likes ?? tweet.like_count ?? 0} | Retweets: ${tweet.retweets ?? tweet.retweet_count ?? 0}`,
      `Created: ${tweet.created_at || 'unknown'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_tweet',
        layer: 'L1',
        tweetId: idValidation.sanitized,
        tweet,
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
 * Handle the "search_tweets" action -- search tweets by query.
 */
async function handleSearchTweets(params, context) {
  const queryValidation = validateQuery(params.query);
  if (!queryValidation.valid) {
    return {
      result: `Error: ${queryValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const sort = params.sort || DEFAULT_SORT;
  if (!VALID_SORT_VALUES.includes(sort)) {
    return {
      result: `Error: Invalid sort value "${sort}". Must be one of: ${VALID_SORT_VALUES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitValidation = validateLimit(params.limit, SEARCH_LIMIT_MIN, SEARCH_LIMIT_MAX, DEFAULT_LIMIT);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
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
      `/tweets/search?query=${encodeURIComponent(queryValidation.sanitized)}&sort=${sort}&limit=${limitValidation.value}`,
      {},
      timeoutMs
    );

    const tweets = data?.tweets || data?.data || [];

    const lines = [
      `Search results for "${queryValidation.sanitized}"`,
      `Sort: ${sort} | Limit: ${limitValidation.value} | Found: ${tweets.length}`,
      '',
      ...tweets.map((t, i) => `${i + 1}. @${t.author || t.user?.username || 'unknown'}: ${t.text || t.content || ''}`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_tweets',
        layer: 'L1',
        query: queryValidation.sanitized,
        sort,
        limit: limitValidation.value,
        resultCount: tweets.length,
        tweets,
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
 * Handle the "get_user" action -- get a user profile by username.
 */
async function handleGetUser(params, context) {
  const usernameValidation = validateUsername(params.username);
  if (!usernameValidation.valid) {
    return {
      result: `Error: ${usernameValidation.error}`,
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
      `/users/${usernameValidation.sanitized}`,
      {},
      timeoutMs
    );

    const user = data?.user || data?.data || data;

    const lines = [
      `User: @${user.username || usernameValidation.sanitized}`,
      `Name: ${user.name || 'unknown'}`,
      `Bio: ${user.bio || user.description || ''}`,
      `Followers: ${user.followers ?? user.followers_count ?? 0} | Following: ${user.following ?? user.following_count ?? 0}`,
      `Tweets: ${user.tweet_count ?? user.statuses_count ?? 0}`,
      `Joined: ${user.created_at || 'unknown'}`,
      `Verified: ${user.verified ? 'Yes' : 'No'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_user',
        layer: 'L1',
        username: usernameValidation.sanitized,
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
 * Handle the "get_timeline" action -- get user's recent tweets.
 */
async function handleGetTimeline(params, context) {
  const usernameValidation = validateUsername(params.username);
  if (!usernameValidation.valid) {
    return {
      result: `Error: ${usernameValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitValidation = validateLimit(params.limit, TIMELINE_LIMIT_MIN, TIMELINE_LIMIT_MAX, DEFAULT_LIMIT);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
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
      `/users/${usernameValidation.sanitized}/tweets?limit=${limitValidation.value}`,
      {},
      timeoutMs
    );

    const tweets = data?.tweets || data?.data || [];

    const lines = [
      `Timeline for @${usernameValidation.sanitized}`,
      `Showing ${tweets.length} tweet(s) (limit: ${limitValidation.value})`,
      '',
      ...tweets.map((t, i) => `${i + 1}. ${t.text || t.content || ''} (${t.created_at || 'unknown'})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_timeline',
        layer: 'L1',
        username: usernameValidation.sanitized,
        limit: limitValidation.value,
        tweetCount: tweets.length,
        tweets,
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
 * Handle the "post_tweet" action -- post a new tweet.
 */
async function handlePostTweet(params, context) {
  const textValidation = validateTweetText(params.text);
  if (!textValidation.valid) {
    return {
      result: `Error: ${textValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const body = { text: textValidation.sanitized };
  if (params.replyTo) {
    const replyValidation = validateTweetId(params.replyTo);
    if (replyValidation.valid) {
      body.replyTo = replyValidation.sanitized;
    }
  }

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/tweets',
      { body },
      timeoutMs
    );

    const tweet = data?.tweet || data?.data || data;

    const lines = [
      'Tweet posted successfully',
      `ID: ${tweet.id || 'unknown'}`,
      `Text: ${textValidation.sanitized}`,
    ];

    if (body.replyTo) {
      lines.push(`Reply to: ${body.replyTo}`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'post_tweet',
        layer: 'L1',
        tweet,
        text: textValidation.sanitized,
        replyTo: body.replyTo || null,
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
 * Handle the "get_trending" action -- get trending topics.
 */
async function handleGetTrending(params, context) {
  const location = (params.location && typeof params.location === 'string')
    ? params.location.trim()
    : DEFAULT_LOCATION;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/trends?location=${encodeURIComponent(location)}`,
      {},
      timeoutMs
    );

    const trends = data?.trends || data?.data || [];

    const lines = [
      `Trending topics (${location})`,
      `Found: ${trends.length} trend(s)`,
      '',
      ...trends.map((t, i) => `${i + 1}. ${t.name || t.topic || t} (${t.tweet_count || t.volume || 'N/A'} tweets)`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_trending',
        layer: 'L1',
        location,
        trendCount: trends.length,
        trends,
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
 * Handle the "get_likes" action -- get users who liked a tweet.
 */
async function handleGetLikes(params, context) {
  const idValidation = validateTweetId(params.tweetId);
  if (!idValidation.valid) {
    return {
      result: `Error: ${idValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitValidation = validateLimit(params.limit, LIKES_LIMIT_MIN, LIKES_LIMIT_MAX, DEFAULT_LIMIT);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
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
      `/tweets/${idValidation.sanitized}/likes?limit=${limitValidation.value}`,
      {},
      timeoutMs
    );

    const likes = data?.likes || data?.users || data?.data || [];

    const lines = [
      `Likes for tweet ${idValidation.sanitized}`,
      `Showing ${likes.length} user(s) (limit: ${limitValidation.value})`,
      '',
      ...likes.map((u, i) => `${i + 1}. @${u.username || u.name || u}`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_likes',
        layer: 'L1',
        tweetId: idValidation.sanitized,
        limit: limitValidation.value,
        likeCount: likes.length,
        likes,
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
  name: 'x-twitter-api',
  version: '1.0.0',
  description: 'X/Twitter API interaction skill. Fetch tweets, search, user profiles, timelines, post tweets, trending topics, and tweet likes.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute an X/Twitter API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: get_tweet, search_tweets, get_user, get_timeline, post_tweet, get_trending, get_likes
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
      case 'get_tweet':
        return await handleGetTweet(params, context);
      case 'search_tweets':
        return await handleSearchTweets(params, context);
      case 'get_user':
        return await handleGetUser(params, context);
      case 'get_timeline':
        return await handleGetTimeline(params, context);
      case 'post_tweet':
        return await handlePostTweet(params, context);
      case 'get_trending':
        return await handleGetTrending(params, context);
      case 'get_likes':
        return await handleGetLikes(params, context);
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
  validateUsername,
  validateTweetText,
  validateQuery,
  validateLimit,
  validateTweetId,
  validate,
  meta,
  VALID_ACTIONS,
  VALID_SORT_VALUES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_TWEET_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_USERNAME_LENGTH,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  DEFAULT_LOCATION,
  SEARCH_LIMIT_MAX,
  TIMELINE_LIMIT_MAX,
  LIKES_LIMIT_MAX,
};
