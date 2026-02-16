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
  { id: '2203306141', name: 'Inbox', comment_count: 0, color: 'grey', is_favorite: false, url: 'https://todoist.com/showProject?id=2203306141' },
  { id: '2203306142', name: 'Work', comment_count: 3, color: 'blue', is_favorite: true, url: 'https://todoist.com/showProject?id=2203306142' },
];

const sampleProject = {
  id: '2203306142',
  name: 'Work',
  comment_count: 3,
  color: 'blue',
  is_favorite: true,
  url: 'https://todoist.com/showProject?id=2203306142',
};

const sampleCreatedProject = {
  id: '2203306999',
  name: 'New Project',
  color: 'red',
  is_favorite: false,
  url: 'https://todoist.com/showProject?id=2203306999',
};

const sampleTasks = [
  {
    id: '6001',
    content: 'Buy groceries',
    description: 'Milk, eggs, bread',
    priority: 2,
    due: { string: 'tomorrow' },
    labels: ['errands'],
    is_completed: false,
    project_id: '2203306141',
  },
  {
    id: '6002',
    content: 'Write report',
    description: '',
    priority: 4,
    due: { string: 'today' },
    labels: ['work', 'urgent'],
    is_completed: false,
    project_id: '2203306142',
  },
];

const sampleTask = {
  id: '6001',
  content: 'Buy groceries',
  description: 'Milk, eggs, bread',
  priority: 2,
  due: { string: 'tomorrow' },
  labels: ['errands'],
  is_completed: false,
  project_id: '2203306141',
  url: 'https://todoist.com/showTask?id=6001',
};

const sampleCreatedTask = {
  id: '6099',
  content: 'Review PR',
  description: 'Check the new feature branch',
  priority: 3,
  due: { string: 'next Monday' },
  labels: ['work'],
  project_id: '2203306142',
  url: 'https://todoist.com/showTask?id=6099',
};

