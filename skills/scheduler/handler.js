/**
 * Task Scheduler Skill Handler
 *
 * In-memory task scheduling using setTimeout and setInterval.
 * Supports cron-like expressions for recurring tasks and one-off delayed tasks.
 * Tasks are stored in a module-level Map and persist for the lifetime of the process.
 */

/**
 * In-memory store for all scheduled tasks.
 * Key: taskName (string)
 * Value: { taskName, cronExpression, command, timerId, type, intervalMs, createdAt, executionCount, lastExecutedAt, status }
 */
const scheduledTasks = new Map();

/**
 * Execution log for auditing (stores the last N executions).
 */
const executionLog = [];
const MAX_LOG_ENTRIES = 200;

/**
 * Parse a simplified cron expression into an interval in milliseconds.
 *
 * Supported formats:
 *   "* /N seconds"  -> every N seconds  (written without space; spaced here for comment safety)
 *   "* /N minutes"  -> every N minutes
 *   "* /N hours"    -> every N hours
 *   "once N"        -> one-time, fires after N seconds
 *
 * @param {string} expression
 * @returns {{ intervalMs: number, type: 'recurring' | 'once' }}
 */
function parseCronExpression(expression) {
  if (!expression || typeof expression !== 'string') {
    throw new Error('cronExpression is required and must be a non-empty string.');
  }

  const trimmed = expression.trim().toLowerCase();

  // One-time: "once 30" fires once after 30 seconds
  const onceMatch = trimmed.match(/^once\s+(\d+)$/);
  if (onceMatch) {
    const delaySec = parseInt(onceMatch[1], 10);
    if (delaySec <= 0) throw new Error('Delay must be a positive integer.');
    return { intervalMs: delaySec * 1000, type: 'once' };
  }

  // Recurring: "*/N unit"
  const recurMatch = trimmed.match(/^\*\/(\d+)\s+(seconds?|minutes?|hours?)$/);
  if (recurMatch) {
    const value = parseInt(recurMatch[1], 10);
    const unit = recurMatch[2];
    if (value <= 0) throw new Error('Interval value must be a positive integer.');

    let multiplier;
    if (unit.startsWith('second')) multiplier = 1000;
    else if (unit.startsWith('minute')) multiplier = 60 * 1000;
    else if (unit.startsWith('hour')) multiplier = 60 * 60 * 1000;
    else throw new Error(`Unknown time unit: ${unit}`);

    return { intervalMs: value * multiplier, type: 'recurring' };
  }

  throw new Error(
    `Invalid cron expression: "${expression}". ` +
    'Supported formats: "*/N seconds", "*/N minutes", "*/N hours", "once DELAY_SECONDS".'
  );
}

/**
 * Execute a task's command (logs it and records execution).
 * @param {string} taskName
 * @param {string} command
 */
function executeTask(taskName, command) {
  const task = scheduledTasks.get(taskName);
  if (!task) return;

  const now = new Date().toISOString();
  task.executionCount += 1;
  task.lastExecutedAt = now;

  const logEntry = {
    taskName,
    command,
    executedAt: now,
    executionNumber: task.executionCount
  };

  executionLog.push(logEntry);
  if (executionLog.length > MAX_LOG_ENTRIES) {
    executionLog.shift();
  }

  // Log to console so the runtime can observe task execution
  console.log(`[Scheduler] Task "${taskName}" executed (#${task.executionCount}): ${command}`);

  // If this was a one-time task, mark it as completed
  if (task.type === 'once') {
    task.status = 'completed';
    task.timerId = null;
  }
}

/**
 * Create a new scheduled task.
 * @param {string} taskName
 * @param {string} cronExpression
 * @param {string} command
 * @returns {{result: string, metadata: Object}}
 */
