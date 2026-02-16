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

const sampleProjects = [
  { key: 'PROJ', name: 'Project Alpha', id: '10001', projectTypeKey: 'software' },
  { key: 'DEV', name: 'Development', id: '10002', projectTypeKey: 'business' },
];

const sampleIssue = {
  key: 'PROJ-123',
  fields: {
    summary: 'Fix login page',
    status: { name: 'In Progress' },
    issuetype: { name: 'Bug' },
    priority: { name: 'High' },
    assignee: { displayName: 'Jane Doe', accountId: 'abc123' },
    reporter: { displayName: 'John Smith' },
    labels: ['bug', 'urgent'],
    created: '2025-01-15T10:00:00.000+0000',
    updated: '2025-01-16T12:00:00.000+0000',
    description: 'Login page returns 500 error.',
  },
};

const sampleCreatedIssue = {
  id: '10042',
  key: 'PROJ-124',
  self: 'https://mysite.atlassian.net/rest/api/3/issue/10042',
};

const sampleSearchResults = {
  total: 42,
  issues: [
    {
      key: 'PROJ-1',
      fields: {
        summary: 'First issue',
        status: { name: 'Open' },
        assignee: { displayName: 'Alice' },
        priority: { name: 'Medium' },
      },
    },
    {
      key: 'PROJ-2',
      fields: {
        summary: 'Second issue',
        status: { name: 'Done' },
        assignee: null,
        priority: { name: 'Low' },
      },
    },
  ],
};

const sampleTransitions = {
  transitions: [
    { id: '11', name: 'To Do', to: { name: 'To Do' } },
    { id: '21', name: 'In Progress', to: { name: 'In Progress' } },
    { id: '31', name: 'Done', to: { name: 'Done' } },
  ],
};

