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
  validateOwnerRepo,
  validateIssueNumber,
  validateSort,
  validateState,
  validateLimit,
  validateQuery,
  validateTitle,
  validateBody,
  validateLabels,
  VALID_ACTIONS,
  VALID_REPO_SORTS,
  VALID_ISSUE_SORTS,
  VALID_PR_SORTS,
  VALID_ISSUE_STATES,
  VALID_PR_STATES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
  MAX_QUERY_LENGTH,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

let mockResponse;

/**
 * Build a mock context with a providerClient that returns mockResponse.
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

/** Sample repo response. */
const sampleRepo = {
  full_name: 'octocat/hello-world',
  description: 'A sample repository',
  stargazers_count: 100,
  forks_count: 50,
  open_issues_count: 5,
  language: 'JavaScript',
  default_branch: 'main',
  html_url: 'https://github.com/octocat/hello-world',
};

/** Sample repos list. */
const sampleReposList = [
  { full_name: 'octocat/repo1', name: 'repo1', description: 'First repo', stargazers_count: 10 },
  { full_name: 'octocat/repo2', name: 'repo2', description: 'Second repo', stargazers_count: 20 },
];

/** Sample issue response. */
const sampleIssue = {
  number: 42,
  title: 'Bug report',
  state: 'open',
  body: 'Something is broken',
  user: { login: 'octocat' },
  labels: [{ name: 'bug' }],
  html_url: 'https://github.com/octocat/hello-world/issues/42',
};

/** Sample issues list. */
const sampleIssuesList = [
  { number: 1, title: 'First issue', state: 'open', user: { login: 'user1' } },
  { number: 2, title: 'Second issue', state: 'closed', user: { login: 'user2' } },
];

/** Sample created issue response. */
const sampleCreatedIssue = {
  number: 99,
  title: 'New issue',
  state: 'open',
  html_url: 'https://github.com/octocat/hello-world/issues/99',
};

/** Sample PR response. */
const samplePR = {
  number: 10,
  title: 'Add feature',
  state: 'open',
  merged: false,
  body: 'This PR adds a new feature',
  user: { login: 'contributor' },
  base: { ref: 'main' },
  head: { ref: 'feature-branch' },
  html_url: 'https://github.com/octocat/hello-world/pull/10',
};

/** Sample PR list. */
const samplePRList = [
  { number: 1, title: 'PR 1', state: 'open', user: { login: 'dev1' } },
  { number: 2, title: 'PR 2', state: 'closed', user: { login: 'dev2' } },
];

