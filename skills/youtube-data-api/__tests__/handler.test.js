import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  validate,
  meta,
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
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(response, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => response,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .request() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .request() triggers an AbortError (timeout).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      request: async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample search response. */
const sampleSearchResponse = {
  videos: [
    { videoId: 'abc123', title: 'Cat video' },
    { videoId: 'def456', title: 'Dog video' },
  ],
};

/** Sample video details response. */
const sampleVideoResponse = {
  videoId: 'abc123',
  title: 'Amazing Cat Video',
  channelTitle: 'Pet Channel',
  viewCount: 1000000,
  likeCount: 50000,
  publishedAt: '2025-01-01T00:00:00Z',
  description: 'A wonderful cat video.',
};

/** Sample channel response. */
const sampleChannelResponse = {
  channelId: 'UCxyz789',
  title: 'Pet Channel',
  subscriberCount: 500000,
  videoCount: 200,
  viewCount: 100000000,
  description: 'All about pets.',
};

/** Sample comments response. */
const sampleCommentsResponse = {
  comments: [
    { author: 'User1', text: 'Great video!' },
    { author: 'User2', text: 'Loved it!' },
  ],
};

/** Sample trending response. */
const sampleTrendingResponse = {
  videos: [
    { videoId: 'trend1', title: 'Trending Video 1' },
    { videoId: 'trend2', title: 'Trending Video 2' },
  ],
};

/** Sample playlist response. */
const samplePlaylistResponse = {
  items: [
    { videoId: 'pl1', title: 'Playlist Item 1' },
    { videoId: 'pl2', title: 'Playlist Item 2' },
  ],
};

/** Sample channel videos response. */
const sampleChannelVideosResponse = {
  videos: [
    { videoId: 'cv1', title: 'Channel Video 1' },
    { videoId: 'cv2', title: 'Channel Video 2' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('youtube-data-api: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const result = await execute({ action: 'invalid' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('invalid'));
  });

  it('should reject missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject undefined params', async () => {
    const result = await execute(undefined, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('youtube-data-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail search_videos without client', async () => {
    const result = await execute({ action: 'search_videos', query: 'cats' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_video without client', async () => {
    const result = await execute({ action: 'get_video', videoId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_channel without client', async () => {
    const result = await execute({ action: 'get_channel', channelId: 'UCxyz' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_comments without client', async () => {
    const result = await execute({ action: 'get_comments', videoId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_trending without client', async () => {
    const result = await execute({ action: 'get_trending' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_playlist without client', async () => {
    const result = await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_channel_videos without client', async () => {
    const result = await execute({ action: 'get_channel_videos', channelId: 'UCxyz' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. search_videos action
// ---------------------------------------------------------------------------
describe('youtube-data-api: search_videos', () => {
  beforeEach(() => {});

  it('should search videos with valid query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_videos', query: 'funny cats' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_videos');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'funny cats');
    assert.equal(result.metadata.order, 'relevance');
    assert.equal(result.metadata.limit, SEARCH_LIMIT_DEFAULT);
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('funny cats'));
  });

  it('should accept custom order and limit', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute(
      { action: 'search_videos', query: 'cats', order: 'date', limit: 10 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.order, 'date');
    assert.equal(result.metadata.limit, 10);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_videos' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_videos', query: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject query exceeding max length', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const longQuery = 'x'.repeat(MAX_QUERY_LENGTH + 1);
    const result = await execute({ action: 'search_videos', query: longQuery }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should reject invalid order', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute(
      { action: 'search_videos', query: 'cats', order: 'invalid' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp limit below minimum to minimum', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute(
      { action: 'search_videos', query: 'cats', limit: 0 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 1);
  });

  it('should clamp limit above maximum to maximum', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute(
      { action: 'search_videos', query: 'cats', limit: 100 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 50);
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_videos', query: 'cats' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should handle empty videos array', async () => {
    const ctx = mockContext({ videos: [] });
    const result = await execute({ action: 'search_videos', query: 'cats' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleSearchResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search_videos', query: 'cats', order: 'date', limit: 10 }, ctx);
    assert.ok(calledPath.includes('/videos/search'));
    assert.ok(calledPath.includes('query=cats'));
    assert.ok(calledPath.includes('order=date'));
    assert.ok(calledPath.includes('limit=10'));
  });
});

// ---------------------------------------------------------------------------
// 4. get_video action
// ---------------------------------------------------------------------------
describe('youtube-data-api: get_video', () => {
  beforeEach(() => {});

  it('should get video with valid videoId', async () => {
    const ctx = mockContext(sampleVideoResponse);
    const result = await execute({ action: 'get_video', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_video');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.videoId, 'abc123');
    assert.ok(result.result.includes('Amazing Cat Video'));
    assert.ok(result.result.includes('Pet Channel'));
  });

  it('should reject missing videoId', async () => {
    const ctx = mockContext(sampleVideoResponse);
    const result = await execute({ action: 'get_video' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty videoId', async () => {
    const ctx = mockContext(sampleVideoResponse);
    const result = await execute({ action: 'get_video', videoId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only videoId', async () => {
    const ctx = mockContext(sampleVideoResponse);
    const result = await execute({ action: 'get_video', videoId: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleVideoResponse);
    const result = await execute({ action: 'get_video', videoId: 'abc123' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 5. get_channel action
// ---------------------------------------------------------------------------
describe('youtube-data-api: get_channel', () => {
  beforeEach(() => {});

  it('should get channel with valid channelId', async () => {
    const ctx = mockContext(sampleChannelResponse);
    const result = await execute({ action: 'get_channel', channelId: 'UCxyz789' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_channel');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.channelId, 'UCxyz789');
    assert.ok(result.result.includes('Pet Channel'));
  });

  it('should reject missing channelId', async () => {
    const ctx = mockContext(sampleChannelResponse);
    const result = await execute({ action: 'get_channel' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty channelId', async () => {
    const ctx = mockContext(sampleChannelResponse);
    const result = await execute({ action: 'get_channel', channelId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 6. get_comments action
// ---------------------------------------------------------------------------
describe('youtube-data-api: get_comments', () => {
  beforeEach(() => {});

  it('should get comments with valid videoId', async () => {
    const ctx = mockContext(sampleCommentsResponse);
    const result = await execute({ action: 'get_comments', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_comments');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.videoId, 'abc123');
    assert.equal(result.metadata.order, 'relevance');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Great video!'));
  });

  it('should accept custom order and limit', async () => {
    const ctx = mockContext(sampleCommentsResponse);
    const result = await execute(
      { action: 'get_comments', videoId: 'abc123', order: 'time', limit: 50 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.order, 'time');
    assert.equal(result.metadata.limit, 50);
  });

  it('should reject missing videoId', async () => {
    const ctx = mockContext(sampleCommentsResponse);
    const result = await execute({ action: 'get_comments' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid order for comments', async () => {
    const ctx = mockContext(sampleCommentsResponse);
    const result = await execute(
      { action: 'get_comments', videoId: 'abc123', order: 'invalid' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp comment limit to max 100', async () => {
    const ctx = mockContext(sampleCommentsResponse);
    const result = await execute(
      { action: 'get_comments', videoId: 'abc123', limit: 200 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 100);
  });

  it('should handle empty comments array', async () => {
    const ctx = mockContext({ comments: [] });
    const result = await execute({ action: 'get_comments', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. get_trending action
// ---------------------------------------------------------------------------
describe('youtube-data-api: get_trending', () => {
  beforeEach(() => {});

  it('should get trending videos with defaults', async () => {
    const ctx = mockContext(sampleTrendingResponse);
    const result = await execute({ action: 'get_trending' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_trending');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.region, 'US');
    assert.equal(result.metadata.category, null);
    assert.equal(result.metadata.count, 2);
  });

  it('should accept custom region', async () => {
    const ctx = mockContext(sampleTrendingResponse);
    const result = await execute({ action: 'get_trending', region: 'GB' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.region, 'GB');
  });

  it('should accept lowercase region and convert to uppercase', async () => {
    const ctx = mockContext(sampleTrendingResponse);
    const result = await execute({ action: 'get_trending', region: 'de' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.region, 'DE');
  });

  it('should accept category parameter', async () => {
    const ctx = mockContext(sampleTrendingResponse);
    const result = await execute({ action: 'get_trending', category: 'Music' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.category, 'Music');
    assert.ok(result.result.includes('Music'));
  });

  it('should reject invalid region code (too long)', async () => {
    const ctx = mockContext(sampleTrendingResponse);
    const result = await execute({ action: 'get_trending', region: 'USA' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid region code (single letter)', async () => {
    const ctx = mockContext(sampleTrendingResponse);
    const result = await execute({ action: 'get_trending', region: 'U' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject region code with numbers', async () => {
    const ctx = mockContext(sampleTrendingResponse);
    const result = await execute({ action: 'get_trending', region: 'U2' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 8. get_playlist action
// ---------------------------------------------------------------------------
describe('youtube-data-api: get_playlist', () => {
  beforeEach(() => {});

  it('should get playlist with valid playlistId', async () => {
    const ctx = mockContext(samplePlaylistResponse);
    const result = await execute({ action: 'get_playlist', playlistId: 'PLxyz123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_playlist');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.playlistId, 'PLxyz123');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Playlist Item 1'));
  });

  it('should accept custom limit', async () => {
    const ctx = mockContext(samplePlaylistResponse);
    const result = await execute(
      { action: 'get_playlist', playlistId: 'PLxyz123', limit: 10 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 10);
  });

  it('should reject missing playlistId', async () => {
    const ctx = mockContext(samplePlaylistResponse);
    const result = await execute({ action: 'get_playlist' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty playlistId', async () => {
    const ctx = mockContext(samplePlaylistResponse);
    const result = await execute({ action: 'get_playlist', playlistId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp playlist limit', async () => {
    const ctx = mockContext(samplePlaylistResponse);
    const result = await execute(
      { action: 'get_playlist', playlistId: 'PLxyz123', limit: 999 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 50);
  });
});

// ---------------------------------------------------------------------------
// 9. get_channel_videos action
// ---------------------------------------------------------------------------
describe('youtube-data-api: get_channel_videos', () => {
  beforeEach(() => {});

  it('should get channel videos with valid channelId', async () => {
    const ctx = mockContext(sampleChannelVideosResponse);
    const result = await execute({ action: 'get_channel_videos', channelId: 'UCxyz789' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_channel_videos');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.channelId, 'UCxyz789');
    assert.equal(result.metadata.order, 'date');
    assert.equal(result.metadata.count, 2);
  });

  it('should accept custom order and limit', async () => {
    const ctx = mockContext(sampleChannelVideosResponse);
    const result = await execute(
      { action: 'get_channel_videos', channelId: 'UCxyz789', order: 'viewCount', limit: 5 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.order, 'viewCount');
    assert.equal(result.metadata.limit, 5);
  });

  it('should reject missing channelId', async () => {
    const ctx = mockContext(sampleChannelVideosResponse);
    const result = await execute({ action: 'get_channel_videos' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid order for channel videos', async () => {
    const ctx = mockContext(sampleChannelVideosResponse);
    const result = await execute(
      { action: 'get_channel_videos', channelId: 'UCxyz789', order: 'relevance' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp channel videos limit', async () => {
    const ctx = mockContext(sampleChannelVideosResponse);
    const result = await execute(
      { action: 'get_channel_videos', channelId: 'UCxyz789', limit: 0 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 1);
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('youtube-data-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on search_videos abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_videos', query: 'cats' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_video abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_video', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_channel abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_channel', channelId: 'UCxyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_comments abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_comments', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_trending abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_trending' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_playlist abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_channel_videos abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_channel_videos', channelId: 'UCxyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('youtube-data-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on search_videos failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'search_videos', query: 'cats' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_video failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'get_video', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_channel failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'get_channel', channelId: 'UCxyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_comments failure', async () => {
    const ctx = mockContextError(new Error('503 Service Unavailable'));
    const result = await execute({ action: 'get_comments', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_trending failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({ action: 'get_trending' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_playlist failure', async () => {
    const ctx = mockContextError(new Error('Not found'));
    const result = await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_channel_videos failure', async () => {
    const ctx = mockContextError(new Error('Timeout upstream'));
    const result = await execute({ action: 'get_channel_videos', channelId: 'UCxyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('youtube-data-api: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient over gatewayClient', () => {
    const result = getClient({
      providerClient: { request: () => {} },
      gatewayClient: { request: () => {} },
    });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });

  it('should return null for null context', () => {
    assert.equal(getClient(null), null);
  });
});

// ---------------------------------------------------------------------------
// 13. redactSensitive
// ---------------------------------------------------------------------------
describe('youtube-data-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: AIzaSyD_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('AIzaSyD_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization=Bearer_sk-abc123xyz';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Bearer_sk-abc123xyz'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Search results for "cats" (5 videos)';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should handle empty string', () => {
    assert.equal(redactSensitive(''), '');
  });
});

// ---------------------------------------------------------------------------
// 14. resolveTimeout
// ---------------------------------------------------------------------------
describe('youtube-data-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should return configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should cap timeout at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should ignore non-positive timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
    assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore non-number timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 15. validateId helper
// ---------------------------------------------------------------------------
describe('youtube-data-api: validateId', () => {
  beforeEach(() => {});

  it('should accept valid id', () => {
    const result = validateId('abc123', 'videoId');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'abc123');
  });

  it('should trim whitespace', () => {
    const result = validateId('  abc123  ', 'videoId');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'abc123');
  });

  it('should reject null', () => {
    const result = validateId(null, 'videoId');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('videoId'));
  });

  it('should reject undefined', () => {
    const result = validateId(undefined, 'channelId');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('channelId'));
  });

  it('should reject empty string', () => {
    const result = validateId('', 'playlistId');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = validateId('   ', 'videoId');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateQuery helper
// ---------------------------------------------------------------------------
describe('youtube-data-api: validateQuery', () => {
  beforeEach(() => {});

  it('should accept valid query', () => {
    const result = validateQuery('funny cat videos');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'funny cat videos');
  });

  it('should trim whitespace', () => {
    const result = validateQuery('  cats  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'cats');
  });

  it('should reject null', () => {
    const result = validateQuery(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateQuery('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only', () => {
    const result = validateQuery('   ');
    assert.equal(result.valid, false);
  });

  it('should reject query exceeding max length', () => {
    const result = validateQuery('x'.repeat(MAX_QUERY_LENGTH + 1));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
  });

  it('should accept query at max length', () => {
    const result = validateQuery('x'.repeat(MAX_QUERY_LENGTH));
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// 17. validateOrder helper
// ---------------------------------------------------------------------------
describe('youtube-data-api: validateOrder', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateOrder(undefined, VALID_SEARCH_ORDERS, 'relevance');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'relevance');
  });

  it('should return default when null', () => {
    const result = validateOrder(null, VALID_SEARCH_ORDERS, 'relevance');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'relevance');
  });

  it('should accept valid order', () => {
    const result = validateOrder('date', VALID_SEARCH_ORDERS, 'relevance');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'date');
  });

  it('should reject invalid order', () => {
    const result = validateOrder('invalid', VALID_SEARCH_ORDERS, 'relevance');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('invalid'));
  });

  it('should reject non-string order', () => {
    const result = validateOrder(42, VALID_SEARCH_ORDERS, 'relevance');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 18. validateRegion helper
// ---------------------------------------------------------------------------
describe('youtube-data-api: validateRegion', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateRegion(undefined, 'US');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'US');
  });

  it('should return default when null', () => {
    const result = validateRegion(null, 'US');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'US');
  });

  it('should accept valid uppercase region', () => {
    const result = validateRegion('GB', 'US');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'GB');
  });

  it('should convert lowercase to uppercase', () => {
    const result = validateRegion('de', 'US');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'DE');
  });

  it('should reject 3-letter code', () => {
    const result = validateRegion('USA', 'US');
    assert.equal(result.valid, false);
  });

  it('should reject 1-letter code', () => {
    const result = validateRegion('U', 'US');
    assert.equal(result.valid, false);
  });

  it('should reject code with numbers', () => {
    const result = validateRegion('U2', 'US');
    assert.equal(result.valid, false);
  });

  it('should reject non-string', () => {
    const result = validateRegion(42, 'US');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 19. clampLimit helper
// ---------------------------------------------------------------------------
describe('youtube-data-api: clampLimit', () => {
  beforeEach(() => {});

  it('should return default for undefined', () => {
    assert.equal(clampLimit(undefined, 1, 50, 25), 25);
  });

  it('should return default for null', () => {
    assert.equal(clampLimit(null, 1, 50, 25), 25);
  });

  it('should return default for NaN', () => {
    assert.equal(clampLimit('abc', 1, 50, 25), 25);
  });

  it('should clamp below min to min', () => {
    assert.equal(clampLimit(0, 1, 50, 25), 1);
  });

  it('should clamp above max to max', () => {
    assert.equal(clampLimit(100, 1, 50, 25), 50);
  });

  it('should floor fractional values', () => {
    assert.equal(clampLimit(10.9, 1, 50, 25), 10);
  });

  it('should pass through valid values', () => {
    assert.equal(clampLimit(15, 1, 50, 25), 15);
  });
});

// ---------------------------------------------------------------------------
// 20. validate() function
// ---------------------------------------------------------------------------
describe('youtube-data-api: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'invalid' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('invalid'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate search_videos requires query', () => {
    const result = validate({ action: 'search_videos' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('query'));
  });

  it('should validate search_videos accepts valid params', () => {
    const result = validate({ action: 'search_videos', query: 'cats' });
    assert.equal(result.valid, true);
  });

  it('should validate search_videos rejects invalid order', () => {
    const result = validate({ action: 'search_videos', query: 'cats', order: 'bad' });
    assert.equal(result.valid, false);
  });

  it('should validate get_video requires videoId', () => {
    const result = validate({ action: 'get_video' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('videoId'));
  });

  it('should validate get_video accepts valid params', () => {
    const result = validate({ action: 'get_video', videoId: 'abc123' });
    assert.equal(result.valid, true);
  });

  it('should validate get_channel requires channelId', () => {
    const result = validate({ action: 'get_channel' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('channelId'));
  });

  it('should validate get_channel accepts valid params', () => {
    const result = validate({ action: 'get_channel', channelId: 'UCxyz' });
    assert.equal(result.valid, true);
  });

  it('should validate get_comments requires videoId', () => {
    const result = validate({ action: 'get_comments' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('videoId'));
  });

  it('should validate get_comments rejects invalid order', () => {
    const result = validate({ action: 'get_comments', videoId: 'abc', order: 'bad' });
    assert.equal(result.valid, false);
  });

  it('should validate get_trending accepts with no params', () => {
    const result = validate({ action: 'get_trending' });
    assert.equal(result.valid, true);
  });

  it('should validate get_trending rejects invalid region', () => {
    const result = validate({ action: 'get_trending', region: 'INVALID' });
    assert.equal(result.valid, false);
  });

  it('should validate get_playlist requires playlistId', () => {
    const result = validate({ action: 'get_playlist' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('playlistId'));
  });

  it('should validate get_channel_videos requires channelId', () => {
    const result = validate({ action: 'get_channel_videos' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('channelId'));
  });

  it('should validate get_channel_videos rejects invalid order', () => {
    const result = validate({ action: 'get_channel_videos', channelId: 'UC123', order: 'rating' });
    assert.equal(result.valid, false);
  });

  it('should validate get_channel_videos accepts valid params', () => {
    const result = validate({ action: 'get_channel_videos', channelId: 'UC123', order: 'viewCount' });
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// 21. meta export
// ---------------------------------------------------------------------------
describe('youtube-data-api: meta', () => {
  beforeEach(() => {});

  it('should export meta object', () => {
    assert.ok(meta);
    assert.equal(typeof meta, 'object');
  });

  it('should have correct name', () => {
    assert.equal(meta.name, 'youtube-data-api');
  });

  it('should have version', () => {
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description.length > 0);
  });

  it('should have 7 actions', () => {
    assert.equal(meta.actions.length, 7);
  });

  it('should include all expected actions', () => {
    assert.ok(meta.actions.includes('search_videos'));
    assert.ok(meta.actions.includes('get_video'));
    assert.ok(meta.actions.includes('get_channel'));
    assert.ok(meta.actions.includes('get_comments'));
    assert.ok(meta.actions.includes('get_trending'));
    assert.ok(meta.actions.includes('get_playlist'));
    assert.ok(meta.actions.includes('get_channel_videos'));
  });
});

// ---------------------------------------------------------------------------
// 22. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('youtube-data-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleSearchResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'search_videos', query: 'cats' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('/videos/search'));
  });
});

// ---------------------------------------------------------------------------
// 23. Endpoint routing verification
// ---------------------------------------------------------------------------
describe('youtube-data-api: endpoint routing', () => {
  beforeEach(() => {});

  it('should call correct path for get_video', async () => {
    let calledPath = null;
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleVideoResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_video', videoId: 'abc123' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.ok(calledPath.includes('/videos/abc123'));
  });

  it('should call correct path for get_channel', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleChannelResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_channel', channelId: 'UCxyz789' }, ctx);
    assert.ok(calledPath.includes('/channels/UCxyz789'));
  });

  it('should call correct path for get_comments', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleCommentsResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_comments', videoId: 'abc123' }, ctx);
    assert.ok(calledPath.includes('/videos/abc123/comments'));
  });

  it('should call correct path for get_trending', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleTrendingResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_trending', region: 'GB' }, ctx);
    assert.ok(calledPath.includes('/videos/trending'));
    assert.ok(calledPath.includes('region=GB'));
  });

  it('should call correct path for get_playlist', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return samplePlaylistResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_playlist', playlistId: 'PLxyz123' }, ctx);
    assert.ok(calledPath.includes('/playlists/PLxyz123/items'));
  });

  it('should call correct path for get_channel_videos', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleChannelVideosResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_channel_videos', channelId: 'UCxyz789' }, ctx);
    assert.ok(calledPath.includes('/channels/UCxyz789/videos'));
  });
});

// ---------------------------------------------------------------------------
// 24. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('youtube-data-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error, 'PROVIDER_NOT_CONFIGURED');
    assert.ok(err.result.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 25. requestWithTimeout
// ---------------------------------------------------------------------------
describe('youtube-data-api: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return response on success', async () => {
    const client = { request: async () => ({ ok: true }) };
    const result = await requestWithTimeout(client, 'GET', '/test', null, 5000);
    assert.deepEqual(result, { ok: true });
  });

  it('should throw TIMEOUT on AbortError', async () => {
    const client = {
      request: async () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'TIMEOUT');
    }
  });

  it('should throw UPSTREAM_ERROR on generic error', async () => {
    const client = {
      request: async () => { throw new Error('Connection failed'); },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('Connection failed'));
    }
  });
});
