import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Helper: clean up all scheduled tasks between tests to avoid timer leaks
// ---------------------------------------------------------------------------

async function cleanupTasks() {
  const list = await execute({ action: 'list' }, {});
  if (list.metadata.tasks && list.metadata.tasks.length > 0) {
    for (const t of list.metadata.tasks) {
      await execute({ action: 'delete', taskName: t.taskName }, {});
    }
  }
}

// ===========================================================================
// Action validation
// ===========================================================================

describe('scheduler: action validation', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should return error for missing action', async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for null action', async () => {
    const res = await execute({ action: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for undefined action', async () => {
    const res = await execute({ action: undefined }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for empty string action', async () => {
    const res = await execute({ action: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for unknown action', async () => {
    const res = await execute({ action: 'purge' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for numeric action', async () => {
    const res = await execute({ action: 42 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for boolean action', async () => {
    const res = await execute({ action: true }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should mention valid actions in error result', async () => {
    const res = await execute({ action: 'fly' }, {});
    assert.ok(res.result.includes('create'));
    assert.ok(res.result.includes('list'));
    assert.ok(res.result.includes('delete'));
  });

  it('should include the invalid action name in the error result', async () => {
    const res = await execute({ action: 'wobble' }, {});
    assert.ok(res.result.includes('wobble'));
  });
});

// ===========================================================================
// Create task: happy path (recurring)
// ===========================================================================

describe('scheduler: create recurring task', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should create a recurring task with seconds', async () => {
    const res = await execute({ action: 'create', taskName: 'sec-task', cronExpression: '*/10 seconds', command: 'echo hi' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.type, 'recurring');
    assert.equal(res.metadata.taskName, 'sec-task');
    await execute({ action: 'delete', taskName: 'sec-task' }, {});
  });

  it('should create a recurring task with minutes', async () => {
    const res = await execute({ action: 'create', taskName: 'min-task', cronExpression: '*/5 minutes', command: 'echo min' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.type, 'recurring');
    assert.equal(res.metadata.intervalMs, 5 * 60 * 1000);
    await execute({ action: 'delete', taskName: 'min-task' }, {});
  });

  it('should create a recurring task with hours', async () => {
    const res = await execute({ action: 'create', taskName: 'hr-task', cronExpression: '*/2 hours', command: 'echo hr' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.type, 'recurring');
    assert.equal(res.metadata.intervalMs, 2 * 60 * 60 * 1000);
    await execute({ action: 'delete', taskName: 'hr-task' }, {});
  });

  it('should accept singular "second" in cron expression', async () => {
    const res = await execute({ action: 'create', taskName: 'single-sec', cronExpression: '*/1 second', command: 'echo s' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.intervalMs, 1000);
    await execute({ action: 'delete', taskName: 'single-sec' }, {});
  });

  it('should accept singular "minute" in cron expression', async () => {
    const res = await execute({ action: 'create', taskName: 'single-min', cronExpression: '*/1 minute', command: 'echo m' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.intervalMs, 60000);
    await execute({ action: 'delete', taskName: 'single-min' }, {});
  });

  it('should accept singular "hour" in cron expression', async () => {
    const res = await execute({ action: 'create', taskName: 'single-hr', cronExpression: '*/1 hour', command: 'echo h' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.intervalMs, 3600000);
    await execute({ action: 'delete', taskName: 'single-hr' }, {});
  });

  it('should calculate correct intervalMs for seconds', async () => {
    const res = await execute({ action: 'create', taskName: 'calc-sec', cronExpression: '*/30 seconds', command: 'echo c' }, {});
    assert.equal(res.metadata.intervalMs, 30000);
    await execute({ action: 'delete', taskName: 'calc-sec' }, {});
  });

  it('should return createdAt in metadata', async () => {
    const res = await execute({ action: 'create', taskName: 'created-at', cronExpression: '*/10 seconds', command: 'echo ca' }, {});
    assert.ok(res.metadata.createdAt);
    const d = new Date(res.metadata.createdAt);
    assert.ok(!isNaN(d.getTime()));
    await execute({ action: 'delete', taskName: 'created-at' }, {});
  });

  it('should return humanInterval in metadata', async () => {
    const res = await execute({ action: 'create', taskName: 'human', cronExpression: '*/10 seconds', command: 'echo h' }, {});
    assert.ok(res.metadata.humanInterval);
    assert.ok(res.metadata.humanInterval.includes('second'));
    await execute({ action: 'delete', taskName: 'human' }, {});
  });

  it('should display humanInterval as seconds for seconds', async () => {
    const res = await execute({ action: 'create', taskName: 'hs', cronExpression: '*/15 seconds', command: 'echo h' }, {});
    assert.ok(res.metadata.humanInterval.includes('15'));
    assert.ok(res.metadata.humanInterval.includes('second'));
    await execute({ action: 'delete', taskName: 'hs' }, {});
  });

  it('should display humanInterval as minutes for minutes', async () => {
    const res = await execute({ action: 'create', taskName: 'hm', cronExpression: '*/3 minutes', command: 'echo h' }, {});
    assert.ok(res.metadata.humanInterval.includes('3'));
    assert.ok(res.metadata.humanInterval.includes('minute'));
    await execute({ action: 'delete', taskName: 'hm' }, {});
  });

  it('should display humanInterval as hours for hours', async () => {
    const res = await execute({ action: 'create', taskName: 'hh', cronExpression: '*/4 hours', command: 'echo h' }, {});
    assert.ok(res.metadata.humanInterval.includes('4'));
    assert.ok(res.metadata.humanInterval.includes('hour'));
    await execute({ action: 'delete', taskName: 'hh' }, {});
  });

  it('should include action "create" in metadata', async () => {
    const res = await execute({ action: 'create', taskName: 'act-meta', cronExpression: '*/10 seconds', command: 'echo a' }, {});
    assert.equal(res.metadata.action, 'create');
    await execute({ action: 'delete', taskName: 'act-meta' }, {});
  });

  it('should include task name in result string', async () => {
    const res = await execute({ action: 'create', taskName: 'in-result', cronExpression: '*/10 seconds', command: 'echo r' }, {});
    assert.ok(res.result.includes('in-result'));
    await execute({ action: 'delete', taskName: 'in-result' }, {});
  });

  it('should include "scheduled successfully" in result', async () => {
    const res = await execute({ action: 'create', taskName: 'sched-ok', cronExpression: '*/10 seconds', command: 'echo s' }, {});
    assert.ok(res.result.includes('scheduled successfully'));
    await execute({ action: 'delete', taskName: 'sched-ok' }, {});
  });

  it('should include type in result string', async () => {
    const res = await execute({ action: 'create', taskName: 'type-str', cronExpression: '*/10 seconds', command: 'echo t' }, {});
    assert.ok(res.result.includes('recurring'));
    await execute({ action: 'delete', taskName: 'type-str' }, {});
  });

  it('should include command in result string', async () => {
    const res = await execute({ action: 'create', taskName: 'cmd-str', cronExpression: '*/10 seconds', command: 'my-command --flag' }, {});
    assert.ok(res.result.includes('my-command --flag'));
    await execute({ action: 'delete', taskName: 'cmd-str' }, {});
  });
});

// ===========================================================================
// Create task: one-time
// ===========================================================================

describe('scheduler: create one-time task', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should create a one-time task', async () => {
    const res = await execute({ action: 'create', taskName: 'once-task', cronExpression: 'once 30', command: 'echo once' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.type, 'once');
    await execute({ action: 'delete', taskName: 'once-task' }, {});
  });

  it('should calculate correct intervalMs for one-time task', async () => {
    const res = await execute({ action: 'create', taskName: 'once-ms', cronExpression: 'once 60', command: 'echo o' }, {});
    assert.equal(res.metadata.intervalMs, 60000);
    await execute({ action: 'delete', taskName: 'once-ms' }, {});
  });

  it('should include type "once" in result', async () => {
    const res = await execute({ action: 'create', taskName: 'once-type', cronExpression: 'once 10', command: 'echo ot' }, {});
    assert.ok(res.result.includes('once'));
    await execute({ action: 'delete', taskName: 'once-type' }, {});
  });

  it('should handle once with large delay', async () => {
    const res = await execute({ action: 'create', taskName: 'once-big', cronExpression: 'once 86400', command: 'echo big' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.intervalMs, 86400 * 1000);
    await execute({ action: 'delete', taskName: 'once-big' }, {});
  });

  it('should handle once with delay of 1', async () => {
    const res = await execute({ action: 'create', taskName: 'once-1', cronExpression: 'once 1', command: 'echo 1' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.intervalMs, 1000);
    await execute({ action: 'delete', taskName: 'once-1' }, {});
  });
});

// ===========================================================================
// Create task: validation errors
// ===========================================================================

describe('scheduler: create task validation', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should return error when taskName is missing', async () => {
    const res = await execute({ action: 'create', cronExpression: '*/10 seconds', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should return error when taskName is empty string', async () => {
    const res = await execute({ action: 'create', taskName: '', cronExpression: '*/10 seconds', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should return error when taskName is whitespace', async () => {
    const res = await execute({ action: 'create', taskName: '  ', cronExpression: '*/10 seconds', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should return error when taskName is null', async () => {
    const res = await execute({ action: 'create', taskName: null, cronExpression: '*/10 seconds', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should return error when taskName is a number', async () => {
    const res = await execute({ action: 'create', taskName: 123, cronExpression: '*/10 seconds', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should return error when command is missing', async () => {
    const res = await execute({ action: 'create', taskName: 'no-cmd', cronExpression: '*/10 seconds' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_COMMAND');
  });

  it('should return error when command is empty string', async () => {
    const res = await execute({ action: 'create', taskName: 'empty-cmd', cronExpression: '*/10 seconds', command: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_COMMAND');
  });

  it('should return error when command is whitespace', async () => {
    const res = await execute({ action: 'create', taskName: 'ws-cmd', cronExpression: '*/10 seconds', command: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_COMMAND');
  });

  it('should return error when command is null', async () => {
    const res = await execute({ action: 'create', taskName: 'null-cmd', cronExpression: '*/10 seconds', command: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_COMMAND');
  });

  it('should return error when command is a number', async () => {
    const res = await execute({ action: 'create', taskName: 'num-cmd', cronExpression: '*/10 seconds', command: 42 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_COMMAND');
  });

  it('should return error for invalid cron expression', async () => {
    const res = await execute({ action: 'create', taskName: 'bad-cron', cronExpression: 'every 5 mins', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CRON');
  });

  it('should return error for null cron expression', async () => {
    const res = await execute({ action: 'create', taskName: 'null-cron', cronExpression: null, command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CRON');
  });

  it('should return error for empty cron expression', async () => {
    const res = await execute({ action: 'create', taskName: 'empty-cron', cronExpression: '', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CRON');
  });

  it('should return error for numeric cron expression', async () => {
    const res = await execute({ action: 'create', taskName: 'num-cron', cronExpression: 42, command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CRON');
  });

  it('should return error for cron with unsupported unit "days"', async () => {
    const res = await execute({ action: 'create', taskName: 'days-cron', cronExpression: '*/5 days', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CRON');
  });

  it('should return error for cron with standard cron format', async () => {
    const res = await execute({ action: 'create', taskName: 'std-cron', cronExpression: '0 * * * *', command: 'echo x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CRON');
  });

  it('should include detail in INVALID_CRON metadata', async () => {
    const res = await execute({ action: 'create', taskName: 'detail', cronExpression: 'bad', command: 'echo x' }, {});
    assert.ok(res.metadata.detail);
    assert.equal(typeof res.metadata.detail, 'string');
  });

  it('should return error for duplicate task name', async () => {
    await execute({ action: 'create', taskName: 'dupe', cronExpression: '*/10 seconds', command: 'echo a' }, {});
    const res = await execute({ action: 'create', taskName: 'dupe', cronExpression: '*/20 seconds', command: 'echo b' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'DUPLICATE_TASK');
    assert.equal(res.metadata.taskName, 'dupe');
    await execute({ action: 'delete', taskName: 'dupe' }, {});
  });

  it('should mention "already exists" in duplicate error result', async () => {
    await execute({ action: 'create', taskName: 'dupe2', cronExpression: '*/10 seconds', command: 'echo a' }, {});
    const res = await execute({ action: 'create', taskName: 'dupe2', cronExpression: '*/20 seconds', command: 'echo b' }, {});
    assert.ok(res.result.includes('already exists'));
    await execute({ action: 'delete', taskName: 'dupe2' }, {});
  });

  it('should trim taskName for duplicate check', async () => {
    await execute({ action: 'create', taskName: 'trim-dupe', cronExpression: '*/10 seconds', command: 'echo a' }, {});
    const res = await execute({ action: 'create', taskName: '  trim-dupe  ', cronExpression: '*/20 seconds', command: 'echo b' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'DUPLICATE_TASK');
    await execute({ action: 'delete', taskName: 'trim-dupe' }, {});
  });
});

// ===========================================================================
// List tasks
// ===========================================================================

describe('scheduler: list tasks', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should return empty list when no tasks exist', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.taskCount, 0);
    assert.deepEqual(res.metadata.tasks, []);
  });

  it('should mention "No scheduled tasks" for empty list', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('No scheduled tasks'));
  });

  it('should include action "list" in metadata', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.action, 'list');
  });

  it('should list one task', async () => {
    await execute({ action: 'create', taskName: 'listed', cronExpression: '*/10 seconds', command: 'echo l' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.taskCount, 1);
    assert.equal(res.metadata.tasks.length, 1);
    assert.equal(res.metadata.tasks[0].taskName, 'listed');
    await execute({ action: 'delete', taskName: 'listed' }, {});
  });

  it('should list multiple tasks', async () => {
    await execute({ action: 'create', taskName: 'task-a', cronExpression: '*/10 seconds', command: 'echo a' }, {});
    await execute({ action: 'create', taskName: 'task-b', cronExpression: '*/20 seconds', command: 'echo b' }, {});
    await execute({ action: 'create', taskName: 'task-c', cronExpression: '*/30 seconds', command: 'echo c' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.taskCount, 3);
    assert.equal(res.metadata.tasks.length, 3);
    const names = res.metadata.tasks.map(t => t.taskName);
    assert.ok(names.includes('task-a'));
    assert.ok(names.includes('task-b'));
    assert.ok(names.includes('task-c'));
    await execute({ action: 'delete', taskName: 'task-a' }, {});
    await execute({ action: 'delete', taskName: 'task-b' }, {});
    await execute({ action: 'delete', taskName: 'task-c' }, {});
  });

  it('should include cronExpression in listed task', async () => {
    await execute({ action: 'create', taskName: 'cron-list', cronExpression: '*/5 minutes', command: 'echo cl' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.tasks[0].cronExpression, '*/5 minutes');
    await execute({ action: 'delete', taskName: 'cron-list' }, {});
  });

  it('should include command in listed task', async () => {
    await execute({ action: 'create', taskName: 'cmd-list', cronExpression: '*/10 seconds', command: 'run-script' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.tasks[0].command, 'run-script');
    await execute({ action: 'delete', taskName: 'cmd-list' }, {});
  });

  it('should include type in listed task', async () => {
    await execute({ action: 'create', taskName: 'type-list', cronExpression: '*/10 seconds', command: 'echo t' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.tasks[0].type, 'recurring');
    await execute({ action: 'delete', taskName: 'type-list' }, {});
  });

  it('should include status in listed task', async () => {
    await execute({ action: 'create', taskName: 'status-list', cronExpression: '*/10 seconds', command: 'echo s' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.tasks[0].status, 'active');
    await execute({ action: 'delete', taskName: 'status-list' }, {});
  });

  it('should include executionCount in listed task (initially 0)', async () => {
    await execute({ action: 'create', taskName: 'exec-list', cronExpression: '*/10 seconds', command: 'echo e' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.tasks[0].executionCount, 0);
    await execute({ action: 'delete', taskName: 'exec-list' }, {});
  });

  it('should include lastExecutedAt in listed task (initially null)', async () => {
    await execute({ action: 'create', taskName: 'last-list', cronExpression: '*/10 seconds', command: 'echo l' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.tasks[0].lastExecutedAt, null);
    await execute({ action: 'delete', taskName: 'last-list' }, {});
  });

  it('should include createdAt in listed task', async () => {
    await execute({ action: 'create', taskName: 'ca-list', cronExpression: '*/10 seconds', command: 'echo c' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.metadata.tasks[0].createdAt);
    await execute({ action: 'delete', taskName: 'ca-list' }, {});
  });

  it('should include intervalMs in listed task', async () => {
    await execute({ action: 'create', taskName: 'int-list', cronExpression: '*/10 seconds', command: 'echo i' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.tasks[0].intervalMs, 10000);
    await execute({ action: 'delete', taskName: 'int-list' }, {});
  });

  it('should include count in result string', async () => {
    await execute({ action: 'create', taskName: 'count-res', cronExpression: '*/10 seconds', command: 'echo cnt' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('Scheduled tasks'));
    assert.ok(res.result.includes('1'));
    await execute({ action: 'delete', taskName: 'count-res' }, {});
  });

  it('should not list deleted tasks', async () => {
    await execute({ action: 'create', taskName: 'del-list', cronExpression: '*/10 seconds', command: 'echo d' }, {});
    await execute({ action: 'delete', taskName: 'del-list' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.taskCount, 0);
  });
});

// ===========================================================================
// Delete task
// ===========================================================================

describe('scheduler: delete task', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should delete an existing task', async () => {
    await execute({ action: 'create', taskName: 'del-me', cronExpression: '*/10 seconds', command: 'echo d' }, {});
    const res = await execute({ action: 'delete', taskName: 'del-me' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'delete');
  });

  it('should return taskName in delete metadata', async () => {
    await execute({ action: 'create', taskName: 'del-name', cronExpression: '*/10 seconds', command: 'echo dn' }, {});
    const res = await execute({ action: 'delete', taskName: 'del-name' }, {});
    assert.equal(res.metadata.taskName, 'del-name');
  });

  it('should return executionCount in delete metadata', async () => {
    await execute({ action: 'create', taskName: 'del-ec', cronExpression: '*/10 seconds', command: 'echo ec' }, {});
    const res = await execute({ action: 'delete', taskName: 'del-ec' }, {});
    assert.equal(res.metadata.executionCount, 0);
  });

  it('should return wasActive in delete metadata', async () => {
    await execute({ action: 'create', taskName: 'del-active', cronExpression: '*/10 seconds', command: 'echo a' }, {});
    const res = await execute({ action: 'delete', taskName: 'del-active' }, {});
    assert.equal(res.metadata.wasActive, true);
  });

  it('should include task name in delete result', async () => {
    await execute({ action: 'create', taskName: 'del-result', cronExpression: '*/10 seconds', command: 'echo r' }, {});
    const res = await execute({ action: 'delete', taskName: 'del-result' }, {});
    assert.ok(res.result.includes('del-result'));
  });

  it('should include "deleted successfully" in result', async () => {
    await execute({ action: 'create', taskName: 'del-success', cronExpression: '*/10 seconds', command: 'echo s' }, {});
    const res = await execute({ action: 'delete', taskName: 'del-success' }, {});
    assert.ok(res.result.includes('deleted successfully'));
  });

  it('should return error for deleting non-existent task', async () => {
    const res = await execute({ action: 'delete', taskName: 'ghost-task' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'TASK_NOT_FOUND');
  });

  it('should include task name in TASK_NOT_FOUND metadata', async () => {
    const res = await execute({ action: 'delete', taskName: 'no-such-task' }, {});
    assert.equal(res.metadata.taskName, 'no-such-task');
  });

  it('should mention task name in not-found result', async () => {
    const res = await execute({ action: 'delete', taskName: 'phantom' }, {});
    assert.ok(res.result.includes('phantom'));
  });

  it('should return error when taskName is missing for delete', async () => {
    const res = await execute({ action: 'delete' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should return error when taskName is empty string for delete', async () => {
    const res = await execute({ action: 'delete', taskName: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should return error when taskName is whitespace for delete', async () => {
    const res = await execute({ action: 'delete', taskName: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should return error when taskName is null for delete', async () => {
    const res = await execute({ action: 'delete', taskName: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TASK_NAME');
  });

  it('should delete one-time task', async () => {
    await execute({ action: 'create', taskName: 'once-del', cronExpression: 'once 9999', command: 'echo od' }, {});
    const res = await execute({ action: 'delete', taskName: 'once-del' }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should delete recurring task', async () => {
    await execute({ action: 'create', taskName: 'recur-del', cronExpression: '*/10 seconds', command: 'echo rd' }, {});
    const res = await execute({ action: 'delete', taskName: 'recur-del' }, {});
    assert.equal(res.metadata.success, true);
  });
});

// ===========================================================================
// Return shape
// ===========================================================================

describe('scheduler: return shape', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should return { result, metadata } for create', async () => {
    const res = await execute({ action: 'create', taskName: 'shape-c', cronExpression: '*/10 seconds', command: 'echo sc' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
    assert.equal(typeof res.result, 'string');
    assert.equal(typeof res.metadata, 'object');
    await execute({ action: 'delete', taskName: 'shape-c' }, {});
  });

  it('should return { result, metadata } for list', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should return { result, metadata } for delete', async () => {
    const res = await execute({ action: 'delete', taskName: 'nonexistent' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should return { result, metadata } for invalid action', async () => {
    const res = await execute({ action: 'invalid' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should never throw (returns error objects instead)', async () => {
    const cases = [
      execute({}, {}),
      execute({ action: null }, {}),
      execute({ action: 'create' }, {}),
      execute({ action: 'create', taskName: 'x', cronExpression: 'bad', command: 'y' }, {}),
      execute({ action: 'delete', taskName: 'nonexistent' }, {}),
    ];
    const results = await Promise.all(cases);
    for (const res of results) {
      assert.ok('result' in res);
      assert.ok('metadata' in res);
    }
  });
});

// ===========================================================================
// Context parameter
// ===========================================================================

describe('scheduler: context parameter', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should accept undefined context', async () => {
    const res = await execute({ action: 'list' }, undefined);
    assert.equal(res.metadata.success, true);
  });

  it('should accept null context', async () => {
    const res = await execute({ action: 'list' }, null);
    assert.equal(res.metadata.success, true);
  });

  it('should accept empty object context', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should accept context with extra fields', async () => {
    const res = await execute({ action: 'list' }, { userId: 'u1', env: 'test' });
    assert.equal(res.metadata.success, true);
  });
});

// ===========================================================================
// Workflow: create, list, delete
// ===========================================================================

describe('scheduler: full workflow', () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  it('should handle create -> list -> delete -> list workflow', async () => {
    const create = await execute({ action: 'create', taskName: 'flow', cronExpression: '*/10 seconds', command: 'echo flow' }, {});
    assert.equal(create.metadata.success, true);

    const list1 = await execute({ action: 'list' }, {});
    assert.equal(list1.metadata.taskCount, 1);

    const del = await execute({ action: 'delete', taskName: 'flow' }, {});
    assert.equal(del.metadata.success, true);

    const list2 = await execute({ action: 'list' }, {});
    assert.equal(list2.metadata.taskCount, 0);
  });

  it('should handle creating multiple tasks and deleting individually', async () => {
    await execute({ action: 'create', taskName: 'w1', cronExpression: '*/10 seconds', command: 'echo w1' }, {});
    await execute({ action: 'create', taskName: 'w2', cronExpression: '*/20 seconds', command: 'echo w2' }, {});
    await execute({ action: 'create', taskName: 'w3', cronExpression: '*/30 seconds', command: 'echo w3' }, {});

    let list = await execute({ action: 'list' }, {});
    assert.equal(list.metadata.taskCount, 3);

    await execute({ action: 'delete', taskName: 'w2' }, {});
    list = await execute({ action: 'list' }, {});
    assert.equal(list.metadata.taskCount, 2);
    const names = list.metadata.tasks.map(t => t.taskName);
    assert.ok(!names.includes('w2'));

    await execute({ action: 'delete', taskName: 'w1' }, {});
    await execute({ action: 'delete', taskName: 'w3' }, {});
    list = await execute({ action: 'list' }, {});
    assert.equal(list.metadata.taskCount, 0);
  });

  it('should allow reusing a task name after deletion', async () => {
    await execute({ action: 'create', taskName: 'reuse', cronExpression: '*/10 seconds', command: 'echo v1' }, {});
    await execute({ action: 'delete', taskName: 'reuse' }, {});
    const res = await execute({ action: 'create', taskName: 'reuse', cronExpression: '*/20 seconds', command: 'echo v2' }, {});
    assert.equal(res.metadata.success, true);
    await execute({ action: 'delete', taskName: 'reuse' }, {});
  });

  it('should handle mixed recurring and one-time tasks', async () => {
    await execute({ action: 'create', taskName: 'mix-r', cronExpression: '*/10 seconds', command: 'echo r' }, {});
    await execute({ action: 'create', taskName: 'mix-o', cronExpression: 'once 30', command: 'echo o' }, {});
    const list = await execute({ action: 'list' }, {});
    assert.equal(list.metadata.taskCount, 2);
    const types = list.metadata.tasks.map(t => t.type);
    assert.ok(types.includes('recurring'));
    assert.ok(types.includes('once'));
    await execute({ action: 'delete', taskName: 'mix-r' }, {});
    await execute({ action: 'delete', taskName: 'mix-o' }, {});
  });

  it('should handle task names with special characters', async () => {
    const res = await execute({ action: 'create', taskName: 'my-task_v2.1', cronExpression: '*/10 seconds', command: 'echo special' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.taskName, 'my-task_v2.1');
    await execute({ action: 'delete', taskName: 'my-task_v2.1' }, {});
  });

  it('should handle task names with spaces (trimmed)', async () => {
    const res = await execute({ action: 'create', taskName: '  spaced  ', cronExpression: '*/10 seconds', command: 'echo sp' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.taskName, 'spaced');
    await execute({ action: 'delete', taskName: 'spaced' }, {});
  });
});