function handleCreate(taskName, cronExpression, command) {
  if (!taskName || typeof taskName !== 'string' || taskName.trim().length === 0) {
    return {
      result: 'Error: taskName is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_TASK_NAME' }
    };
  }
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    return {
      result: 'Error: command is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_COMMAND' }
    };
  }

  const name = taskName.trim();

  if (scheduledTasks.has(name)) {
    return {
      result: `Error: A task named "${name}" already exists. Delete it first or choose a different name.`,
      metadata: { success: false, error: 'DUPLICATE_TASK', taskName: name }
    };
  }

  let parsed;
  try {
    parsed = parseCronExpression(cronExpression);
  } catch (error) {
    return {
      result: `Error: ${error.message}`,
      metadata: { success: false, error: 'INVALID_CRON', detail: error.message }
    };
  }

  const { intervalMs, type } = parsed;
  let timerId;

  if (type === 'once') {
    timerId = setTimeout(() => executeTask(name, command), intervalMs);
  } else {
    timerId = setInterval(() => executeTask(name, command), intervalMs);
  }

  const task = {
    taskName: name,
    cronExpression,
    command,
    timerId,
    type,
    intervalMs,
    createdAt: new Date().toISOString(),
    executionCount: 0,
    lastExecutedAt: null,
    status: 'active'
  };

  scheduledTasks.set(name, task);

  const humanInterval = intervalMs >= 3600000
    ? `${intervalMs / 3600000} hour(s)`
    : intervalMs >= 60000
      ? `${intervalMs / 60000} minute(s)`
      : `${intervalMs / 1000} second(s)`;

  return {
    result: `Task "${name}" scheduled successfully.\nType: ${type}\nInterval: ${humanInterval}\nCommand: ${command}`,
    metadata: {
      success: true,
      action: 'create',
      taskName: name,
      type,
      intervalMs,
      humanInterval,
      createdAt: task.createdAt
    }
  };
}

/**
 * List all scheduled tasks.
 * @returns {{result: string, metadata: Object}}
 */
function handleList() {
  if (scheduledTasks.size === 0) {
    return {
      result: 'No scheduled tasks.',
      metadata: { success: true, action: 'list', taskCount: 0, tasks: [] }
    };
  }

  const tasks = [];
  for (const [name, task] of scheduledTasks) {
    tasks.push({
      taskName: name,
      cronExpression: task.cronExpression,
      command: task.command,
      type: task.type,
      status: task.status,
      intervalMs: task.intervalMs,
      createdAt: task.createdAt,
      executionCount: task.executionCount,
      lastExecutedAt: task.lastExecutedAt
    });
  }

  const formatted = tasks
    .map((t, i) => {
      return `${i + 1}. "${t.taskName}" [${t.status}]\n` +
        `   Schedule: ${t.cronExpression} (${t.type})\n` +
        `   Command: ${t.command}\n` +
        `   Executions: ${t.executionCount}` +
        (t.lastExecutedAt ? ` | Last run: ${t.lastExecutedAt}` : '') +
        `\n   Created: ${t.createdAt}`;
    })
    .join('\n\n');

  return {
    result: `Scheduled tasks (${tasks.length}):\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'list',
      taskCount: tasks.length,
      tasks
    }
  };
}

/**
 * Delete a scheduled task.
 * @param {string} taskName
 * @returns {{result: string, metadata: Object}}
 */
function handleDelete(taskName) {
  if (!taskName || typeof taskName !== 'string' || taskName.trim().length === 0) {
    return {
      result: 'Error: taskName is required for delete action.',
      metadata: { success: false, error: 'INVALID_TASK_NAME' }
    };
  }

  const name = taskName.trim();
  const task = scheduledTasks.get(name);

  if (!task) {
    return {
      result: `Error: No task found with name "${name}".`,
      metadata: { success: false, error: 'TASK_NOT_FOUND', taskName: name }
    };
  }

  // Clear the timer
  if (task.timerId !== null) {
    if (task.type === 'once') {
      clearTimeout(task.timerId);
    } else {
      clearInterval(task.timerId);
    }
  }

  scheduledTasks.delete(name);

  return {
    result: `Task "${name}" deleted successfully. It had run ${task.executionCount} time(s).`,
    metadata: {
      success: true,
      action: 'delete',
      taskName: name,
      executionCount: task.executionCount,
      wasActive: task.status === 'active'
    }
  };
}

/**
 * Execute a scheduler operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: create, list, delete
 * @param {string} [params.taskName] - Task name (required for create/delete)
 * @param {string} [params.cronExpression] - Schedule expression (required for create)
 * @param {string} [params.command] - Command to run (required for create)
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action, taskName, cronExpression, command } = params;

  const validActions = ['create', 'list', 'delete'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' }
    };
  }

  switch (action) {
    case 'create':
      return handleCreate(taskName, cronExpression, command);
    case 'list':
      return handleList();
    case 'delete':
      return handleDelete(taskName);
    default:
      return {
        result: `Error: Unknown action "${action}".`,
        metadata: { success: false, error: 'UNKNOWN_ACTION' }
      };
  }
}
