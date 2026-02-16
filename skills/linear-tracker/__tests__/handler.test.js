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
 * from its .graphql() method.
 */
function mockContext(graphqlResponse, config) {
  return {
    providerClient: {
      graphql: async (_query, _variables, _opts) => graphqlResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .graphql() tracks calls and returns data.
 */
function mockContextWithSpy(graphqlResponse) {
  const calls = [];
  return {
    context: {
      providerClient: {
        graphql: async (query, variables, opts) => {
          calls.push({ query, variables, opts });
          return graphqlResponse;
        },
      },
      config: { timeoutMs: 5000 },
    },
    calls,
  };
}

/**
 * Build a mock context where .graphql() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      graphql: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .graphql() throws an AbortError.
 */
function mockContextTimeout() {
  return {
    providerClient: {
      graphql: async (_query, _variables, _opts) => {
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

const sampleCreatedIssue = {
  issueCreate: {
    success: true,
    issue: {
      id: 'issue-001',
      identifier: 'ENG-42',
      title: 'Fix login page',
      url: 'https://linear.app/team/issue/ENG-42',
      state: { name: 'Todo' },
      priority: 1,
      assignee: { name: 'Jane Doe' },
    },
  },
};

const sampleUpdatedIssue = {
  issueUpdate: {
    success: true,
    issue: {
      id: 'issue-001',
      identifier: 'ENG-42',
      title: 'Fix login page (updated)',
      url: 'https://linear.app/team/issue/ENG-42',
      state: { name: 'In Progress' },
      priority: 2,
      assignee: { name: 'Jane Doe' },
    },
  },
};

const sampleIssuesList = {
  issues: {
    nodes: [
      {
        id: 'issue-001',
        identifier: 'ENG-1',
        title: 'First issue',
        state: { name: 'Todo' },
        priority: 2,
        assignee: { name: 'Alice' },
        createdAt: '2025-01-15T10:00:00Z',
        url: 'https://linear.app/team/issue/ENG-1',
      },
      {
        id: 'issue-002',
        identifier: 'ENG-2',
        title: 'Second issue',
        state: { name: 'Done' },
        priority: 4,
        assignee: null,
        createdAt: '2025-01-16T12:00:00Z',
        url: 'https://linear.app/team/issue/ENG-2',
      },
    ],
  },
};

const sampleIssue = {
  issue: {
    id: 'issue-001',
    identifier: 'ENG-42',
    title: 'Fix login page',
    description: 'Login page returns 500 error.',
    state: { name: 'In Progress' },
    priority: 1,
    assignee: { name: 'Jane Doe' },
    creator: { name: 'John Smith' },
    labels: { nodes: [{ name: 'bug' }, { name: 'urgent' }] },
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-16T12:00:00Z',
    url: 'https://linear.app/team/issue/ENG-42',
    team: { name: 'Engineering' },
  },
};

const sampleCreatedProject = {
  projectCreate: {
    success: true,
    project: {
      id: 'proj-001',
      name: 'Q1 Sprint',
      description: 'Q1 deliverables',
      url: 'https://linear.app/team/project/q1-sprint',
      state: 'planned',
    },
  },
};

const sampleProjectsList = {
  projects: {
    nodes: [
      {
        id: 'proj-001',
        name: 'Q1 Sprint',
        description: 'Q1 deliverables',
        state: 'planned',
        url: 'https://linear.app/team/project/q1-sprint',
        startDate: '2025-01-01',
        targetDate: '2025-03-31',
      },
      {
        id: 'proj-002',
        name: 'Q2 Sprint',
        description: null,
        state: 'started',
        url: 'https://linear.app/team/project/q2-sprint',
        startDate: '2025-04-01',
        targetDate: '2025-06-30',
      },
    ],
  },
};

const sampleComment = {
  commentCreate: {
    success: true,
    comment: {
      id: 'comment-001',
      body: 'Great work!',
      createdAt: '2025-02-01T08:00:00Z',
      user: { name: 'Alice' },
    },
  },
};

const sampleSearchResults = {
  searchIssues: {
    nodes: [
      {
        id: 'issue-001',
        identifier: 'ENG-1',
        title: 'Login bug',
        state: { name: 'Todo' },
        priority: 1,
        assignee: { name: 'Alice' },
        url: 'https://linear.app/team/issue/ENG-1',
      },
      {
        id: 'issue-003',
        identifier: 'ENG-3',
        title: 'Login performance',
        state: { name: 'In Progress' },
        priority: 3,
        assignee: null,
        url: 'https://linear.app/team/issue/ENG-3',
      },
    ],
  },
};

const sampleCreatedCycle = {
  cycleCreate: {
    success: true,
    cycle: {
      id: 'cycle-001',
      name: 'Sprint 1',
      number: 1,
      startsAt: '2025-01-06',
      endsAt: '2025-01-20',
      url: 'https://linear.app/team/cycle/1',
    },
  },
};

const sampleCyclesList = {
  cycles: {
    nodes: [
      {
        id: 'cycle-001',
        name: 'Sprint 1',
        number: 1,
        startsAt: '2025-01-06',
        endsAt: '2025-01-20',
        url: 'https://linear.app/team/cycle/1',
      },
      {
        id: 'cycle-002',
        name: null,
        number: 2,
        startsAt: '2025-01-20',
        endsAt: '2025-02-03',
        url: 'https://linear.app/team/cycle/2',
      },
    ],
  },
};

const sampleCycle = {
  cycle: {
    id: 'cycle-001',
    name: 'Sprint 1',
    number: 1,
    startsAt: '2025-01-06',
    endsAt: '2025-01-20',
    url: 'https://linear.app/team/cycle/1',
    issues: {
      nodes: [
        { id: 'issue-001', identifier: 'ENG-1', title: 'First issue', state: { name: 'Todo' } },
        { id: 'issue-002', identifier: 'ENG-2', title: 'Second issue', state: { name: 'Done' } },
      ],
    },
  },
};

const sampleAddIssueToCycle = {
  issueUpdate: {
    success: true,
    issue: {
      id: 'issue-001',
      identifier: 'ENG-1',
      title: 'First issue',
      cycle: { id: 'cycle-001', name: 'Sprint 1' },
    },
  },
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('linear-tracker: action validation', () => {
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
    assert.ok(result.result.includes('create_issue'));
    assert.ok(result.result.includes('manage_cycle'));
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all 9 actions
// ---------------------------------------------------------------------------
describe('linear-tracker: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail create_issue without client', async () => {
    const result = await execute({ action: 'create_issue', title: 'Test', teamId: 't1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_issue without client', async () => {
    const result = await execute({ action: 'update_issue', issueId: 'i1', title: 'x' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_issues without client', async () => {
    const result = await execute({ action: 'list_issues' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_issue without client', async () => {
    const result = await execute({ action: 'get_issue', issueId: 'i1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_project without client', async () => {
    const result = await execute({ action: 'create_project', name: 'P', teamIds: ['t1'] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_projects without client', async () => {
    const result = await execute({ action: 'list_projects' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail add_comment without client', async () => {
    const result = await execute({ action: 'add_comment', issueId: 'i1', body: 'Hi' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_issues without client', async () => {
    const result = await execute({ action: 'search_issues', query: 'bug' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail manage_cycle create without client', async () => {
    const result = await execute({
      action: 'manage_cycle', subAction: 'create',
      teamId: 't1', startsAt: '2025-01-01', endsAt: '2025-01-14',
    }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail manage_cycle list without client', async () => {
    const result = await execute({ action: 'manage_cycle', subAction: 'list' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail manage_cycle get without client', async () => {
    const result = await execute({ action: 'manage_cycle', subAction: 'get', cycleId: 'c1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail manage_cycle add_issue without client', async () => {
    const result = await execute({
      action: 'manage_cycle', subAction: 'add_issue',
      cycleId: 'c1', issueId: 'i1',
    }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. create_issue action
// ---------------------------------------------------------------------------
describe('linear-tracker: create_issue', () => {
  beforeEach(() => {});

  it('should create an issue successfully', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({
      action: 'create_issue', title: 'Fix login page', teamId: 'team-001',
      priority: 1, description: 'Details here',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.identifier, 'ENG-42');
    assert.equal(result.metadata.title, 'Fix login page');
    assert.ok(result.result.includes('ENG-42'));
  });

  it('should reject missing title', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', teamId: 'team-001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TITLE');
  });

  it('should reject missing teamId', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', title: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEAM_ID');
  });

  it('should pass correct variables to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedIssue);
    await execute({
      action: 'create_issue', title: 'Test', teamId: 'team-001',
      description: 'desc', priority: 2, assigneeId: 'user-001',
      stateId: 'state-001', labelIds: ['label-001'],
    }, context);
    assert.equal(calls.length, 1);
    const vars = calls[0].variables;
    assert.equal(vars.input.title, 'Test');
    assert.equal(vars.input.teamId, 'team-001');
    assert.equal(vars.input.description, 'desc');
    assert.equal(vars.input.priority, 2);
    assert.equal(vars.input.assigneeId, 'user-001');
    assert.equal(vars.input.stateId, 'state-001');
    assert.deepEqual(vars.input.labelIds, ['label-001']);
  });

  it('should not include optional fields when not provided', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedIssue);
    await execute({ action: 'create_issue', title: 'Test', teamId: 'team-001' }, context);
    const vars = calls[0].variables;
    assert.equal(vars.input.description, undefined);
    assert.equal(vars.input.priority, undefined);
    assert.equal(vars.input.assigneeId, undefined);
  });

  it('should handle API returning success: false', async () => {
    const ctx = mockContext({ issueCreate: { success: false, issue: null } });
    const result = await execute({ action: 'create_issue', title: 'Test', teamId: 't1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'CREATE_FAILED');
  });

  it('should include url in metadata', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', title: 'Test', teamId: 't1' }, ctx);
    assert.equal(result.metadata.url, 'https://linear.app/team/issue/ENG-42');
  });

  it('should include priority in metadata', async () => {
    const ctx = mockContext(sampleCreatedIssue);
    const result = await execute({ action: 'create_issue', title: 'Test', teamId: 't1' }, ctx);
    assert.equal(result.metadata.priority, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. update_issue action
// ---------------------------------------------------------------------------
describe('linear-tracker: update_issue', () => {
  beforeEach(() => {});

  it('should update an issue successfully', async () => {
    const ctx = mockContext(sampleUpdatedIssue);
    const result = await execute({
      action: 'update_issue', issueId: 'issue-001', title: 'Fix login page (updated)',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.identifier, 'ENG-42');
    assert.ok(result.result.includes('ENG-42'));
    assert.ok(result.result.includes('title'));
  });

  it('should reject missing issueId', async () => {
    const ctx = mockContext(sampleUpdatedIssue);
    const result = await execute({ action: 'update_issue', title: 'x' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_ID');
  });

  it('should reject when no update fields are provided', async () => {
    const ctx = mockContext(sampleUpdatedIssue);
    const result = await execute({ action: 'update_issue', issueId: 'issue-001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'NO_UPDATE_FIELDS');
  });

  it('should pass id and input to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedIssue);
    await execute({
      action: 'update_issue', issueId: 'issue-001',
      title: 'New title', priority: 3, stateId: 'state-done',
    }, context);
    assert.equal(calls[0].variables.id, 'issue-001');
    assert.equal(calls[0].variables.input.title, 'New title');
    assert.equal(calls[0].variables.input.priority, 3);
    assert.equal(calls[0].variables.input.stateId, 'state-done');
  });

  it('should include updatedFields in metadata', async () => {
    const ctx = mockContext(sampleUpdatedIssue);
    const result = await execute({
      action: 'update_issue', issueId: 'issue-001',
      title: 'New', priority: 2,
    }, ctx);
    assert.deepEqual(result.metadata.updatedFields, ['title', 'priority']);
  });

  it('should handle API returning success: false', async () => {
    const ctx = mockContext({ issueUpdate: { success: false, issue: null } });
    const result = await execute({ action: 'update_issue', issueId: 'i1', title: 'x' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPDATE_FAILED');
  });

  it('should accept assigneeId as update field', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedIssue);
    await execute({
      action: 'update_issue', issueId: 'issue-001', assigneeId: 'user-002',
    }, context);
    assert.equal(calls[0].variables.input.assigneeId, 'user-002');
  });

  it('should accept description as update field', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedIssue);
    await execute({
      action: 'update_issue', issueId: 'issue-001', description: 'new desc',
    }, context);
    assert.equal(calls[0].variables.input.description, 'new desc');
  });
});

// ---------------------------------------------------------------------------
// 5. list_issues action
// ---------------------------------------------------------------------------
describe('linear-tracker: list_issues', () => {
  beforeEach(() => {});

  it('should list issues successfully', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_issues');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('ENG-1'));
    assert.ok(result.result.includes('ENG-2'));
  });

  it('should handle empty issues list', async () => {
    const ctx = mockContext({ issues: { nodes: [] } });
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No Linear issues'));
  });

  it('should pass filter and limit to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssuesList);
    await execute({
      action: 'list_issues', teamId: 'team-001', stateId: 'state-001',
      assigneeId: 'user-001', limit: 10,
    }, context);
    const vars = calls[0].variables;
    assert.equal(vars.first, 10);
    assert.deepEqual(vars.filter.team, { id: { eq: 'team-001' } });
    assert.deepEqual(vars.filter.state, { id: { eq: 'state-001' } });
    assert.deepEqual(vars.filter.assignee, { id: { eq: 'user-001' } });
  });

  it('should default limit to 25', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssuesList);
    await execute({ action: 'list_issues' }, context);
    assert.equal(calls[0].variables.first, 25);
  });

  it('should not include filter fields when not provided', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssuesList);
    await execute({ action: 'list_issues' }, context);
    const vars = calls[0].variables;
    assert.deepEqual(vars.filter, {});
  });

  it('should include issue metadata with assignee info', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.equal(result.metadata.issues[0].assignee, 'Alice');
    assert.equal(result.metadata.issues[1].assignee, null);
  });

  it('should include priority labels in result text', async () => {
    const ctx = mockContext(sampleIssuesList);
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.ok(result.result.includes('High'));
    assert.ok(result.result.includes('Low'));
  });
});

// ---------------------------------------------------------------------------
// 6. get_issue action
// ---------------------------------------------------------------------------
describe('linear-tracker: get_issue', () => {
  beforeEach(() => {});

  it('should get issue details successfully', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', issueId: 'issue-001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_issue');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.identifier, 'ENG-42');
    assert.equal(result.metadata.title, 'Fix login page');
    assert.equal(result.metadata.state, 'In Progress');
    assert.equal(result.metadata.priority, 1);
    assert.equal(result.metadata.assignee, 'Jane Doe');
    assert.equal(result.metadata.creator, 'John Smith');
    assert.equal(result.metadata.team, 'Engineering');
    assert.ok(result.result.includes('ENG-42'));
    assert.ok(result.result.includes('Fix login page'));
  });

  it('should reject missing issueId', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_ID');
  });

  it('should handle issue not found', async () => {
    const ctx = mockContext({ issue: null });
    const result = await execute({ action: 'get_issue', issueId: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'NOT_FOUND');
  });

  it('should include labels in metadata', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', issueId: 'issue-001' }, ctx);
    assert.deepEqual(result.metadata.labels, ['bug', 'urgent']);
  });

  it('should pass correct id to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssue);
    await execute({ action: 'get_issue', issueId: 'issue-001' }, context);
    assert.equal(calls[0].variables.id, 'issue-001');
  });

  it('should include url in metadata', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', issueId: 'issue-001' }, ctx);
    assert.equal(result.metadata.url, 'https://linear.app/team/issue/ENG-42');
  });

  it('should display priority label in result text', async () => {
    const ctx = mockContext(sampleIssue);
    const result = await execute({ action: 'get_issue', issueId: 'issue-001' }, ctx);
    assert.ok(result.result.includes('Urgent'));
  });

  it('should handle issue with no labels', async () => {
    const noLabels = {
      issue: { ...sampleIssue.issue, labels: { nodes: [] } },
    };
    const ctx = mockContext(noLabels);
    const result = await execute({ action: 'get_issue', issueId: 'issue-001' }, ctx);
    assert.deepEqual(result.metadata.labels, []);
    assert.ok(result.result.includes('None'));
  });

  it('should handle issue with no assignee', async () => {
    const noAssignee = {
      issue: { ...sampleIssue.issue, assignee: null },
    };
    const ctx = mockContext(noAssignee);
    const result = await execute({ action: 'get_issue', issueId: 'issue-001' }, ctx);
    assert.equal(result.metadata.assignee, null);
    assert.ok(result.result.includes('Unassigned'));
  });
});

// ---------------------------------------------------------------------------
// 7. create_project action
// ---------------------------------------------------------------------------
describe('linear-tracker: create_project', () => {
  beforeEach(() => {});

  it('should create a project successfully', async () => {
    const ctx = mockContext(sampleCreatedProject);
    const result = await execute({
      action: 'create_project', name: 'Q1 Sprint',
      teamIds: ['team-001'], description: 'Q1 deliverables',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_project');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.name, 'Q1 Sprint');
    assert.ok(result.result.includes('Q1 Sprint'));
  });

  it('should reject missing name', async () => {
    const ctx = mockContext(sampleCreatedProject);
    const result = await execute({ action: 'create_project', teamIds: ['t1'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_NAME');
  });

  it('should reject missing teamIds', async () => {
    const ctx = mockContext(sampleCreatedProject);
    const result = await execute({ action: 'create_project', name: 'P' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEAM_IDS');
  });

  it('should reject empty teamIds array', async () => {
    const ctx = mockContext(sampleCreatedProject);
    const result = await execute({ action: 'create_project', name: 'P', teamIds: [] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEAM_IDS');
  });

  it('should pass correct variables to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedProject);
    await execute({
      action: 'create_project', name: 'Q1', teamIds: ['t1'],
      description: 'desc', targetDate: '2025-03-31',
    }, context);
    const input = calls[0].variables.input;
    assert.equal(input.name, 'Q1');
    assert.deepEqual(input.teamIds, ['t1']);
    assert.equal(input.description, 'desc');
    assert.equal(input.targetDate, '2025-03-31');
  });

  it('should handle API returning success: false', async () => {
    const ctx = mockContext({ projectCreate: { success: false, project: null } });
    const result = await execute({ action: 'create_project', name: 'P', teamIds: ['t1'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'CREATE_FAILED');
  });

  it('should include url in metadata', async () => {
    const ctx = mockContext(sampleCreatedProject);
    const result = await execute({ action: 'create_project', name: 'Q1', teamIds: ['t1'] }, ctx);
    assert.equal(result.metadata.url, 'https://linear.app/team/project/q1-sprint');
  });
});

// ---------------------------------------------------------------------------
// 8. list_projects action
// ---------------------------------------------------------------------------
describe('linear-tracker: list_projects', () => {
  beforeEach(() => {});

  it('should list projects successfully', async () => {
    const ctx = mockContext(sampleProjectsList);
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_projects');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Q1 Sprint'));
    assert.ok(result.result.includes('Q2 Sprint'));
  });

  it('should handle empty projects list', async () => {
    const ctx = mockContext({ projects: { nodes: [] } });
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No Linear projects'));
  });

  it('should pass limit to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleProjectsList);
    await execute({ action: 'list_projects', limit: 10 }, context);
    assert.equal(calls[0].variables.first, 10);
  });

  it('should default limit to 25', async () => {
    const { context, calls } = mockContextWithSpy(sampleProjectsList);
    await execute({ action: 'list_projects' }, context);
    assert.equal(calls[0].variables.first, 25);
  });

  it('should include project details in metadata', async () => {
    const ctx = mockContext(sampleProjectsList);
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.projects[0].name, 'Q1 Sprint');
    assert.equal(result.metadata.projects[0].state, 'planned');
    assert.equal(result.metadata.projects[1].description, null);
  });
});

// ---------------------------------------------------------------------------
// 9. add_comment action
// ---------------------------------------------------------------------------
describe('linear-tracker: add_comment', () => {
  beforeEach(() => {});

  it('should add a comment successfully', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({
      action: 'add_comment', issueId: 'issue-001', body: 'Great work!',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'add_comment');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.issueId, 'issue-001');
    assert.equal(result.metadata.commentId, 'comment-001');
    assert.ok(result.result.includes('comment-001'));
  });

  it('should reject missing issueId', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({ action: 'add_comment', body: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_ID');
  });

  it('should reject missing body', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({ action: 'add_comment', issueId: 'issue-001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BODY');
  });

  it('should pass correct variables to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleComment);
    await execute({ action: 'add_comment', issueId: 'issue-001', body: 'Hello' }, context);
    const vars = calls[0].variables;
    assert.equal(vars.input.issueId, 'issue-001');
    assert.equal(vars.input.body, 'Hello');
  });

  it('should handle API returning success: false', async () => {
    const ctx = mockContext({ commentCreate: { success: false, comment: null } });
    const result = await execute({ action: 'add_comment', issueId: 'i1', body: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'CREATE_FAILED');
  });
});

// ---------------------------------------------------------------------------
// 10. search_issues action
// ---------------------------------------------------------------------------
describe('linear-tracker: search_issues', () => {
  beforeEach(() => {});

  it('should search issues successfully', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_issues', query: 'login' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_issues');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.query, 'login');
    assert.ok(result.result.includes('ENG-1'));
    assert.ok(result.result.includes('ENG-3'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_issues' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_QUERY');
  });

  it('should handle empty search results', async () => {
    const ctx = mockContext({ searchIssues: { nodes: [] } });
    const result = await execute({ action: 'search_issues', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No issues found'));
  });

  it('should pass query and limit to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_issues', query: 'login', limit: 10 }, context);
    assert.equal(calls[0].variables.query, 'login');
    assert.equal(calls[0].variables.first, 10);
  });

  it('should default limit to 25', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_issues', query: 'login' }, context);
    assert.equal(calls[0].variables.first, 25);
  });

  it('should include issue metadata', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_issues', query: 'login' }, ctx);
    assert.equal(result.metadata.issues[0].identifier, 'ENG-1');
    assert.equal(result.metadata.issues[0].assignee, 'Alice');
    assert.equal(result.metadata.issues[1].assignee, null);
  });
});

// ---------------------------------------------------------------------------
// 11. manage_cycle: subAction validation
// ---------------------------------------------------------------------------
describe('linear-tracker: manage_cycle subAction validation', () => {
  beforeEach(() => {});

  it('should reject invalid subAction', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'manage_cycle', subAction: 'invalid' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SUB_ACTION');
  });

  it('should reject missing subAction', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'manage_cycle' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SUB_ACTION');
  });

  it('should list valid sub-actions in error message', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'manage_cycle', subAction: 'bad' }, ctx);
    assert.ok(result.result.includes('create'));
    assert.ok(result.result.includes('list'));
    assert.ok(result.result.includes('get'));
    assert.ok(result.result.includes('add_issue'));
  });
});

// ---------------------------------------------------------------------------
// 12. manage_cycle: create
// ---------------------------------------------------------------------------
describe('linear-tracker: manage_cycle create', () => {
  beforeEach(() => {});

  it('should create a cycle successfully', async () => {
    const ctx = mockContext(sampleCreatedCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'create',
      teamId: 'team-001', startsAt: '2025-01-06', endsAt: '2025-01-20', name: 'Sprint 1',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'manage_cycle');
    assert.equal(result.metadata.subAction, 'create');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.name, 'Sprint 1');
    assert.ok(result.result.includes('Sprint 1'));
  });

  it('should reject missing teamId', async () => {
    const ctx = mockContext(sampleCreatedCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'create',
      startsAt: '2025-01-06', endsAt: '2025-01-20',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEAM_ID');
  });

  it('should reject missing startsAt', async () => {
    const ctx = mockContext(sampleCreatedCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'create',
      teamId: 't1', endsAt: '2025-01-20',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_STARTS_AT');
  });

  it('should reject missing endsAt', async () => {
    const ctx = mockContext(sampleCreatedCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'create',
      teamId: 't1', startsAt: '2025-01-06',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ENDS_AT');
  });

  it('should pass correct variables to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedCycle);
    await execute({
      action: 'manage_cycle', subAction: 'create',
      teamId: 'team-001', startsAt: '2025-01-06', endsAt: '2025-01-20', name: 'Sprint 1',
    }, context);
    const input = calls[0].variables.input;
    assert.equal(input.teamId, 'team-001');
    assert.equal(input.startsAt, '2025-01-06');
    assert.equal(input.endsAt, '2025-01-20');
    assert.equal(input.name, 'Sprint 1');
  });

  it('should handle API returning success: false', async () => {
    const ctx = mockContext({ cycleCreate: { success: false, cycle: null } });
    const result = await execute({
      action: 'manage_cycle', subAction: 'create',
      teamId: 't1', startsAt: '2025-01-06', endsAt: '2025-01-20',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'CREATE_FAILED');
  });

  it('should create cycle without optional name', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedCycle);
    await execute({
      action: 'manage_cycle', subAction: 'create',
      teamId: 'team-001', startsAt: '2025-01-06', endsAt: '2025-01-20',
    }, context);
    assert.equal(calls[0].variables.input.name, undefined);
  });
});

// ---------------------------------------------------------------------------
// 13. manage_cycle: list
// ---------------------------------------------------------------------------
describe('linear-tracker: manage_cycle list', () => {
  beforeEach(() => {});

  it('should list cycles successfully', async () => {
    const ctx = mockContext(sampleCyclesList);
    const result = await execute({ action: 'manage_cycle', subAction: 'list' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'manage_cycle');
    assert.equal(result.metadata.subAction, 'list');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Sprint 1'));
    assert.ok(result.result.includes('Cycle 2'));
  });

  it('should handle empty cycles list', async () => {
    const ctx = mockContext({ cycles: { nodes: [] } });
    const result = await execute({ action: 'manage_cycle', subAction: 'list' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No Linear cycles'));
  });

  it('should pass limit to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleCyclesList);
    await execute({ action: 'manage_cycle', subAction: 'list', limit: 5 }, context);
    assert.equal(calls[0].variables.first, 5);
  });

  it('should default limit to 25', async () => {
    const { context, calls } = mockContextWithSpy(sampleCyclesList);
    await execute({ action: 'manage_cycle', subAction: 'list' }, context);
    assert.equal(calls[0].variables.first, 25);
  });
});

// ---------------------------------------------------------------------------
// 14. manage_cycle: get
// ---------------------------------------------------------------------------
describe('linear-tracker: manage_cycle get', () => {
  beforeEach(() => {});

  it('should get cycle details successfully', async () => {
    const ctx = mockContext(sampleCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'get', cycleId: 'cycle-001',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'manage_cycle');
    assert.equal(result.metadata.subAction, 'get');
    assert.equal(result.metadata.cycleId, 'cycle-001');
    assert.equal(result.metadata.name, 'Sprint 1');
    assert.equal(result.metadata.issueCount, 2);
    assert.ok(result.result.includes('Sprint 1'));
    assert.ok(result.result.includes('ENG-1'));
    assert.ok(result.result.includes('ENG-2'));
  });

  it('should reject missing cycleId', async () => {
    const ctx = mockContext(sampleCycle);
    const result = await execute({ action: 'manage_cycle', subAction: 'get' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CYCLE_ID');
  });

  it('should handle cycle not found', async () => {
    const ctx = mockContext({ cycle: null });
    const result = await execute({
      action: 'manage_cycle', subAction: 'get', cycleId: 'nonexistent',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'NOT_FOUND');
  });

  it('should pass correct id to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleCycle);
    await execute({
      action: 'manage_cycle', subAction: 'get', cycleId: 'cycle-001',
    }, context);
    assert.equal(calls[0].variables.id, 'cycle-001');
  });

  it('should handle cycle with no issues', async () => {
    const emptyCycle = {
      cycle: { ...sampleCycle.cycle, issues: { nodes: [] } },
    };
    const ctx = mockContext(emptyCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'get', cycleId: 'cycle-001',
    }, ctx);
    assert.equal(result.metadata.issueCount, 0);
    assert.ok(result.result.includes('No issues'));
  });
});

// ---------------------------------------------------------------------------
// 15. manage_cycle: add_issue
// ---------------------------------------------------------------------------
describe('linear-tracker: manage_cycle add_issue', () => {
  beforeEach(() => {});

  it('should add issue to cycle successfully', async () => {
    const ctx = mockContext(sampleAddIssueToCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'add_issue',
      cycleId: 'cycle-001', issueId: 'issue-001',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'manage_cycle');
    assert.equal(result.metadata.subAction, 'add_issue');
    assert.equal(result.metadata.identifier, 'ENG-1');
    assert.equal(result.metadata.cycleId, 'cycle-001');
    assert.equal(result.metadata.cycleName, 'Sprint 1');
    assert.ok(result.result.includes('ENG-1'));
    assert.ok(result.result.includes('Sprint 1'));
  });

  it('should reject missing cycleId', async () => {
    const ctx = mockContext(sampleAddIssueToCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'add_issue', issueId: 'i1',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CYCLE_ID');
  });

  it('should reject missing issueId', async () => {
    const ctx = mockContext(sampleAddIssueToCycle);
    const result = await execute({
      action: 'manage_cycle', subAction: 'add_issue', cycleId: 'c1',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ISSUE_ID');
  });

  it('should pass correct variables to graphql', async () => {
    const { context, calls } = mockContextWithSpy(sampleAddIssueToCycle);
    await execute({
      action: 'manage_cycle', subAction: 'add_issue',
      cycleId: 'cycle-001', issueId: 'issue-001',
    }, context);
    assert.equal(calls[0].variables.id, 'issue-001');
    assert.equal(calls[0].variables.input.cycleId, 'cycle-001');
  });

  it('should handle API returning success: false', async () => {
    const ctx = mockContext({ issueUpdate: { success: false, issue: null } });
    const result = await execute({
      action: 'manage_cycle', subAction: 'add_issue',
      cycleId: 'c1', issueId: 'i1',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPDATE_FAILED');
  });
});

// ---------------------------------------------------------------------------
// 16. Timeout handling
// ---------------------------------------------------------------------------
describe('linear-tracker: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error for create_issue', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'create_issue', title: 'Test', teamId: 't1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error for list_issues', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error for get_issue', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_issue', issueId: 'i1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error for search_issues', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_issues', query: 'bug' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error for list_projects', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error for manage_cycle list', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'manage_cycle', subAction: 'list' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 17. Network error handling
// ---------------------------------------------------------------------------
describe('linear-tracker: network errors', () => {
  beforeEach(() => {});

  it('should return GRAPHQL_ERROR on network failure for list_issues', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'GRAPHQL_ERROR');
  });

  it('should return GRAPHQL_ERROR on network failure for create_issue', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'create_issue', title: 'Bug', teamId: 't1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'GRAPHQL_ERROR');
  });

  it('should return GRAPHQL_ERROR on network failure for get_issue', async () => {
    const ctx = mockContextError(new Error('Network error'));
    const result = await execute({ action: 'get_issue', issueId: 'i1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'GRAPHQL_ERROR');
  });

  it('should return GRAPHQL_ERROR on network failure for add_comment', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'add_comment', issueId: 'i1', body: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'GRAPHQL_ERROR');
  });

  it('should return GRAPHQL_ERROR on network failure for search_issues', async () => {
    const ctx = mockContextError(new Error('Connection reset'));
    const result = await execute({ action: 'search_issues', query: 'bug' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'GRAPHQL_ERROR');
  });

  it('should return GRAPHQL_ERROR on failure for manage_cycle create', async () => {
    const ctx = mockContextError(new Error('Timeout'));
    const result = await execute({
      action: 'manage_cycle', subAction: 'create',
      teamId: 't1', startsAt: '2025-01-06', endsAt: '2025-01-20',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'GRAPHQL_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 18. getClient helper
// ---------------------------------------------------------------------------
describe('linear-tracker: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient', () => {
    const result = getClient({
      providerClient: { graphql: () => {} },
      gatewayClient: { graphql: () => {} },
    });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { graphql: () => {} } });
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

  it('should return client object when providerClient is present', () => {
    const mockClient = { graphql: () => {} };
    const result = getClient({ providerClient: mockClient });
    assert.equal(result.client, mockClient);
  });
});

// ---------------------------------------------------------------------------
// 19. redactSensitive
// ---------------------------------------------------------------------------
describe('linear-tracker: redactSensitive', () => {
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

  it('should redact Linear API tokens', () => {
    const input = 'Using lin_api_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh for auth';
    const output = redactSensitive(input);
    assert.ok(!output.includes('lin_api_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'ENG-42 has status In Progress';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: abc123token';
    const output = redactSensitive(input);
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact password patterns', () => {
    const input = 'password=mysecret123';
    const output = redactSensitive(input);
    assert.ok(output.includes('[REDACTED]'));
  });
});

// ---------------------------------------------------------------------------
// 20. sanitizeString
// ---------------------------------------------------------------------------
describe('linear-tracker: sanitizeString', () => {
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

  it('should handle empty string', () => {
    assert.equal(sanitizeString(''), '');
  });

  it('should preserve normal characters', () => {
    assert.equal(sanitizeString('Hello World! 123'), 'Hello World! 123');
  });
});

// ---------------------------------------------------------------------------
// 21. L1 compliance - no hardcoded URLs
// ---------------------------------------------------------------------------
describe('linear-tracker: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded Linear URLs in graphql queries', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssuesList);
    await execute({ action: 'list_issues' }, context);
    for (const call of calls) {
      assert.ok(!call.query.includes('https://'), 'Query must not contain https://');
      assert.ok(!call.query.includes('api.linear.app'), 'Query must not contain api.linear.app');
    }
  });

  it('should use graphql method not fetch for all operations', async () => {
    const calls = [];
    const ctx = {
      providerClient: {
        graphql: async (query, variables, opts) => {
          calls.push({ query, variables });
          return sampleIssuesList;
        },
        fetch: async () => {
          throw new Error('fetch should not be called');
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_issues' }, ctx);
    assert.equal(calls.length, 1);
  });

  it('should use graphql for create operations', async () => {
    const calls = [];
    const ctx = {
      providerClient: {
        graphql: async (query, variables, opts) => {
          calls.push({ query, variables });
          return sampleCreatedIssue;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'create_issue', title: 'Test', teamId: 't1' }, ctx);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].query.includes('IssueCreate'));
  });
});

// ---------------------------------------------------------------------------
// 22. Limit clamping
// ---------------------------------------------------------------------------
describe('linear-tracker: limit clamping', () => {
  beforeEach(() => {});

  it('should clamp limit to max 100', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssuesList);
    await execute({ action: 'list_issues', limit: 500 }, context);
    assert.equal(calls[0].variables.first, 100);
  });

  it('should use default limit of 25', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssuesList);
    await execute({ action: 'list_issues' }, context);
    assert.equal(calls[0].variables.first, 25);
  });

  it('should clamp limit to min 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssuesList);
    await execute({ action: 'list_issues', limit: -5 }, context);
    assert.equal(calls[0].variables.first, 1);
  });

  it('should floor fractional limits', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssuesList);
    await execute({ action: 'list_issues', limit: 10.7 }, context);
    assert.equal(calls[0].variables.first, 10);
  });

  it('should clamp limit for search_issues', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search_issues', query: 'bug', limit: 200 }, context);
    assert.equal(calls[0].variables.first, 100);
  });

  it('should clamp limit for list_projects', async () => {
    const { context, calls } = mockContextWithSpy(sampleProjectsList);
    await execute({ action: 'list_projects', limit: 200 }, context);
    assert.equal(calls[0].variables.first, 100);
  });

  it('should clamp limit for manage_cycle list', async () => {
    const { context, calls } = mockContextWithSpy(sampleCyclesList);
    await execute({ action: 'manage_cycle', subAction: 'list', limit: 200 }, context);
    assert.equal(calls[0].variables.first, 100);
  });
});

// ---------------------------------------------------------------------------
// 23. Gateway client fallback
// ---------------------------------------------------------------------------
describe('linear-tracker: gateway client fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    const calls = [];
    const ctx = {
      gatewayClient: {
        graphql: async (query, variables, opts) => {
          calls.push({ query, variables });
          return sampleIssuesList;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calls.length, 1);
  });

  it('should prefer providerClient over gatewayClient', async () => {
    const providerCalls = [];
    const gatewayCalls = [];
    const ctx = {
      providerClient: {
        graphql: async (query, variables, opts) => {
          providerCalls.push({ query });
          return sampleIssuesList;
        },
      },
      gatewayClient: {
        graphql: async (query, variables, opts) => {
          gatewayCalls.push({ query });
          return sampleIssuesList;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_issues' }, ctx);
    assert.equal(providerCalls.length, 1);
    assert.equal(gatewayCalls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 24. Edge cases
// ---------------------------------------------------------------------------
describe('linear-tracker: edge cases', () => {
  beforeEach(() => {});

  it('should handle null response from graphql for list_issues', async () => {
    const ctx = mockContext({ issues: { nodes: null } });
    const result = await execute({ action: 'list_issues' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should handle undefined nodes for list_projects', async () => {
    const ctx = mockContext({ projects: {} });
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should handle undefined nodes for search_issues', async () => {
    const ctx = mockContext({ searchIssues: {} });
    const result = await execute({ action: 'search_issues', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should sanitize title with control characters for create_issue', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedIssue);
    await execute({
      action: 'create_issue', title: 'Bug\x00Fix\x07Test', teamId: 'team-001',
    }, context);
    assert.equal(calls[0].variables.input.title, 'BugFixTest');
  });

  it('should sanitize issueId with whitespace', async () => {
    const { context, calls } = mockContextWithSpy(sampleIssue);
    await execute({ action: 'get_issue', issueId: '  issue-001  ' }, context);
    assert.equal(calls[0].variables.id, 'issue-001');
  });

  it('should handle missing fields gracefully in get_issue response', async () => {
    const minimalIssue = {
      issue: {
        id: 'issue-001',
        identifier: 'ENG-1',
        title: 'Minimal',
        description: null,
        state: null,
        priority: null,
        assignee: null,
        creator: null,
        labels: null,
        createdAt: null,
        updatedAt: null,
        url: null,
        team: null,
      },
    };
    const ctx = mockContext(minimalIssue);
    const result = await execute({ action: 'get_issue', issueId: 'issue-001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.state, null);
    assert.equal(result.metadata.assignee, null);
    assert.equal(result.metadata.creator, null);
    assert.equal(result.metadata.team, null);
    assert.deepEqual(result.metadata.labels, []);
    assert.ok(result.result.includes('No description'));
    assert.ok(result.result.includes('Unassigned'));
    assert.ok(result.result.includes('N/A'));
  });

  it('should handle cycle with null name in list', async () => {
    const ctx = mockContext(sampleCyclesList);
    const result = await execute({ action: 'manage_cycle', subAction: 'list' }, ctx);
    assert.ok(result.result.includes('Cycle 2'));
  });
});
