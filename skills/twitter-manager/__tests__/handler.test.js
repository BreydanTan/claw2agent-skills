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

const sampleTweet = {
  data: {
    id: '1234567890',
    text: 'Hello, world!',
    author_id: '44196397',
    created_at: '2025-06-01T12:00:00Z',
    public_metrics: {
      retweet_count: 100,
      like_count: 500,
      reply_count: 25,
    },
  },
};

const samplePostedTweet = {
  data: {
    id: '9876543210',
    text: 'Just posted!',
  },
};

const sampleSearchResults = {
  data: [
    { id: '111', text: 'First tweet about javascript', author_id: '100' },
    { id: '222', text: 'Second tweet about javascript', author_id: '200' },
  ],
  meta: { result_count: 2 },
};

const sampleUser = {
  data: {
    id: '44196397',
    username: 'elonmusk',
    name: 'Elon Musk',
    description: 'CEO of Tesla and SpaceX',
    verified: true,
    created_at: '2009-06-02T20:12:29Z',
    public_metrics: {
      followers_count: 150000000,
      following_count: 500,
      tweet_count: 30000,
    },
  },
};

const sampleTimeline = {
  data: [
    { id: '333', text: 'Timeline tweet one', created_at: '2025-06-01T10:00:00Z' },
    { id: '444', text: 'Timeline tweet two', created_at: '2025-06-01T09:00:00Z' },
  ],
};

const sampleDeleteResponse = {
  data: { deleted: true },
};

const sampleLikeResponse = {
  data: { liked: true },
};