/** Sample search code response. */
const sampleSearchCode = {
  total_count: 100,
  items: [
    { path: 'src/index.js', repository: { full_name: 'octocat/hello-world' }, score: 1.5 },
    { path: 'lib/utils.js', repository: { full_name: 'octocat/tools' }, score: 1.2 },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('github-api: action validation', () => {
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
      assert.ok(result.result.includes(a), `Should mention action "${a}" in error`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all API actions
// ---------------------------------------------------------------------------
describe('github-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_repo without client', async () => {
    const result = await execute({ action: 'get_repo', owner: 'octocat', repo: 'hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail list_repos without client', async () => {
    const result = await execute({ action: 'list_repos', username: 'octocat' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_issue without client', async () => {
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r', issueNumber: 1 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_issues without client', async () => {
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_issue without client', async () => {
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_pull_request without client', async () => {
    const result = await execute({ action: 'get_pull_request', owner: 'o', repo: 'r', prNumber: 1 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_pull_requests without client', async () => {
    const result = await execute({ action: 'list_pull_requests', owner: 'o', repo: 'r' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_code without client', async () => {
    const result = await execute({ action: 'search_code', query: 'hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_repo action
// ---------------------------------------------------------------------------
describe('github-api: get_repo', () => {
  beforeEach(() => {});

  it('should get repo with valid params', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'octocat', repo: 'hello-world' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_repo');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.owner, 'octocat');
    assert.equal(result.metadata.repo, 'hello-world');
    assert.ok(result.result.includes('octocat/hello-world'));
    assert.ok(result.metadata.timestamp);
  });

  it('should include description in result', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'octocat', repo: 'hello-world' }, ctx);
    assert.ok(result.result.includes('A sample repository'));
  });

  it('should include stats in result', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'octocat', repo: 'hello-world' }, ctx);
    assert.ok(result.result.includes('Stars: 100'));
    assert.ok(result.result.includes('Forks: 50'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', repo: 'hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'octocat' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject owner with invalid chars', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'oct@cat', repo: 'hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept owner with dots and hyphens', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'my-org.io', repo: 'my-repo' }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should store data in metadata', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'octocat', repo: 'hello-world' }, ctx);
    assert.equal(result.metadata.data.full_name, 'octocat/hello-world');
  });
});

// ---------------------------------------------------------------------------
// 4. list_repos action
// ---------------------------------------------------------------------------
describe('github-api: list_repos', () => {
  beforeEach(() => {});

  it('should list repos with valid username', async () => {
    const ctx = mockContext(sampleReposList);
    const result = await execute({ action: 'list_repos', username: 'octocat' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_repos');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.username, 'octocat');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.sort, 'updated');
    assert.equal(result.metadata.limit, 30);
  });

  it('should use custom sort', async () => {
    const ctx = mockContext(sampleReposList);
    const result = await execute({ action: 'list_repos', username: 'octocat', sort: 'created' }, ctx);
    assert.equal(result.metadata.sort, 'created');
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleReposList);
    const result = await execute({ action: 'list_repos', username: 'octocat', limit: 10 }, ctx);
    assert.equal(result.metadata.limit, 10);
  });

  it('should reject missing username', async () => {
    const ctx = mockContext(sampleReposList);
    const result = await execute({ action: 'list_repos' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid sort', async () => {
    const ctx = mockContext(sampleReposList);
    const result = await execute({ action: 'list_repos', username: 'octocat', sort: 'invalid' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should clamp limit to max', async () => {
    const ctx = mockContext(sampleReposList);
    const result = await execute({ action: 'list_repos', username: 'octocat', limit: 200 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 100);
  });

  it('should include repo names in result text', async () => {
    const ctx = mockContext(sampleReposList);
    const result = await execute({ action: 'list_repos', username: 'octocat' }, ctx);
    assert.ok(result.result.includes('octocat/repo1'));
    assert.ok(result.result.includes('octocat/repo2'));
  });
});

// ---------------------------------------------------------------------------
// 5. get_issue action
// ---------------------------------------------------------------------------
describe('github-api: get_issue', () => {
  beforeEach(() => {});

  it('should get issue with valid params', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'octocat', repo: 'hello-world', issueNumber: 42 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueNumber, 42);
    assert.ok(result.result.includes('#42'));
    assert.ok(result.result.includes('Bug report'));
  });

  it('should include issue body in result', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'octocat', repo: 'hello-world', issueNumber: 42 }, ctx);
    assert.ok(result.result.includes('Something is broken'));
  });

  it('should include labels in result', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'octocat', repo: 'hello-world', issueNumber: 42 }, ctx);
    assert.ok(result.result.includes('bug'));
  });

  it('should reject missing issueNumber', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject zero issueNumber', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r', issueNumber: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject negative issueNumber', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r', issueNumber: -5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer issueNumber', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r', issueNumber: 1.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept string issueNumber that parses to int', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r', issueNumber: '42' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.issueNumber, 42);
  });
});

// ---------------------------------------------------------------------------
// 6. list_issues action
// ---------------------------------------------------------------------------
describe('github-api: list_issues', () => {
  beforeEach(() => {});

  it('should list issues with valid params', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues', owner: 'octocat', repo: 'hello-world' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_issues');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.state, 'open');
    assert.equal(result.metadata.sort, 'created');
  });

  it('should use custom state', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r', state: 'closed' }, ctx);
    assert.equal(result.metadata.state, 'closed');
  });

  it('should use custom sort', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r', sort: 'updated' }, ctx);
    assert.equal(result.metadata.sort, 'updated');
  });

  it('should reject invalid state', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r', state: 'invalid' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid sort', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r', sort: 'invalid' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include issue titles in result text', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r' }, ctx);
    assert.ok(result.result.includes('First issue'));
    assert.ok(result.result.includes('Second issue'));
  });
});

// ---------------------------------------------------------------------------
// 7. create_issue action
// ---------------------------------------------------------------------------
describe('github-api: create_issue', () => {
  beforeEach(() => {});

  it('should create issue with title only', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'My issue' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.title, 'My issue');
    assert.ok(result.result.includes('Created Issue'));
  });

  it('should create issue with body and labels', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({
      action: 'create_issue', owner: 'o', repo: 'r',
      title: 'Bug', body: 'Details here', labels: ['bug', 'urgent'],
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should reject missing title', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty title', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject title exceeding max length', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'x'.repeat(MAX_TITLE_LENGTH + 1) }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should reject body exceeding max length', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({
      action: 'create_issue', owner: 'o', repo: 'r',
      title: 'T', body: 'x'.repeat(MAX_BODY_LENGTH + 1),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string body', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T', body: 123 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-array labels', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T', labels: 'bug' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject labels with non-string elements', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T', labels: [123] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept null body', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T', body: null }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept null labels', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T', labels: null }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should pass body and labels in request', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { capturedBody = body; return sampleCreatedIssue; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'create_issue', owner: 'o', repo: 'r',
      title: 'T', body: 'B', labels: ['bug'],
    }, ctx);
    assert.equal(capturedBody.title, 'T');
    assert.equal(capturedBody.body, 'B');
    assert.deepEqual(capturedBody.labels, ['bug']);
  });

  it('should not include body/labels in request when omitted', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { capturedBody = body; return sampleCreatedIssue; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T' }, ctx);
    assert.equal(capturedBody.title, 'T');
    assert.equal(capturedBody.body, undefined);
    assert.equal(capturedBody.labels, undefined);
  });

  it('should use POST method', async () => {
    let capturedMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { capturedMethod = method; return sampleCreatedIssue; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T' }, ctx);
    assert.equal(capturedMethod, 'POST');
  });
});

