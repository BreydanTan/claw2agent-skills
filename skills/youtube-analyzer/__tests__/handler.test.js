import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  redactSensitive,
  sanitizeString,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .fetch() method.
 */
function mockContext(fetchResponse, config) {
  return {
    providerClient: {
      fetch: async (_endpoint, _opts) => fetchResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .fetch() tracks calls and returns data.
 */
function mockContextWithSpy(fetchResponse) {
  const calls = [];
  return {
    context: {
      providerClient: {
        fetch: async (endpoint, opts) => {
          calls.push({ endpoint, opts });
          return fetchResponse;
        },
      },
      config: { timeoutMs: 5000 },
    },
    calls,
  };
}

/**
 * Build a mock context where .fetch() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      fetch: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .fetch() times out (AbortError).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      fetch: async (_endpoint, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

// ---------------------------------------------------------------------------
// Sample response data
// ---------------------------------------------------------------------------

const sampleVideo = {
  items: [{
    snippet: {
      title: 'Never Gonna Give You Up',
      description: 'The official video for Rick Astley - Never Gonna Give You Up',
      channelTitle: 'Rick Astley',
      publishedAt: '2009-10-25T06:57:33Z',
      tags: ['rick astley', 'never gonna give you up', 'rickroll', '80s'],
    },
    statistics: {
      viewCount: '1500000000',
      likeCount: '15000000',
      commentCount: '3000000',
    },
    contentDetails: {
      duration: 'PT3M33S',
    },
  }],
};

const sampleVideoNoItems = { items: [] };

const sampleSearchResults = {
  items: [
    {
      id: { videoId: 'abc123' },
      snippet: { title: 'JS Tutorial', channelTitle: 'CodeChannel', publishedAt: '2025-01-01T00:00:00Z' },
    },
    {
      id: { videoId: 'def456' },
      snippet: { title: 'React Guide', channelTitle: 'ReactDev', publishedAt: '2025-02-01T00:00:00Z' },
    },
  ],
  pageInfo: { totalResults: 100 },
};

const sampleSearchChannels = {
  items: [
    {
      id: { channelId: 'UCxyz' },
      snippet: { title: 'Tech Channel', channelTitle: 'Tech Channel', publishedAt: '2020-01-01T00:00:00Z' },
    },
  ],
  pageInfo: { totalResults: 1 },
};

const sampleSearchEmpty = { items: [], pageInfo: { totalResults: 0 } };

const sampleChannel = {
  items: [{
    snippet: {
      title: 'Google Developers',
      description: 'The Google Developers channel features talks from events and more.',
      publishedAt: '2007-08-23T00:34:43Z',
      country: 'US',
    },
    statistics: {
      subscriberCount: '2500000',
      viewCount: '500000000',
      videoCount: '5000',
    },
  }],
};

const sampleChannelNotFound = { items: [] };

const sampleComments = {
  items: [
    {
      snippet: {
        topLevelComment: {
          snippet: {
            authorDisplayName: 'UserOne',
            textDisplay: 'Great video! Really helpful content.',
            likeCount: 42,
            publishedAt: '2025-03-01T10:00:00Z',
          },
        },
      },
    },
    {
      snippet: {
        topLevelComment: {
          snippet: {
            authorDisplayName: 'UserTwo',
            textDisplay: 'Thanks for the tutorial.',
            likeCount: 10,
            publishedAt: '2025-03-02T12:00:00Z',
          },
        },
      },
    },
  ],
};

const sampleCommentsEmpty = { items: [] };

const sampleTranscript = {
  text: 'Hello and welcome to this video. Today we will learn about JavaScript.',
  segments: [
    { text: 'Hello and welcome to this video.', start: 0, duration: 3 },
    { text: 'Today we will learn about JavaScript.', start: 3, duration: 4 },
  ],
};

const sampleTranscriptEmpty = { text: '', segments: [] };

const samplePlaylist = {
  items: [
    {
      snippet: {
        title: 'Intro to JS',
        resourceId: { videoId: 'vid001' },
        channelTitle: 'CodeChannel',
        position: 0,
        publishedAt: '2025-01-01T00:00:00Z',
      },
      contentDetails: { videoId: 'vid001' },
    },
    {
      snippet: {
        title: 'Variables and Types',
        resourceId: { videoId: 'vid002' },
        channelTitle: 'CodeChannel',
        position: 1,
        publishedAt: '2025-01-02T00:00:00Z',
      },
      contentDetails: { videoId: 'vid002' },
    },
  ],
  pageInfo: { totalResults: 20 },
};

const samplePlaylistEmpty = { items: [], pageInfo: { totalResults: 0 } };

// Engagement test data: high engagement
const sampleVideoHighEngagement = {
  items: [{
    snippet: { title: 'Viral Video' },
    statistics: {
      viewCount: '1000',
      likeCount: '100',
      commentCount: '50',
    },
    contentDetails: { duration: 'PT5M0S' },
  }],
};

// Engagement test data: zero views
const sampleVideoZeroViews = {
  items: [{
    snippet: { title: 'New Video' },
    statistics: {
      viewCount: '0',
      likeCount: '0',
      commentCount: '0',
    },
    contentDetails: { duration: 'PT1M0S' },
  }],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('youtube-analyzer: action validation', () => {
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

  it('should list valid actions in error message', async () => {
    const result = await execute({ action: 'bad' }, {});
    assert.ok(result.result.includes('get_video'));
    assert.ok(result.result.includes('search'));
    assert.ok(result.result.includes('analyze_engagement'));
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all external actions
// ---------------------------------------------------------------------------
describe('youtube-analyzer: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_video without client', async () => {
    const result = await execute({ action: 'get_video', videoId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search without client', async () => {
    const result = await execute({ action: 'search', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_channel without client', async () => {
    const result = await execute({ action: 'get_channel', channelId: 'UCxyz' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_comments without client', async () => {
    const result = await execute({ action: 'list_comments', videoId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_transcript without client', async () => {
    const result = await execute({ action: 'get_transcript', videoId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_playlist without client', async () => {
    const result = await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail analyze_engagement without client', async () => {
    const result = await execute({ action: 'analyze_engagement', videoId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_video action
// ---------------------------------------------------------------------------
describe('youtube-analyzer: get_video', () => {
  beforeEach(() => {});

  it('should return video info successfully', async () => {
    const ctx = mockContext(sampleVideo);
    const result = await execute({ action: 'get_video', videoId: 'dQw4w9WgXcQ' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_video');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.videoId, 'dQw4w9WgXcQ');
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.title, 'Never Gonna Give You Up');
    assert.equal(result.metadata.channelTitle, 'Rick Astley');
    assert.equal(result.metadata.viewCount, '1500000000');
    assert.equal(result.metadata.likeCount, '15000000');
    assert.ok(result.result.includes('Never Gonna Give You Up'));
    assert.ok(result.result.includes('Rick Astley'));
  });

  it('should reject missing videoId', async () => {
    const ctx = mockContext(sampleVideo);
    const result = await execute({ action: 'get_video' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_VIDEO_ID');
  });

  it('should handle video not found', async () => {
    const ctx = mockContext(sampleVideoNoItems);
    const result = await execute({ action: 'get_video', videoId: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
  });

  it('should call the correct endpoint with params', async () => {
    const { context, calls } = mockContextWithSpy(sampleVideo);
    await execute({ action: 'get_video', videoId: 'dQw4w9WgXcQ' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, 'youtube/videos');
    assert.equal(calls[0].opts.params.id, 'dQw4w9WgXcQ');
    assert.ok(calls[0].opts.params.part.includes('snippet'));
    assert.ok(calls[0].opts.params.part.includes('statistics'));
  });

  it('should include tags in metadata', async () => {
    const ctx = mockContext(sampleVideo);
    const result = await execute({ action: 'get_video', videoId: 'dQw4w9WgXcQ' }, ctx);
    assert.ok(Array.isArray(result.metadata.tags));
    assert.ok(result.metadata.tags.includes('rick astley'));
  });

  it('should include duration in metadata', async () => {
    const ctx = mockContext(sampleVideo);
    const result = await execute({ action: 'get_video', videoId: 'dQw4w9WgXcQ' }, ctx);
    assert.equal(result.metadata.duration, 'PT3M33S');
    assert.ok(result.result.includes('3m'));
  });
});

// ---------------------------------------------------------------------------
// 4. search action
// ---------------------------------------------------------------------------
describe('youtube-analyzer: search', () => {
  beforeEach(() => {});

  it('should search videos successfully', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'javascript tutorial' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'javascript tutorial');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.totalResults, 100);
    assert.ok(result.result.includes('JS Tutorial'));
    assert.ok(result.result.includes('React Guide'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_QUERY');
  });

  it('should handle empty search results', async () => {
    const ctx = mockContext(sampleSearchEmpty);
    const result = await execute({ action: 'search', query: 'zzzzzznonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No results'));
  });

  it('should use default order of relevance', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].opts.params.order, 'relevance');
  });

  it('should use default type of video', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].opts.params.type, 'video');
  });

  it('should pass custom order and type', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', order: 'viewCount', type: 'channel' }, context);
    assert.equal(calls[0].opts.params.order, 'viewCount');
    assert.equal(calls[0].opts.params.type, 'channel');
  });

  it('should default invalid order to relevance', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', order: 'invalid_order' }, context);
    assert.equal(calls[0].opts.params.order, 'relevance');
  });

  it('should default invalid type to video', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', type: 'invalid_type' }, context);
    assert.equal(calls[0].opts.params.type, 'video');
  });

  it('should use default maxResults of 10', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].opts.params.maxResults, 10);
  });

  it('should pass custom maxResults', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', maxResults: 5 }, context);
    assert.equal(calls[0].opts.params.maxResults, 5);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].endpoint, 'youtube/search');
  });

  it('should return channel search results with channelId', async () => {
    const ctx = mockContext(sampleSearchChannels);
    const result = await execute({ action: 'search', query: 'tech', type: 'channel' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.items[0].channelId, 'UCxyz');
  });
});

// ---------------------------------------------------------------------------
// 5. get_channel action
// ---------------------------------------------------------------------------
describe('youtube-analyzer: get_channel', () => {
  beforeEach(() => {});

  it('should return channel info successfully', async () => {
    const ctx = mockContext(sampleChannel);
    const result = await execute({ action: 'get_channel', channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_channel');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.title, 'Google Developers');
    assert.equal(result.metadata.subscriberCount, '2500000');
    assert.equal(result.metadata.videoCount, '5000');
    assert.ok(result.result.includes('Google Developers'));
    assert.ok(result.result.includes('2500000'));
  });

  it('should reject missing channelId', async () => {
    const ctx = mockContext(sampleChannel);
    const result = await execute({ action: 'get_channel' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CHANNEL_ID');
  });

  it('should handle channel not found', async () => {
    const ctx = mockContext(sampleChannelNotFound);
    const result = await execute({ action: 'get_channel', channelId: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannel);
    await execute({ action: 'get_channel', channelId: 'UCxyz' }, context);
    assert.equal(calls[0].endpoint, 'youtube/channels');
    assert.equal(calls[0].opts.params.id, 'UCxyz');
  });
});

// ---------------------------------------------------------------------------
// 6. list_comments action
// ---------------------------------------------------------------------------
describe('youtube-analyzer: list_comments', () => {
  beforeEach(() => {});

  it('should list comments successfully', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'list_comments', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_comments');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('UserOne'));
    assert.ok(result.result.includes('UserTwo'));
    assert.ok(result.result.includes('Great video'));
  });

  it('should reject missing videoId', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'list_comments' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_VIDEO_ID');
  });

  it('should handle empty comments', async () => {
    const ctx = mockContext(sampleCommentsEmpty);
    const result = await execute({ action: 'list_comments', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No comments'));
  });

  it('should use default order of relevance', async () => {
    const { context, calls } = mockContextWithSpy(sampleComments);
    await execute({ action: 'list_comments', videoId: 'abc' }, context);
    assert.equal(calls[0].opts.params.order, 'relevance');
  });

  it('should pass custom order', async () => {
    const { context, calls } = mockContextWithSpy(sampleComments);
    await execute({ action: 'list_comments', videoId: 'abc', order: 'time' }, context);
    assert.equal(calls[0].opts.params.order, 'time');
  });

  it('should use default maxResults of 20', async () => {
    const { context, calls } = mockContextWithSpy(sampleComments);
    await execute({ action: 'list_comments', videoId: 'abc' }, context);
    assert.equal(calls[0].opts.params.maxResults, 20);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleComments);
    await execute({ action: 'list_comments', videoId: 'abc' }, context);
    assert.equal(calls[0].endpoint, 'youtube/commentThreads');
    assert.equal(calls[0].opts.params.videoId, 'abc');
  });

  it('should include comment metadata with author and likeCount', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'list_comments', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.comments[0].author, 'UserOne');
    assert.equal(result.metadata.comments[0].likeCount, 42);
    assert.equal(result.metadata.comments[1].author, 'UserTwo');
  });
});

// ---------------------------------------------------------------------------
// 7. get_transcript action
// ---------------------------------------------------------------------------
describe('youtube-analyzer: get_transcript', () => {
  beforeEach(() => {});

  it('should return transcript successfully', async () => {
    const ctx = mockContext(sampleTranscript);
    const result = await execute({ action: 'get_transcript', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_transcript');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.segmentCount, 2);
    assert.ok(result.metadata.text.includes('Hello and welcome'));
    assert.ok(result.result.includes('Hello and welcome'));
  });

  it('should reject missing videoId', async () => {
    const ctx = mockContext(sampleTranscript);
    const result = await execute({ action: 'get_transcript' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_VIDEO_ID');
  });

  it('should handle no transcript found', async () => {
    const ctx = mockContext(sampleTranscriptEmpty);
    const result = await execute({ action: 'get_transcript', videoId: 'abc' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
    assert.ok(result.result.includes('No transcript'));
  });

  it('should use default language of en', async () => {
    const { context, calls } = mockContextWithSpy(sampleTranscript);
    await execute({ action: 'get_transcript', videoId: 'abc' }, context);
    assert.equal(calls[0].opts.params.language, 'en');
  });

  it('should pass custom language', async () => {
    const { context, calls } = mockContextWithSpy(sampleTranscript);
    await execute({ action: 'get_transcript', videoId: 'abc', language: 'es' }, context);
    assert.equal(calls[0].opts.params.language, 'es');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleTranscript);
    await execute({ action: 'get_transcript', videoId: 'abc' }, context);
    assert.equal(calls[0].endpoint, 'youtube/captions');
    assert.equal(calls[0].opts.params.videoId, 'abc');
  });
});

// ---------------------------------------------------------------------------
// 8. get_playlist action
// ---------------------------------------------------------------------------
describe('youtube-analyzer: get_playlist', () => {
  beforeEach(() => {});

  it('should return playlist items successfully', async () => {
    const ctx = mockContext(samplePlaylist);
    const result = await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_playlist');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.totalResults, 20);
    assert.ok(result.result.includes('Intro to JS'));
    assert.ok(result.result.includes('Variables and Types'));
  });

  it('should reject missing playlistId', async () => {
    const ctx = mockContext(samplePlaylist);
    const result = await execute({ action: 'get_playlist' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PLAYLIST_ID');
  });

  it('should handle empty playlist', async () => {
    const ctx = mockContext(samplePlaylistEmpty);
    const result = await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No items'));
  });

  it('should use default maxResults of 50', async () => {
    const { context, calls } = mockContextWithSpy(samplePlaylist);
    await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, context);
    assert.equal(calls[0].opts.params.maxResults, 50);
  });

  it('should pass custom maxResults', async () => {
    const { context, calls } = mockContextWithSpy(samplePlaylist);
    await execute({ action: 'get_playlist', playlistId: 'PLxyz', maxResults: 10 }, context);
    assert.equal(calls[0].opts.params.maxResults, 10);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(samplePlaylist);
    await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, context);
    assert.equal(calls[0].endpoint, 'youtube/playlistItems');
    assert.equal(calls[0].opts.params.playlistId, 'PLxyz');
  });

  it('should include videoId in playlist item metadata', async () => {
    const ctx = mockContext(samplePlaylist);
    const result = await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, ctx);
    assert.equal(result.metadata.items[0].videoId, 'vid001');
    assert.equal(result.metadata.items[1].videoId, 'vid002');
  });
});

// ---------------------------------------------------------------------------
// 9. analyze_engagement action
// ---------------------------------------------------------------------------
describe('youtube-analyzer: analyze_engagement', () => {
  beforeEach(() => {});

  it('should calculate engagement metrics successfully', async () => {
    const ctx = mockContext(sampleVideoHighEngagement);
    const result = await execute({ action: 'analyze_engagement', videoId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'analyze_engagement');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.found, true);
    assert.equal(result.metadata.viewCount, 1000);
    assert.equal(result.metadata.likeCount, 100);
    assert.equal(result.metadata.commentCount, 50);
    // engagement rate = ((100 + 50) / 1000) * 100 = 15%
    assert.equal(result.metadata.engagementRate, 15);
    // like ratio = (100 / 1000) * 100 = 10%
    assert.equal(result.metadata.likeRatio, 10);
    // comment rate = (50 / 1000) * 100 = 5%
    assert.equal(result.metadata.commentRate, 5);
    assert.equal(result.metadata.ctrTier, 'excellent');
  });

  it('should reject missing videoId', async () => {
    const ctx = mockContext(sampleVideoHighEngagement);
    const result = await execute({ action: 'analyze_engagement' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_VIDEO_ID');
  });

  it('should handle video not found', async () => {
    const ctx = mockContext(sampleVideoNoItems);
    const result = await execute({ action: 'analyze_engagement', videoId: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.found, false);
  });

  it('should handle zero views gracefully', async () => {
    const ctx = mockContext(sampleVideoZeroViews);
    const result = await execute({ action: 'analyze_engagement', videoId: 'zero' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.engagementRate, 0);
    assert.equal(result.metadata.likeRatio, 0);
    assert.equal(result.metadata.commentRate, 0);
    assert.equal(result.metadata.ctrTier, 'low');
  });

  it('should classify ctr tier as high for engagement >= 5%', async () => {
    const data = {
      items: [{
        snippet: { title: 'Test' },
        statistics: { viewCount: '1000', likeCount: '40', commentCount: '20' },
        contentDetails: { duration: 'PT1M' },
      }],
    };
    const ctx = mockContext(data);
    const result = await execute({ action: 'analyze_engagement', videoId: 'x' }, ctx);
    // engagement = ((40 + 20) / 1000) * 100 = 6%
    assert.equal(result.metadata.ctrTier, 'high');
  });

  it('should classify ctr tier as average for engagement >= 2%', async () => {
    const data = {
      items: [{
        snippet: { title: 'Test' },
        statistics: { viewCount: '1000', likeCount: '15', commentCount: '5' },
        contentDetails: { duration: 'PT1M' },
      }],
    };
    const ctx = mockContext(data);
    const result = await execute({ action: 'analyze_engagement', videoId: 'x' }, ctx);
    // engagement = ((15 + 5) / 1000) * 100 = 2%
    assert.equal(result.metadata.ctrTier, 'average');
  });

  it('should classify ctr tier as below_average for engagement >= 0.5%', async () => {
    const data = {
      items: [{
        snippet: { title: 'Test' },
        statistics: { viewCount: '10000', likeCount: '40', commentCount: '10' },
        contentDetails: { duration: 'PT1M' },
      }],
    };
    const ctx = mockContext(data);
    const result = await execute({ action: 'analyze_engagement', videoId: 'x' }, ctx);
    // engagement = ((40 + 10) / 10000) * 100 = 0.5%
    assert.equal(result.metadata.ctrTier, 'below_average');
  });

  it('should fetch from youtube/videos endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleVideoHighEngagement);
    await execute({ action: 'analyze_engagement', videoId: 'abc' }, context);
    assert.equal(calls[0].endpoint, 'youtube/videos');
    assert.equal(calls[0].opts.params.id, 'abc');
  });

  it('should include title in result text', async () => {
    const ctx = mockContext(sampleVideoHighEngagement);
    const result = await execute({ action: 'analyze_engagement', videoId: 'abc' }, ctx);
    assert.ok(result.result.includes('Viral Video'));
    assert.ok(result.result.includes('Engagement Rate'));
    assert.ok(result.result.includes('15.00%'));
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('youtube-analyzer: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for get_video', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_video', videoId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for search', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for get_channel', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_channel', channelId: 'UCxyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for analyze_engagement', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'analyze_engagement', videoId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('youtube-analyzer: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for get_video', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_video', videoId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for search', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for list_comments', async () => {
    const ctx = mockContextError(new Error('ECONNRESET'));
    const result = await execute({ action: 'list_comments', videoId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('youtube-analyzer: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient', () => {
    const result = getClient({ providerClient: { fetch: () => {} }, gatewayClient: { fetch: () => {} } });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { fetch: () => {} } });
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
describe('youtube-analyzer: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact token patterns', () => {
    const input = 'token=mySecretToken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('mySecretToken123'));
  });

  it('should redact YouTube API key patterns', () => {
    const input = 'Using AIzaSyA1234567890abcdefghijklmnopqrstuvw for auth';
    const output = redactSensitive(input);
    assert.ok(!output.includes('AIzaSyA1234567890abcdefghijklmnopqrstuvw'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Rick Astley has 1.5B views';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 14. sanitizeString
// ---------------------------------------------------------------------------
describe('youtube-analyzer: sanitizeString', () => {
  beforeEach(() => {});

  it('should trim whitespace', () => {
    assert.equal(sanitizeString('  hello  '), 'hello');
  });

  it('should remove control characters', () => {
    const input = 'hello\x00world\x07test';
    const output = sanitizeString(input);
    assert.ok(!output.includes('\x00'));
    assert.ok(!output.includes('\x07'));
    assert.ok(output.includes('hello'));
  });

  it('should return undefined for null', () => {
    assert.equal(sanitizeString(null), undefined);
  });

  it('should return undefined for undefined', () => {
    assert.equal(sanitizeString(undefined), undefined);
  });

  it('should convert numbers to strings', () => {
    assert.equal(sanitizeString(123), '123');
  });
});

// ---------------------------------------------------------------------------
// 15. No hardcoded URLs (L1 compliance)
// ---------------------------------------------------------------------------
describe('youtube-analyzer: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded googleapis.com URLs in fetch endpoints', async () => {
    const { context, calls } = mockContextWithSpy(sampleVideo);
    await execute({ action: 'get_video', videoId: 'abc' }, context);
    for (const call of calls) {
      assert.ok(!call.endpoint.includes('https://'), 'Endpoint must not contain https://');
      assert.ok(!call.endpoint.includes('googleapis.com'), 'Endpoint must not contain googleapis.com');
      assert.ok(call.endpoint.startsWith('youtube/'), 'Endpoint must start with youtube/');
    }
  });

  it('should use youtube/ prefix for all API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleVideo);

    await execute({ action: 'get_video', videoId: 'abc' }, context);
    await execute({ action: 'search', query: 'test' }, context);
    await execute({ action: 'get_channel', channelId: 'UCxyz' }, context);
    await execute({ action: 'list_comments', videoId: 'abc' }, context);
    await execute({ action: 'get_transcript', videoId: 'abc' }, context);
    await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, context);
    await execute({ action: 'analyze_engagement', videoId: 'abc' }, context);

    assert.ok(calls.length >= 7, `Expected at least 7 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.endpoint.startsWith('youtube/'), `Endpoint "${call.endpoint}" must start with youtube/`);
    }
  });

  it('should use correct endpoint for each action', async () => {
    const { context, calls } = mockContextWithSpy(sampleVideo);

    await execute({ action: 'get_video', videoId: 'abc' }, context);
    await execute({ action: 'search', query: 'test' }, context);
    await execute({ action: 'get_channel', channelId: 'UCxyz' }, context);
    await execute({ action: 'list_comments', videoId: 'abc' }, context);
    await execute({ action: 'get_transcript', videoId: 'abc' }, context);
    await execute({ action: 'get_playlist', playlistId: 'PLxyz' }, context);

    assert.equal(calls[0].endpoint, 'youtube/videos');
    assert.equal(calls[1].endpoint, 'youtube/search');
    assert.equal(calls[2].endpoint, 'youtube/channels');
    assert.equal(calls[3].endpoint, 'youtube/commentThreads');
    assert.equal(calls[4].endpoint, 'youtube/captions');
    assert.equal(calls[5].endpoint, 'youtube/playlistItems');
  });
});

// ---------------------------------------------------------------------------
// 16. maxResults clamping
// ---------------------------------------------------------------------------
describe('youtube-analyzer: maxResults clamping', () => {
  beforeEach(() => {});

  it('should clamp maxResults to max 50', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', maxResults: 500 }, context);
    assert.equal(calls[0].opts.params.maxResults, 50);
  });

  it('should clamp maxResults to minimum 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', maxResults: -5 }, context);
    assert.equal(calls[0].opts.params.maxResults, 1);
  });

  it('should floor fractional maxResults', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', maxResults: 7.9 }, context);
    assert.equal(calls[0].opts.params.maxResults, 7);
  });
});
