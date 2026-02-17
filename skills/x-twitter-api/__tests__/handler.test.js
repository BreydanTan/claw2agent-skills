import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
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
      request: async (_method, _path, _body, _opts) => requestResponse,
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

/** Sample tweet response. */
const sampleTweet = {
  tweet: {
    id: '123456',
    author: 'elonmusk',
    text: 'Hello world!',
    likes: 1000,
    retweets: 500,
    created_at: '2025-01-15T12:00:00Z',
  },
};

/** Sample search response. */
const sampleSearchResponse = {
  tweets: [
    { author: 'user1', text: 'First tweet', created_at: '2025-01-15T12:00:00Z' },
    { author: 'user2', text: 'Second tweet', created_at: '2025-01-15T11:00:00Z' },
  ],
};

/** Sample user response. */
const sampleUser = {
  user: {
    username: 'testuser',
    name: 'Test User',
    bio: 'A test account',
    followers: 1000,
    following: 500,
    tweet_count: 200,
    created_at: '2020-01-01T00:00:00Z',
    verified: true,
  },
};

/** Sample timeline response. */
const sampleTimeline = {
  tweets: [
    { text: 'Recent tweet 1', created_at: '2025-01-15T12:00:00Z' },
    { text: 'Recent tweet 2', created_at: '2025-01-15T11:00:00Z' },
  ],
};

/** Sample post tweet response. */
const samplePostResponse = {
  tweet: {
    id: '789012',
    text: 'My new tweet',
  },
};

/** Sample trending response. */
const sampleTrending = {
  trends: [
    { name: '#Trending1', tweet_count: 50000 },
    { name: '#Trending2', tweet_count: 30000 },
  ],
};

