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
  validateRequiredString,
  validateLimit,
  validateQuery,
  validateMetrics,
  validatePeriod,
  VALID_ACTIONS,
  VALID_METRICS,
  VALID_PERIODS,
  DEFAULT_LIMIT,
  MAX_LIMIT_MEDIA,
  MAX_LIMIT_HASHTAG,
  MAX_LIMIT_COMMENTS,
  MAX_QUERY_LENGTH,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => requestResponse,
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
      request: async (_method, _path, _body, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample profile response. */
const sampleProfile = {
  id: '12345',
  username: 'johndoe',
  name: 'John Doe',
  biography: 'Photography enthusiast',
  followers_count: 1500,
  follows_count: 300,
  media_count: 42,
};

/** Sample media response. */
const sampleMedia = {
  id: 'media_001',
  media_type: 'IMAGE',
  caption: 'Beautiful sunset at the beach',
  timestamp: '2025-01-15T18:30:00Z',
  like_count: 250,
  comments_count: 12,
  media_url: 'https://cdn.example.com/photo.jpg',
};

/** Sample media list response. */
const sampleMediaList = {
  data: [
    { id: 'media_001', media_type: 'IMAGE', caption: 'First post' },
    { id: 'media_002', media_type: 'VIDEO', caption: 'Second post' },
    { id: 'media_003', media_type: 'CAROUSEL_ALBUM', caption: 'Third post' },
  ],
};

/** Sample hashtag search response. */
const sampleHashtags = {
  data: [
    { id: 'ht_001', name: 'sunset', media_count: 50000 },
    { id: 'ht_002', name: 'sunsetphotography', media_count: 12000 },
  ],
};

/** Sample insights response. */
const sampleInsights = {
  data: [
    { name: 'impressions', values: [{ value: 5200 }] },
    { name: 'reach', values: [{ value: 3100 }] },
    { name: 'profile_views', values: [{ value: 180 }] },
    { name: 'follower_count', values: [{ value: 1500 }] },
  ],
};

/** Sample comments response. */
const sampleComments = {
  data: [
    { id: 'c_001', username: 'alice', text: 'Great photo!' },
    { id: 'c_002', username: 'bob', text: 'Love this!' },
  ],
};

/** Sample stories response. */
const sampleStories = {
  data: [
    { id: 'story_001', media_type: 'IMAGE', timestamp: '2025-01-15T10:00:00Z' },
    { id: 'story_002', media_type: 'VIDEO', timestamp: '2025-01-15T12:00:00Z' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('instagram-graph-api: action validation', () => {
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
    const result = await execute({ action: 'nope' }, {});
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Error should mention action "${a}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all actions
// ---------------------------------------------------------------------------
describe('instagram-graph-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_profile without client', async () => {
    const result = await execute({ action: 'get_profile', userId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail get_media without client', async () => {
    const result = await execute({ action: 'get_media', mediaId: 'm1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_media without client', async () => {
    const result = await execute({ action: 'list_media', userId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_hashtag without client', async () => {
    const result = await execute({ action: 'search_hashtag', query: 'sunset' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_insights without client', async () => {
    const result = await execute({ action: 'get_insights', userId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_comments without client', async () => {
    const result = await execute({ action: 'get_comments', mediaId: 'm1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_stories without client', async () => {
    const result = await execute({ action: 'get_stories', userId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_profile action
// ---------------------------------------------------------------------------
describe('instagram-graph-api: get_profile', () => {
  beforeEach(() => {});

  it('should get profile with valid userId', async () => {
    const ctx = mockContext(sampleProfile);
    const result = await execute({ action: 'get_profile', userId: '12345' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_profile');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.userId, '12345');
    assert.ok(result.result.includes('John Doe'));
    assert.ok(result.result.includes('@johndoe'));
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing userId', async () => {
    const ctx = mockContext(sampleProfile);
    const result = await execute({ action: 'get_profile' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty userId', async () => {
    const ctx = mockContext(sampleProfile);
    const result = await execute({ action: 'get_profile', userId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only userId', async () => {
    const ctx = mockContext(sampleProfile);
    const result = await execute({ action: 'get_profile', userId: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleProfile;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_profile', userId: 'user_99' }, ctx);
    assert.equal(calledPath, '/users/user_99');
  });

  it('should use GET method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => {
          calledMethod = method;
          return sampleProfile;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_profile', userId: '123' }, ctx);
    assert.equal(calledMethod, 'GET');
  });
});

// ---------------------------------------------------------------------------
// 4. get_media action
// ---------------------------------------------------------------------------
describe('instagram-graph-api: get_media', () => {
  beforeEach(() => {});

  it('should get media with valid mediaId', async () => {
    const ctx = mockContext(sampleMedia);
    const result = await execute({ action: 'get_media', mediaId: 'media_001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_media');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.mediaId, 'media_001');
    assert.ok(result.result.includes('media_001'));
    assert.ok(result.result.includes('IMAGE'));
    assert.ok(result.result.includes('sunset'));
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing mediaId', async () => {
    const ctx = mockContext(sampleMedia);
    const result = await execute({ action: 'get_media' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty mediaId', async () => {
    const ctx = mockContext(sampleMedia);
    const result = await execute({ action: 'get_media', mediaId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleMedia;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_media', mediaId: 'xyz_789' }, ctx);
    assert.equal(calledPath, '/media/xyz_789');
  });
});

// ---------------------------------------------------------------------------
// 5. list_media action
// ---------------------------------------------------------------------------
describe('instagram-graph-api: list_media', () => {
  beforeEach(() => {});

  it('should list media with valid userId', async () => {
    const ctx = mockContext(sampleMediaList);
    const result = await execute({ action: 'list_media', userId: '12345' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_media');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.userId, '12345');
    assert.equal(result.metadata.count, 3);
    assert.equal(result.metadata.limit, DEFAULT_LIMIT);
    assert.ok(result.result.includes('3 item(s)'));
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleMediaList);
    const result = await execute({ action: 'list_media', userId: '123', limit: 10 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 10);
  });

  it('should clamp limit to max', async () => {
    const ctx = mockContext(sampleMediaList);
    const result = await execute({ action: 'list_media', userId: '123', limit: 200 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT_MEDIA);
  });

  it('should clamp limit to min', async () => {
    const ctx = mockContext(sampleMediaList);
    const result = await execute({ action: 'list_media', userId: '123', limit: 0 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 1);
  });

  it('should reject missing userId', async () => {
    const ctx = mockContext(sampleMediaList);
    const result = await execute({ action: 'list_media' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer limit', async () => {
    const ctx = mockContext(sampleMediaList);
    const result = await execute({ action: 'list_media', userId: '123', limit: 5.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path with limit', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleMediaList;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_media', userId: 'u1', limit: 10 }, ctx);
    assert.equal(calledPath, '/users/u1/media?limit=10');
  });
});

// ---------------------------------------------------------------------------
// 6. search_hashtag action
// ---------------------------------------------------------------------------
describe('instagram-graph-api: search_hashtag', () => {
  beforeEach(() => {});

  it('should search hashtag with valid query', async () => {
    const ctx = mockContext(sampleHashtags);
    const result = await execute({ action: 'search_hashtag', query: 'sunset' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_hashtag');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'sunset');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('#sunset'));
    assert.ok(result.result.includes('50000'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleHashtags);
    const result = await execute({ action: 'search_hashtag' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleHashtags);
    const result = await execute({ action: 'search_hashtag', query: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject query exceeding max length', async () => {
    const ctx = mockContext(sampleHashtags);
    const longQuery = 'x'.repeat(MAX_QUERY_LENGTH + 1);
    const result = await execute({ action: 'search_hashtag', query: longQuery }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should clamp limit to hashtag max (50)', async () => {
    const ctx = mockContext(sampleHashtags);
    const result = await execute({ action: 'search_hashtag', query: 'sunset', limit: 100 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT_HASHTAG);
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleHashtags);
    const result = await execute({ action: 'search_hashtag', query: 'sunset', limit: 5 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 5);
  });

  it('should trim query whitespace', async () => {
    const ctx = mockContext(sampleHashtags);
    const result = await execute({ action: 'search_hashtag', query: '  sunset  ' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.query, 'sunset');
  });
});

// ---------------------------------------------------------------------------
// 7. get_insights action
// ---------------------------------------------------------------------------
describe('instagram-graph-api: get_insights', () => {
  beforeEach(() => {});

  it('should get insights with defaults', async () => {
    const ctx = mockContext(sampleInsights);
    const result = await execute({ action: 'get_insights', userId: '12345' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_insights');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.userId, '12345');
    assert.equal(result.metadata.period, 'day');
    assert.deepEqual(result.metadata.metrics, VALID_METRICS);
    assert.ok(result.result.includes('impressions'));
    assert.ok(result.result.includes('5200'));
  });

  it('should use custom metrics', async () => {
    const ctx = mockContext(sampleInsights);
    const result = await execute({
      action: 'get_insights',
      userId: '123',
      metrics: ['reach', 'impressions'],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.deepEqual(result.metadata.metrics, ['reach', 'impressions']);
  });

  it('should use custom period', async () => {
    const ctx = mockContext(sampleInsights);
    const result = await execute({
      action: 'get_insights',
      userId: '123',
      period: 'month',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.period, 'month');
  });

  it('should reject invalid metrics', async () => {
    const ctx = mockContext(sampleInsights);
    const result = await execute({
      action: 'get_insights',
      userId: '123',
      metrics: ['impressions', 'invalid_metric'],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('invalid_metric'));
  });

  it('should reject non-array metrics', async () => {
    const ctx = mockContext(sampleInsights);
    const result = await execute({
      action: 'get_insights',
      userId: '123',
      metrics: 'impressions',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid period', async () => {
    const ctx = mockContext(sampleInsights);
    const result = await execute({
      action: 'get_insights',
      userId: '123',
      period: 'year',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('year'));
  });

  it('should reject missing userId', async () => {
    const ctx = mockContext(sampleInsights);
    const result = await execute({ action: 'get_insights' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should default empty metrics array to all metrics', async () => {
    const ctx = mockContext(sampleInsights);
    const result = await execute({
      action: 'get_insights',
      userId: '123',
      metrics: [],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.deepEqual(result.metadata.metrics, VALID_METRICS);
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleInsights;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'get_insights',
      userId: 'u1',
      metrics: ['reach'],
      period: 'week',
    }, ctx);
    assert.equal(calledPath, '/users/u1/insights?metrics=reach&period=week');
  });
});

// ---------------------------------------------------------------------------
// 8. get_comments action
// ---------------------------------------------------------------------------
describe('instagram-graph-api: get_comments', () => {
  beforeEach(() => {});

  it('should get comments with valid mediaId', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'get_comments', mediaId: 'media_001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_comments');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.mediaId, 'media_001');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('@alice'));
    assert.ok(result.result.includes('Great photo!'));
  });

  it('should reject missing mediaId', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'get_comments' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'get_comments', mediaId: 'm1', limit: 50 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 50);
  });

  it('should clamp limit to max', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'get_comments', mediaId: 'm1', limit: 200 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT_COMMENTS);
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleComments;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_comments', mediaId: 'm1', limit: 10 }, ctx);
    assert.equal(calledPath, '/media/m1/comments?limit=10');
  });
});

// ---------------------------------------------------------------------------
// 9. get_stories action
// ---------------------------------------------------------------------------
describe('instagram-graph-api: get_stories', () => {
  beforeEach(() => {});

  it('should get stories with valid userId', async () => {
    const ctx = mockContext(sampleStories);
    const result = await execute({ action: 'get_stories', userId: '12345' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_stories');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.userId, '12345');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('story_001'));
    assert.ok(result.result.includes('IMAGE'));
  });

  it('should reject missing userId', async () => {
    const ctx = mockContext(sampleStories);
    const result = await execute({ action: 'get_stories' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty userId', async () => {
    const ctx = mockContext(sampleStories);
    const result = await execute({ action: 'get_stories', userId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleStories;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_stories', userId: 'user_42' }, ctx);
    assert.equal(calledPath, '/users/user_42/stories');
  });

  it('should handle empty stories array', async () => {
    const ctx = mockContext({ data: [] });
    const result = await execute({ action: 'get_stories', userId: '123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('instagram-graph-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on get_profile abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_profile', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_media abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_media', mediaId: 'm1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_media abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_media', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search_hashtag abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_hashtag', query: 'sunset' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_insights abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_insights', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_comments abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_comments', mediaId: 'm1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_stories abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_stories', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('instagram-graph-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on get_profile failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_profile', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_media failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'get_media', mediaId: 'm1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_media failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'list_media', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search_hashtag failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({ action: 'search_hashtag', query: 'sunset' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_insights failure', async () => {
    const ctx = mockContextError(new Error('Forbidden'));
    const result = await execute({ action: 'get_insights', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_comments failure', async () => {
    const ctx = mockContextError(new Error('Not found'));
    const result = await execute({ action: 'get_comments', mediaId: 'm1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_stories failure', async () => {
    const ctx = mockContextError(new Error('Gateway timeout'));
    const result = await execute({ action: 'get_stories', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should preserve upstream error code if present', async () => {
    const err = new Error('API limit');
    err.code = 'RATE_LIMITED';
    const ctx = mockContextError(err);
    const result = await execute({ action: 'get_profile', userId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'RATE_LIMITED');
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('instagram-graph-api: getClient', () => {
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
// 13. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('instagram-graph-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 14. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('instagram-graph-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return configured timeout within limit', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should cap timeout at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should return default for zero timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should return default for negative timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: -100 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should return default for null context', () => {
    assert.equal(resolveTimeout(null), DEFAULT_TIMEOUT_MS);
  });

  it('should return default for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 15. redactSensitive
// ---------------------------------------------------------------------------
describe('instagram-graph-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: Bearer_mytoken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Bearer_mytoken123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact token patterns', () => {
    const input = 'token=IGQVJW... some data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('IGQVJW'));
  });

  it('should not alter clean strings', () => {
    const input = 'Profile: johndoe, Followers: 1500';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 16. validateRequiredString
// ---------------------------------------------------------------------------
describe('instagram-graph-api: validateRequiredString', () => {
  beforeEach(() => {});

  it('should accept valid string', () => {
    const result = validateRequiredString('abc123', 'userId');
    assert.equal(result.valid, true);
  });

  it('should reject empty string', () => {
    const result = validateRequiredString('', 'userId');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('userId'));
  });

  it('should reject null', () => {
    const result = validateRequiredString(null, 'mediaId');
    assert.equal(result.valid, false);
  });

  it('should reject undefined', () => {
    const result = validateRequiredString(undefined, 'mediaId');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = validateRequiredString('   ', 'userId');
    assert.equal(result.valid, false);
  });

  it('should reject number', () => {
    const result = validateRequiredString(123, 'userId');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validateLimit
// ---------------------------------------------------------------------------
describe('instagram-graph-api: validateLimit', () => {
  beforeEach(() => {});

  it('should default when undefined', () => {
    const result = validateLimit(undefined, 1, 100, 25);
    assert.equal(result.valid, true);
    assert.equal(result.value, 25);
  });

  it('should default when null', () => {
    const result = validateLimit(null, 1, 100, 25);
    assert.equal(result.valid, true);
    assert.equal(result.value, 25);
  });

  it('should accept valid limit', () => {
    const result = validateLimit(10, 1, 100, 25);
    assert.equal(result.valid, true);
    assert.equal(result.value, 10);
  });

  it('should clamp to max', () => {
    const result = validateLimit(200, 1, 100, 25);
    assert.equal(result.valid, true);
    assert.equal(result.value, 100);
  });

  it('should clamp to min', () => {
    const result = validateLimit(0, 1, 100, 25);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1);
  });

  it('should reject non-integer', () => {
    const result = validateLimit(5.5, 1, 100, 25);
    assert.equal(result.valid, false);
  });

  it('should reject NaN', () => {
    const result = validateLimit('abc', 1, 100, 25);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 18. validateQuery
// ---------------------------------------------------------------------------
describe('instagram-graph-api: validateQuery', () => {
  beforeEach(() => {});

  it('should accept valid query', () => {
    const result = validateQuery('sunset');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'sunset');
  });

  it('should trim whitespace', () => {
    const result = validateQuery('  sunset  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'sunset');
  });

  it('should reject null query', () => {
    const result = validateQuery(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty query', () => {
    const result = validateQuery('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only query', () => {
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
// 19. validateMetrics
// ---------------------------------------------------------------------------
describe('instagram-graph-api: validateMetrics', () => {
  beforeEach(() => {});

  it('should default to all metrics for undefined', () => {
    const result = validateMetrics(undefined);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, VALID_METRICS);
  });

  it('should default to all metrics for null', () => {
    const result = validateMetrics(null);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, VALID_METRICS);
  });

  it('should default to all metrics for empty array', () => {
    const result = validateMetrics([]);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, VALID_METRICS);
  });

  it('should accept valid metrics', () => {
    const result = validateMetrics(['reach', 'impressions']);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, ['reach', 'impressions']);
  });

  it('should reject invalid metrics', () => {
    const result = validateMetrics(['reach', 'bogus']);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('bogus'));
  });

  it('should reject non-array', () => {
    const result = validateMetrics('reach');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 20. validatePeriod
// ---------------------------------------------------------------------------
describe('instagram-graph-api: validatePeriod', () => {
  beforeEach(() => {});

  it('should default to day for undefined', () => {
    const result = validatePeriod(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'day');
  });

  it('should default to day for null', () => {
    const result = validatePeriod(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'day');
  });

  it('should accept day', () => {
    const result = validatePeriod('day');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'day');
  });

  it('should accept week', () => {
    const result = validatePeriod('week');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'week');
  });

  it('should accept month', () => {
    const result = validatePeriod('month');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'month');
  });

  it('should reject invalid period', () => {
    const result = validatePeriod('year');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('year'));
  });

  it('should reject non-string period', () => {
    const result = validatePeriod(42);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 21. validate() export
// ---------------------------------------------------------------------------
describe('instagram-graph-api: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'nope' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('nope'));
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate get_profile with valid userId', () => {
    const result = validate({ action: 'get_profile', userId: '123' });
    assert.equal(result.valid, true);
  });

  it('should reject get_profile without userId', () => {
    const result = validate({ action: 'get_profile' });
    assert.equal(result.valid, false);
  });

  it('should validate get_media with valid mediaId', () => {
    const result = validate({ action: 'get_media', mediaId: 'm1' });
    assert.equal(result.valid, true);
  });

  it('should reject get_media without mediaId', () => {
    const result = validate({ action: 'get_media' });
    assert.equal(result.valid, false);
  });

  it('should validate list_media with valid userId', () => {
    const result = validate({ action: 'list_media', userId: '123' });
    assert.equal(result.valid, true);
  });

  it('should reject list_media without userId', () => {
    const result = validate({ action: 'list_media' });
    assert.equal(result.valid, false);
  });

  it('should reject list_media with non-integer limit', () => {
    const result = validate({ action: 'list_media', userId: '123', limit: 5.5 });
    assert.equal(result.valid, false);
  });

  it('should validate search_hashtag with valid query', () => {
    const result = validate({ action: 'search_hashtag', query: 'sunset' });
    assert.equal(result.valid, true);
  });

  it('should reject search_hashtag without query', () => {
    const result = validate({ action: 'search_hashtag' });
    assert.equal(result.valid, false);
  });

  it('should validate get_insights with valid userId', () => {
    const result = validate({ action: 'get_insights', userId: '123' });
    assert.equal(result.valid, true);
  });

  it('should reject get_insights with invalid metrics', () => {
    const result = validate({ action: 'get_insights', userId: '123', metrics: ['bad'] });
    assert.equal(result.valid, false);
  });

  it('should reject get_insights with invalid period', () => {
    const result = validate({ action: 'get_insights', userId: '123', period: 'year' });
    assert.equal(result.valid, false);
  });

  it('should validate get_comments with valid mediaId', () => {
    const result = validate({ action: 'get_comments', mediaId: 'm1' });
    assert.equal(result.valid, true);
  });

  it('should reject get_comments without mediaId', () => {
    const result = validate({ action: 'get_comments' });
    assert.equal(result.valid, false);
  });

  it('should validate get_stories with valid userId', () => {
    const result = validate({ action: 'get_stories', userId: '123' });
    assert.equal(result.valid, true);
  });

  it('should reject get_stories without userId', () => {
    const result = validate({ action: 'get_stories' });
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 22. meta export
// ---------------------------------------------------------------------------
describe('instagram-graph-api: meta', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'instagram-graph-api');
  });

  it('should have correct version', () => {
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description.length > 0);
    assert.ok(meta.description.includes('Instagram'));
  });

  it('should list all 7 actions', () => {
    assert.equal(meta.actions.length, 7);
    assert.deepEqual(meta.actions, VALID_ACTIONS);
  });
});

// ---------------------------------------------------------------------------
// 23. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('instagram-graph-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleProfile;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_profile', userId: '123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/users/123');
  });
});

// ---------------------------------------------------------------------------
// 24. requestWithTimeout direct tests
// ---------------------------------------------------------------------------
describe('instagram-graph-api: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return data on success', async () => {
    const client = { request: async () => ({ ok: true }) };
    const result = await requestWithTimeout(client, 'GET', '/test', {}, 5000);
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
      await requestWithTimeout(client, 'GET', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (e) {
      assert.equal(e.code, 'TIMEOUT');
    }
  });

  it('should throw UPSTREAM_ERROR on generic error', async () => {
    const client = {
      request: async () => { throw new Error('Network fail'); },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (e) {
      assert.equal(e.code, 'UPSTREAM_ERROR');
      assert.ok(e.message.includes('Network fail'));
    }
  });
});
