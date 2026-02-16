/**
 * YouTube Analyzer Skill Handler (Layer 1)
 *
 * Analyze YouTube videos, channels, and playlists via the YouTube Data API:
 * get video details, search content, get channel info, list comments,
 * retrieve transcripts, browse playlists, and calculate engagement metrics.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://www.googleapis.com/...)
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
  'get_video', 'search', 'get_channel', 'list_comments',
  'get_transcript', 'get_playlist', 'analyze_engagement',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const VALID_SEARCH_ORDERS = ['relevance', 'date', 'viewCount', 'rating'];
const VALID_COMMENT_ORDERS = ['relevance', 'time'];
const VALID_SEARCH_TYPES = ['video', 'channel', 'playlist'];

const DEFAULT_SEARCH_MAX_RESULTS = 10;
const DEFAULT_COMMENTS_MAX_RESULTS = 20;
const DEFAULT_PLAYLIST_MAX_RESULTS = 50;
const MAX_RESULTS_LIMIT = 50;

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
    result: 'Error: Provider client required for YouTube API access. Configure the platform adapter.',
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
  /AIza[A-Za-z0-9_-]{35}/g,
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
 * @param {number} defaultVal
 * @returns {number}
 */
function clampMaxResults(value, defaultVal) {
  const n = typeof value === 'number' ? value : defaultVal;
  if (n < 1) return 1;
  if (n > MAX_RESULTS_LIMIT) return MAX_RESULTS_LIMIT;
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
// Duration formatting
// ---------------------------------------------------------------------------

/**
 * Format an ISO 8601 duration string (PT#H#M#S) to human-readable form.
 *
 * @param {string} isoDuration
 * @returns {string}
 */
function formatDuration(isoDuration) {
  if (!isoDuration || typeof isoDuration !== 'string') return 'N/A';
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return isoDuration;
  const hours = match[1] ? `${match[1]}h ` : '';
  const minutes = match[2] ? `${match[2]}m ` : '';
  const seconds = match[3] ? `${match[3]}s` : '';
  const result = `${hours}${minutes}${seconds}`.trim();
  return result || '0s';
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * get_video - Get video details.
 */
async function handleGetVideo(params, context) {
  const videoId = sanitizeString(params.videoId);

  if (!videoId) {
    return {
      result: 'Error: The "videoId" parameter is required for get_video.',
      metadata: { success: false, error: 'MISSING_VIDEO_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'youtube/videos',
      { params: { id: videoId, part: 'snippet,statistics,contentDetails' } },
      timeoutMs
    );

    const item = data?.items?.[0];
    if (!item) {
      return {
        result: `No video found with ID "${videoId}".`,
        metadata: { success: true, action: 'get_video', layer: 'L1', videoId, found: false },
      };
    }

    const snippet = item.snippet || {};
    const stats = item.statistics || {};
    const details = item.contentDetails || {};

    const result = [
      `Title: ${snippet.title || 'N/A'}`,
      `Channel: ${snippet.channelTitle || 'N/A'}`,
      `Published: ${snippet.publishedAt || 'N/A'}`,
      `Duration: ${formatDuration(details.duration)}`,
      `Views: ${stats.viewCount ?? 'N/A'} | Likes: ${stats.likeCount ?? 'N/A'} | Comments: ${stats.commentCount ?? 'N/A'}`,
      `Description: ${snippet.description ? snippet.description.substring(0, 200) : 'N/A'}`,
      `Tags: ${Array.isArray(snippet.tags) && snippet.tags.length > 0 ? snippet.tags.slice(0, 10).join(', ') : 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_video',
        layer: 'L1',
        videoId,
        found: true,
        title: snippet.title || null,
        description: snippet.description || null,
        channelTitle: snippet.channelTitle || null,
        publishedAt: snippet.publishedAt || null,
        viewCount: stats.viewCount ?? null,
        likeCount: stats.likeCount ?? null,
        commentCount: stats.commentCount ?? null,
        duration: details.duration || null,
        tags: snippet.tags || [],
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
 * search - Search YouTube content.
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
  const maxResults = clampMaxResults(params.maxResults, DEFAULT_SEARCH_MAX_RESULTS);
  const order = VALID_SEARCH_ORDERS.includes(params.order) ? params.order : 'relevance';
  const type = VALID_SEARCH_TYPES.includes(params.type) ? params.type : 'video';

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'youtube/search',
      { params: { q: query, maxResults, order, type, part: 'snippet' } },
      timeoutMs
    );

    const items = Array.isArray(data?.items) ? data.items : [];
    const totalResults = data?.pageInfo?.totalResults ?? items.length;

    if (items.length === 0) {
      return {
        result: `No results found for "${query}".`,
        metadata: {
          success: true,
          action: 'search',
          layer: 'L1',
          query,
          order,
          type,
          totalResults: 0,
          count: 0,
          items: [],
        },
      };
    }

    const lines = items.map((item) => {
      const snippet = item.snippet || {};
      const id = item.id?.videoId || item.id?.channelId || item.id?.playlistId || 'N/A';
      return `[${id}] ${snippet.title || 'N/A'} - ${snippet.channelTitle || 'N/A'}`;
    });

    return {
      result: redactSensitive(`Search results for "${query}" (${items.length} of ${totalResults}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'search',
        layer: 'L1',
        query,
        order,
        type,
        totalResults,
        count: items.length,
        items: items.map((item) => ({
          videoId: item.id?.videoId || null,
          channelId: item.id?.channelId || null,
          playlistId: item.id?.playlistId || null,
          title: item.snippet?.title || null,
          channelTitle: item.snippet?.channelTitle || null,
          publishedAt: item.snippet?.publishedAt || null,
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
 * get_channel - Get channel information.
 */
async function handleGetChannel(params, context) {
  const channelId = sanitizeString(params.channelId);

  if (!channelId) {
    return {
      result: 'Error: The "channelId" parameter is required for get_channel.',
      metadata: { success: false, error: 'MISSING_CHANNEL_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'youtube/channels',
      { params: { id: channelId, part: 'snippet,statistics,brandingSettings' } },
      timeoutMs
    );

    const item = data?.items?.[0];
    if (!item) {
      return {
        result: `No channel found with ID "${channelId}".`,
        metadata: { success: true, action: 'get_channel', layer: 'L1', channelId, found: false },
      };
    }

    const snippet = item.snippet || {};
    const stats = item.statistics || {};

    const result = [
      `Channel: ${snippet.title || 'N/A'}`,
      `Description: ${snippet.description ? snippet.description.substring(0, 200) : 'N/A'}`,
      `Subscribers: ${stats.subscriberCount ?? 'N/A'}`,
      `Total Views: ${stats.viewCount ?? 'N/A'}`,
      `Video Count: ${stats.videoCount ?? 'N/A'}`,
      `Created: ${snippet.publishedAt || 'N/A'}`,
      `Country: ${snippet.country || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_channel',
        layer: 'L1',
        channelId,
        found: true,
        title: snippet.title || null,
        description: snippet.description || null,
        subscriberCount: stats.subscriberCount ?? null,
        viewCount: stats.viewCount ?? null,
        videoCount: stats.videoCount ?? null,
        publishedAt: snippet.publishedAt || null,
        country: snippet.country || null,
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
 * list_comments - List video comments.
 */
async function handleListComments(params, context) {
  const videoId = sanitizeString(params.videoId);

  if (!videoId) {
    return {
      result: 'Error: The "videoId" parameter is required for list_comments.',
      metadata: { success: false, error: 'MISSING_VIDEO_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxResults = clampMaxResults(params.maxResults, DEFAULT_COMMENTS_MAX_RESULTS);
  const order = VALID_COMMENT_ORDERS.includes(params.order) ? params.order : 'relevance';

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'youtube/commentThreads',
      { params: { videoId, maxResults, order, part: 'snippet' } },
      timeoutMs
    );

    const items = Array.isArray(data?.items) ? data.items : [];

    if (items.length === 0) {
      return {
        result: `No comments found for video "${videoId}".`,
        metadata: {
          success: true,
          action: 'list_comments',
          layer: 'L1',
          videoId,
          order,
          count: 0,
          comments: [],
        },
      };
    }

    const comments = items.map((item) => {
      const comment = item.snippet?.topLevelComment?.snippet || {};
      return {
        author: comment.authorDisplayName || 'Unknown',
        text: comment.textDisplay || '',
        likeCount: comment.likeCount ?? 0,
        publishedAt: comment.publishedAt || null,
      };
    });

    const lines = comments.map(
      (c) => `[${c.author}] (${c.likeCount} likes) ${c.text.substring(0, 100)}`
    );

    return {
      result: redactSensitive(`Comments for video "${videoId}" (${comments.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_comments',
        layer: 'L1',
        videoId,
        order,
        count: comments.length,
        comments,
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
 * get_transcript - Get video transcript/captions.
 */
async function handleGetTranscript(params, context) {
  const videoId = sanitizeString(params.videoId);

  if (!videoId) {
    return {
      result: 'Error: The "videoId" parameter is required for get_transcript.',
      metadata: { success: false, error: 'MISSING_VIDEO_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const language = sanitizeString(params.language) || 'en';

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'youtube/captions',
      { params: { videoId, language } },
      timeoutMs
    );

    const segments = Array.isArray(data?.segments) ? data.segments : [];
    const text = data?.text || '';

    if (segments.length === 0 && !text) {
      return {
        result: `No transcript found for video "${videoId}" in language "${language}".`,
        metadata: {
          success: true,
          action: 'get_transcript',
          layer: 'L1',
          videoId,
          language,
          found: false,
          segmentCount: 0,
        },
      };
    }

    const transcriptText = text || segments.map((s) => s.text || '').join(' ');
    const preview = transcriptText.substring(0, 500);

    return {
      result: redactSensitive(`Transcript for video "${videoId}" (${language}, ${segments.length} segments):\n${preview}${transcriptText.length > 500 ? '...' : ''}`),
      metadata: {
        success: true,
        action: 'get_transcript',
        layer: 'L1',
        videoId,
        language,
        found: true,
        segmentCount: segments.length,
        text: transcriptText,
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
 * get_playlist - Get playlist items.
 */
async function handleGetPlaylist(params, context) {
  const playlistId = sanitizeString(params.playlistId);

  if (!playlistId) {
    return {
      result: 'Error: The "playlistId" parameter is required for get_playlist.',
      metadata: { success: false, error: 'MISSING_PLAYLIST_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxResults = clampMaxResults(params.maxResults, DEFAULT_PLAYLIST_MAX_RESULTS);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'youtube/playlistItems',
      { params: { playlistId, maxResults, part: 'snippet,contentDetails' } },
      timeoutMs
    );

    const items = Array.isArray(data?.items) ? data.items : [];
    const totalResults = data?.pageInfo?.totalResults ?? items.length;

    if (items.length === 0) {
      return {
        result: `No items found in playlist "${playlistId}".`,
        metadata: {
          success: true,
          action: 'get_playlist',
          layer: 'L1',
          playlistId,
          totalResults: 0,
          count: 0,
          items: [],
        },
      };
    }

    const playlistItems = items.map((item) => {
      const snippet = item.snippet || {};
      return {
        title: snippet.title || 'N/A',
        videoId: snippet.resourceId?.videoId || item.contentDetails?.videoId || null,
        channelTitle: snippet.channelTitle || null,
        position: snippet.position ?? null,
        publishedAt: snippet.publishedAt || null,
      };
    });

    const lines = playlistItems.map(
      (p, i) => `${p.position ?? i + 1}. [${p.videoId || 'N/A'}] ${p.title}`
    );

    return {
      result: redactSensitive(`Playlist "${playlistId}" (${items.length} of ${totalResults} items):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'get_playlist',
        layer: 'L1',
        playlistId,
        totalResults,
        count: items.length,
        items: playlistItems,
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
 * analyze_engagement - Calculate engagement metrics from video data.
 *
 * Two-step action: fetches video data, then computes metrics locally.
 */
async function handleAnalyzeEngagement(params, context) {
  const videoId = sanitizeString(params.videoId);

  if (!videoId) {
    return {
      result: 'Error: The "videoId" parameter is required for analyze_engagement.',
      metadata: { success: false, error: 'MISSING_VIDEO_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    // Step 1: Fetch video data
    const data = await fetchWithTimeout(
      resolved.client,
      'youtube/videos',
      { params: { id: videoId, part: 'snippet,statistics,contentDetails' } },
      timeoutMs
    );

    const item = data?.items?.[0];
    if (!item) {
      return {
        result: `No video found with ID "${videoId}".`,
        metadata: { success: true, action: 'analyze_engagement', layer: 'L1', videoId, found: false },
      };
    }

    const stats = item.statistics || {};
    const snippet = item.snippet || {};

    const viewCount = parseInt(stats.viewCount, 10) || 0;
    const likeCount = parseInt(stats.likeCount, 10) || 0;
    const commentCount = parseInt(stats.commentCount, 10) || 0;

    // Step 2: Compute engagement metrics locally
    const engagementRate = viewCount > 0
      ? (((likeCount + commentCount) / viewCount) * 100)
      : 0;

    const likeRatio = viewCount > 0
      ? ((likeCount / viewCount) * 100)
      : 0;

    const commentRate = viewCount > 0
      ? ((commentCount / viewCount) * 100)
      : 0;

    // Estimated CTR tier based on engagement rate
    let ctrTier;
    if (engagementRate >= 10) ctrTier = 'excellent';
    else if (engagementRate >= 5) ctrTier = 'high';
    else if (engagementRate >= 2) ctrTier = 'average';
    else if (engagementRate >= 0.5) ctrTier = 'below_average';
    else ctrTier = 'low';

    const result = [
      `Engagement Analysis for: ${snippet.title || videoId}`,
      `Views: ${viewCount.toLocaleString()} | Likes: ${likeCount.toLocaleString()} | Comments: ${commentCount.toLocaleString()}`,
      `Engagement Rate: ${engagementRate.toFixed(2)}%`,
      `Like Ratio: ${likeRatio.toFixed(2)}%`,
      `Comment Rate: ${commentRate.toFixed(4)}%`,
      `Estimated CTR Tier: ${ctrTier}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'analyze_engagement',
        layer: 'L1',
        videoId,
        found: true,
        title: snippet.title || null,
        viewCount,
        likeCount,
        commentCount,
        engagementRate: parseFloat(engagementRate.toFixed(2)),
        likeRatio: parseFloat(likeRatio.toFixed(2)),
        commentRate: parseFloat(commentRate.toFixed(4)),
        ctrTier,
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
 * Execute a YouTube analysis operation.
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
      case 'get_video':
        return await handleGetVideo(params, context);
      case 'search':
        return await handleSearch(params, context);
      case 'get_channel':
        return await handleGetChannel(params, context);
      case 'list_comments':
        return await handleListComments(params, context);
      case 'get_transcript':
        return await handleGetTranscript(params, context);
      case 'get_playlist':
        return await handleGetPlaylist(params, context);
      case 'analyze_engagement':
        return await handleAnalyzeEngagement(params, context);
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