const sampleUpdatedTask = {
  id: '6001',
  content: 'Buy organic groceries',
  description: 'Organic milk, free-range eggs',
  priority: 3,
  due: { string: 'Friday' },
  labels: ['errands', 'health'],
  url: 'https://todoist.com/showTask?id=6001',
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('todoist-manager: action validation', () => {
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
describe('todoist-manager: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail list_projects without client', async () => {
    const result = await execute({ action: 'list_projects' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_project without client', async () => {
    const result = await execute({ action: 'get_project', projectId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_project without client', async () => {
    const result = await execute({ action: 'create_project', name: 'Test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_tasks without client', async () => {
    const result = await execute({ action: 'list_tasks' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_task without client', async () => {
    const result = await execute({ action: 'get_task', taskId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_task without client', async () => {
    const result = await execute({ action: 'create_task', content: 'Test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_task without client', async () => {
    const result = await execute({ action: 'update_task', taskId: '123', content: 'Updated' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail complete_task without client', async () => {
    const result = await execute({ action: 'complete_task', taskId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail delete_task without client', async () => {
    const result = await execute({ action: 'delete_task', taskId: '123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. list_projects action
// ---------------------------------------------------------------------------
describe('todoist-manager: list_projects', () => {
  beforeEach(() => {});

  it('should list projects successfully', async () => {
    const ctx = mockContext(sampleProjects);
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_projects');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Inbox'));
    assert.ok(result.result.includes('Work'));
  });

  it('should handle empty project list', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No projects found'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleProjects);
    await execute({ action: 'list_projects' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, 'todoist/projects');
  });
});

// ---------------------------------------------------------------------------
// 4. get_project action
// ---------------------------------------------------------------------------
describe('todoist-manager: get_project', () => {
  beforeEach(() => {});

  it('should get project details successfully', async () => {
    const ctx = mockContext(sampleProject);
    const result = await execute({ action: 'get_project', projectId: '2203306142' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_project');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.name, 'Work');
    assert.equal(result.metadata.color, 'blue');
    assert.equal(result.metadata.isFavorite, true);
    assert.ok(result.result.includes('Work'));
  });

  it('should reject missing projectId', async () => {
    const ctx = mockContext(sampleProject);
    const result = await execute({ action: 'get_project' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PROJECT_ID');
  });

  it('should call the correct endpoint with project ID', async () => {
    const { context, calls } = mockContextWithSpy(sampleProject);
    await execute({ action: 'get_project', projectId: '2203306142' }, context);
    assert.equal(calls[0].endpoint, 'todoist/projects/2203306142');
  });
});

// ---------------------------------------------------------------------------
// 5. create_project action
// ---------------------------------------------------------------------------
describe('todoist-manager: create_project', () => {
  beforeEach(() => {});

  it('should create a project successfully', async () => {
    const ctx = mockContext(sampleCreatedProject);
    const result = await execute({ action: 'create_project', name: 'New Project', color: 'red' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_project');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.projectId, '2203306999');
    assert.equal(result.metadata.name, 'New Project');
    assert.ok(result.result.includes('New Project'));
  });

  it('should reject missing name', async () => {
    const ctx = mockContext(sampleCreatedProject);
    const result = await execute({ action: 'create_project' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_NAME');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedProject);
    await execute({ action: 'create_project', name: 'Test' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should pass optional color and isFavorite', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedProject);
    await execute({ action: 'create_project', name: 'Test', color: 'green', isFavorite: true }, context);
    assert.equal(calls[0].opts.params.color, 'green');
    assert.equal(calls[0].opts.params.is_favorite, true);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedProject);
    await execute({ action: 'create_project', name: 'Test' }, context);
    assert.equal(calls[0].endpoint, 'todoist/projects');
  });
});

// ---------------------------------------------------------------------------
// 6. list_tasks action
// ---------------------------------------------------------------------------
describe('todoist-manager: list_tasks', () => {
  beforeEach(() => {});

  it('should list tasks successfully', async () => {
    const ctx = mockContext(sampleTasks);
    const result = await execute({ action: 'list_tasks' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_tasks');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Buy groceries'));
    assert.ok(result.result.includes('Write report'));
  });

  it('should handle empty tasks list', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_tasks' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No tasks found'));
  });

  it('should pass projectId filter to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleTasks);
    await execute({ action: 'list_tasks', projectId: '2203306142' }, context);
    assert.equal(calls[0].opts.params.project_id, '2203306142');
  });

  it('should pass filter string to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleTasks);
    await execute({ action: 'list_tasks', filter: 'today | overdue' }, context);
    assert.equal(calls[0].opts.params.filter, 'today | overdue');
  });

  it('should pass label filter to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleTasks);
    await execute({ action: 'list_tasks', label: 'work' }, context);
    assert.equal(calls[0].opts.params.label, 'work');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleTasks);
    await execute({ action: 'list_tasks' }, context);
    assert.equal(calls[0].endpoint, 'todoist/tasks');
  });
});

// ---------------------------------------------------------------------------
// 7. get_task action
// ---------------------------------------------------------------------------
describe('todoist-manager: get_task', () => {
  beforeEach(() => {});

  it('should get task details successfully', async () => {
    const ctx = mockContext(sampleTask);
    const result = await execute({ action: 'get_task', taskId: '6001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_task');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.taskId, '6001');
    assert.equal(result.metadata.content, 'Buy groceries');
    assert.equal(result.metadata.priority, 2);
    assert.ok(result.result.includes('Buy groceries'));
    assert.ok(result.result.includes('Milk, eggs, bread'));
  });

  it('should reject missing taskId', async () => {
    const ctx = mockContext(sampleTask);
    const result = await execute({ action: 'get_task' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TASK_ID');
  });

  it('should call the correct endpoint with task ID', async () => {
    const { context, calls } = mockContextWithSpy(sampleTask);
    await execute({ action: 'get_task', taskId: '6001' }, context);
    assert.equal(calls[0].endpoint, 'todoist/tasks/6001');
  });
});

// ---------------------------------------------------------------------------
// 8. create_task action
// ---------------------------------------------------------------------------
describe('todoist-manager: create_task', () => {
  beforeEach(() => {});

  it('should create a task successfully', async () => {
    const ctx = mockContext(sampleCreatedTask);
    const result = await execute({
      action: 'create_task',
      content: 'Review PR',
      projectId: '2203306142',
      description: 'Check the new feature branch',
      priority: 3,
      dueString: 'next Monday',
      labels: ['work'],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_task');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.taskId, '6099');
    assert.equal(result.metadata.content, 'Review PR');
    assert.ok(result.result.includes('Review PR'));
  });

  it('should reject missing content', async () => {
    const ctx = mockContext(sampleCreatedTask);
    const result = await execute({ action: 'create_task' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CONTENT');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedTask);
    await execute({ action: 'create_task', content: 'Test' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should pass all optional params to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedTask);
    await execute({
      action: 'create_task',
      content: 'Test',
      projectId: '123',
      description: 'Desc',
      priority: 4,
      dueString: 'tomorrow',
      labels: ['urgent', 'work'],
    }, context);
    assert.equal(calls[0].opts.params.content, 'Test');
    assert.equal(calls[0].opts.params.project_id, '123');
    assert.equal(calls[0].opts.params.description, 'Desc');
    assert.equal(calls[0].opts.params.priority, 4);
    assert.equal(calls[0].opts.params.due_string, 'tomorrow');
    assert.deepEqual(calls[0].opts.params.labels, ['urgent', 'work']);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedTask);
    await execute({ action: 'create_task', content: 'Test' }, context);
    assert.equal(calls[0].endpoint, 'todoist/tasks');
  });
});

// ---------------------------------------------------------------------------
// 9. update_task action
// ---------------------------------------------------------------------------
describe('todoist-manager: update_task', () => {
  beforeEach(() => {});

  it('should update a task successfully', async () => {
    const ctx = mockContext(sampleUpdatedTask);
    const result = await execute({
      action: 'update_task',
      taskId: '6001',
      content: 'Buy organic groceries',
      priority: 3,
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update_task');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.taskId, '6001');
    assert.equal(result.metadata.content, 'Buy organic groceries');
    assert.ok(result.result.includes('updated'));
  });

  it('should reject missing taskId', async () => {
    const ctx = mockContext(sampleUpdatedTask);
    const result = await execute({ action: 'update_task', content: 'Updated' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TASK_ID');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedTask);
    await execute({ action: 'update_task', taskId: '6001', content: 'Updated' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint with task ID', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedTask);
    await execute({ action: 'update_task', taskId: '6001', content: 'Updated' }, context);
    assert.equal(calls[0].endpoint, 'todoist/tasks/6001');
  });

  it('should pass updated fields to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedTask);
    await execute({
      action: 'update_task',
      taskId: '6001',
      content: 'New content',
      description: 'New desc',
      priority: 2,
      dueString: 'Friday',
      labels: ['errands'],
    }, context);
    assert.equal(calls[0].opts.params.content, 'New content');
    assert.equal(calls[0].opts.params.description, 'New desc');
    assert.equal(calls[0].opts.params.priority, 2);
    assert.equal(calls[0].opts.params.due_string, 'Friday');
    assert.deepEqual(calls[0].opts.params.labels, ['errands']);
  });
});

// ---------------------------------------------------------------------------
// 10. complete_task action
// ---------------------------------------------------------------------------
describe('todoist-manager: complete_task', () => {
  beforeEach(() => {});

  it('should complete a task successfully', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'complete_task', taskId: '6001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'complete_task');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.taskId, '6001');
    assert.ok(result.result.includes('complete'));
  });

  it('should reject missing taskId', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'complete_task' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TASK_ID');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'complete_task', taskId: '6001' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct close endpoint', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'complete_task', taskId: '6001' }, context);
    assert.equal(calls[0].endpoint, 'todoist/tasks/6001/close');
  });
});

// ---------------------------------------------------------------------------
// 11. delete_task action
// ---------------------------------------------------------------------------
describe('todoist-manager: delete_task', () => {
  beforeEach(() => {});

  it('should delete a task successfully', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'delete_task', taskId: '6001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'delete_task');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.taskId, '6001');
    assert.ok(result.result.includes('deleted'));
  });

  it('should reject missing taskId', async () => {
    const ctx = mockContext(undefined);
    const result = await execute({ action: 'delete_task' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TASK_ID');
  });

  it('should use DELETE method', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'delete_task', taskId: '6001' }, context);
    assert.equal(calls[0].opts.method, 'DELETE');
  });

  it('should call the correct endpoint with task ID', async () => {
    const { context, calls } = mockContextWithSpy(undefined);
    await execute({ action: 'delete_task', taskId: '6001' }, context);
    assert.equal(calls[0].endpoint, 'todoist/tasks/6001');
  });
});

// ---------------------------------------------------------------------------
// 12. Timeout handling
// ---------------------------------------------------------------------------
describe('todoist-manager: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for list_projects', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for list_tasks', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_tasks' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for create_task', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'create_task', content: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 13. Network error handling
// ---------------------------------------------------------------------------
describe('todoist-manager: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for list_projects', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_projects' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for create_task', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'create_task', content: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 14. getClient helper
// ---------------------------------------------------------------------------
describe('todoist-manager: getClient', () => {
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
describe('todoist-manager: redactSensitive', () => {
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

  it('should redact 40-char hex strings (Todoist API tokens)', () => {
    const input = 'Using 0123456789abcdef0123456789abcdef01234567 for auth';
    const output = redactSensitive(input);
    assert.ok(!output.includes('0123456789abcdef0123456789abcdef01234567'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Buy groceries and write report';
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
describe('todoist-manager: sanitizeString', () => {
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
describe('todoist-manager: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded todoist.com URLs in fetch endpoints', async () => {
    const { context, calls } = mockContextWithSpy(sampleProjects);
    await execute({ action: 'list_projects' }, context);
    for (const call of calls) {
      assert.ok(!call.endpoint.includes('https://'), 'Endpoint must not contain https://');
      assert.ok(!call.endpoint.includes('api.todoist.com'), 'Endpoint must not contain api.todoist.com');
      assert.ok(call.endpoint.startsWith('todoist/'), 'Endpoint must start with todoist/');
    }
  });

  it('should use todoist/ prefix for all API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleTask);

    await execute({ action: 'list_projects' }, context);
    await execute({ action: 'get_project', projectId: '123' }, context);
    await execute({ action: 'create_project', name: 'Test' }, context);
    await execute({ action: 'list_tasks' }, context);
    await execute({ action: 'get_task', taskId: '123' }, context);
    await execute({ action: 'create_task', content: 'Test' }, context);
    await execute({ action: 'update_task', taskId: '123' }, context);
    await execute({ action: 'complete_task', taskId: '123' }, context);
    await execute({ action: 'delete_task', taskId: '123' }, context);

    assert.ok(calls.length >= 9, `Expected at least 9 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.endpoint.startsWith('todoist/'), `Endpoint "${call.endpoint}" must start with todoist/`);
    }
  });
});

// ---------------------------------------------------------------------------
// 18. Priority clamping
// ---------------------------------------------------------------------------
describe('todoist-manager: priority clamping', () => {
  beforeEach(() => {});

  it('should clamp priority to max 4', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedTask);
    await execute({ action: 'create_task', content: 'Test', priority: 10 }, context);
    assert.equal(calls[0].opts.params.priority, 4);
  });

  it('should clamp priority to min 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedTask);
    await execute({ action: 'create_task', content: 'Test', priority: -5 }, context);
    assert.equal(calls[0].opts.params.priority, 1);
  });

  it('should pass through valid priority', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedTask);
    await execute({ action: 'create_task', content: 'Test', priority: 3 }, context);
    assert.equal(calls[0].opts.params.priority, 3);
  });

  it('should not include priority when not provided', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedTask);
    await execute({ action: 'create_task', content: 'Test' }, context);
    assert.equal(calls[0].opts.params.priority, undefined);
  });
});