const sampleRetweetResponse = {
  data: { retweeted: true },
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('twitter-manager: action validation', () => {
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
// 2. PROVIDER_NOT_CONFIGURED for all 8 actions
// ---------------------------------------------------------------------------
describe('twitter-manager: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail post_tweet without client', async () => {
    const result = await execute({ action: 'post_tweet', text: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_tweet without client', async () => {
    const result = await execute({ action: 'get_tweet', tweetId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_tweets without client', async () => {
    const result = await execute({ action: 'search_tweets', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_user without client', async () => {
    const result = await execute({ action: 'get_user', username: 'testuser' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_timeline without client', async () => {
    const result = await execute({ action: 'get_timeline', userId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail delete_tweet without client', async () => {
    const result = await execute({ action: 'delete_tweet', tweetId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail like_tweet without client', async () => {
    const result = await execute({ action: 'like_tweet', tweetId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail retweet without client', async () => {
    const result = await execute({ action: 'retweet', tweetId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. post_tweet action
// ---------------------------------------------------------------------------
describe('twitter-manager: post_tweet', () => {
  beforeEach(() => {});

  it('should post a tweet successfully', async () => {
    const ctx = mockContext(samplePostedTweet);
    const result = await execute({ action: 'post_tweet', text: 'Hello, world!' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'post_tweet');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.tweetId, '9876543210');
    assert.ok(result.result.includes('9876543210'));
  });

  it('should reject missing text', async () => {
    const ctx = mockContext(samplePostedTweet);
    const result = await execute({ action: 'post_tweet' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });

  it('should reject tweet exceeding 280 characters', async () => {
    const ctx = mockContext(samplePostedTweet);
    const longText = 'a'.repeat(281);
    const result = await execute({ action: 'post_tweet', text: longText }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TWEET_TOO_LONG');
    assert.ok(result.result.includes('280'));
  });

  it('should accept tweet of exactly 280 characters', async () => {
    const ctx = mockContext(samplePostedTweet);
    const exactText = 'a'.repeat(280);
    const result = await execute({ action: 'post_tweet', text: exactText }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'post_tweet');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(samplePostedTweet);
    await execute({ action: 'post_tweet', text: 'Hello' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(samplePostedTweet);
    await execute({ action: 'post_tweet', text: 'Hello' }, context);
    assert.equal(calls[0].endpoint, 'twitter/tweets');
  });

  it('should include replyTo when provided', async () => {
    const { context, calls } = mockContextWithSpy(samplePostedTweet);
    await execute({ action: 'post_tweet', text: 'Reply!', replyTo: '9999' }, context);
    assert.equal(calls[0].opts.params.reply.in_reply_to_tweet_id, '9999');
  });

  it('should not include reply field when replyTo is absent', async () => {
    const { context, calls } = mockContextWithSpy(samplePostedTweet);
    await execute({ action: 'post_tweet', text: 'No reply' }, context);
    assert.equal(calls[0].opts.params.reply, undefined);
  });
});

// ---------------------------------------------------------------------------
// 4. Tweet length validation
// ---------------------------------------------------------------------------
describe('twitter-manager: tweet length validation', () => {
  beforeEach(() => {});

  it('should reject 281 character tweet', async () => {
    const ctx = mockContext(samplePostedTweet);
    const result = await execute({ action: 'post_tweet', text: 'x'.repeat(281) }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TWEET_TOO_LONG');
  });

  it('should reject 500 character tweet', async () => {
    const ctx = mockContext(samplePostedTweet);
    const result = await execute({ action: 'post_tweet', text: 'z'.repeat(500) }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TWEET_TOO_LONG');
  });

  it('should accept 1 character tweet', async () => {
    const ctx = mockContext(samplePostedTweet);
    const result = await execute({ action: 'post_tweet', text: 'A' }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept 280 character tweet', async () => {
    const ctx = mockContext(samplePostedTweet);
    const result = await execute({ action: 'post_tweet', text: 'B'.repeat(280) }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should include character count in error message', async () => {
    const ctx = mockContext(samplePostedTweet);
    const result = await execute({ action: 'post_tweet', text: 'c'.repeat(300) }, ctx);
    assert.ok(result.result.includes('300'));
    assert.ok(result.result.includes('280'));
  });
});

// ---------------------------------------------------------------------------
// 5. get_tweet action
// ---------------------------------------------------------------------------
describe('twitter-manager: get_tweet', () => {
  beforeEach(() => {});

  it('should get tweet details successfully', async () => {
    const ctx = mockContext(sampleTweet);
    const result = await execute({ action: 'get_tweet', tweetId: '1234567890' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_tweet');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.tweetId, '1234567890');
    assert.equal(result.metadata.text, 'Hello, world!');
    assert.equal(result.metadata.authorId, '44196397');
    assert.ok(result.result.includes('Hello, world!'));
  });

  it('should reject missing tweetId', async () => {
    const ctx = mockContext(sampleTweet);
    const result = await execute({ action: 'get_tweet' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TWEET_ID');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleTweet);
    await execute({ action: 'get_tweet', tweetId: '1234567890' }, context);
    assert.equal(calls[0].endpoint, 'twitter/tweets/1234567890');
  });
});

// ---------------------------------------------------------------------------
// 6. search_tweets action
// ---------------------------------------------------------------------------
describe('twitter-manager: search_tweets', () => {
  beforeEach(() => {});

  it('should search tweets successfully', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_tweets', query: 'javascript' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_tweets');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('javascript'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_tweets' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_QUERY');
  });

  it('should handle empty search results', async () => {
    const ctx = mockContext({ data: [], meta: { result_count: 0 } });
    const result = await execute({ action: 'search_tweets', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No tweets found'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_tweets', query: 'test' }, context);
    assert.equal(calls[0].endpoint, 'twitter/tweets/search/recent');
  });

  it('should pass sortOrder to params', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_tweets', query: 'test', sortOrder: 'relevancy' }, context);
    assert.equal(calls[0].opts.params.sort_order, 'relevancy');
  });

  it('should default sortOrder to recency', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_tweets', query: 'test' }, context);
    assert.equal(calls[0].opts.params.sort_order, 'recency');
  });

  it('should pass maxResults to params', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_tweets', query: 'test', maxResults: 25 }, context);
    assert.equal(calls[0].opts.params.max_results, 25);
  });
});

// ---------------------------------------------------------------------------
// 7. get_user action
// ---------------------------------------------------------------------------
describe('twitter-manager: get_user', () => {
  beforeEach(() => {});

  it('should get user profile successfully', async () => {
    const ctx = mockContext(sampleUser);
    const result = await execute({ action: 'get_user', username: 'elonmusk' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_user');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.username, 'elonmusk');
    assert.equal(result.metadata.name, 'Elon Musk');
    assert.equal(result.metadata.verified, true);
    assert.ok(result.result.includes('@elonmusk'));
    assert.ok(result.result.includes('Elon Musk'));
  });

  it('should reject missing username', async () => {
    const ctx = mockContext(sampleUser);
    const result = await execute({ action: 'get_user' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_USERNAME');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleUser);
    await execute({ action: 'get_user', username: 'elonmusk' }, context);
    assert.equal(calls[0].endpoint, 'twitter/users/by/username/elonmusk');
  });
});

// ---------------------------------------------------------------------------
// 8. get_timeline action
// ---------------------------------------------------------------------------
describe('twitter-manager: get_timeline', () => {
  beforeEach(() => {});

  it('should get timeline successfully', async () => {
    const ctx = mockContext(sampleTimeline);
    const result = await execute({ action: 'get_timeline', userId: '44196397' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_timeline');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.userId, '44196397');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Timeline'));
  });

  it('should reject missing userId', async () => {
    const ctx = mockContext(sampleTimeline);
    const result = await execute({ action: 'get_timeline' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_USER_ID');
  });

  it('should handle empty timeline', async () => {
    const ctx = mockContext({ data: [] });
    const result = await execute({ action: 'get_timeline', userId: '123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No tweets found'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleTimeline);
    await execute({ action: 'get_timeline', userId: '44196397' }, context);
    assert.equal(calls[0].endpoint, 'twitter/users/44196397/tweets');
  });

  it('should pass maxResults to params', async () => {
    const { context, calls } = mockContextWithSpy(sampleTimeline);
    await execute({ action: 'get_timeline', userId: '123', maxResults: 20 }, context);
    assert.equal(calls[0].opts.params.max_results, 20);
  });
});

// ---------------------------------------------------------------------------
// 9. delete_tweet action
// ---------------------------------------------------------------------------
describe('twitter-manager: delete_tweet', () => {
  beforeEach(() => {});

  it('should delete a tweet successfully', async () => {
    const ctx = mockContext(sampleDeleteResponse);
    const result = await execute({ action: 'delete_tweet', tweetId: '1234567890' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'delete_tweet');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.tweetId, '1234567890');
    assert.equal(result.metadata.deleted, true);
    assert.ok(result.result.includes('deleted'));
  });

  it('should reject missing tweetId', async () => {
    const ctx = mockContext(sampleDeleteResponse);
    const result = await execute({ action: 'delete_tweet' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TWEET_ID');
  });

  it('should use DELETE method', async () => {
    const { context, calls } = mockContextWithSpy(sampleDeleteResponse);
    await execute({ action: 'delete_tweet', tweetId: '123' }, context);
    assert.equal(calls[0].opts.method, 'DELETE');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleDeleteResponse);
    await execute({ action: 'delete_tweet', tweetId: '1234567890' }, context);
    assert.equal(calls[0].endpoint, 'twitter/tweets/1234567890');
  });
});

// ---------------------------------------------------------------------------
// 10. like_tweet action
// ---------------------------------------------------------------------------
describe('twitter-manager: like_tweet', () => {
  beforeEach(() => {});

  it('should like a tweet successfully', async () => {
    const ctx = mockContext(sampleLikeResponse);
    const result = await execute({ action: 'like_tweet', tweetId: '1234567890' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'like_tweet');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.tweetId, '1234567890');
    assert.equal(result.metadata.liked, true);
    assert.ok(result.result.includes('liked'));
  });

  it('should reject missing tweetId', async () => {
    const ctx = mockContext(sampleLikeResponse);
    const result = await execute({ action: 'like_tweet' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TWEET_ID');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleLikeResponse);
    await execute({ action: 'like_tweet', tweetId: '123' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleLikeResponse);
    await execute({ action: 'like_tweet', tweetId: '1234567890' }, context);
    assert.equal(calls[0].endpoint, 'twitter/tweets/1234567890/like');
  });
});

// ---------------------------------------------------------------------------
// 11. retweet action
// ---------------------------------------------------------------------------
describe('twitter-manager: retweet', () => {
  beforeEach(() => {});

  it('should retweet successfully', async () => {
    const ctx = mockContext(sampleRetweetResponse);
    const result = await execute({ action: 'retweet', tweetId: '1234567890' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'retweet');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.tweetId, '1234567890');
    assert.equal(result.metadata.retweeted, true);
    assert.ok(result.result.includes('retweeted'));
  });

  it('should reject missing tweetId', async () => {
    const ctx = mockContext(sampleRetweetResponse);
    const result = await execute({ action: 'retweet' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TWEET_ID');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleRetweetResponse);
    await execute({ action: 'retweet', tweetId: '123' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleRetweetResponse);
    await execute({ action: 'retweet', tweetId: '1234567890' }, context);
    assert.equal(calls[0].endpoint, 'twitter/tweets/1234567890/retweet');
  });
});

// ---------------------------------------------------------------------------
// 12. Timeout handling
// ---------------------------------------------------------------------------
describe('twitter-manager: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for post_tweet', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'post_tweet', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for get_tweet', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_tweet', tweetId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for search_tweets', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_tweets', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 13. Network error handling
// ---------------------------------------------------------------------------
describe('twitter-manager: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for post_tweet', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'post_tweet', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for get_user', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'get_user', username: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 14. getClient helper
// ---------------------------------------------------------------------------
describe('twitter-manager: getClient', () => {
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
// 15. redactSensitive
// ---------------------------------------------------------------------------
describe('twitter-manager: redactSensitive', () => {
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

  it('should redact Bearer token patterns', () => {
    const input = 'Bearer AAAAAAAAAAAAAAbcdefghij123456789';
    const output = redactSensitive(input);
    assert.ok(!output.includes('AAAAAAAAAAAAAAbcdefghij123456789'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact authorization header patterns', () => {
    const input = 'authorization: Bearer xyz123';
    const output = redactSensitive(input);
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Posted a tweet with 100 likes';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 16. sanitizeString
// ---------------------------------------------------------------------------
describe('twitter-manager: sanitizeString', () => {
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
// 17. L1 compliance - no hardcoded URLs
// ---------------------------------------------------------------------------
describe('twitter-manager: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded twitter.com URLs in fetch endpoints', async () => {
    const { context, calls } = mockContextWithSpy(samplePostedTweet);
    await execute({ action: 'post_tweet', text: 'Hello' }, context);
    for (const call of calls) {
      assert.ok(!call.endpoint.includes('https://'), 'Endpoint must not contain https://');
      assert.ok(!call.endpoint.includes('api.twitter.com'), 'Endpoint must not contain api.twitter.com');
      assert.ok(call.endpoint.startsWith('twitter/'), 'Endpoint must start with twitter/');
    }
  });

  it('should use twitter/ prefix for all API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);

    await execute({ action: 'post_tweet', text: 'Hello' }, context);
    await execute({ action: 'get_tweet', tweetId: '123' }, context);
    await execute({ action: 'search_tweets', query: 'test' }, context);
    await execute({ action: 'get_user', username: 'test' }, context);
    await execute({ action: 'get_timeline', userId: '123' }, context);
    await execute({ action: 'delete_tweet', tweetId: '123' }, context);
    await execute({ action: 'like_tweet', tweetId: '123' }, context);
    await execute({ action: 'retweet', tweetId: '123' }, context);

    assert.ok(calls.length >= 8, `Expected at least 8 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.endpoint.startsWith('twitter/'), `Endpoint "${call.endpoint}" must start with twitter/`);
    }
  });
});

// ---------------------------------------------------------------------------
// 18. maxResults clamping
// ---------------------------------------------------------------------------
describe('twitter-manager: maxResults clamping', () => {
  beforeEach(() => {});

  it('should clamp maxResults to max 100', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_tweets', query: 'test', maxResults: 500 }, context);
    assert.equal(calls[0].opts.params.max_results, 100);
  });

  it('should use default maxResults of 10', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_tweets', query: 'test' }, context);
    assert.equal(calls[0].opts.params.max_results, 10);
  });

  it('should clamp maxResults to minimum 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_tweets', query: 'test', maxResults: -5 }, context);
    assert.equal(calls[0].opts.params.max_results, 1);
  });
});
