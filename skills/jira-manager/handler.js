/**
 * Jira Manager Skill Handler (Layer 1)
 *
 * Manage Jira projects and issues via the Jira REST API: list projects,
 * get/create/update issues, transition statuses, search with JQL,
 * add comments, list transitions, and assign issues.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://your-domain.atlassian.net/...)
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
  'list_projects', 'get_issue', 'create_issue', 'update_issue',
  'transition_issue', 'search_issues', 'add_comment',
  'list_transitions', 'assign_issue',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RESULTS = 50;

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
    result: 'Error: Provider client required for Jira API access. Configure the platform adapter.',
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
  /ATATT[A-Za-z0-9\-_+=/.]{20,}/g,
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
 * list_projects - List all Jira projects.
 */
async function handleListProjects(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'jira/rest/api/3/project',
      { params: {} },
      timeoutMs
    );

    const projects = Array.isArray(data) ? data : [];

    if (projects.length === 0) {
      return {
        result: 'No Jira projects found.',
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
      (p) => `${p.key} - ${p.name} (${p.projectTypeKey || 'N/A'})`
    );

    return {
      result: redactSensitive(`Jira Projects (${projects.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_projects',
        layer: 'L1',
        count: projects.length,
        projects: projects.map((p) => ({
          key: p.key,
          name: p.name,
          id: p.id || null,
          projectTypeKey: p.projectTypeKey || null,
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
 * get_issue - Get Jira issue details.
 */
async function handleGetIssue(params, context) {
  const issueKey = sanitizeString(params.issueKey);

  if (!issueKey) {
    return {
      result: 'Error: The "issueKey" parameter is required for get_issue.',
      metadata: { success: false, error: 'MISSING_ISSUE_KEY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `jira/rest/api/3/issue/${issueKey}`,
      { params: {} },
      timeoutMs
    );

    const fields = data.fields || {};
    const result = [
      `Issue: ${data.key || issueKey}`,
      `Summary: ${fields.summary || 'N/A'}`,
      `Status: ${fields.status?.name || 'N/A'}`,
      `Issue Type: ${fields.issuetype?.name || 'N/A'}`,
      `Priority: ${fields.priority?.name || 'N/A'}`,
      `Assignee: ${fields.assignee?.displayName || 'Unassigned'}`,
      `Reporter: ${fields.reporter?.displayName || 'N/A'}`,
      `Labels: ${Array.isArray(fields.labels) && fields.labels.length > 0 ? fields.labels.join(', ') : 'None'}`,
      `Created: ${fields.created || 'N/A'}`,
      `Updated: ${fields.updated || 'N/A'}`,
      `Description: ${fields.description ? (typeof fields.description === 'string' ? fields.description : JSON.stringify(fields.description)) : 'No description'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_issue',
        layer: 'L1',
        issueKey: data.key || issueKey,
        summary: fields.summary || null,
        status: fields.status?.name || null,
        issueType: fields.issuetype?.name || null,
        priority: fields.priority?.name || null,
        assignee: fields.assignee?.displayName || null,
        reporter: fields.reporter?.displayName || null,
        labels: fields.labels || [],
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
 * create_issue - Create a new Jira issue.
 */
async function handleCreateIssue(params, context) {
  const projectKey = sanitizeString(params.projectKey);
  const summary = sanitizeString(params.summary);

  if (!projectKey) {
    return {
      result: 'Error: The "projectKey" parameter is required for create_issue.',
      metadata: { success: false, error: 'MISSING_PROJECT_KEY' },
    };
  }
  if (!summary) {
    return {
      result: 'Error: The "summary" parameter is required for create_issue.',
      metadata: { success: false, error: 'MISSING_SUMMARY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const issueType = sanitizeString(params.issueType) || 'Task';
  const description = sanitizeString(params.description) || '';
  const priority = sanitizeString(params.priority);
  const assignee = sanitizeString(params.assignee);
  const labels = Array.isArray(params.labels) ? params.labels.map((l) => sanitizeString(l)) : [];

  const issueFields = {
    project: { key: projectKey },
    summary,
    issuetype: { name: issueType },
  };

  if (description) {
    issueFields.description = {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
    };
  }
  if (priority) {
    issueFields.priority = { name: priority };
  }
  if (assignee) {
    issueFields.assignee = { accountId: assignee };
  }
  if (labels.length > 0) {
    issueFields.labels = labels;
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'jira/rest/api/3/issue',
      {
        method: 'POST',
        body: { fields: issueFields },
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Issue ${data.key} created: ${summary}\nURL: ${data.self || 'N/A'}`),
      metadata: {
        success: true,
        action: 'create_issue',
        layer: 'L1',
        issueKey: data.key,
        issueId: data.id || null,
        summary,
        projectKey,
        issueType,
        url: data.self || null,
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
 * update_issue - Update fields on an existing Jira issue.
 */
async function handleUpdateIssue(params, context) {
  const issueKey = sanitizeString(params.issueKey);
  const fields = params.fields;

  if (!issueKey) {
    return {
      result: 'Error: The "issueKey" parameter is required for update_issue.',
      metadata: { success: false, error: 'MISSING_ISSUE_KEY' },
    };
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return {
      result: 'Error: The "fields" parameter is required for update_issue and must be an object.',
      metadata: { success: false, error: 'MISSING_FIELDS' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    await fetchWithTimeout(
      resolved.client,
      `jira/rest/api/3/issue/${issueKey}`,
      {
        method: 'PUT',
        body: { fields },
      },
      timeoutMs
    );

    const updatedFieldNames = Object.keys(fields).join(', ');
    return {
      result: redactSensitive(`Issue ${issueKey} updated. Fields modified: ${updatedFieldNames}`),
      metadata: {
        success: true,
        action: 'update_issue',
        layer: 'L1',
        issueKey,
        updatedFields: Object.keys(fields),
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
 * transition_issue - Change issue status via transition.
 */
async function handleTransitionIssue(params, context) {
  const issueKey = sanitizeString(params.issueKey);
  const transitionId = sanitizeString(params.transitionId);

  if (!issueKey) {
    return {
      result: 'Error: The "issueKey" parameter is required for transition_issue.',
      metadata: { success: false, error: 'MISSING_ISSUE_KEY' },
    };
  }
  if (!transitionId) {
    return {
      result: 'Error: The "transitionId" parameter is required for transition_issue.',
      metadata: { success: false, error: 'MISSING_TRANSITION_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    await fetchWithTimeout(
      resolved.client,
      `jira/rest/api/3/issue/${issueKey}/transitions`,
      {
        method: 'POST',
        body: { transition: { id: transitionId } },
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Issue ${issueKey} transitioned successfully (transition ID: ${transitionId}).`),
      metadata: {
        success: true,
        action: 'transition_issue',
        layer: 'L1',
        issueKey,
        transitionId,
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
 * search_issues - Search issues via JQL.
 */
async function handleSearchIssues(params, context) {
  const jql = sanitizeString(params.jql);

  if (!jql) {
    return {
      result: 'Error: The "jql" parameter is required for search_issues.',
      metadata: { success: false, error: 'MISSING_JQL' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxResults = typeof params.maxResults === 'number' && params.maxResults > 0
    ? Math.min(params.maxResults, 100)
    : DEFAULT_MAX_RESULTS;

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'jira/rest/api/3/search',
      { params: { jql, maxResults } },
      timeoutMs
    );

    const issues = Array.isArray(data?.issues) ? data.issues : [];
    const total = data?.total ?? issues.length;

    if (issues.length === 0) {
      return {
        result: `No issues found for JQL: ${jql}`,
        metadata: {
          success: true,
          action: 'search_issues',
          layer: 'L1',
          jql,
          total: 0,
          count: 0,
          issues: [],
        },
      };
    }

    const lines = issues.map(
      (i) => `${i.key} [${i.fields?.status?.name || 'N/A'}] ${i.fields?.summary || 'N/A'} (${i.fields?.assignee?.displayName || 'Unassigned'})`
    );

    return {
      result: redactSensitive(`Search results for "${jql}" (${total} total, showing ${issues.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'search_issues',
        layer: 'L1',
        jql,
        total,
        count: issues.length,
        issues: issues.map((i) => ({
          key: i.key,
          summary: i.fields?.summary || null,
          status: i.fields?.status?.name || null,
          assignee: i.fields?.assignee?.displayName || null,
          priority: i.fields?.priority?.name || null,
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
 * add_comment - Add a comment to an issue.
 */
async function handleAddComment(params, context) {
  const issueKey = sanitizeString(params.issueKey);
  const body = sanitizeString(params.body);

  if (!issueKey) {
    return {
      result: 'Error: The "issueKey" parameter is required for add_comment.',
      metadata: { success: false, error: 'MISSING_ISSUE_KEY' },
    };
  }
  if (!body) {
    return {
      result: 'Error: The "body" parameter is required for add_comment.',
      metadata: { success: false, error: 'MISSING_BODY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `jira/rest/api/3/issue/${issueKey}/comment`,
      {
        method: 'POST',
        body: {
          body: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
          },
        },
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Comment added to ${issueKey} (comment ID: ${data.id || 'N/A'}).`),
      metadata: {
        success: true,
        action: 'add_comment',
        layer: 'L1',
        issueKey,
        commentId: data.id || null,
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
 * list_transitions - List available transitions for an issue.
 */
async function handleListTransitions(params, context) {
  const issueKey = sanitizeString(params.issueKey);

  if (!issueKey) {
    return {
      result: 'Error: The "issueKey" parameter is required for list_transitions.',
      metadata: { success: false, error: 'MISSING_ISSUE_KEY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `jira/rest/api/3/issue/${issueKey}/transitions`,
      { params: {} },
      timeoutMs
    );

    const transitions = Array.isArray(data?.transitions) ? data.transitions : [];

    if (transitions.length === 0) {
      return {
        result: `No transitions available for ${issueKey}.`,
        metadata: {
          success: true,
          action: 'list_transitions',
          layer: 'L1',
          issueKey,
          count: 0,
          transitions: [],
        },
      };
    }

    const lines = transitions.map(
      (t) => `${t.id} - ${t.name} (to: ${t.to?.name || 'N/A'})`
    );

    return {
      result: redactSensitive(`Transitions for ${issueKey} (${transitions.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_transitions',
        layer: 'L1',
        issueKey,
        count: transitions.length,
        transitions: transitions.map((t) => ({
          id: t.id,
          name: t.name,
          to: t.to?.name || null,
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
 * assign_issue - Assign an issue to a user.
 */
async function handleAssignIssue(params, context) {
  const issueKey = sanitizeString(params.issueKey);
  const accountId = sanitizeString(params.accountId);

  if (!issueKey) {
    return {
      result: 'Error: The "issueKey" parameter is required for assign_issue.',
      metadata: { success: false, error: 'MISSING_ISSUE_KEY' },
    };
  }
  if (!accountId) {
    return {
      result: 'Error: The "accountId" parameter is required for assign_issue.',
      metadata: { success: false, error: 'MISSING_ACCOUNT_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    await fetchWithTimeout(
      resolved.client,
      `jira/rest/api/3/issue/${issueKey}/assignee`,
      {
        method: 'PUT',
        body: { accountId },
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Issue ${issueKey} assigned to account ${accountId}.`),
      metadata: {
        success: true,
        action: 'assign_issue',
        layer: 'L1',
        issueKey,
        accountId,
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
 * Execute a Jira management operation.
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
      case 'get_issue':
        return await handleGetIssue(params, context);
      case 'create_issue':
        return await handleCreateIssue(params, context);
      case 'update_issue':
        return await handleUpdateIssue(params, context);
      case 'transition_issue':
        return await handleTransitionIssue(params, context);
      case 'search_issues':
        return await handleSearchIssues(params, context);
      case 'add_comment':
        return await handleAddComment(params, context);
      case 'list_transitions':
        return await handleListTransitions(params, context);
      case 'assign_issue':
        return await handleAssignIssue(params, context);
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
