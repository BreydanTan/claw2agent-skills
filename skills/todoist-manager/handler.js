/**
 * Todoist Manager Skill Handler (Layer 1)
 *
 * Manage Todoist projects and tasks via the Todoist API: list/get/create
 * projects, list/get/create/update/complete/delete tasks.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://api.todoist.com/...)
 * - All external access goes through context.providerClient or context.gatewayClient
 * - If no client is available: PROVIDER_NOT_CONFIGURED
 * - Enforces timeout (default 15s, max 30s)
 * - Redacts secrets from all outputs
 * - Sanitizes inputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'list_projects', 'get_project', 'create_project',
  'list_tasks', 'get_task', 'create_task', 'update_task',
  'complete_task', 'delete_task',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the provider or gateway client from context.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
export function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

/**
 * Return the standard PROVIDER_NOT_CONFIGURED error response.
 *
 * @returns {{ result: string, metadata: Object }}
 */
function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for Todoist API access. Configure the platform adapter.',
    metadata: {
      success: false,
      error: 'PROVIDER_NOT_CONFIGURED',
    },
  };
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
  /[0-9a-f]{40}/g,
];

/**
 * Redact sensitive tokens/keys from a string.
 *
 * @param {string} text
 * @returns {string}
 */
export function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a string input by trimming and removing control characters.
 *
 * @param {*} value
 * @returns {string|undefined}
 */