const sampleComment = {
  id: '10050',
  body: { type: 'doc', version: 1, content: [] },
  created: '2025-02-01T08:00:00.000+0000',
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('jira-manager: action validation', () => {
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
// 2. PROVIDER_NOT_CONFIGURED for all 9 actions
// ---------------------------------------------------------------------------
describe('jira-manager: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail list_projects without client', async () => {
    const result = await execute({ action: 'list_projects' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_issue without client', async () => {
    const result = await execute({ action: 'get_issue', issueKey: 'PROJ-123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_issue without client', async () => {
    const result = await execute({ action: 'create_issue', projectKey: 'PROJ', summary: 'Test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_issue without client', async () => {
    const result = await execute({ action: 'update_issue', issueKey: 'PROJ-123', fields: { summary: 'x' } }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail transition_issue without client', async () => {
    const result = await execute({ action: 'transition_issue', issueKey: 'PROJ-123', transitionId: '31' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_issues without client', async () => {
    const result = await execute({ action: 'search_issues', jql: 'project = PROJ' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail add_comment without client', async () => {
    const result = await execute({ action: 'add_comment', issueKey: 'PROJ-123', body: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_transitions without client', async () => {
    const result = await execute({ action: 'list_transitions', issueKey: 'PROJ-123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail assign_issue without client', async () => {
    const result = await execute({ action: 'assign_issue', issueKey: 'PROJ-123', accountId: 'abc' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. list_projects action
// ---------------------------------------------------------------------------
describe('jira-manager: list_projects', () => {
  beforeEach(() => {});

  it('should list projects successfully', async () => {
    const ctx = mockContext(sampleProjects);
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_projects');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('PROJ'));
    assert.ok(result.result.includes('Project Alpha'));
  });

  it('should handle empty project list', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No Jira projects'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleProjects);
    await execute({ action: 'list_projects' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/project');
  });
});

// ---------------------------------------------------------------------------
// 4. get_issue action
// ---------------------------------------------------------------------------
describe('jira-manager: get_issue', () => {
  beforeEach(() => {});

  it('should get issue details successfully', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueKey, 'PROJ-123');
    assert.equal(result.metadata.summary, 'Fix login page');
    assert.equal(result.metadata.status, 'In Progress');
    assert.equal(result.metadata.issueType, 'Bug');
    assert.equal(result.metadata.priority, 'High');
    assert.ok(result.result.includes('PROJ-123'));
    assert.ok(result.result.includes('Fix login page'));
  });

  it('should reject missing issueKey', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_KEY');
  });

  it('should call the correct endpoint with issue key', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssue);
    await execute({ action: 'get_issue', issueKey: 'PROJ-123' }, context);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/issue/PROJ-123');
  });

  it('should include labels in metadata', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', issueKey: 'PROJ-123' }, ctx);
    assert.deepEqual(result.metadata.labels, ['bug', 'urgent']);
  });
});

// ---------------------------------------------------------------------------
// 5. create_issue action
// ---------------------------------------------------------------------------
describe('jira-manager: create_issue', () => {
  beforeEach(() => {});

  it('should create an issue successfully', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({
      action: 'create_issue', projectKey: 'PROJ', summary: 'New bug',
      issueType: 'Bug', description: 'Details here', priority: 'High',
      labels: ['bug'],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueKey, 'PROJ-124');
    assert.equal(result.metadata.summary, 'New bug');
    assert.ok(result.result.includes('PROJ-124'));
  });

  it('should reject missing projectKey', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', summary: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PROJECT_KEY');
  });

  it('should reject missing summary', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', projectKey: 'PROJ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_SUMMARY');
  });

  it('should use POST method for creating issues', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedIssue);
    await execute({ action: 'create_issue', projectKey: 'PROJ', summary: 'Test' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedIssue);
    await execute({ action: 'create_issue', projectKey: 'PROJ', summary: 'Test' }, context);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/issue');
  });

  it('should default issueType to Task', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedIssue);
    await execute({ action: 'create_issue', projectKey: 'PROJ', summary: 'Test' }, context);
    assert.equal(calls[0].opts.body.fields.issuetype.name, 'Task');
  });

  it('should include priority when provided', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedIssue);
    await execute({ action: 'create_issue', projectKey: 'PROJ', summary: 'Test', priority: 'High' }, context);
    assert.equal(calls[0].opts.body.fields.priority.name, 'High');
  });
});

// ---------------------------------------------------------------------------
// 6. update_issue action
// ---------------------------------------------------------------------------
describe('jira-manager: update_issue', () => {
  beforeEach(() => {});

  it('should update an issue successfully', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({
      action: 'update_issue', issueKey: 'PROJ-123',
      fields: { summary: 'Updated summary' },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueKey, 'PROJ-123');
    assert.ok(result.result.includes('PROJ-123'));
    assert.ok(result.result.includes('summary'));
  });

  it('should reject missing issueKey', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'update_issue', fields: { summary: 'x' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_KEY');
  });

  it('should reject missing fields', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'update_issue', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_FIELDS');
  });

  it('should reject array fields', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'update_issue', issueKey: 'PROJ-123', fields: ['bad'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_FIELDS');
  });

  it('should use PUT method', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'update_issue', issueKey: 'PROJ-123', fields: { summary: 'x' } }, context);
    assert.equal(calls[0].opts.method, 'PUT');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'update_issue', issueKey: 'PROJ-123', fields: { summary: 'x' } }, context);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/issue/PROJ-123');
  });

  it('should include updated field names in metadata', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({
      action: 'update_issue', issueKey: 'PROJ-123',
      fields: { summary: 'x', priority: { name: 'Low' } },
    }, ctx);
    assert.deepEqual(result.metadata.updatedFields, ['summary', 'priority']);
  });
});

// ---------------------------------------------------------------------------
// 7. transition_issue action
// ---------------------------------------------------------------------------
describe('jira-manager: transition_issue', () => {
  beforeEach(() => {});

  it('should transition an issue successfully', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({
      action: 'transition_issue', issueKey: 'PROJ-123', transitionId: '31',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'transition_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueKey, 'PROJ-123');
    assert.equal(result.metadata.transitionId, '31');
    assert.ok(result.result.includes('transitioned'));
  });

  it('should reject missing issueKey', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'transition_issue', transitionId: '31' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_KEY');
  });

  it('should reject missing transitionId', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'transition_issue', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TRANSITION_ID');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'transition_issue', issueKey: 'PROJ-123', transitionId: '31' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'transition_issue', issueKey: 'PROJ-123', transitionId: '31' }, context);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/issue/PROJ-123/transitions');
  });
});

// ---------------------------------------------------------------------------
// 8. search_issues action
// ---------------------------------------------------------------------------
describe('jira-manager: search_issues', () => {
  beforeEach(() => {});

  it('should search issues successfully', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_issues', jql: 'project = PROJ' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_issues');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.total, 42);
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('PROJ-1'));
    assert.ok(result.result.includes('PROJ-2'));
  });

  it('should reject missing jql', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_issues' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_JQL');
  });

  it('should handle empty search results', async () => {
    const ctx = mockContext({ total: 0, issues: [] });
    const result = await execute({ action: 'search_issues', jql: 'project = EMPTY' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.total, 0);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No issues found'));
  });

  it('should pass jql and maxResults to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_issues', jql: 'project = PROJ', maxResults: 10 }, context);
    assert.equal(calls[0].opts.params.jql, 'project = PROJ');
    assert.equal(calls[0].opts.params.maxResults, 10);
  });

  it('should default maxResults to 50', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_issues', jql: 'project = PROJ' }, context);
    assert.equal(calls[0].opts.params.maxResults, 50);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_issues', jql: 'project = PROJ' }, context);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/search');
  });
});

