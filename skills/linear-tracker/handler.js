/**
 * Linear Tracker Skill Handler (Layer 1)
 *
 * Manage Linear issues, projects, and cycles via the Linear GraphQL API:
 * create/update/list/get issues, create/list projects, add comments,
 * search issues, and manage cycles.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://api.linear.app/...)
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
  'create_issue', 'update_issue', 'list_issues', 'get_issue',
  'create_project', 'list_projects', 'add_comment',
  'search_issues', 'manage_cycle',
];

const VALID_CYCLE_SUB_ACTIONS = ['create', 'list', 'get', 'add_issue'];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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
    result: 'Error: Provider client required for Linear API access. Configure the platform adapter.',
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
  /lin_api_[A-Za-z0-9]{30,}/g,
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
 * Clamp limit to valid range.
 *
 * @param {*} value
 * @returns {number}
 */
function clampLimit(value) {
  const n = typeof value === 'number' ? value : DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
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
// GraphQL with timeout
// ---------------------------------------------------------------------------

/**
 * Execute a GraphQL query through the provider client with timeout enforcement.
 *
 * @param {Object} client - The provider or gateway client (must have .graphql())
 * @param {string} query - GraphQL query or mutation string
 * @param {Object} variables - GraphQL variables
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function graphqlWithTimeout(client, query, variables, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.graphql(query, variables, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'GRAPHQL_ERROR', message: err.message || 'Unknown GraphQL error' };
  }
}

// ---------------------------------------------------------------------------
// GraphQL queries and mutations
// ---------------------------------------------------------------------------

const QUERIES = {
  createIssue: `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
          state { name }
          priority
          assignee { name }
        }
      }
    }
  `,

  updateIssue: `
    mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          identifier
          title
          url
          state { name }
          priority
          assignee { name }
        }
      }
    }
  `,

  listIssues: `
    query Issues($filter: IssueFilter, $first: Int) {
      issues(filter: $filter, first: $first) {
        nodes {
          id
          identifier
          title
          state { name }
          priority
          assignee { name }
          createdAt
          url
        }
      }
    }
  `,

  getIssue: `
    query Issue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        state { name }
        priority
        assignee { name }
        creator { name }
        labels { nodes { name } }
        createdAt
        updatedAt
        url
        team { name }
      }
    }
  `,

  createProject: `
    mutation ProjectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project {
          id
          name
          description
          url
          state
        }
      }
    }
  `,

  listProjects: `
    query Projects($first: Int) {
      projects(first: $first) {
        nodes {
          id
          name
          description
          state
          url
          startDate
          targetDate
        }
      }
    }
  `,

  addComment: `
    mutation CommentCreate($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
          body
          createdAt
          user { name }
        }
      }
    }
  `,

  searchIssues: `
    query SearchIssues($query: String!, $first: Int) {
      searchIssues(query: $query, first: $first) {
        nodes {
          id
          identifier
          title
          state { name }
          priority
          assignee { name }
          url
        }
      }
    }
  `,

  createCycle: `
    mutation CycleCreate($input: CycleCreateInput!) {
      cycleCreate(input: $input) {
        success
        cycle {
          id
          name
          number
          startsAt
          endsAt
          url
        }
      }
    }
  `,

  listCycles: `
    query Cycles($first: Int) {
      cycles(first: $first) {
        nodes {
          id
          name
          number
          startsAt
          endsAt
          url
        }
      }
    }
  `,

  getCycle: `
    query Cycle($id: String!) {
      cycle(id: $id) {
        id
        name
        number
        startsAt
        endsAt
        url
        issues {
          nodes {
            id
            identifier
            title
            state { name }
          }
        }
      }
    }
  `,

  addIssueToCycle: `
    mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          identifier
          title
          cycle { id name }
        }
      }
    }
  `,
};

// ---------------------------------------------------------------------------
// Priority label helper
// ---------------------------------------------------------------------------

const PRIORITY_LABELS = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

function priorityLabel(value) {
  return PRIORITY_LABELS[value] ?? `Priority ${value}`;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * create_issue - Create a new Linear issue.
 */
async function handleCreateIssue(params, context) {
  const title = sanitizeString(params.title);
  const teamId = sanitizeString(params.teamId);

  if (!title) {
    return {
      result: 'Error: The "title" parameter is required for create_issue.',
      metadata: { success: false, error: 'MISSING_TITLE' },
    };
  }
  if (!teamId) {
    return {
      result: 'Error: The "teamId" parameter is required for create_issue.',
      metadata: { success: false, error: 'MISSING_TEAM_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const description = sanitizeString(params.description) || undefined;
  const assigneeId = sanitizeString(params.assigneeId) || undefined;
  const stateId = sanitizeString(params.stateId) || undefined;
  const labelIds = Array.isArray(params.labelIds) ? params.labelIds : undefined;
  const priority = typeof params.priority === 'number' ? params.priority : undefined;

  const input = { title, teamId };
  if (description) input.description = description;
  if (assigneeId) input.assigneeId = assigneeId;
  if (stateId) input.stateId = stateId;
  if (labelIds) input.labelIds = labelIds;
  if (priority !== undefined) input.priority = priority;

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.createIssue, { input }, timeoutMs
    );

    const issue = data?.issueCreate?.issue;
    if (!data?.issueCreate?.success || !issue) {
      return {
        result: 'Error: Failed to create issue in Linear.',
        metadata: { success: false, error: 'CREATE_FAILED' },
      };
    }

    return {
      result: redactSensitive(
        `Issue ${issue.identifier} created: ${issue.title}\nURL: ${issue.url || 'N/A'}`
      ),
      metadata: {
        success: true,
        action: 'create_issue',
        layer: 'L1',
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url || null,
        state: issue.state?.name || null,
        priority: issue.priority ?? null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * update_issue - Update an existing Linear issue.
 */
async function handleUpdateIssue(params, context) {
  const issueId = sanitizeString(params.issueId);

  if (!issueId) {
    return {
      result: 'Error: The "issueId" parameter is required for update_issue.',
      metadata: { success: false, error: 'MISSING_ISSUE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const input = {};

  const title = sanitizeString(params.title);
  const description = sanitizeString(params.description);
  const assigneeId = sanitizeString(params.assigneeId);
  const stateId = sanitizeString(params.stateId);

  if (title) input.title = title;
  if (description !== undefined) input.description = description;
  if (typeof params.priority === 'number') input.priority = params.priority;
  if (stateId) input.stateId = stateId;
  if (assigneeId) input.assigneeId = assigneeId;

  if (Object.keys(input).length === 0) {
    return {
      result: 'Error: At least one field to update must be provided.',
      metadata: { success: false, error: 'NO_UPDATE_FIELDS' },
    };
  }

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.updateIssue, { id: issueId, input }, timeoutMs
    );

    const issue = data?.issueUpdate?.issue;
    if (!data?.issueUpdate?.success || !issue) {
      return {
        result: 'Error: Failed to update issue in Linear.',
        metadata: { success: false, error: 'UPDATE_FAILED' },
      };
    }

    const updatedFields = Object.keys(input);
    return {
      result: redactSensitive(
        `Issue ${issue.identifier} updated. Fields modified: ${updatedFields.join(', ')}`
      ),
      metadata: {
        success: true,
        action: 'update_issue',
        layer: 'L1',
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        updatedFields,
        url: issue.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * list_issues - List issues with filters.
 */
async function handleListIssues(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = clampLimit(params.limit);

  const filter = {};
  const teamId = sanitizeString(params.teamId);
  const stateId = sanitizeString(params.stateId);
  const assigneeId = sanitizeString(params.assigneeId);

  if (teamId) filter.team = { id: { eq: teamId } };
  if (stateId) filter.state = { id: { eq: stateId } };
  if (assigneeId) filter.assignee = { id: { eq: assigneeId } };

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.listIssues, { filter, first: limit }, timeoutMs
    );

    const issues = data?.issues?.nodes || [];

    if (issues.length === 0) {
      return {
        result: 'No Linear issues found matching the filters.',
        metadata: {
          success: true,
          action: 'list_issues',
          layer: 'L1',
          count: 0,
          issues: [],
        },
      };
    }

    const lines = issues.map(
      (i) => `${i.identifier} [${i.state?.name || 'N/A'}] ${i.title} (${i.assignee?.name || 'Unassigned'}) [${priorityLabel(i.priority)}]`
    );

    return {
      result: redactSensitive(`Linear Issues (${issues.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_issues',
        layer: 'L1',
        count: issues.length,
        issues: issues.map((i) => ({
          id: i.id,
          identifier: i.identifier,
          title: i.title,
          state: i.state?.name || null,
          priority: i.priority ?? null,
          assignee: i.assignee?.name || null,
          url: i.url || null,
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * get_issue - Get a single issue by ID.
 */
async function handleGetIssue(params, context) {
  const issueId = sanitizeString(params.issueId);

  if (!issueId) {
    return {
      result: 'Error: The "issueId" parameter is required for get_issue.',
      metadata: { success: false, error: 'MISSING_ISSUE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.getIssue, { id: issueId }, timeoutMs
    );

    const issue = data?.issue;
    if (!issue) {
      return {
        result: `Error: Issue "${issueId}" not found.`,
        metadata: { success: false, error: 'NOT_FOUND' },
      };
    }

    const labels = issue.labels?.nodes?.map((l) => l.name) || [];

    const result = [
      `Issue: ${issue.identifier}`,
      `Title: ${issue.title}`,
      `State: ${issue.state?.name || 'N/A'}`,
      `Priority: ${priorityLabel(issue.priority)}`,
      `Assignee: ${issue.assignee?.name || 'Unassigned'}`,
      `Creator: ${issue.creator?.name || 'N/A'}`,
      `Team: ${issue.team?.name || 'N/A'}`,
      `Labels: ${labels.length > 0 ? labels.join(', ') : 'None'}`,
      `Created: ${issue.createdAt || 'N/A'}`,
      `Updated: ${issue.updatedAt || 'N/A'}`,
      `Description: ${issue.description || 'No description'}`,
      `URL: ${issue.url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_issue',
        layer: 'L1',
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        state: issue.state?.name || null,
        priority: issue.priority ?? null,
        assignee: issue.assignee?.name || null,
        creator: issue.creator?.name || null,
        team: issue.team?.name || null,
        labels,
        url: issue.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * create_project - Create a new Linear project.
 */
async function handleCreateProject(params, context) {
  const name = sanitizeString(params.name);
  const teamIds = Array.isArray(params.teamIds) ? params.teamIds : [];

  if (!name) {
    return {
      result: 'Error: The "name" parameter is required for create_project.',
      metadata: { success: false, error: 'MISSING_NAME' },
    };
  }
  if (teamIds.length === 0) {
    return {
      result: 'Error: The "teamIds" parameter is required for create_project.',
      metadata: { success: false, error: 'MISSING_TEAM_IDS' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const description = sanitizeString(params.description) || undefined;
  const targetDate = sanitizeString(params.targetDate) || undefined;

  const input = { name, teamIds };
  if (description) input.description = description;
  if (targetDate) input.targetDate = targetDate;

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.createProject, { input }, timeoutMs
    );

    const project = data?.projectCreate?.project;
    if (!data?.projectCreate?.success || !project) {
      return {
        result: 'Error: Failed to create project in Linear.',
        metadata: { success: false, error: 'CREATE_FAILED' },
      };
    }

    return {
      result: redactSensitive(
        `Project created: ${project.name}\nURL: ${project.url || 'N/A'}`
      ),
      metadata: {
        success: true,
        action: 'create_project',
        layer: 'L1',
        projectId: project.id,
        name: project.name,
        description: project.description || null,
        state: project.state || null,
        url: project.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * list_projects - List all projects.
 */
async function handleListProjects(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = clampLimit(params.limit);

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.listProjects, { first: limit }, timeoutMs
    );

    const projects = data?.projects?.nodes || [];

    if (projects.length === 0) {
      return {
        result: 'No Linear projects found.',
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
      (p) => `${p.name} (${p.state || 'N/A'}) - ${p.description || 'No description'}`
    );

    return {
      result: redactSensitive(`Linear Projects (${projects.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_projects',
        layer: 'L1',
        count: projects.length,
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || null,
          state: p.state || null,
          url: p.url || null,
          targetDate: p.targetDate || null,
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * add_comment - Add a comment to an issue.
 */
async function handleAddComment(params, context) {
  const issueId = sanitizeString(params.issueId);
  const body = sanitizeString(params.body);

  if (!issueId) {
    return {
      result: 'Error: The "issueId" parameter is required for add_comment.',
      metadata: { success: false, error: 'MISSING_ISSUE_ID' },
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
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.addComment, { input: { issueId, body } }, timeoutMs
    );

    const comment = data?.commentCreate?.comment;
    if (!data?.commentCreate?.success || !comment) {
      return {
        result: 'Error: Failed to add comment in Linear.',
        metadata: { success: false, error: 'CREATE_FAILED' },
      };
    }

    return {
      result: redactSensitive(
        `Comment added to issue (comment ID: ${comment.id}).`
      ),
      metadata: {
        success: true,
        action: 'add_comment',
        layer: 'L1',
        issueId,
        commentId: comment.id,
        createdAt: comment.createdAt || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * search_issues - Search issues by query string.
 */
async function handleSearchIssues(params, context) {
  const query = sanitizeString(params.query);

  if (!query) {
    return {
      result: 'Error: The "query" parameter is required for search_issues.',
      metadata: { success: false, error: 'MISSING_QUERY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = clampLimit(params.limit);

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.searchIssues, { query, first: limit }, timeoutMs
    );

    const issues = data?.searchIssues?.nodes || [];

    if (issues.length === 0) {
      return {
        result: `No issues found for query: "${query}"`,
        metadata: {
          success: true,
          action: 'search_issues',
          layer: 'L1',
          query,
          count: 0,
          issues: [],
        },
      };
    }

    const lines = issues.map(
      (i) => `${i.identifier} [${i.state?.name || 'N/A'}] ${i.title} (${i.assignee?.name || 'Unassigned'})`
    );

    return {
      result: redactSensitive(
        `Search results for "${query}" (${issues.length}):\n${lines.join('\n')}`
      ),
      metadata: {
        success: true,
        action: 'search_issues',
        layer: 'L1',
        query,
        count: issues.length,
        issues: issues.map((i) => ({
          id: i.id,
          identifier: i.identifier,
          title: i.title,
          state: i.state?.name || null,
          priority: i.priority ?? null,
          assignee: i.assignee?.name || null,
          url: i.url || null,
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * manage_cycle - Manage Linear cycles (create, list, get, add_issue).
 */
async function handleManageCycle(params, context) {
  const subAction = sanitizeString(params.subAction);

  if (!subAction || !VALID_CYCLE_SUB_ACTIONS.includes(subAction)) {
    return {
      result: `Error: Invalid subAction "${subAction}". Must be one of: ${VALID_CYCLE_SUB_ACTIONS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_SUB_ACTION' },
    };
  }

  switch (subAction) {
    case 'create':
      return await handleCycleCreate(params, context);
    case 'list':
      return await handleCycleList(params, context);
    case 'get':
      return await handleCycleGet(params, context);
    case 'add_issue':
      return await handleCycleAddIssue(params, context);
    default:
      return {
        result: `Error: Unknown cycle subAction "${subAction}".`,
        metadata: { success: false, error: 'INVALID_SUB_ACTION' },
      };
  }
}

/**
 * manage_cycle / create - Create a new cycle.
 */
async function handleCycleCreate(params, context) {
  const name = sanitizeString(params.name);
  const teamId = sanitizeString(params.teamId);
  const startsAt = sanitizeString(params.startsAt);
  const endsAt = sanitizeString(params.endsAt);

  if (!teamId) {
    return {
      result: 'Error: The "teamId" parameter is required for cycle create.',
      metadata: { success: false, error: 'MISSING_TEAM_ID' },
    };
  }
  if (!startsAt) {
    return {
      result: 'Error: The "startsAt" parameter is required for cycle create.',
      metadata: { success: false, error: 'MISSING_STARTS_AT' },
    };
  }
  if (!endsAt) {
    return {
      result: 'Error: The "endsAt" parameter is required for cycle create.',
      metadata: { success: false, error: 'MISSING_ENDS_AT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const input = { teamId, startsAt, endsAt };
  if (name) input.name = name;

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.createCycle, { input }, timeoutMs
    );

    const cycle = data?.cycleCreate?.cycle;
    if (!data?.cycleCreate?.success || !cycle) {
      return {
        result: 'Error: Failed to create cycle in Linear.',
        metadata: { success: false, error: 'CREATE_FAILED' },
      };
    }

    return {
      result: redactSensitive(
        `Cycle created: ${cycle.name || `Cycle ${cycle.number}`}\nURL: ${cycle.url || 'N/A'}`
      ),
      metadata: {
        success: true,
        action: 'manage_cycle',
        subAction: 'create',
        layer: 'L1',
        cycleId: cycle.id,
        name: cycle.name || null,
        number: cycle.number || null,
        startsAt: cycle.startsAt || null,
        endsAt: cycle.endsAt || null,
        url: cycle.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * manage_cycle / list - List cycles.
 */
async function handleCycleList(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = clampLimit(params.limit);

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.listCycles, { first: limit }, timeoutMs
    );

    const cycles = data?.cycles?.nodes || [];

    if (cycles.length === 0) {
      return {
        result: 'No Linear cycles found.',
        metadata: {
          success: true,
          action: 'manage_cycle',
          subAction: 'list',
          layer: 'L1',
          count: 0,
          cycles: [],
        },
      };
    }

    const lines = cycles.map(
      (c) => `${c.name || `Cycle ${c.number}`} (${c.startsAt || 'N/A'} - ${c.endsAt || 'N/A'})`
    );

    return {
      result: redactSensitive(`Linear Cycles (${cycles.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'manage_cycle',
        subAction: 'list',
        layer: 'L1',
        count: cycles.length,
        cycles: cycles.map((c) => ({
          id: c.id,
          name: c.name || null,
          number: c.number || null,
          startsAt: c.startsAt || null,
          endsAt: c.endsAt || null,
          url: c.url || null,
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * manage_cycle / get - Get cycle details.
 */
async function handleCycleGet(params, context) {
  const cycleId = sanitizeString(params.cycleId);

  if (!cycleId) {
    return {
      result: 'Error: The "cycleId" parameter is required for cycle get.',
      metadata: { success: false, error: 'MISSING_CYCLE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.getCycle, { id: cycleId }, timeoutMs
    );

    const cycle = data?.cycle;
    if (!cycle) {
      return {
        result: `Error: Cycle "${cycleId}" not found.`,
        metadata: { success: false, error: 'NOT_FOUND' },
      };
    }

    const issues = cycle.issues?.nodes || [];
    const issueLines = issues.map(
      (i) => `  ${i.identifier} [${i.state?.name || 'N/A'}] ${i.title}`
    );

    const result = [
      `Cycle: ${cycle.name || `Cycle ${cycle.number}`}`,
      `ID: ${cycle.id}`,
      `Period: ${cycle.startsAt || 'N/A'} - ${cycle.endsAt || 'N/A'}`,
      `Issues (${issues.length}):`,
      ...(issueLines.length > 0 ? issueLines : ['  No issues']),
      `URL: ${cycle.url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'manage_cycle',
        subAction: 'get',
        layer: 'L1',
        cycleId: cycle.id,
        name: cycle.name || null,
        number: cycle.number || null,
        startsAt: cycle.startsAt || null,
        endsAt: cycle.endsAt || null,
        issueCount: issues.length,
        url: cycle.url || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

/**
 * manage_cycle / add_issue - Add an issue to a cycle.
 */
async function handleCycleAddIssue(params, context) {
  const cycleId = sanitizeString(params.cycleId);
  const issueId = sanitizeString(params.issueId);

  if (!cycleId) {
    return {
      result: 'Error: The "cycleId" parameter is required for cycle add_issue.',
      metadata: { success: false, error: 'MISSING_CYCLE_ID' },
    };
  }
  if (!issueId) {
    return {
      result: 'Error: The "issueId" parameter is required for cycle add_issue.',
      metadata: { success: false, error: 'MISSING_ISSUE_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await graphqlWithTimeout(
      resolved.client, QUERIES.addIssueToCycle, { id: issueId, input: { cycleId } }, timeoutMs
    );

    const issue = data?.issueUpdate?.issue;
    if (!data?.issueUpdate?.success || !issue) {
      return {
        result: 'Error: Failed to add issue to cycle.',
        metadata: { success: false, error: 'UPDATE_FAILED' },
      };
    }

    return {
      result: redactSensitive(
        `Issue ${issue.identifier} added to cycle ${issue.cycle?.name || cycleId}.`
      ),
      metadata: {
        success: true,
        action: 'manage_cycle',
        subAction: 'add_issue',
        layer: 'L1',
        issueId: issue.id,
        identifier: issue.identifier,
        cycleId,
        cycleName: issue.cycle?.name || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'GRAPHQL_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Linear tracker operation.
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
      case 'create_issue':
        return await handleCreateIssue(params, context);
      case 'update_issue':
        return await handleUpdateIssue(params, context);
      case 'list_issues':
        return await handleListIssues(params, context);
      case 'get_issue':
        return await handleGetIssue(params, context);
      case 'create_project':
        return await handleCreateProject(params, context);
      case 'list_projects':
        return await handleListProjects(params, context);
      case 'add_comment':
        return await handleAddComment(params, context);
      case 'search_issues':
        return await handleSearchIssues(params, context);
      case 'manage_cycle':
        return await handleManageCycle(params, context);
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