export function sanitizeString(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return String(value);
  // eslint-disable-next-line no-control-regex
  return value.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Clamp priority to the valid Todoist range (1-4).
 *
 * @param {*} value
 * @returns {number|undefined}
 */
function clampPriority(value) {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return undefined;
  if (n < 1) return 1;
  if (n > 4) return 4;
  return Math.floor(n);
}

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective timeout from context config.
 *
 * @param {Object} context
 * @returns {number}
 */
function resolveTimeout(context) {
  const configured = context?.config?.timeoutMs;
  if (typeof configured === 'number' && configured > 0) {
    return Math.min(configured, MAX_TIMEOUT_MS);
  }
  return DEFAULT_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

/**
 * Fetch data through the provider client with timeout enforcement.
 *
 * @param {Object} client - The provider or gateway client (must have .fetch())
 * @param {string} endpoint - The resource/endpoint identifier
 * @param {Object} options - Fetch options (params, method, body, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function fetchWithTimeout(client, endpoint, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.fetch(endpoint, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'FETCH_ERROR', message: err.message || 'Unknown fetch error' };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * list_projects - List all Todoist projects.
 */
async function handleListProjects(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'todoist/projects',
      { params: {} },
      timeoutMs
    );

    const projects = Array.isArray(data) ? data : [];

    if (projects.length === 0) {
      return {
        result: 'No projects found.',
        metadata: {
          success: true,
          action: 'list_projects',
          layer: 'L1',
          count: 0,
          projects: [],
        },
      };
    }

    const lines = projects.map(
      (p) => `${p.name || 'Untitled'} (ID: ${p.id}) - ${p.comment_count ?? 0} comments`
    );

    return {
      result: redactSensitive(`Projects (${projects.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_projects',
        layer: 'L1',
        count: projects.length,
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name || null,
          color: p.color || null,
          isFavorite: p.is_favorite || false,
          url: p.url || null,
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * get_project - Get project details by ID.
 */
async function handleGetProject(params, context) {
  const projectId = sanitizeString(params.projectId);

  if (!projectId) {
    return {
      result: 'Error: The "projectId" parameter is required for get_project.',
      metadata: { success: false, error: 'MISSING_PROJECT_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `todoist/projects/${projectId}`,
      { params: {} },
      timeoutMs
    );

    const result = [
      `Project: ${data.name || 'Untitled'}`,
      `ID: ${data.id || projectId}`,
      `Color: ${data.color || 'N/A'}`,
      `Favorite: ${data.is_favorite ? 'Yes' : 'No'}`,
      `Comment Count: ${data.comment_count ?? 0}`,
      `URL: ${data.url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_project',
        layer: 'L1',
        projectId: data.id || projectId,
        name: data.name || null,
        color: data.color || null,
        isFavorite: data.is_favorite || false,
        url: data.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * create_project - Create a new Todoist project.
 */
async function handleCreateProject(params, context) {
  const name = sanitizeString(params.name);

  if (!name) {
    return {
      result: 'Error: The "name" parameter is required for create_project.',
      metadata: { success: false, error: 'MISSING_NAME' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const body = { name };

  const color = sanitizeString(params.color);
  if (color) body.color = color;

  if (typeof params.isFavorite === 'boolean') {
    body.is_favorite = params.isFavorite;
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'todoist/projects',
      {
        method: 'POST',
        params: body,
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Project created: ${data.name || name} (ID: ${data.id || 'N/A'})\nURL: ${data.url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'create_project',
        layer: 'L1',
        projectId: data.id || null,
        name: data.name || name,
        color: data.color || null,
        isFavorite: data.is_favorite || false,
        url: data.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * list_tasks - List tasks with optional filters.
 */
async function handleListTasks(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const fetchParams = {};

  const projectId = sanitizeString(params.projectId);
  if (projectId) fetchParams.project_id = projectId;

  const filter = sanitizeString(params.filter);
  if (filter) fetchParams.filter = filter;

  const label = sanitizeString(params.label);
  if (label) fetchParams.label = label;

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'todoist/tasks',
      { params: fetchParams },
      timeoutMs
    );

    const tasks = Array.isArray(data) ? data : [];

    if (tasks.length === 0) {
      return {
        result: 'No tasks found.',
        metadata: {
          success: true,
          action: 'list_tasks',
          layer: 'L1',
          count: 0,
          tasks: [],
        },
      };
    }

    const lines = tasks.map(
      (t) => `- [${t.is_completed ? 'x' : ' '}] ${t.content || 'Untitled'} (ID: ${t.id}) P${t.priority || 1}${t.due?.string ? ` | Due: ${t.due.string}` : ''}`
    );

    return {
      result: redactSensitive(`Tasks (${tasks.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_tasks',
        layer: 'L1',
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          content: t.content || null,
          description: t.description || null,
          priority: t.priority || 1,
          due: t.due?.string || null,
          labels: t.labels || [],
          isCompleted: t.is_completed || false,
          projectId: t.project_id || null,
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * get_task - Get task details by ID.
 */
async function handleGetTask(params, context) {
  const taskId = sanitizeString(params.taskId);

  if (!taskId) {
    return {
      result: 'Error: The "taskId" parameter is required for get_task.',
      metadata: { success: false, error: 'MISSING_TASK_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `todoist/tasks/${taskId}`,
      { params: {} },
      timeoutMs
    );

    const result = [
      `Task: ${data.content || 'Untitled'}`,
      `ID: ${data.id || taskId}`,
      `Description: ${data.description || 'N/A'}`,
      `Priority: P${data.priority || 1}`,
      `Due: ${data.due?.string || 'N/A'}`,
      `Labels: ${Array.isArray(data.labels) && data.labels.length > 0 ? data.labels.join(', ') : 'None'}`,
      `Completed: ${data.is_completed ? 'Yes' : 'No'}`,
      `Project ID: ${data.project_id || 'N/A'}`,
      `URL: ${data.url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_task',
        layer: 'L1',
        taskId: data.id || taskId,
        content: data.content || null,
        description: data.description || null,
        priority: data.priority || 1,
        due: data.due?.string || null,
        labels: data.labels || [],
        isCompleted: data.is_completed || false,
        projectId: data.project_id || null,
        url: data.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * create_task - Create a new Todoist task.
 */
async function handleCreateTask(params, context) {
  const content = sanitizeString(params.content);

  if (!content) {
    return {
      result: 'Error: The "content" parameter is required for create_task.',
      metadata: { success: false, error: 'MISSING_CONTENT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const body = { content };

  const projectId = sanitizeString(params.projectId);
  if (projectId) body.project_id = projectId;

  const description = sanitizeString(params.description);
  if (description) body.description = description;

  const priority = clampPriority(params.priority);
  if (priority !== undefined) body.priority = priority;

  const dueString = sanitizeString(params.dueString);
  if (dueString) body.due_string = dueString;

  if (Array.isArray(params.labels)) {
    body.labels = params.labels.map((l) => sanitizeString(l)).filter(Boolean);
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'todoist/tasks',
      {
        method: 'POST',
        params: body,
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Task created: ${data.content || content} (ID: ${data.id || 'N/A'})\nURL: ${data.url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'create_task',
        layer: 'L1',
        taskId: data.id || null,
        content: data.content || content,
        description: data.description || null,
        priority: data.priority || 1,
        due: data.due?.string || null,
        labels: data.labels || [],
        projectId: data.project_id || null,
        url: data.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * update_task - Update an existing Todoist task.
 */
async function handleUpdateTask(params, context) {
  const taskId = sanitizeString(params.taskId);

  if (!taskId) {
    return {
      result: 'Error: The "taskId" parameter is required for update_task.',
      metadata: { success: false, error: 'MISSING_TASK_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const body = {};

  const content = sanitizeString(params.content);
  if (content) body.content = content;

  const description = sanitizeString(params.description);
  if (description) body.description = description;

  const priority = clampPriority(params.priority);
  if (priority !== undefined) body.priority = priority;

  const dueString = sanitizeString(params.dueString);
  if (dueString) body.due_string = dueString;

  if (Array.isArray(params.labels)) {
    body.labels = params.labels.map((l) => sanitizeString(l)).filter(Boolean);
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `todoist/tasks/${taskId}`,
      {
        method: 'POST',
        params: body,
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Task updated: ${data.content || 'N/A'} (ID: ${data.id || taskId})`),
      metadata: {
        success: true,
        action: 'update_task',
        layer: 'L1',
        taskId: data.id || taskId,
        content: data.content || null,
        description: data.description || null,
        priority: data.priority || 1,
        due: data.due?.string || null,
        labels: data.labels || [],
        url: data.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * complete_task - Mark a Todoist task as complete.
 */
async function handleCompleteTask(params, context) {
  const taskId = sanitizeString(params.taskId);

  if (!taskId) {
    return {
      result: 'Error: The "taskId" parameter is required for complete_task.',
      metadata: { success: false, error: 'MISSING_TASK_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    await fetchWithTimeout(
      resolved.client,
      `todoist/tasks/${taskId}/close`,
      {
        method: 'POST',
        params: {},
      },
      timeoutMs
    );

    return {
      result: `Task ${taskId} marked as complete.`,
      metadata: {
        success: true,
        action: 'complete_task',
        layer: 'L1',
        taskId,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * delete_task - Delete a Todoist task.
 */
async function handleDeleteTask(params, context) {
  const taskId = sanitizeString(params.taskId);

  if (!taskId) {
    return {
      result: 'Error: The "taskId" parameter is required for delete_task.',
      metadata: { success: false, error: 'MISSING_TASK_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    await fetchWithTimeout(
      resolved.client,
      `todoist/tasks/${taskId}`,
      {
        method: 'DELETE',
        params: {},
      },
      timeoutMs
    );

    return {
      result: `Task ${taskId} deleted.`,
      metadata: {
        success: true,
        action: 'delete_task',
        layer: 'L1',
        taskId,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Todoist management operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of the VALID_ACTIONS
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  try {
    switch (action) {
      case 'list_projects':
        return await handleListProjects(params, context);
      case 'get_project':
        return await handleGetProject(params, context);
      case 'create_project':
        return await handleCreateProject(params, context);
      case 'list_tasks':
        return await handleListTasks(params, context);
      case 'get_task':
        return await handleGetTask(params, context);
      case 'create_task':
        return await handleCreateTask(params, context);
      case 'update_task':
        return await handleUpdateTask(params, context);
      case 'complete_task':
        return await handleCompleteTask(params, context);
      case 'delete_task':
        return await handleDeleteTask(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: 'OPERATION_FAILED', detail: error.message },
    };
  }
}