// ---------------------------------------------------------------------------
// 9. add_comment action
// ---------------------------------------------------------------------------
describe('jira-manager: add_comment', () => {
  beforeEach(() => {});

  it('should add a comment successfully', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({ action: 'add_comment', issueKey: 'PROJ-123', body: 'Great work!' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'add_comment');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueKey, 'PROJ-123');
    assert.equal(result.metadata.commentId, '10050');
    assert.ok(result.result.includes('PROJ-123'));
  });

  it('should reject missing issueKey', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({ action: 'add_comment', body: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_KEY');
  });

  it('should reject missing body', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({ action: 'add_comment', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BODY');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleComment);
    await execute({ action: 'add_comment', issueKey: 'PROJ-123', body: 'Hello' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleComment);
    await execute({ action: 'add_comment', issueKey: 'PROJ-123', body: 'Hello' }, context);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/issue/PROJ-123/comment');
  });
});

// ---------------------------------------------------------------------------
// 10. list_transitions action
// ---------------------------------------------------------------------------
describe('jira-manager: list_transitions', () => {
  beforeEach(() => {});

  it('should list transitions successfully', async () => {
    const ctx = mockContext(sampleTransitions);
    const result = await execute({ action: 'list_transitions', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_transitions');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 3);
    assert.ok(result.result.includes('To Do'));
    assert.ok(result.result.includes('In Progress'));
    assert.ok(result.result.includes('Done'));
  });

  it('should reject missing issueKey', async () => {
    const ctx = mockContext(sampleTransitions);
    const result = await execute({ action: 'list_transitions' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_KEY');
  });

  it('should handle empty transitions', async () => {
    const ctx = mockContext({ transitions: [] });
    const result = await execute({ action: 'list_transitions', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No transitions'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleTransitions);
    await execute({ action: 'list_transitions', issueKey: 'PROJ-123' }, context);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/issue/PROJ-123/transitions');
  });

  it('should include transition details in metadata', async () => {
    const ctx = mockContext(sampleTransitions);
    const result = await execute({ action: 'list_transitions', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.transitions[0].id, '11');
    assert.equal(result.metadata.transitions[0].name, 'To Do');
    assert.equal(result.metadata.transitions[2].to, 'Done');
  });
});

// ---------------------------------------------------------------------------
// 11. assign_issue action
// ---------------------------------------------------------------------------
describe('jira-manager: assign_issue', () => {
  beforeEach(() => {});

  it('should assign an issue successfully', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({
      action: 'assign_issue', issueKey: 'PROJ-123', accountId: 'abc123',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'assign_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueKey, 'PROJ-123');
    assert.equal(result.metadata.accountId, 'abc123');
    assert.ok(result.result.includes('PROJ-123'));
    assert.ok(result.result.includes('abc123'));
  });

  it('should reject missing issueKey', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'assign_issue', accountId: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_KEY');
  });

  it('should reject missing accountId', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'assign_issue', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ACCOUNT_ID');
  });

  it('should use PUT method', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'assign_issue', issueKey: 'PROJ-123', accountId: 'abc' }, context);
    assert.equal(calls[0].opts.method, 'PUT');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'assign_issue', issueKey: 'PROJ-123', accountId: 'abc' }, context);
    assert.equal(calls[0].endpoint, 'jira/rest/api/3/issue/PROJ-123/assignee');
  });
});

// ---------------------------------------------------------------------------
// 12. Timeout handling
// ---------------------------------------------------------------------------
describe('jira-manager: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for list_projects', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for get_issue', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_issue', issueKey: 'PROJ-123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for search_issues', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_issues', jql: 'project = PROJ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 13. Network error handling
// ---------------------------------------------------------------------------
describe('jira-manager: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for list_projects', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for create_issue', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'create_issue', projectKey: 'PROJ', summary: 'Bug' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 14. getClient helper
// ---------------------------------------------------------------------------
describe('jira-manager: getClient', () => {
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
describe('jira-manager: redactSensitive', () => {
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

  it('should redact Atlassian API tokens', () => {
    const input = 'Using ATATT3xFfGF0sMuHxqKmZ9ABCDEFGHIJKabcdefgh for auth';
    const output = redactSensitive(input);
    assert.ok(!output.includes('ATATT3xFfGF0sMuHxqKmZ9ABCDEFGHIJKabcdefgh'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'PROJ-123 has status In Progress';
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
describe('jira-manager: sanitizeString', () => {
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
describe('jira-manager: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded atlassian URLs in fetch endpoints', async () => {
    const { context, calls } = mockContextWithSpy(sampleProjects);
    await execute({ action: 'list_projects' }, context);
    for (const call of calls) {
      assert.ok(!call.endpoint.includes('https://'), 'Endpoint must not contain https://');
      assert.ok(!call.endpoint.includes('atlassian.net'), 'Endpoint must not contain atlassian.net');
      assert.ok(call.endpoint.startsWith('jira/'), 'Endpoint must start with jira/');
    }
  });

  it('should use jira/ prefix for all API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);

    await execute({ action: 'list_projects' }, context);
    await execute({ action: 'get_issue', issueKey: 'P-1' }, context);
    await execute({ action: 'search_issues', jql: 'project = P' }, context);
    await execute({ action: 'list_transitions', issueKey: 'P-1' }, context);

    assert.ok(calls.length >= 4, `Expected at least 4 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.endpoint.startsWith('jira/'), `Endpoint "${call.endpoint}" must start with jira/`);
    }
  });
});

// ---------------------------------------------------------------------------
// 18. maxResults clamping
// ---------------------------------------------------------------------------
describe('jira-manager: maxResults clamping', () => {
  beforeEach(() => {});

  it('should clamp maxResults to max 100', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_issues', jql: 'project = PROJ', maxResults: 500 }, context);
    assert.equal(calls[0].opts.params.maxResults, 100);
  });

  it('should use default maxResults of 50', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_issues', jql: 'project = PROJ' }, context);
    assert.equal(calls[0].opts.params.maxResults, 50);
  });
});
