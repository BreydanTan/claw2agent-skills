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

const sampleRepo = {
  name: 'react',
  full_name: 'facebook/react',
  description: 'A JavaScript library for building user interfaces',
  stargazers_count: 220000,
  forks_count: 45000,
  language: 'JavaScript',
  topics: ['javascript', 'ui', 'frontend'],
  default_branch: 'main',
  html_url: 'https://github.com/facebook/react',
};

const sampleRepos = [
  { name: 'react', full_name: 'facebook/react', description: 'UI library', stargazers_count: 220000, language: 'JavaScript', html_url: 'https://github.com/facebook/react' },
  { name: 'jest', full_name: 'facebook/jest', description: 'Testing framework', stargazers_count: 44000, language: 'TypeScript', html_url: 'https://github.com/facebook/jest' },
];

const sampleIssue = {
  number: 42,
  title: 'Bug in rendering',
  state: 'open',
  body: 'Rendering fails under certain conditions.',
  user: { login: 'johndoe' },
  labels: [{ name: 'bug' }, { name: 'high-priority' }],
  assignees: [{ login: 'janedoe' }],
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-16T12:00:00Z',
  html_url: 'https://github.com/facebook/react/issues/42',
};

const sampleIssues = [
  { number: 1, title: 'First issue', state: 'open', user: { login: 'alice' }, html_url: 'https://github.com/o/r/issues/1' },
  { number: 2, title: 'Second issue', state: 'open', user: { login: 'bob' }, html_url: 'https://github.com/o/r/issues/2' },
];

const samplePr = {
  number: 99,
  title: 'Add new feature',
  state: 'open',
  merged: false,
  body: 'This PR adds a new feature.',
  user: { login: 'developer1' },
  head: { ref: 'feature-branch' },
  base: { ref: 'main' },
  commits: 3,
  changed_files: 5,
  additions: 120,
  deletions: 30,
  created_at: '2025-02-01T08:00:00Z',
  updated_at: '2025-02-02T09:00:00Z',
  html_url: 'https://github.com/myorg/myrepo/pull/99',
};

const samplePrs = [
  { number: 10, title: 'PR one', state: 'open', user: { login: 'dev1' }, head: { ref: 'feat-1' }, base: { ref: 'main' }, html_url: 'https://github.com/o/r/pull/10' },
  { number: 11, title: 'PR two', state: 'open', user: { login: 'dev2' }, head: { ref: 'feat-2' }, base: { ref: 'main' }, html_url: 'https://github.com/o/r/pull/11' },
];

const sampleSearchResults = {
  total_count: 42,
  items: [
    { name: 'App.js', path: 'src/App.js', sha: 'abc123', html_url: 'https://github.com/o/r/blob/main/src/App.js', score: 1.5 },
    { name: 'index.js', path: 'src/index.js', sha: 'def456', html_url: 'https://github.com/o/r/blob/main/src/index.js', score: 1.2 },
  ],
};

const sampleCreatedIssue = {
  number: 100,
  title: 'New issue',
  html_url: 'https://github.com/myorg/myrepo/issues/100',
};

