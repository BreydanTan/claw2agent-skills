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

/** Sample post response */
const samplePost = {
  post: {
    id: 'abc123',
    title: 'Test Post Title',
    author: 'testuser',
    subreddit: 'programming',
    score: 42,
    url: 'https://example.com/post',
    selftext: 'This is the post body.',
  },
};

/** Sample posts list response */
const samplePostsList = {
  posts: [
    { title: 'First Post', score: 100 },
    { title: 'Second Post', score: 50 },
    { title: 'Third Post', score: 25 },
  ],
};

/** Sample search results */
const sampleSearchResults = {
  results: [
    { title: 'Search Result 1', subreddit: 'programming' },
    { title: 'Search Result 2', subreddit: 'javascript' },
  ],
};

/** Sample subreddit info */
const sampleSubredditInfo = {
  subreddit: {
    name: 'programming',
    title: 'Programming',
    description: 'Computer Programming',
    subscribers: 5000000,
    created: '2008-01-25',
    nsfw: false,
  },
};

/** Sample comments */
const sampleComments = {
  comments: [
    { author: 'user1', body: 'Great post!', score: 10 },
    { author: 'user2', body: 'I disagree.', score: -2 },
  ],
};

/** Sample user info */
const sampleUserInfo = {
  user: {
    name: 'testuser',
    karma: 12345,
    created: '2015-06-15',
    description: 'Just a test user.',
  },
};

