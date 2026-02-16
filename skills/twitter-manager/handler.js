/**
 * Twitter Manager Skill Handler (Layer 1)
 *
 * Manage Twitter/X interactions via the Twitter API: post tweets, get tweet
 * details, search tweets, get user profiles, view timelines, delete tweets,
 * like tweets, and retweet.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://api.twitter.com/...)
 * - All external access goes through context.providerClient or context.gatewayClient
 * - If no client is available: PROVIDER_NOT_CONFIGURED
 * - Enforces timeout (default 15s, max 30s)
 * - Redacts secrets from all outputs (especially Bearer tokens)
 * - Sanitizes inputs
 * - Validates tweet length (max 280 characters)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'post_tweet', 'get_tweet', 'search_tweets', 'get_user',
  'get_timeline', 'delete_tweet', 'like_tweet', 'retweet',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const MAX_TWEET_LENGTH = 280;
const MAX_RESULTS = 100;
const DEFAULT_MAX_RESULTS = 10;

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
    result: 'Error: Provider client required for Twitter API access. Configure the platform adapter.',
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
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
  /AAAAAAAAAAAAA[A-Za-z0-9%]{20,}/g,
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
 * Clamp maxResults to valid range.
 *
 * @param {*} value
 * @returns {number}
 */
function clampMaxResults(value) {
  const n = typeof value === 'number' ? value : DEFAULT_MAX_RESULTS;
  if (n < 1) return 1;
  if (n > MAX_RESULTS) return MAX_RESULTS;
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
 * post_tweet - Post a new tweet.
 */
async function handlePostTweet(params, context) {
  const text = sanitizeString(params.text);

  if (!text) {
    return {
      result: 'Error: The "text" parameter is required for post_tweet.',
      metadata: { success: false, error: 'MISSING_TEXT' },
    };
  }

  if (text.length > MAX_TWEET_LENGTH) {
    return {
      result: `Error: Tweet text exceeds maximum length of ${MAX_TWEET_LENGTH} characters (got ${text.length}).`,
      metadata: { success: false, error: 'TWEET_TOO_LONG' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const replyTo = sanitizeString(params.replyTo);

  const fetchParams = { text };
  if (replyTo) {
    fetchParams.reply = { in_reply_to_tweet_id: replyTo };
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'twitter/tweets',
      {
        method: 'POST',
        params: fetchParams,
      },
      timeoutMs
    );

    const tweetId = data?.data?.id || data?.id || 'unknown';
    const tweetText = data?.data?.text || data?.text || text;

    return {
      result: redactSensitive(`Tweet posted successfully (ID: ${tweetId}): ${tweetText}`),
      metadata: {
        success: true,
        action: 'post_tweet',
        layer: 'L1',
        tweetId,
        text: tweetText,
        replyTo: replyTo || null,
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
 * get_tweet - Get tweet details.
 */
async function handleGetTweet(params, context) {
  const tweetId = sanitizeString(params.tweetId);

  if (!tweetId) {
    return {
      result: 'Error: The "tweetId" parameter is required for get_tweet.',
      metadata: { success: false, error: 'MISSING_TWEET_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `twitter/tweets/${tweetId}`,
      { params: {} },
      timeoutMs
    );

    const tweet = data?.data || data;

    const result = [
      `Tweet ID: ${tweet.id || tweetId}`,
      `Text: ${tweet.text || 'N/A'}`,
      `Author ID: ${tweet.author_id || 'N/A'}`,
      `Created: ${tweet.created_at || 'N/A'}`,
      `Retweets: ${tweet.public_metrics?.retweet_count ?? 'N/A'}`,
      `Likes: ${tweet.public_metrics?.like_count ?? 'N/A'}`,
      `Replies: ${tweet.public_metrics?.reply_count ?? 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_tweet',
        layer: 'L1',
        tweetId: tweet.id || tweetId,
        text: tweet.text || null,
        authorId: tweet.author_id || null,
        createdAt: tweet.created_at || null,
        metrics: tweet.public_metrics || null,
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
 * search_tweets - Search recent tweets.
 */
async function handleSearchTweets(params, context) {
  const query = sanitizeString(params.query);

  if (!query) {
    return {
      result: 'Error: The "query" parameter is required for search_tweets.',
      metadata: { success: false, error: 'MISSING_QUERY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxResults = clampMaxResults(params.maxResults);
  const sortOrder = params.sortOrder === 'relevancy' ? 'relevancy' : 'recency';

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'twitter/tweets/search/recent',
      { params: { query, max_results: maxResults, sort_order: sortOrder } },
      timeoutMs
    );

    const tweets = Array.isArray(data?.data) ? data.data : [];
    const resultCount = data?.meta?.result_count ?? tweets.length;

    if (tweets.length === 0) {
      return {
        result: `No tweets found for query "${query}".`,
        metadata: {
          success: true,
          action: 'search_tweets',
          layer: 'L1',
          query,
          sortOrder,
          count: 0,
          tweets: [],
        },
      };
    }

    const lines = tweets.map(
      (t) => `[${t.id}] ${t.text || 'N/A'}`
    );

    return {
      result: redactSensitive(`Search results for "${query}" (${resultCount} results, sorted by ${sortOrder}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'search_tweets',
        layer: 'L1',
        query,
        sortOrder,
        count: tweets.length,
        tweets: tweets.map((t) => ({
          id: t.id,
          text: t.text || null,
          authorId: t.author_id || null,
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
 * get_user - Get user profile by username.
 */
async function handleGetUser(params, context) {
  const username = sanitizeString(params.username);

  if (!username) {
    return {
      result: 'Error: The "username" parameter is required for get_user.',
      metadata: { success: false, error: 'MISSING_USERNAME' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `twitter/users/by/username/${username}`,
      { params: {} },
      timeoutMs
    );

    const user = data?.data || data;

    const result = [
      `Username: @${user.username || username}`,
      `Name: ${user.name || 'N/A'}`,
      `ID: ${user.id || 'N/A'}`,
      `Bio: ${user.description || 'N/A'}`,
      `Followers: ${user.public_metrics?.followers_count ?? 'N/A'}`,
      `Following: ${user.public_metrics?.following_count ?? 'N/A'}`,
      `Tweets: ${user.public_metrics?.tweet_count ?? 'N/A'}`,
      `Verified: ${user.verified ? 'Yes' : 'No'}`,
      `Created: ${user.created_at || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_user',
        layer: 'L1',
        username: user.username || username,
        name: user.name || null,
        userId: user.id || null,
        description: user.description || null,
        metrics: user.public_metrics || null,
        verified: user.verified || false,
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
 * get_timeline - Get a user's tweet timeline.
 */
async function handleGetTimeline(params, context) {
  const userId = sanitizeString(params.userId);

  if (!userId) {
    return {
      result: 'Error: The "userId" parameter is required for get_timeline.',
      metadata: { success: false, error: 'MISSING_USER_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxResults = clampMaxResults(params.maxResults);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `twitter/users/${userId}/tweets`,
      { params: { max_results: maxResults } },
      timeoutMs
    );

    const tweets = Array.isArray(data?.data) ? data.data : [];

    if (tweets.length === 0) {
      return {
        result: `No tweets found in timeline for user ${userId}.`,
        metadata: {
          success: true,
          action: 'get_timeline',
          layer: 'L1',
          userId,
          count: 0,
          tweets: [],
        },
      };
    }

    const lines = tweets.map(
      (t) => `[${t.id}] ${t.text || 'N/A'} (${t.created_at || 'N/A'})`
    );

    return {
      result: redactSensitive(`Timeline for user ${userId} (${tweets.length} tweets):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'get_timeline',
        layer: 'L1',
        userId,
        count: tweets.length,
        tweets: tweets.map((t) => ({
          id: t.id,
          text: t.text || null,
          createdAt: t.created_at || null,
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
 * delete_tweet - Delete a tweet by ID.
 */
async function handleDeleteTweet(params, context) {
  const tweetId = sanitizeString(params.tweetId);

  if (!tweetId) {
    return {
      result: 'Error: The "tweetId" parameter is required for delete_tweet.',
      metadata: { success: false, error: 'MISSING_TWEET_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `twitter/tweets/${tweetId}`,
      { method: 'DELETE' },
      timeoutMs
    );

    const deleted = data?.data?.deleted ?? true;

    return {
      result: redactSensitive(`Tweet ${tweetId} deleted successfully.`),
      metadata: {
        success: true,
        action: 'delete_tweet',
        layer: 'L1',
        tweetId,
        deleted,
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
 * like_tweet - Like a tweet by ID.
 */
async function handleLikeTweet(params, context) {
  const tweetId = sanitizeString(params.tweetId);

  if (!tweetId) {
    return {
      result: 'Error: The "tweetId" parameter is required for like_tweet.',
      metadata: { success: false, error: 'MISSING_TWEET_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `twitter/tweets/${tweetId}/like`,
      {
        method: 'POST',
        params: { tweet_id: tweetId },
      },
      timeoutMs
    );

    const liked = data?.data?.liked ?? true;

    return {
      result: redactSensitive(`Tweet ${tweetId} liked successfully.`),
      metadata: {
        success: true,
        action: 'like_tweet',
        layer: 'L1',
        tweetId,
        liked,
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
 * retweet - Retweet a tweet by ID.
 */
async function handleRetweet(params, context) {
  const tweetId = sanitizeString(params.tweetId);

  if (!tweetId) {
    return {
      result: 'Error: The "tweetId" parameter is required for retweet.',
      metadata: { success: false, error: 'MISSING_TWEET_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `twitter/tweets/${tweetId}/retweet`,
      {
        method: 'POST',
        params: { tweet_id: tweetId },
      },
      timeoutMs
    );

    const retweeted = data?.data?.retweeted ?? true;

    return {
      result: redactSensitive(`Tweet ${tweetId} retweeted successfully.`),
      metadata: {
        success: true,
        action: 'retweet',
        layer: 'L1',
        tweetId,
        retweeted,
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
 * Execute a Twitter management operation.
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
      case 'post_tweet':
        return await handlePostTweet(params, context);
      case 'get_tweet':
        return await handleGetTweet(params, context);
      case 'search_tweets':
        return await handleSearchTweets(params, context);
      case 'get_user':
        return await handleGetUser(params, context);
      case 'get_timeline':
        return await handleGetTimeline(params, context);
      case 'delete_tweet':
        return await handleDeleteTweet(params, context);
      case 'like_tweet':
        return await handleLikeTweet(params, context);
      case 'retweet':
        return await handleRetweet(params, context);
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