const sampleCreatedPr = {
  number: 200,
  title: 'New PR',
  html_url: 'https://github.com/myorg/myrepo/pull/200',
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('github-repo-manager: action validation', () => {
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
// 2. PROVIDER_NOT_CONFIGURED for all external actions
// ---------------------------------------------------------------------------
describe('github-repo-manager: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_repo without client', async () => {
    const result = await execute({ action: 'get_repo', owner: 'facebook', repo: 'react' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_repos without client', async () => {
    const result = await execute({ action: 'list_repos', owner: 'facebook' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_issue without client', async () => {
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'Bug' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_issues without client', async () => {
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_issue without client', async () => {
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r', issueNumber: 1 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_pr without client', async () => {
    const result = await execute({ action: 'create_pr', owner: 'o', repo: 'r', title: 'PR', head: 'feat', base: 'main' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_prs without client', async () => {
    const result = await execute({ action: 'list_prs', owner: 'o', repo: 'r' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_pr without client', async () => {
    const result = await execute({ action: 'get_pr', owner: 'o', repo: 'r', prNumber: 1 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_code without client', async () => {
    const result = await execute({ action: 'search_code', owner: 'o', repo: 'r', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_repo action
// ---------------------------------------------------------------------------
describe('github-repo-manager: get_repo', () => {
  beforeEach(() => {});

  it('should return repo info successfully', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'facebook', repo: 'react' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_repo');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.owner, 'facebook');
    assert.equal(result.metadata.repo, 'react');
    assert.equal(result.metadata.stars, 220000);
    assert.equal(result.metadata.forks, 45000);
    assert.equal(result.metadata.language, 'JavaScript');
    assert.ok(result.result.includes('facebook/react'));
    assert.ok(result.result.includes('220000'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', repo: 'react' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(sampleRepo);
    const result = await execute({ action: 'get_repo', owner: 'facebook' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_REPO');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleRepo);
    await execute({ action: 'get_repo', owner: 'facebook', repo: 'react' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, 'github/repos/facebook/react');
  });
});

// ---------------------------------------------------------------------------
// 4. list_repos action
// ---------------------------------------------------------------------------
describe('github-repo-manager: list_repos', () => {
  beforeEach(() => {});

  it('should list repos successfully', async () => {
    const ctx = mockContext(sampleRepos);
    const result = await execute({ action: 'list_repos', owner: 'facebook' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_repos');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('facebook/react'));
    assert.ok(result.result.includes('facebook/jest'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(sampleRepos);
    const result = await execute({ action: 'list_repos' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should handle empty repo list', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_repos', owner: 'nobody' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should pass sort and type params to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleRepos);
    await execute({ action: 'list_repos', owner: 'fb', sort: 'created', type: 'public', perPage: 10 }, context);
    assert.equal(calls[0].opts.params.sort, 'created');
    assert.equal(calls[0].opts.params.type, 'public');
    assert.equal(calls[0].opts.params.per_page, 10);
  });
});

// ---------------------------------------------------------------------------
// 5. create_issue action
// ---------------------------------------------------------------------------
describe('github-repo-manager: create_issue', () => {
  beforeEach(() => {});

  it('should create an issue successfully', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({
      action: 'create_issue', owner: 'myorg', repo: 'myrepo', title: 'New issue',
      body: 'Description', labels: ['bug'], assignees: ['dev1'],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueNumber, 100);
    assert.ok(result.result.includes('#100'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', repo: 'r', title: 'Bug' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', title: 'Bug' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_REPO');
  });

  it('should reject missing title', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TITLE');
  });

  it('should use POST method for creating issues', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedIssue);
    await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'Bug' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });
});

// ---------------------------------------------------------------------------
// 6. list_issues action
// ---------------------------------------------------------------------------
describe('github-repo-manager: list_issues', () => {
  beforeEach(() => {});

  it('should list issues successfully', async () => {
    const ctx = mockContext(sampleIssues);
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_issues');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('#1'));
    assert.ok(result.result.includes('#2'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(sampleIssues);
    const result = await execute({ action: 'list_issues', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(sampleIssues);
    const result = await execute({ action: 'list_issues', owner: 'o' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_REPO');
  });

  it('should handle empty issues list', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_issues', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No'));
  });

  it('should pass state and labels to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssues);
    await execute({ action: 'list_issues', owner: 'o', repo: 'r', state: 'closed', labels: ['bug', 'urgent'] }, context);
    assert.equal(calls[0].opts.params.state, 'closed');
    assert.equal(calls[0].opts.params.labels, 'bug,urgent');
  });
});

// ---------------------------------------------------------------------------
// 7. get_issue action
// ---------------------------------------------------------------------------
describe('github-repo-manager: get_issue', () => {
  beforeEach(() => {});

  it('should get an issue successfully', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'facebook', repo: 'react', issueNumber: 42 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueNumber, 42);
    assert.equal(result.metadata.title, 'Bug in rendering');
    assert.equal(result.metadata.state, 'open');
    assert.ok(result.result.includes('#42'));
    assert.ok(result.result.includes('Bug in rendering'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', repo: 'r', issueNumber: 1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'o', issueNumber: 1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_REPO');
  });

  it('should reject missing issueNumber', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_NUMBER');
  });

  it('should reject non-numeric issueNumber', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', owner: 'o', repo: 'r', issueNumber: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_NUMBER');
  });

  it('should call the correct endpoint with issue number', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssue);
    await execute({ action: 'get_issue', owner: 'facebook', repo: 'react', issueNumber: 42 }, context);
    assert.equal(calls[0].endpoint, 'github/repos/facebook/react/issues/42');
  });
});

// ---------------------------------------------------------------------------
// 8. create_pr action
// ---------------------------------------------------------------------------
describe('github-repo-manager: create_pr', () => {
  beforeEach(() => {});

  it('should create a PR successfully', async () => {
    const ctx = mockContext(sampleCreatedPr);
    const result = await execute({
      action: 'create_pr', owner: 'myorg', repo: 'myrepo',
      title: 'New PR', head: 'feature', base: 'main', body: 'Description', draft: false,
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_pr');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.prNumber, 200);
    assert.ok(result.result.includes('#200'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(sampleCreatedPr);
    const result = await execute({ action: 'create_pr', repo: 'r', title: 'T', head: 'h', base: 'b' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(sampleCreatedPr);
    const result = await execute({ action: 'create_pr', owner: 'o', title: 'T', head: 'h', base: 'b' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_REPO');
  });

  it('should reject missing title', async () => {
    const ctx = mockContext(sampleCreatedPr);
    const result = await execute({ action: 'create_pr', owner: 'o', repo: 'r', head: 'h', base: 'b' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TITLE');
  });

  it('should reject missing head', async () => {
    const ctx = mockContext(sampleCreatedPr);
    const result = await execute({ action: 'create_pr', owner: 'o', repo: 'r', title: 'T', base: 'b' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_HEAD');
  });

  it('should reject missing base', async () => {
    const ctx = mockContext(sampleCreatedPr);
    const result = await execute({ action: 'create_pr', owner: 'o', repo: 'r', title: 'T', head: 'h' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE');
  });

  it('should use POST method for creating PRs', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedPr);
    await execute({ action: 'create_pr', owner: 'o', repo: 'r', title: 'T', head: 'h', base: 'b' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should set draft flag when specified', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedPr);
    await execute({ action: 'create_pr', owner: 'o', repo: 'r', title: 'T', head: 'h', base: 'b', draft: true }, context);
    assert.equal(calls[0].opts.params.draft, true);
  });
});

// ---------------------------------------------------------------------------
// 9. list_prs action
// ---------------------------------------------------------------------------
describe('github-repo-manager: list_prs', () => {
  beforeEach(() => {});

  it('should list PRs successfully', async () => {
    const ctx = mockContext(samplePrs);
    const result = await execute({ action: 'list_prs', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_prs');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('#10'));
    assert.ok(result.result.includes('#11'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(samplePrs);
    const result = await execute({ action: 'list_prs', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(samplePrs);
    const result = await execute({ action: 'list_prs', owner: 'o' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_REPO');
  });

  it('should handle empty PR list', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_prs', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No'));
  });
});

// ---------------------------------------------------------------------------
// 10. get_pr action
// ---------------------------------------------------------------------------
describe('github-repo-manager: get_pr', () => {
  beforeEach(() => {});

  it('should get a PR successfully', async () => {
    const ctx = mockContext(samplePr);
    const result = await execute({ action: 'get_pr', owner: 'myorg', repo: 'myrepo', prNumber: 99 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_pr');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.prNumber, 99);
    assert.equal(result.metadata.title, 'Add new feature');
    assert.equal(result.metadata.merged, false);
    assert.ok(result.result.includes('#99'));
    assert.ok(result.result.includes('Add new feature'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(samplePr);
    const result = await execute({ action: 'get_pr', repo: 'r', prNumber: 1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(samplePr);
    const result = await execute({ action: 'get_pr', owner: 'o', prNumber: 1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_REPO');
  });

  it('should reject missing prNumber', async () => {
    const ctx = mockContext(samplePr);
    const result = await execute({ action: 'get_pr', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PR_NUMBER');
  });

  it('should reject non-numeric prNumber', async () => {
    const ctx = mockContext(samplePr);
    const result = await execute({ action: 'get_pr', owner: 'o', repo: 'r', prNumber: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PR_NUMBER');
  });

  it('should call the correct endpoint with PR number', async () => {
    const { context, calls } = mockContextWithSpy(samplePr);
    await execute({ action: 'get_pr', owner: 'myorg', repo: 'myrepo', prNumber: 99 }, context);
    assert.equal(calls[0].endpoint, 'github/repos/myorg/myrepo/pulls/99');
  });
});

// ---------------------------------------------------------------------------
// 11. search_code action
// ---------------------------------------------------------------------------
describe('github-repo-manager: search_code', () => {
  beforeEach(() => {});

  it('should search code successfully', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_code', owner: 'o', repo: 'r', query: 'useState' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_code');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.totalCount, 42);
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('useState'));
    assert.ok(result.result.includes('App.js'));
  });

  it('should reject missing owner', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_code', repo: 'r', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_OWNER');
  });

  it('should reject missing repo', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_code', owner: 'o', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_REPO');
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_code', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_QUERY');
  });

  it('should handle empty search results', async () => {
    const ctx = mockContext({ total_count: 0, items: [] });
    const result = await execute({ action: 'search_code', owner: 'o', repo: 'r', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.totalCount, 0);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No code matches'));
  });

  it('should include repo scope in search query', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_code', owner: 'facebook', repo: 'react', query: 'hooks' }, context);
    assert.ok(calls[0].opts.params.q.includes('repo:facebook/react'));
    assert.ok(calls[0].opts.params.q.includes('hooks'));
  });
});

// ---------------------------------------------------------------------------
// 12. Timeout handling
// ---------------------------------------------------------------------------
describe('github-repo-manager: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for get_repo', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for list_repos', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_repos', owner: 'o' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for search_code', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_code', owner: 'o', repo: 'r', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 13. Network error handling
// ---------------------------------------------------------------------------
describe('github-repo-manager: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for get_repo', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for create_issue', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'create_issue', owner: 'o', repo: 'r', title: 'Bug' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 14. getClient helper
// ---------------------------------------------------------------------------
describe('github-repo-manager: getClient', () => {
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
describe('github-repo-manager: redactSensitive', () => {
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

  it('should redact GitHub PAT tokens', () => {
    const input = 'Using ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl for auth';
    const output = redactSensitive(input);
    assert.ok(!output.includes('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'facebook/react has 220k stars';
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
describe('github-repo-manager: sanitizeString', () => {
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
// 17. No hardcoded URLs (L1 compliance)
// ---------------------------------------------------------------------------
describe('github-repo-manager: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded github.com URLs in fetch endpoints', async () => {
    const { context, calls } = mockContextWithSpy(sampleRepo);
    await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, context);
    for (const call of calls) {
      assert.ok(!call.endpoint.includes('https://'), 'Endpoint must not contain https://');
      assert.ok(!call.endpoint.includes('api.github.com'), 'Endpoint must not contain api.github.com');
      assert.ok(call.endpoint.startsWith('github/'), 'Endpoint must start with github/');
    }
  });

  it('should use github/ prefix for all API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);

    // Run multiple actions to collect all endpoints
    await execute({ action: 'get_repo', owner: 'o', repo: 'r' }, context);
    await execute({ action: 'list_repos', owner: 'o' }, context);
    await execute({ action: 'list_issues', owner: 'o', repo: 'r' }, context);
    await execute({ action: 'list_prs', owner: 'o', repo: 'r' }, context);
    await execute({ action: 'search_code', owner: 'o', repo: 'r', query: 'test' }, context);

    assert.ok(calls.length >= 5, `Expected at least 5 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.endpoint.startsWith('github/'), `Endpoint "${call.endpoint}" must start with github/`);
    }
  });
});

// ---------------------------------------------------------------------------
// 18. perPage clamping
// ---------------------------------------------------------------------------
describe('github-repo-manager: perPage clamping', () => {
  beforeEach(() => {});

  it('should clamp perPage to max 100', async () => {
    const { context, calls } = mockContextWithSpy(sampleRepos);
    await execute({ action: 'list_repos', owner: 'o', perPage: 500 }, context);
    assert.equal(calls[0].opts.params.per_page, 100);
  });

  it('should use default perPage of 30', async () => {
    const { context, calls } = mockContextWithSpy(sampleRepos);
    await execute({ action: 'list_repos', owner: 'o' }, context);
    assert.equal(calls[0].opts.params.per_page, 30);
  });

  it('should clamp perPage to minimum 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleRepos);
    await execute({ action: 'list_repos', owner: 'o', perPage: -5 }, context);
    assert.equal(calls[0].opts.params.per_page, 1);
  });
});