/** Sample trending */
const sampleTrending = {
  trending: [
    { title: 'Topic 1', description: 'Trending topic one' },
    { title: 'Topic 2', description: 'Trending topic two' },
    { title: 'Topic 3', description: 'Trending topic three' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('reddit-api-manager: action validation', () => {
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
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Error message should mention "${a}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('reddit-api-manager: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_post without client', async () => {
    const result = await execute({ action: 'get_post', postId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail list_posts without client', async () => {
    const result = await execute({ action: 'list_posts', subreddit: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search without client', async () => {
    const result = await execute({ action: 'search', query: 'hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_subreddit_info without client', async () => {
    const result = await execute({ action: 'get_subreddit_info', subreddit: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_comments without client', async () => {
    const result = await execute({ action: 'get_comments', postId: 'abc123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_user_info without client', async () => {
    const result = await execute({ action: 'get_user_info', username: 'testuser' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_trending without client', async () => {
    const result = await execute({ action: 'list_trending' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_post action
// ---------------------------------------------------------------------------
describe('reddit-api-manager: get_post', () => {
  beforeEach(() => {});

  it('should fetch a post by ID', async () => {
    const ctx = mockContext(samplePost);
    const result = await execute({ action: 'get_post', postId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_post');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.postId, 'abc123');
    assert.ok(result.result.includes('Test Post Title'));
    assert.ok(result.result.includes('testuser'));
  });

  it('should include post details in result', async () => {
    const ctx = mockContext(samplePost);
    const result = await execute({ action: 'get_post', postId: 'abc123' }, ctx);
    assert.ok(result.result.includes('r/programming'));
    assert.ok(result.result.includes('Score: 42'));
  });

  it('should reject missing postId', async () => {
    const ctx = mockContext(samplePost);
    const result = await execute({ action: 'get_post' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty postId', async () => {
    const ctx = mockContext(samplePost);
    const result = await execute({ action: 'get_post', postId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only postId', async () => {
    const ctx = mockContext(samplePost);
    const result = await execute({ action: 'get_post', postId: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(samplePost);
    const result = await execute({ action: 'get_post', postId: 'abc123' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return samplePost;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_post', postId: 'xyz789' }, ctx);
    assert.equal(calledPath, '/posts/xyz789');
  });
});

// ---------------------------------------------------------------------------
// 4. list_posts action
// ---------------------------------------------------------------------------
describe('reddit-api-manager: list_posts', () => {
  beforeEach(() => {});

  it('should list posts from a subreddit', async () => {
    const ctx = mockContext(samplePostsList);
    const result = await execute({ action: 'list_posts', subreddit: 'programming' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_posts');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.subreddit, 'programming');
    assert.equal(result.metadata.sort, 'hot');
    assert.equal(result.metadata.limit, 25);
    assert.equal(result.metadata.postCount, 3);
    assert.ok(result.result.includes('r/programming'));
    assert.ok(result.result.includes('First Post'));
  });

  it('should use custom sort and limit', async () => {
    const ctx = mockContext(samplePostsList);
    const result = await execute(
      { action: 'list_posts', subreddit: 'test', sort: 'new', limit: 10 },
      ctx
    );
    assert.equal(result.metadata.sort, 'new');
    assert.equal(result.metadata.limit, 10);
  });

  it('should reject missing subreddit', async () => {
    const ctx = mockContext(samplePostsList);
    const result = await execute({ action: 'list_posts' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject subreddit with special characters', async () => {
    const ctx = mockContext(samplePostsList);
    const result = await execute({ action: 'list_posts', subreddit: 'test/../../etc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid sort for list_posts', async () => {
    const ctx = mockContext(samplePostsList);
    const result = await execute(
      { action: 'list_posts', subreddit: 'test', sort: 'invalid' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp limit to MAX_LIMIT', async () => {
    const ctx = mockContext(samplePostsList);
    const result = await execute(
      { action: 'list_posts', subreddit: 'test', limit: 500 },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should reject limit of 0', async () => {
    const ctx = mockContext(samplePostsList);
    const result = await execute(
      { action: 'list_posts', subreddit: 'test', limit: 0 },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return samplePostsList;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_posts', subreddit: 'javascript', sort: 'top', limit: 5 }, ctx);
    assert.equal(calledPath, '/subreddits/javascript/posts?sort=top&limit=5');
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [{ title: 'Alt Post', score: 1 }] });
    const result = await execute({ action: 'list_posts', subreddit: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.postCount, 1);
  });
});

// ---------------------------------------------------------------------------
// 5. search action
// ---------------------------------------------------------------------------
describe('reddit-api-manager: search', () => {
  beforeEach(() => {});

  it('should search Reddit', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'javascript tips' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'javascript tips');
    assert.equal(result.metadata.sort, 'relevance');
    assert.equal(result.metadata.resultCount, 2);
    assert.ok(result.result.includes('Search Result 1'));
  });

  it('should search within a specific subreddit', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute(
      { action: 'search', query: 'react hooks', subreddit: 'javascript' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.subreddit, 'javascript');
    assert.ok(result.result.includes('r/javascript'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid subreddit in search', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute(
      { action: 'search', query: 'test', subreddit: 'bad/name' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid sort for search', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute(
      { action: 'search', query: 'test', sort: 'rising' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should use custom sort and limit', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute(
      { action: 'search', query: 'test', sort: 'top', limit: 50 },
      ctx
    );
    assert.equal(result.metadata.sort, 'top');
    assert.equal(result.metadata.limit, 50);
  });

  it('should set subreddit to null when not provided', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.subreddit, null);
  });

  it('should encode query in path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleSearchResults;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search', query: 'hello world' }, ctx);
    assert.ok(calledPath.includes('hello%20world'));
  });
});

// ---------------------------------------------------------------------------
// 6. get_subreddit_info action
// ---------------------------------------------------------------------------
describe('reddit-api-manager: get_subreddit_info', () => {
  beforeEach(() => {});

  it('should fetch subreddit info', async () => {
    const ctx = mockContext(sampleSubredditInfo);
    const result = await execute({ action: 'get_subreddit_info', subreddit: 'programming' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_subreddit_info');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.subreddit, 'programming');
    assert.ok(result.result.includes('r/programming'));
    assert.ok(result.result.includes('Subscribers: 5000000'));
  });

  it('should reject missing subreddit', async () => {
    const ctx = mockContext(sampleSubredditInfo);
    const result = await execute({ action: 'get_subreddit_info' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject subreddit with dots', async () => {
    const ctx = mockContext(sampleSubredditInfo);
    const result = await execute({ action: 'get_subreddit_info', subreddit: 'bad.name' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleSubredditInfo;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_subreddit_info', subreddit: 'python' }, ctx);
    assert.equal(calledPath, '/subreddits/python');
  });
});

// ---------------------------------------------------------------------------
// 7. get_comments action
// ---------------------------------------------------------------------------
describe('reddit-api-manager: get_comments', () => {
  beforeEach(() => {});

  it('should fetch comments on a post', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'get_comments', postId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_comments');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.postId, 'abc123');
    assert.equal(result.metadata.sort, 'best');
    assert.equal(result.metadata.commentCount, 2);
    assert.ok(result.result.includes('Great post!'));
  });

  it('should use custom sort and limit', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute(
      { action: 'get_comments', postId: 'abc123', sort: 'controversial', limit: 10 },
      ctx
    );
    assert.equal(result.metadata.sort, 'controversial');
    assert.equal(result.metadata.limit, 10);
  });

  it('should reject missing postId', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute({ action: 'get_comments' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid sort for comments', async () => {
    const ctx = mockContext(sampleComments);
    const result = await execute(
      { action: 'get_comments', postId: 'abc123', sort: 'random' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
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
    await execute({ action: 'get_comments', postId: 'def456', sort: 'top', limit: 5 }, ctx);
    assert.equal(calledPath, '/posts/def456/comments?sort=top&limit=5');
  });
});

// ---------------------------------------------------------------------------
// 8. get_user_info action
// ---------------------------------------------------------------------------
describe('reddit-api-manager: get_user_info', () => {
  beforeEach(() => {});

  it('should fetch user info', async () => {
    const ctx = mockContext(sampleUserInfo);
    const result = await execute({ action: 'get_user_info', username: 'testuser' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_user_info');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.username, 'testuser');
    assert.ok(result.result.includes('u/testuser'));
    assert.ok(result.result.includes('Karma: 12345'));
  });

  it('should reject missing username', async () => {
    const ctx = mockContext(sampleUserInfo);
    const result = await execute({ action: 'get_user_info' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty username', async () => {
    const ctx = mockContext(sampleUserInfo);
    const result = await execute({ action: 'get_user_info', username: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleUserInfo;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_user_info', username: 'john_doe' }, ctx);
    assert.equal(calledPath, '/users/john_doe');
  });
});

// ---------------------------------------------------------------------------
// 9. list_trending action
// ---------------------------------------------------------------------------
describe('reddit-api-manager: list_trending', () => {
  beforeEach(() => {});

  it('should list trending topics', async () => {
    const ctx = mockContext(sampleTrending);
    const result = await execute({ action: 'list_trending' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_trending');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.trendingCount, 3);
    assert.ok(result.result.includes('Trending on Reddit'));
    assert.ok(result.result.includes('Topic 1'));
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleTrending;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_trending' }, ctx);
    assert.equal(calledPath, '/trending');
  });

  it('should use GET method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => {
          calledMethod = method;
          return sampleTrending;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_trending' }, ctx);
    assert.equal(calledMethod, 'GET');
  });

  it('should handle empty trending list', async () => {
    const ctx = mockContext({ trending: [] });
    const result = await execute({ action: 'list_trending' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.trendingCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('reddit-api-manager: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on get_post abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_post', postId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_posts abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_posts', subreddit: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_comments abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_comments', postId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_user_info abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_user_info', username: 'testuser' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_trending abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_trending' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('reddit-api-manager: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on get_post failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_post', postId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_posts failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'list_posts', subreddit: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_subreddit_info failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'get_subreddit_info', subreddit: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_comments failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({ action: 'get_comments', postId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_user_info failure', async () => {
    const ctx = mockContextError(new Error('Not found'));
    const result = await execute({ action: 'get_user_info', username: 'testuser' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_trending failure', async () => {
    const ctx = mockContextError(new Error('Service unavailable'));
    const result = await execute({ action: 'list_trending' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_post', postId: 'abc123' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('reddit-api-manager: getClient', () => {
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
describe('reddit-api-manager: redactSensitive', () => {
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

  it('should redact password patterns', () => {
    const input = 'password=secretpass123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('secretpass123'));
  });

  it('should not alter clean strings', () => {
    const input = 'Fetched 25 posts from r/programming';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 14. sanitizeSubreddit helper
// ---------------------------------------------------------------------------
describe('reddit-api-manager: sanitizeSubreddit', () => {
  beforeEach(() => {});

  it('should accept valid subreddit name', () => {
    const result = sanitizeSubreddit('programming');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'programming');
  });

  it('should accept name with underscores', () => {
    const result = sanitizeSubreddit('ask_reddit');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'ask_reddit');
  });

  it('should accept name with numbers', () => {
    const result = sanitizeSubreddit('python3');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'python3');
  });

  it('should trim whitespace', () => {
    const result = sanitizeSubreddit('  test  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'test');
  });

  it('should reject name with slashes', () => {
    const result = sanitizeSubreddit('../../etc');
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject name with dots', () => {
    const result = sanitizeSubreddit('bad.name');
    assert.equal(result.valid, false);
  });

  it('should reject name with spaces', () => {
    const result = sanitizeSubreddit('bad name');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = sanitizeSubreddit(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = sanitizeSubreddit('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = sanitizeSubreddit('   ');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 15. validateSort helper
// ---------------------------------------------------------------------------
describe('reddit-api-manager: validateSort', () => {
  beforeEach(() => {});

  it('should return default when sort is undefined', () => {
    const result = validateSort(undefined, VALID_POST_SORTS, 'hot');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'hot');
  });

  it('should return default when sort is null', () => {
    const result = validateSort(null, VALID_SEARCH_SORTS, 'relevance');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'relevance');
  });

  it('should accept valid sort value', () => {
    const result = validateSort('new', VALID_POST_SORTS, 'hot');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'new');
  });

  it('should reject invalid sort value', () => {
    const result = validateSort('random', VALID_POST_SORTS, 'hot');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('random'));
  });
});

// ---------------------------------------------------------------------------
// 16. validateLimit helper
// ---------------------------------------------------------------------------
describe('reddit-api-manager: validateLimit', () => {
  beforeEach(() => {});

  it('should return default when limit is undefined', () => {
    const result = validateLimit(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should return default when limit is null', () => {
    const result = validateLimit(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should accept valid limit', () => {
    const result = validateLimit(50);
    assert.equal(result.valid, true);
    assert.equal(result.value, 50);
  });

  it('should clamp limit to MAX_LIMIT', () => {
    const result = validateLimit(200);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_LIMIT);
  });

  it('should accept MIN_LIMIT', () => {
    const result = validateLimit(MIN_LIMIT);
    assert.equal(result.valid, true);
    assert.equal(result.value, MIN_LIMIT);
  });

  it('should reject 0', () => {
    const result = validateLimit(0);
    assert.equal(result.valid, false);
  });

  it('should reject negative number', () => {
    const result = validateLimit(-5);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateLimit(1.5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('reddit-api-manager: resolveTimeout', () => {
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

  it('should cap at MAX_TIMEOUT_MS', () => {
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
// 18. validate() export
// ---------------------------------------------------------------------------
describe('reddit-api-manager: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('bad'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate get_post requires postId', () => {
    assert.equal(validate({ action: 'get_post' }).valid, false);
    assert.equal(validate({ action: 'get_post', postId: '' }).valid, false);
    assert.equal(validate({ action: 'get_post', postId: 'abc' }).valid, true);
  });

  it('should validate list_posts requires subreddit', () => {
    assert.equal(validate({ action: 'list_posts' }).valid, false);
    assert.equal(validate({ action: 'list_posts', subreddit: 'bad/name' }).valid, false);
    assert.equal(validate({ action: 'list_posts', subreddit: 'test' }).valid, true);
  });

  it('should validate search requires query', () => {
    assert.equal(validate({ action: 'search' }).valid, false);
    assert.equal(validate({ action: 'search', query: '' }).valid, false);
    assert.equal(validate({ action: 'search', query: 'test' }).valid, true);
  });

  it('should validate get_subreddit_info requires subreddit', () => {
    assert.equal(validate({ action: 'get_subreddit_info' }).valid, false);
    assert.equal(validate({ action: 'get_subreddit_info', subreddit: 'test' }).valid, true);
  });

  it('should validate get_comments requires postId', () => {
    assert.equal(validate({ action: 'get_comments' }).valid, false);
    assert.equal(validate({ action: 'get_comments', postId: 'abc' }).valid, true);
  });

  it('should validate get_user_info requires username', () => {
    assert.equal(validate({ action: 'get_user_info' }).valid, false);
    assert.equal(validate({ action: 'get_user_info', username: '' }).valid, false);
    assert.equal(validate({ action: 'get_user_info', username: 'user1' }).valid, true);
  });

  it('should validate list_trending requires nothing', () => {
    assert.equal(validate({ action: 'list_trending' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 19. meta export
// ---------------------------------------------------------------------------
describe('reddit-api-manager: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'reddit-api-manager');
  });

  it('should have version', () => {
    assert.ok(meta.version);
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('Reddit'));
  });

  it('should list all 7 actions', () => {
    assert.equal(meta.actions.length, 7);
    assert.ok(meta.actions.includes('get_post'));
    assert.ok(meta.actions.includes('list_posts'));
    assert.ok(meta.actions.includes('search'));
    assert.ok(meta.actions.includes('get_subreddit_info'));
    assert.ok(meta.actions.includes('get_comments'));
    assert.ok(meta.actions.includes('get_user_info'));
    assert.ok(meta.actions.includes('list_trending'));
  });
});

// ---------------------------------------------------------------------------
// 20. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('reddit-api-manager: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return samplePost;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_post', postId: 'abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/posts/abc123');
  });
});

// ---------------------------------------------------------------------------
// 21. Input sanitization edge cases
// ---------------------------------------------------------------------------
describe('reddit-api-manager: input sanitization edge cases', () => {
  beforeEach(() => {});

  it('should reject subreddit with HTML tags', () => {
    const result = sanitizeSubreddit('<script>alert(1)</script>');
    assert.equal(result.valid, false);
  });

  it('should reject subreddit with unicode', () => {
    const result = sanitizeSubreddit('test\u00e9');
    assert.equal(result.valid, false);
  });

  it('should accept subreddit with mixed case', () => {
    const result = sanitizeSubreddit('AskReddit');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'AskReddit');
  });

  it('should reject non-string subreddit', () => {
    const result = sanitizeSubreddit(123);
    assert.equal(result.valid, false);
  });

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('token: sk_live_secret123'));
    const result = await execute({ action: 'get_post', postId: 'abc' }, ctx);
    assert.ok(!result.result.includes('sk_live_secret123'));
  });
});

// ---------------------------------------------------------------------------
// 22. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('reddit-api-manager: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });
});