// ---------------------------------------------------------------------------
// 8. get_pull_request action
// ---------------------------------------------------------------------------
describe('github-api: get_pull_request', () => {
  beforeEach(() => {});

  it('should get PR with valid params', async () => {
    const ctx = mockContext(samplePR);
    const result = await execute({ action: 'get_pull_request', owner: 'octocat', repo: 'hello-world', prNumber: 10 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_pull_request');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.prNumber, 10);
    assert.ok(result.result.includes('#10'));
    assert.ok(result.result.includes('Add feature'));
  });

  it('should include merge status in result', async () => {
    const ctx = mockContext(samplePR);
    const result = await execute({ action: 'get_pull_request', owner: 'o', repo: 'r', prNumber: 10 }, ctx);
    assert.ok(result.result.includes('Merged: No'));
  });

  it('should include branch info in result', async () => {
    const ctx = mockContext(samplePR);
    const result = await execute({ action: 'get_pull_request', owner: 'o', repo: 'r', prNumber: 10 }, ctx);
    assert.ok(result.result.includes('main'));
    assert.ok(result.result.includes('feature-branch'));
  });

  it('should reject missing prNumber', async () => {
    const ctx = mockContext(samplePR);
    const result = await execute({ action: 'get_pull_request', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject zero prNumber', async () => {
    const ctx = mockContext(samplePR);
    const result = await execute({ action: 'get_pull_request', owner: 'o', repo: 'r', prNumber: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject negative prNumber', async () => {
    const ctx = mockContext(samplePR);
    const result = await execute({ action: 'get_pull_request', owner: 'o', repo: 'r', prNumber: -1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 9. list_pull_requests action
// ---------------------------------------------------------------------------
describe('github-api: list_pull_requests', () => {
  beforeEach(() => {});

  it('should list PRs with valid params', async () => {
    const ctx = mockContext(samplePRList);
    const result = await execute({ action: 'list_pull_requests', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_pull_requests');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.state, 'open');
    assert.equal(result.metadata.sort, 'created');
  });

  it('should use custom state for PRs', async () => {
    const ctx = mockContext(samplePRList);
    const result = await execute({ action: 'list_pull_requests', owner: 'o', repo: 'r', state: 'all' }, ctx);
    assert.equal(result.metadata.state, 'all');
  });

  it('should use custom sort for PRs', async () => {
    const ctx = mockContext(samplePRList);
    const result = await execute({ action: 'list_pull_requests', owner: 'o', repo: 'r', sort: 'popularity' }, ctx);
    assert.equal(result.metadata.sort, 'popularity');
  });

  it('should reject invalid PR sort', async () => {
    const ctx = mockContext(samplePRList);
    const result = await execute({ action: 'list_pull_requests', owner: 'o', repo: 'r', sort: 'comments' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include PR titles in result text', async () => {
    const ctx = mockContext(samplePRList);
    const result = await execute({ action: 'list_pull_requests', owner: 'o', repo: 'r' }, ctx);
    assert.ok(result.result.includes('PR 1'));
    assert.ok(result.result.includes('PR 2'));
  });
});

// ---------------------------------------------------------------------------
// 10. search_code action
// ---------------------------------------------------------------------------
describe('github-api: search_code', () => {
  beforeEach(() => {});

  it('should search code with valid query', async () => {
    const ctx = mockContext(sampleSearchCode);
    const result = await execute({ action: 'search_code', query: 'useState' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_code');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'useState');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.totalCount, 100);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchCode);
    const result = await execute({ action: 'search_code' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleSearchCode);
    const result = await execute({ action: 'search_code', query: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject query exceeding max length', async () => {
    const ctx = mockContext(sampleSearchCode);
    const result = await execute({ action: 'search_code', query: 'x'.repeat(MAX_QUERY_LENGTH + 1) }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should include file paths in result text', async () => {
    const ctx = mockContext(sampleSearchCode);
    const result = await execute({ action: 'search_code', query: 'useState' }, ctx);
    assert.ok(result.result.includes('src/index.js'));
    assert.ok(result.result.includes('lib/utils.js'));
  });

  it('should use custom limit for search', async () => {
    const ctx = mockContext(sampleSearchCode);
    const result = await execute({ action: 'search_code', query: 'test', limit: 5 }, ctx);
    assert.equal(result.metadata.limit, 5);
  });

  it('should encode query in path', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => { capturedPath = path; return sampleSearchCode; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search_code', query: 'hello world' }, ctx);
    assert.ok(capturedPath.includes('hello%20world'));
  });
});

// ---------------------------------------------------------------------------
// 11. Timeout handling
// ---------------------------------------------------------------------------
describe('github-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on get_repo abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_repos abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_repos', username: 'o' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on create_issue abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search_code abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_code', query: 'hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 12. Network error handling
// ---------------------------------------------------------------------------
describe('github-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on get_repo failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_repos failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'list_repos', username: 'o' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on create_issue failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search_code failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'search_code', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 13. getClient helper
// ---------------------------------------------------------------------------
describe('github-api: getClient', () => {
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
// 14. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('github-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when not configured', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return configured timeout within max', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should clamp to max timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should return default for zero timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should return default for negative timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: -100 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should return default for non-number timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });

  it('should return default for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 15. redactSensitive
// ---------------------------------------------------------------------------
describe('github-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: ghp_abc123xyz data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('ghp_abc123xyz'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization=ghp_abc123secret';
    const output = redactSensitive(input);
    assert.ok(!output.includes('ghp_abc123secret'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Repository: octocat/hello-world (100 stars)';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 16. validateOwnerRepo helper
// ---------------------------------------------------------------------------
describe('github-api: validateOwnerRepo', () => {
  beforeEach(() => {});

  it('should accept valid owner name', () => {
    const result = validateOwnerRepo('octocat', 'owner');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'octocat');
  });

  it('should accept name with hyphens', () => {
    const result = validateOwnerRepo('my-org', 'owner');
    assert.equal(result.valid, true);
  });

  it('should accept name with dots', () => {
    const result = validateOwnerRepo('my.org', 'owner');
    assert.equal(result.valid, true);
  });

  it('should accept name with underscores', () => {
    const result = validateOwnerRepo('my_org', 'owner');
    assert.equal(result.valid, true);
  });

  it('should trim whitespace', () => {
    const result = validateOwnerRepo('  octocat  ', 'owner');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'octocat');
  });

  it('should reject empty string', () => {
    const result = validateOwnerRepo('', 'owner');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateOwnerRepo(null, 'owner');
    assert.equal(result.valid, false);
  });

  it('should reject undefined', () => {
    const result = validateOwnerRepo(undefined, 'owner');
    assert.equal(result.valid, false);
  });

  it('should reject name with spaces', () => {
    const result = validateOwnerRepo('my org', 'owner');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('invalid characters'));
  });

  it('should reject name with special chars', () => {
    const result = validateOwnerRepo('my@org!', 'owner');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = validateOwnerRepo('   ', 'owner');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validateIssueNumber helper
// ---------------------------------------------------------------------------
describe('github-api: validateIssueNumber', () => {
  beforeEach(() => {});

  it('should accept positive integer', () => {
    const result = validateIssueNumber(42, 'issueNumber');
    assert.equal(result.valid, true);
    assert.equal(result.value, 42);
  });

  it('should accept 1', () => {
    const result = validateIssueNumber(1, 'issueNumber');
    assert.equal(result.valid, true);
  });

  it('should reject 0', () => {
    const result = validateIssueNumber(0, 'issueNumber');
    assert.equal(result.valid, false);
  });

  it('should reject negative', () => {
    const result = validateIssueNumber(-5, 'issueNumber');
    assert.equal(result.valid, false);
  });

  it('should reject float', () => {
    const result = validateIssueNumber(1.5, 'issueNumber');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateIssueNumber(null, 'issueNumber');
    assert.equal(result.valid, false);
  });

  it('should reject undefined', () => {
    const result = validateIssueNumber(undefined, 'issueNumber');
    assert.equal(result.valid, false);
  });

  it('should accept string that parses to positive int', () => {
    const result = validateIssueNumber('10', 'issueNumber');
    assert.equal(result.valid, true);
    assert.equal(result.value, 10);
  });
});

// ---------------------------------------------------------------------------
// 18. validateSort helper
// ---------------------------------------------------------------------------
describe('github-api: validateSort', () => {
  beforeEach(() => {});

  it('should default when undefined', () => {
    const result = validateSort(undefined, VALID_REPO_SORTS, 'updated');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'updated');
  });

  it('should default when null', () => {
    const result = validateSort(null, VALID_ISSUE_SORTS, 'created');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'created');
  });

  it('should accept valid sort value', () => {
    const result = validateSort('pushed', VALID_REPO_SORTS, 'updated');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'pushed');
  });

  it('should reject invalid sort value', () => {
    const result = validateSort('invalid', VALID_REPO_SORTS, 'updated');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('invalid'));
  });
});

// ---------------------------------------------------------------------------
// 19. validateState helper
// ---------------------------------------------------------------------------
describe('github-api: validateState', () => {
  beforeEach(() => {});

  it('should default when undefined', () => {
    const result = validateState(undefined, VALID_ISSUE_STATES, 'open');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'open');
  });

  it('should accept valid state', () => {
    const result = validateState('closed', VALID_ISSUE_STATES, 'open');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'closed');
  });

  it('should reject invalid state', () => {
    const result = validateState('pending', VALID_ISSUE_STATES, 'open');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 20. validateLimit helper
// ---------------------------------------------------------------------------
describe('github-api: validateLimit', () => {
  beforeEach(() => {});

  it('should default when undefined', () => {
    const result = validateLimit(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should accept valid limit', () => {
    const result = validateLimit(50);
    assert.equal(result.valid, true);
    assert.equal(result.value, 50);
  });

  it('should clamp to max', () => {
    const result = validateLimit(200);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_LIMIT);
  });

  it('should reject 0', () => {
    const result = validateLimit(0);
    assert.equal(result.valid, false);
  });

  it('should reject negative', () => {
    const result = validateLimit(-5);
    assert.equal(result.valid, false);
  });

  it('should reject float', () => {
    const result = validateLimit(1.5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 21. validateQuery helper
// ---------------------------------------------------------------------------
describe('github-api: validateQuery', () => {
  beforeEach(() => {});

  it('should accept valid query', () => {
    const result = validateQuery('useState hook');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'useState hook');
  });

  it('should trim whitespace', () => {
    const result = validateQuery('  test  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'test');
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
});

// ---------------------------------------------------------------------------
// 22. validateTitle helper
// ---------------------------------------------------------------------------
describe('github-api: validateTitle', () => {
  beforeEach(() => {});

  it('should accept valid title', () => {
    const result = validateTitle('Bug report');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Bug report');
  });

  it('should trim whitespace', () => {
    const result = validateTitle('  Title  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Title');
  });

  it('should reject null', () => {
    const result = validateTitle(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateTitle('');
    assert.equal(result.valid, false);
  });

  it('should reject title exceeding max length', () => {
    const result = validateTitle('x'.repeat(MAX_TITLE_LENGTH + 1));
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 23. validateBody helper
// ---------------------------------------------------------------------------
describe('github-api: validateBody', () => {
  beforeEach(() => {});

  it('should accept valid body', () => {
    const result = validateBody('This is a body');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'This is a body');
  });

  it('should accept null', () => {
    const result = validateBody(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should accept undefined', () => {
    const result = validateBody(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should reject non-string', () => {
    const result = validateBody(123);
    assert.equal(result.valid, false);
  });

  it('should reject body exceeding max length', () => {
    const result = validateBody('x'.repeat(MAX_BODY_LENGTH + 1));
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 24. validateLabels helper
// ---------------------------------------------------------------------------
describe('github-api: validateLabels', () => {
  beforeEach(() => {});

  it('should accept valid labels array', () => {
    const result = validateLabels(['bug', 'urgent']);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, ['bug', 'urgent']);
  });

  it('should accept empty array', () => {
    const result = validateLabels([]);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, []);
  });

  it('should accept null', () => {
    const result = validateLabels(null);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, []);
  });

  it('should accept undefined', () => {
    const result = validateLabels(undefined);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, []);
  });

  it('should reject non-array', () => {
    const result = validateLabels('bug');
    assert.equal(result.valid, false);
  });

  it('should reject array with non-string elements', () => {
    const result = validateLabels([123, 'bug']);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('index 0'));
  });
});

// ---------------------------------------------------------------------------
// 25. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('github-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path, body, opts) => {
          calledPath = path;
          return sampleRepo;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('/repos/o/r'));
  });
});

// ---------------------------------------------------------------------------
// 26. Endpoint routing verification
// ---------------------------------------------------------------------------
describe('github-api: endpoint routing', () => {
  beforeEach(() => {});

  it('should call /repos/{owner}/{repo} for get_repo', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedPath = path; return sampleRepo; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_repo', owner: 'octocat', repo: 'hello-world' }, ctx);
    assert.equal(capturedPath, '/repos/octocat/hello-world');
  });

  it('should call /users/{username}/repos for list_repos', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedPath = path; return sampleReposList; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_repos', username: 'octocat' }, ctx);
    assert.ok(capturedPath.startsWith('/users/octocat/repos'));
  });

  it('should call /repos/{owner}/{repo}/issues/{n} for get_issue', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedPath = path; return sampleIssue; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_issue', owner: 'o', repo: 'r', issueNumber: 42 }, ctx);
    assert.equal(capturedPath, '/repos/o/r/issues/42');
  });

  it('should call /repos/{owner}/{repo}/issues for list_issues', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedPath = path; return sampleIssuesList; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_issues', owner: 'o', repo: 'r' }, ctx);
    assert.ok(capturedPath.startsWith('/repos/o/r/issues'));
  });

  it('should call /repos/{owner}/{repo}/issues for create_issue', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedPath = path; return sampleCreatedIssue; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T' }, ctx);
    assert.equal(capturedPath, '/repos/o/r/issues');
  });

  it('should call /repos/{owner}/{repo}/pulls/{n} for get_pull_request', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedPath = path; return samplePR; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_pull_request', owner: 'o', repo: 'r', prNumber: 10 }, ctx);
    assert.equal(capturedPath, '/repos/o/r/pulls/10');
  });

  it('should call /repos/{owner}/{repo}/pulls for list_pull_requests', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedPath = path; return samplePRList; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_pull_requests', owner: 'o', repo: 'r' }, ctx);
    assert.ok(capturedPath.startsWith('/repos/o/r/pulls'));
  });

  it('should call /search/code for search_code', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedPath = path; return sampleSearchCode; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search_code', query: 'test' }, ctx);
    assert.ok(capturedPath.startsWith('/search/code'));
  });

  it('should use GET for get_repo', async () => {
    let capturedMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => { capturedMethod = method; return sampleRepo; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, ctx);
    assert.equal(capturedMethod, 'GET');
  });
});

// ---------------------------------------------------------------------------
// 27. validate() export
// ---------------------------------------------------------------------------
describe('github-api: validate()', () => {
  beforeEach(() => {});

  it('should validate valid get_repo', () => {
    const result = validate({ action: 'get_repo', owner: 'o', repo: 'r' });
    assert.equal(result.valid, true);
  });

  it('should reject invalid action in validate', () => {
    const result = validate({ action: 'invalid' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('invalid'));
  });

  it('should reject null params in validate', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate get_issue requires issueNumber', () => {
    const result = validate({ action: 'get_issue', owner: 'o', repo: 'r' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('issueNumber'));
  });

  it('should validate create_issue requires title', () => {
    const result = validate({ action: 'create_issue', owner: 'o', repo: 'r' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('title'));
  });

  it('should validate list_repos requires username', () => {
    const result = validate({ action: 'list_repos' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('username'));
  });

  it('should validate search_code requires query', () => {
    const result = validate({ action: 'search_code' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('query'));
  });

  it('should validate get_pull_request requires prNumber', () => {
    const result = validate({ action: 'get_pull_request', owner: 'o', repo: 'r' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('prNumber'));
  });

  it('should validate list_issues with invalid state', () => {
    const result = validate({ action: 'list_issues', owner: 'o', repo: 'r', state: 'xyz' });
    assert.equal(result.valid, false);
  });

  it('should validate list_pull_requests with invalid sort', () => {
    const result = validate({ action: 'list_pull_requests', owner: 'o', repo: 'r', sort: 'xyz' });
    assert.equal(result.valid, false);
  });

  it('should validate create_issue with invalid labels', () => {
    const result = validate({ action: 'create_issue', owner: 'o', repo: 'r', title: 'T', labels: 'not-array' });
    assert.equal(result.valid, false);
  });

  it('should pass valid list_issues', () => {
    const result = validate({ action: 'list_issues', owner: 'o', repo: 'r', state: 'open', sort: 'created' });
    assert.equal(result.valid, true);
  });

  it('should pass valid list_pull_requests', () => {
    const result = validate({ action: 'list_pull_requests', owner: 'o', repo: 'r', state: 'all', sort: 'popularity' });
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// 28. meta export
// ---------------------------------------------------------------------------
describe('github-api: meta', () => {
  beforeEach(() => {});

  it('should export meta object', () => {
    assert.ok(meta);
    assert.equal(typeof meta, 'object');
  });

  it('should have correct name', () => {
    assert.equal(meta.name, 'github-api');
  });

  it('should have version', () => {
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description.length > 0);
  });

  it('should have all actions', () => {
    assert.deepEqual(meta.actions, VALID_ACTIONS);
  });
});

// ---------------------------------------------------------------------------
// 29. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('github-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
  });
});

// ---------------------------------------------------------------------------
// 30. Constants verification
// ---------------------------------------------------------------------------
describe('github-api: constants', () => {
  beforeEach(() => {});

  it('should have 8 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 8);
  });

  it('should have correct default timeout', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 15000);
  });

  it('should have correct max timeout', () => {
    assert.equal(MAX_TIMEOUT_MS, 30000);
  });

  it('should have correct default limit', () => {
    assert.equal(DEFAULT_LIMIT, 30);
  });

  it('should have correct max limit', () => {
    assert.equal(MAX_LIMIT, 100);
  });

  it('should have correct min limit', () => {
    assert.equal(MIN_LIMIT, 1);
  });

  it('should have correct max title length', () => {
    assert.equal(MAX_TITLE_LENGTH, 256);
  });

  it('should have correct max body length', () => {
    assert.equal(MAX_BODY_LENGTH, 65536);
  });

  it('should have correct max query length', () => {
    assert.equal(MAX_QUERY_LENGTH, 256);
  });
});