/** Sample likes response. */
const sampleLikes = {
  likes: [
    { username: 'liker1', name: 'Liker One' },
    { username: 'liker2', name: 'Liker Two' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('x-twitter-api: action validation', () => {
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
    for (const action of VALID_ACTIONS) {
      assert.ok(result.result.includes(action), `Should mention ${action}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('x-twitter-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_tweet without client', async () => {
    const result = await execute({ action: 'get_tweet', tweetId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail search_tweets without client', async () => {
    const result = await execute({ action: 'search_tweets', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_user without client', async () => {
    const result = await execute({ action: 'get_user', username: 'testuser' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_timeline without client', async () => {
    const result = await execute({ action: 'get_timeline', username: 'testuser' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail post_tweet without client', async () => {
    const result = await execute({ action: 'post_tweet', text: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_trending without client', async () => {
    const result = await execute({ action: 'get_trending' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_likes without client', async () => {
    const result = await execute({ action: 'get_likes', tweetId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_tweet action
// ---------------------------------------------------------------------------
describe('x-twitter-api: get_tweet', () => {
  beforeEach(() => {});

  it('should fetch tweet by ID', async () => {
    const ctx = mockContext(sampleTweet);
    const result = await execute({ action: 'get_tweet', tweetId: '123456' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_tweet');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.tweetId, '123456');
    assert.ok(result.result.includes('Tweet 123456'));
    assert.ok(result.result.includes('@elonmusk'));
    assert.ok(result.result.includes('Hello world!'));
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleTweet);
    const result = await execute({ action: 'get_tweet', tweetId: '123456' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing tweetId', async () => {
    const ctx = mockContext(sampleTweet);
    const result = await execute({ action: 'get_tweet' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty tweetId', async () => {
    const ctx = mockContext(sampleTweet);
    const result = await execute({ action: 'get_tweet', tweetId: '  ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_method, path) => {
          calledPath = path;
          return sampleTweet;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_tweet', tweetId: '999' }, ctx);
    assert.equal(calledPath, '/tweets/999');
  });

  it('should use GET method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => {
          calledMethod = method;
          return sampleTweet;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_tweet', tweetId: '999' }, ctx);
    assert.equal(calledMethod, 'GET');
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: { id: '111', author: 'someone', text: 'Hi' } });
    const result = await execute({ action: 'get_tweet', tweetId: '111' }, ctx);
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 4. search_tweets action
// ---------------------------------------------------------------------------
describe('x-twitter-api: search_tweets', () => {
  beforeEach(() => {});

  it('should search tweets with valid query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets', query: 'hello world' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_tweets');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'hello world');
    assert.equal(result.metadata.sort, 'recency');
    assert.equal(result.metadata.limit, 25);
    assert.equal(result.metadata.resultCount, 2);
    assert.ok(result.result.includes('hello world'));
  });

  it('should accept custom sort value', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets', query: 'test', sort: 'relevancy' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.sort, 'relevancy');
  });

  it('should accept custom limit', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets', query: 'test', limit: 50 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 50);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets', query: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject query exceeding max length', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets', query: 'x'.repeat(MAX_QUERY_LENGTH + 1) }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should reject invalid sort value', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets', query: 'test', sort: 'popularity' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('sort'));
  });

  it('should clamp limit to max', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets', query: 'test', limit: 200 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, SEARCH_LIMIT_MAX);
  });

  it('should clamp limit to min', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search_tweets', query: 'test', limit: 0 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 1);
  });

  it('should call correct endpoint with encoded query', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleSearchResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search_tweets', query: 'hello world' }, ctx);
    assert.ok(calledPath.includes('/tweets/search'));
    assert.ok(calledPath.includes('hello%20world'));
  });
});

// ---------------------------------------------------------------------------
// 5. get_user action
// ---------------------------------------------------------------------------
describe('x-twitter-api: get_user', () => {
  beforeEach(() => {});

  it('should fetch user profile', async () => {
    const ctx = mockContext(sampleUser);
    const result = await execute({ action: 'get_user', username: 'testuser' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_user');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.username, 'testuser');
    assert.ok(result.result.includes('@testuser'));
    assert.ok(result.result.includes('Test User'));
    assert.ok(result.result.includes('Verified: Yes'));
  });

  it('should strip leading @ from username', async () => {
    const ctx = mockContext(sampleUser);
    const result = await execute({ action: 'get_user', username: '@testuser' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.username, 'testuser');
  });

  it('should reject missing username', async () => {
    const ctx = mockContext(sampleUser);
    const result = await execute({ action: 'get_user' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject username with special chars', async () => {
    const ctx = mockContext(sampleUser);
    const result = await execute({ action: 'get_user', username: 'user!name' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('alphanumeric'));
  });

  it('should reject username exceeding max length', async () => {
    const ctx = mockContext(sampleUser);
    const result = await execute({ action: 'get_user', username: 'a'.repeat(MAX_USERNAME_LENGTH + 1) }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should reject empty username', async () => {
    const ctx = mockContext(sampleUser);
    const result = await execute({ action: 'get_user', username: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleUser; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_user', username: 'jack' }, ctx);
    assert.equal(calledPath, '/users/jack');
  });
});

// ---------------------------------------------------------------------------
// 6. get_timeline action
// ---------------------------------------------------------------------------
describe('x-twitter-api: get_timeline', () => {
  beforeEach(() => {});

  it('should fetch user timeline', async () => {
    const ctx = mockContext(sampleTimeline);
    const result = await execute({ action: 'get_timeline', username: 'testuser' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_timeline');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.username, 'testuser');
    assert.equal(result.metadata.tweetCount, 2);
    assert.ok(result.result.includes('Timeline for @testuser'));
  });

  it('should accept custom limit', async () => {
    const ctx = mockContext(sampleTimeline);
    const result = await execute({ action: 'get_timeline', username: 'testuser', limit: 10 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 10);
  });

  it('should reject missing username', async () => {
    const ctx = mockContext(sampleTimeline);
    const result = await execute({ action: 'get_timeline' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp limit to max', async () => {
    const ctx = mockContext(sampleTimeline);
    const result = await execute({ action: 'get_timeline', username: 'test', limit: 200 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, TIMELINE_LIMIT_MAX);
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleTimeline; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_timeline', username: 'jack', limit: 10 }, ctx);
    assert.ok(calledPath.includes('/users/jack/tweets'));
    assert.ok(calledPath.includes('limit=10'));
  });
});

// ---------------------------------------------------------------------------
// 7. post_tweet action
// ---------------------------------------------------------------------------
describe('x-twitter-api: post_tweet', () => {
  beforeEach(() => {});

  it('should post a tweet', async () => {
    const ctx = mockContext(samplePostResponse);
    const result = await execute({ action: 'post_tweet', text: 'My new tweet' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'post_tweet');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.text, 'My new tweet');
    assert.ok(result.result.includes('Tweet posted successfully'));
    assert.ok(result.result.includes('My new tweet'));
  });

  it('should include replyTo when provided', async () => {
    const ctx = mockContext(samplePostResponse);
    const result = await execute({ action: 'post_tweet', text: 'Reply text', replyTo: '999' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.replyTo, '999');
    assert.ok(result.result.includes('Reply to: 999'));
  });

  it('should set replyTo to null when not provided', async () => {
    const ctx = mockContext(samplePostResponse);
    const result = await execute({ action: 'post_tweet', text: 'No reply' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.replyTo, null);
  });

  it('should reject missing text', async () => {
    const ctx = mockContext(samplePostResponse);
    const result = await execute({ action: 'post_tweet' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty text', async () => {
    const ctx = mockContext(samplePostResponse);
    const result = await execute({ action: 'post_tweet', text: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject text exceeding max length', async () => {
    const ctx = mockContext(samplePostResponse);
    const result = await execute({ action: 'post_tweet', text: 'x'.repeat(MAX_TWEET_LENGTH + 1) }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should use POST method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => { calledMethod = method; return samplePostResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'post_tweet', text: 'Hello' }, ctx);
    assert.equal(calledMethod, 'POST');
  });

  it('should call /tweets endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return samplePostResponse; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'post_tweet', text: 'Hello' }, ctx);
    assert.equal(calledPath, '/tweets');
  });

  it('should trim tweet text', async () => {
    const ctx = mockContext(samplePostResponse);
    const result = await execute({ action: 'post_tweet', text: '  trimmed tweet  ' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.text, 'trimmed tweet');
  });
});

// ---------------------------------------------------------------------------
// 8. get_trending action
// ---------------------------------------------------------------------------
describe('x-twitter-api: get_trending', () => {
  beforeEach(() => {});

  it('should fetch trending topics', async () => {
    const ctx = mockContext(sampleTrending);
    const result = await execute({ action: 'get_trending' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_trending');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.location, 'worldwide');
    assert.equal(result.metadata.trendCount, 2);
    assert.ok(result.result.includes('Trending topics'));
    assert.ok(result.result.includes('#Trending1'));
  });

  it('should accept custom location', async () => {
    const ctx = mockContext(sampleTrending);
    const result = await execute({ action: 'get_trending', location: 'US' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.location, 'US');
    assert.ok(result.result.includes('US'));
  });

  it('should default location to worldwide', async () => {
    const ctx = mockContext(sampleTrending);
    const result = await execute({ action: 'get_trending' }, ctx);
    assert.equal(result.metadata.location, 'worldwide');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleTrending; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_trending', location: 'UK' }, ctx);
    assert.ok(calledPath.includes('/trends'));
    assert.ok(calledPath.includes('UK'));
  });
});

// ---------------------------------------------------------------------------
// 9. get_likes action
// ---------------------------------------------------------------------------
describe('x-twitter-api: get_likes', () => {
  beforeEach(() => {});

  it('should fetch tweet likes', async () => {
    const ctx = mockContext(sampleLikes);
    const result = await execute({ action: 'get_likes', tweetId: '123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_likes');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.tweetId, '123');
    assert.equal(result.metadata.likeCount, 2);
    assert.ok(result.result.includes('Likes for tweet 123'));
    assert.ok(result.result.includes('@liker1'));
  });

  it('should accept custom limit', async () => {
    const ctx = mockContext(sampleLikes);
    const result = await execute({ action: 'get_likes', tweetId: '123', limit: 10 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 10);
  });

  it('should reject missing tweetId', async () => {
    const ctx = mockContext(sampleLikes);
    const result = await execute({ action: 'get_likes' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp limit to max (50)', async () => {
    const ctx = mockContext(sampleLikes);
    const result = await execute({ action: 'get_likes', tweetId: '123', limit: 100 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, LIKES_LIMIT_MAX);
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { calledPath = path; return sampleLikes; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_likes', tweetId: '555', limit: 5 }, ctx);
    assert.ok(calledPath.includes('/tweets/555/likes'));
    assert.ok(calledPath.includes('limit=5'));
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('x-twitter-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on get_tweet abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_tweet', tweetId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search_tweets abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_tweets', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_user abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_user', username: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on post_tweet abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'post_tweet', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_trending abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_trending' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_likes abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_likes', tweetId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_timeline abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_timeline', username: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network errors
// ---------------------------------------------------------------------------
describe('x-twitter-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on get_tweet failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_tweet', tweetId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search_tweets failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'search_tweets', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on post_tweet failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'post_tweet', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_user failure', async () => {
    const ctx = mockContextError(new Error('404 Not Found'));
    const result = await execute({ action: 'get_user', username: 'nobody' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_trending failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({ action: 'get_trending' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_tweet', tweetId: '123' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('x-twitter-api: getClient', () => {
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
describe('x-twitter-api: redactSensitive', () => {
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
    const input = 'authorization=Bearer_xyz123abc';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Bearer_xyz123abc'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact token patterns', () => {
    const input = 'token=my_secret_token_12345';
    const output = redactSensitive(input);
    assert.ok(!output.includes('my_secret_token_12345'));
  });

  it('should not alter clean strings', () => {
    const input = 'Tweet posted successfully at 1024px';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 14. resolveTimeout
// ---------------------------------------------------------------------------
describe('x-twitter-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should clamp to max timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), MAX_TIMEOUT_MS);
  });

  it('should ignore non-positive timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS);
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore non-number timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 15. validateUsername helper
// ---------------------------------------------------------------------------
describe('x-twitter-api: validateUsername', () => {
  beforeEach(() => {});

  it('should accept valid username', () => {
    const result = validateUsername('jack');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'jack');
  });

  it('should accept underscores', () => {
    const result = validateUsername('test_user');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'test_user');
  });

  it('should accept numbers', () => {
    const result = validateUsername('user123');
    assert.equal(result.valid, true);
  });

  it('should strip leading @', () => {
    const result = validateUsername('@testuser');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'testuser');
  });

  it('should reject empty username', () => {
    const result = validateUsername('');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateUsername(null);
    assert.equal(result.valid, false);
  });

  it('should reject special characters', () => {
    const result = validateUsername('user!name');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('alphanumeric'));
  });

  it('should reject username exceeding max length', () => {
    const result = validateUsername('a'.repeat(16));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
  });

  it('should accept username at max length', () => {
    const result = validateUsername('a'.repeat(15));
    assert.equal(result.valid, true);
  });

  it('should reject @ alone', () => {
    const result = validateUsername('@');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateTweetText helper
// ---------------------------------------------------------------------------
describe('x-twitter-api: validateTweetText', () => {
  beforeEach(() => {});

  it('should accept valid tweet text', () => {
    const result = validateTweetText('Hello world');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'Hello world');
  });

  it('should trim whitespace', () => {
    const result = validateTweetText('  Hello  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'Hello');
  });

  it('should reject empty text', () => {
    const result = validateTweetText('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only text', () => {
    const result = validateTweetText('   ');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateTweetText(null);
    assert.equal(result.valid, false);
  });

  it('should reject text exceeding max length', () => {
    const result = validateTweetText('x'.repeat(281));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
  });

  it('should accept text at max length', () => {
    const result = validateTweetText('x'.repeat(280));
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// 17. validateQuery helper
// ---------------------------------------------------------------------------
describe('x-twitter-api: validateQuery', () => {
  beforeEach(() => {});

  it('should accept valid query', () => {
    const result = validateQuery('hello world');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'hello world');
  });

  it('should trim whitespace', () => {
    const result = validateQuery('  test  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'test');
  });

  it('should reject empty query', () => {
    const result = validateQuery('');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateQuery(null);
    assert.equal(result.valid, false);
  });

  it('should reject query exceeding max length', () => {
    const result = validateQuery('x'.repeat(513));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
  });

  it('should accept query at max length', () => {
    const result = validateQuery('x'.repeat(512));
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// 18. validateLimit helper
// ---------------------------------------------------------------------------
describe('x-twitter-api: validateLimit', () => {
  beforeEach(() => {});

  it('should return default for undefined', () => {
    const result = validateLimit(undefined, 1, 100, 25);
    assert.equal(result.valid, true);
    assert.equal(result.value, 25);
  });

  it('should return default for null', () => {
    const result = validateLimit(null, 1, 100, 25);
    assert.equal(result.valid, true);
    assert.equal(result.value, 25);
  });

  it('should accept valid limit', () => {
    const result = validateLimit(50, 1, 100, 25);
    assert.equal(result.valid, true);
    assert.equal(result.value, 50);
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
    const result = validateLimit(1.5, 1, 100, 25);
    assert.equal(result.valid, false);
  });

  it('should reject NaN', () => {
    const result = validateLimit('abc', 1, 100, 25);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 19. validateTweetId helper
// ---------------------------------------------------------------------------
describe('x-twitter-api: validateTweetId', () => {
  beforeEach(() => {});

  it('should accept valid tweet ID', () => {
    const result = validateTweetId('123456');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, '123456');
  });

  it('should trim whitespace', () => {
    const result = validateTweetId('  123  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, '123');
  });

  it('should reject empty string', () => {
    const result = validateTweetId('');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateTweetId(null);
    assert.equal(result.valid, false);
  });

  it('should reject undefined', () => {
    const result = validateTweetId(undefined);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 20. validate() export
// ---------------------------------------------------------------------------
describe('x-twitter-api: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Invalid action'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate get_tweet requires tweetId', () => {
    assert.equal(validate({ action: 'get_tweet' }).valid, false);
    assert.equal(validate({ action: 'get_tweet', tweetId: '123' }).valid, true);
  });

  it('should validate search_tweets requires query', () => {
    assert.equal(validate({ action: 'search_tweets' }).valid, false);
    assert.equal(validate({ action: 'search_tweets', query: 'test' }).valid, true);
  });

  it('should validate search_tweets rejects invalid sort', () => {
    const result = validate({ action: 'search_tweets', query: 'test', sort: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('sort'));
  });

  it('should validate get_user requires username', () => {
    assert.equal(validate({ action: 'get_user' }).valid, false);
    assert.equal(validate({ action: 'get_user', username: 'test' }).valid, true);
  });

  it('should validate get_timeline requires username', () => {
    assert.equal(validate({ action: 'get_timeline' }).valid, false);
    assert.equal(validate({ action: 'get_timeline', username: 'test' }).valid, true);
  });

  it('should validate post_tweet requires text', () => {
    assert.equal(validate({ action: 'post_tweet' }).valid, false);
    assert.equal(validate({ action: 'post_tweet', text: 'Hello' }).valid, true);
  });

  it('should validate get_trending always valid', () => {
    assert.equal(validate({ action: 'get_trending' }).valid, true);
  });

  it('should validate get_likes requires tweetId', () => {
    assert.equal(validate({ action: 'get_likes' }).valid, false);
    assert.equal(validate({ action: 'get_likes', tweetId: '123' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 21. meta export
// ---------------------------------------------------------------------------
describe('x-twitter-api: meta', () => {
  beforeEach(() => {});

  it('should export correct name', () => {
    assert.equal(meta.name, 'x-twitter-api');
  });

  it('should export version', () => {
    assert.equal(meta.version, '1.0.0');
  });

  it('should export description', () => {
    assert.ok(meta.description.length > 0);
    assert.ok(meta.description.includes('Twitter'));
  });

  it('should export all 7 actions', () => {
    assert.equal(meta.actions.length, 7);
    assert.ok(meta.actions.includes('get_tweet'));
    assert.ok(meta.actions.includes('search_tweets'));
    assert.ok(meta.actions.includes('get_user'));
    assert.ok(meta.actions.includes('get_timeline'));
    assert.ok(meta.actions.includes('post_tweet'));
    assert.ok(meta.actions.includes('get_trending'));
    assert.ok(meta.actions.includes('get_likes'));
  });
});

// ---------------------------------------------------------------------------
// 22. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('x-twitter-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (_method, path, _body, _opts) => {
          calledPath = path;
          return sampleTweet;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_tweet', tweetId: '123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/tweets/123');
  });
});

// ---------------------------------------------------------------------------
// 23. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('x-twitter-api: providerNotConfiguredError', () => {
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
// 24. requestWithTimeout helper
// ---------------------------------------------------------------------------
describe('x-twitter-api: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return data on success', async () => {
    const client = { request: async () => ({ ok: true }) };
    const data = await requestWithTimeout(client, 'GET', '/test', {}, 5000);
    assert.deepEqual(data, { ok: true });
  });

  it('should throw TIMEOUT on abort', async () => {
    const client = {
      request: async (_m, _p, _b, opts) => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'TIMEOUT');
    }
  });

  it('should throw UPSTREAM_ERROR on network failure', async () => {
    const client = { request: async () => { throw new Error('Connection reset'); } };
    try {
      await requestWithTimeout(client, 'GET', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('Connection reset'));
    }
  });
});

// ---------------------------------------------------------------------------
// 25. Input sanitization edge cases
// ---------------------------------------------------------------------------
describe('x-twitter-api: input sanitization edge cases', () => {
  beforeEach(() => {});

  it('should handle username with spaces via trim', () => {
    const result = validateUsername('  jack  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'jack');
  });

  it('should reject username with dots', () => {
    const result = validateUsername('user.name');
    assert.equal(result.valid, false);
  });

  it('should reject username with hyphens', () => {
    const result = validateUsername('user-name');
    assert.equal(result.valid, false);
  });

  it('should accept single character username', () => {
    const result = validateUsername('a');
    assert.equal(result.valid, true);
  });

  it('should accept tweet text with emojis', () => {
    const result = validateTweetText('Hello! 😀');
    assert.equal(result.valid, true);
  });

  it('should accept query with special characters', () => {
    const result = validateQuery('#trending @user');
    assert.equal(result.valid, true);
  });
});
