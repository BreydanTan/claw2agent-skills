/**
 * GitHub API Skill Handler (Layer 1)
 *
 * Interact with the GitHub API to manage repositories, issues, pull requests,
 * and search code.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 15s, max 30s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'get_repo',
  'list_repos',
  'get_issue',
  'list_issues',
  'create_issue',
  'get_pull_request',
  'list_pull_requests',
  'search_code',
];

const VALID_REPO_SORTS = ['updated', 'created', 'pushed', 'full_name'];
const VALID_ISSUE_SORTS = ['created', 'updated', 'comments'];
const VALID_PR_SORTS = ['created', 'updated', 'popularity'];
const VALID_ISSUE_STATES = ['open', 'closed', 'all'];
const VALID_PR_STATES = ['open', 'closed', 'all'];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const DEFAULT_LIMIT = 30;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const MAX_TITLE_LENGTH = 256;
const MAX_BODY_LENGTH = 65536;
const MAX_QUERY_LENGTH = 256;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the provider or gateway client from context.
 * L1 prefers providerClient; falls back to gatewayClient.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
function getClient(context) {
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
    result: 'Error: Provider client required for GitHub API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for GitHub API access. Configure an API key or platform adapter.',
        retriable: false,
      },
    },
  };
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
// Request with timeout
// ---------------------------------------------------------------------------

/**
 * Send a request through the provider client with timeout.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The API path
 * @param {Object|null} body - Request body
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, body, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown request error' };
  }
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
];

/**
 * Redact sensitive tokens/keys from a string.
 *
 * @param {string} text
 * @returns {string}
 */
function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate owner or repo name: alphanumeric, hyphens, dots allowed.
 *
 * @param {*} value
 * @param {string} label
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateOwnerRepo(value, label) {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: `The "${label}" parameter is required and must be a non-empty string.` };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: `The "${label}" parameter must not be empty.` };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return { valid: false, error: `The "${label}" parameter contains invalid characters. Only alphanumeric, hyphens, and dots are allowed.` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate an issue or PR number (positive integer).
 *
 * @param {*} value
 * @param {string} label
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateIssueNumber(value, label) {
  if (value === undefined || value === null) {
    return { valid: false, error: `The "${label}" parameter is required.` };
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    return { valid: false, error: `The "${label}" parameter must be a positive integer.` };
  }
  return { valid: true, value: num };
}

/**
 * Validate a sort value against allowed options.
 *
 * @param {*} value
 * @param {string[]} validValues
 * @param {string} defaultValue
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateSort(value, validValues, defaultValue) {
  if (value === undefined || value === null) {
    return { valid: true, value: defaultValue };
  }
  if (typeof value !== 'string' || !validValues.includes(value)) {
    return { valid: false, error: `Invalid sort "${value}". Must be one of: ${validValues.join(', ')}` };
  }
  return { valid: true, value };
}

/**
 * Validate a state value against allowed options.
 *
 * @param {*} value
 * @param {string[]} validValues
 * @param {string} defaultValue
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateState(value, validValues, defaultValue) {
  if (value === undefined || value === null) {
    return { valid: true, value: defaultValue };
  }
  if (typeof value !== 'string' || !validValues.includes(value)) {
    return { valid: false, error: `Invalid state "${value}". Must be one of: ${validValues.join(', ')}` };
  }
  return { valid: true, value };
}

/**
 * Validate and clamp the limit parameter.
 *
 * @param {*} value
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLimit(value) {
  if (value === undefined || value === null) {
    return { valid: true, value: DEFAULT_LIMIT };
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    return { valid: false, error: `The "limit" parameter must be a positive integer.` };
  }
  return { valid: true, value: Math.min(Math.max(num, MIN_LIMIT), MAX_LIMIT) };
}

/**
 * Validate a query string.
 *
 * @param {*} value
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateQuery(value) {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'The "query" parameter is required and must be a non-empty string.' };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "query" parameter must not be empty.' };
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters (got ${trimmed.length}).` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate a title string.
 *
 * @param {*} value
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateTitle(value) {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'The "title" parameter is required and must be a non-empty string.' };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "title" parameter must not be empty.' };
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return { valid: false, error: `Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters (got ${trimmed.length}).` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate the optional body string.
 *
 * @param {*} value
 * @returns {{ valid: boolean, value?: string|null, error?: string }}
 */
function validateBody(value) {
  if (value === undefined || value === null) {
    return { valid: true, value: null };
  }
  if (typeof value !== 'string') {
    return { valid: false, error: 'The "body" parameter must be a string.' };
  }
  if (value.length > MAX_BODY_LENGTH) {
    return { valid: false, error: `Body exceeds maximum length of ${MAX_BODY_LENGTH} characters (got ${value.length}).` };
  }
  return { valid: true, value };
}

/**
 * Validate the optional labels array.
 *
 * @param {*} value
 * @returns {{ valid: boolean, value?: string[], error?: string }}
 */
function validateLabels(value) {
  if (value === undefined || value === null) {
    return { valid: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return { valid: false, error: 'The "labels" parameter must be an array of strings.' };
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      return { valid: false, error: `Label at index ${i} must be a string.` };
    }
  }
  return { valid: true, value };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle get_repo action -- get repository details.
 */
async function handleGetRepo(params, context) {
  const ownerV = validateOwnerRepo(params.owner, 'owner');
  if (!ownerV.valid) return { result: `Error: ${ownerV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const repoV = validateOwnerRepo(params.repo, 'repo');
  if (!repoV.valid) return { result: `Error: ${repoV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/repos/${ownerV.value}/${repoV.value}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const lines = [
      `Repository: ${data.full_name || `${ownerV.value}/${repoV.value}`}`,
      data.description ? `Description: ${data.description}` : null,
      `Stars: ${data.stargazers_count ?? 'N/A'} | Forks: ${data.forks_count ?? 'N/A'} | Open Issues: ${data.open_issues_count ?? 'N/A'}`,
      `Language: ${data.language || 'N/A'}`,
      `Default Branch: ${data.default_branch || 'N/A'}`,
      data.html_url ? `URL: ${data.html_url}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_repo',
        layer: 'L1',
        owner: ownerV.value,
        repo: repoV.value,
        data,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle list_repos action -- list user repositories.
 */
async function handleListRepos(params, context) {
  const usernameV = validateOwnerRepo(params.username, 'username');
  if (!usernameV.valid) return { result: `Error: ${usernameV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const sortV = validateSort(params.sort, VALID_REPO_SORTS, 'updated');
  if (!sortV.valid) return { result: `Error: ${sortV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const limitV = validateLimit(params.limit);
  if (!limitV.valid) return { result: `Error: ${limitV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/users/${usernameV.value}/repos?sort=${sortV.value}&per_page=${limitV.value}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const repos = Array.isArray(data) ? data : (data?.items || []);
    const lines = [
      `Repositories for ${usernameV.value} (${repos.length} results, sort: ${sortV.value})`,
      '',
      ...repos.map((r, i) => `${i + 1}. ${r.full_name || r.name} - ${r.description || 'No description'} (Stars: ${r.stargazers_count ?? 0})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_repos',
        layer: 'L1',
        username: usernameV.value,
        sort: sortV.value,
        limit: limitV.value,
        count: repos.length,
        repos,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle get_issue action -- get issue details.
 */
async function handleGetIssue(params, context) {
  const ownerV = validateOwnerRepo(params.owner, 'owner');
  if (!ownerV.valid) return { result: `Error: ${ownerV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const repoV = validateOwnerRepo(params.repo, 'repo');
  if (!repoV.valid) return { result: `Error: ${repoV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const issueV = validateIssueNumber(params.issueNumber, 'issueNumber');
  if (!issueV.valid) return { result: `Error: ${issueV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/repos/${ownerV.value}/${repoV.value}/issues/${issueV.value}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const lines = [
      `Issue #${data.number || issueV.value}: ${data.title || 'Untitled'}`,
      `State: ${data.state || 'N/A'}`,
      data.body ? `Body: ${data.body.substring(0, 500)}${data.body.length > 500 ? '...' : ''}` : null,
      `Author: ${data.user?.login || 'N/A'}`,
      data.labels?.length ? `Labels: ${data.labels.map(l => l.name || l).join(', ')}` : null,
      data.html_url ? `URL: ${data.html_url}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_issue',
        layer: 'L1',
        owner: ownerV.value,
        repo: repoV.value,
        issueNumber: issueV.value,
        data,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle list_issues action -- list issues in a repo.
 */
async function handleListIssues(params, context) {
  const ownerV = validateOwnerRepo(params.owner, 'owner');
  if (!ownerV.valid) return { result: `Error: ${ownerV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const repoV = validateOwnerRepo(params.repo, 'repo');
  if (!repoV.valid) return { result: `Error: ${repoV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const stateV = validateState(params.state, VALID_ISSUE_STATES, 'open');
  if (!stateV.valid) return { result: `Error: ${stateV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const sortV = validateSort(params.sort, VALID_ISSUE_SORTS, 'created');
  if (!sortV.valid) return { result: `Error: ${sortV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const limitV = validateLimit(params.limit);
  if (!limitV.valid) return { result: `Error: ${limitV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/repos/${ownerV.value}/${repoV.value}/issues?state=${stateV.value}&sort=${sortV.value}&per_page=${limitV.value}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const issues = Array.isArray(data) ? data : (data?.items || []);
    const lines = [
      `Issues for ${ownerV.value}/${repoV.value} (${issues.length} results, state: ${stateV.value}, sort: ${sortV.value})`,
      '',
      ...issues.map((iss, i) => `${i + 1}. #${iss.number} ${iss.title} [${iss.state}] (by ${iss.user?.login || 'N/A'})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_issues',
        layer: 'L1',
        owner: ownerV.value,
        repo: repoV.value,
        state: stateV.value,
        sort: sortV.value,
        limit: limitV.value,
        count: issues.length,
        issues,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle create_issue action -- create a new issue.
 */
async function handleCreateIssue(params, context) {
  const ownerV = validateOwnerRepo(params.owner, 'owner');
  if (!ownerV.valid) return { result: `Error: ${ownerV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const repoV = validateOwnerRepo(params.repo, 'repo');
  if (!repoV.valid) return { result: `Error: ${repoV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const titleV = validateTitle(params.title);
  if (!titleV.valid) return { result: `Error: ${titleV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const bodyV = validateBody(params.body);
  if (!bodyV.valid) return { result: `Error: ${bodyV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const labelsV = validateLabels(params.labels);
  if (!labelsV.valid) return { result: `Error: ${labelsV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/repos/${ownerV.value}/${repoV.value}/issues`;

  const reqBody = { title: titleV.value };
  if (bodyV.value !== null) reqBody.body = bodyV.value;
  if (labelsV.value.length > 0) reqBody.labels = labelsV.value;

  try {
    const data = await requestWithTimeout(resolved.client, 'POST', path, reqBody, timeoutMs);

    const lines = [
      `Created Issue #${data.number || 'N/A'}: ${data.title || titleV.value}`,
      `State: ${data.state || 'open'}`,
      data.html_url ? `URL: ${data.html_url}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'create_issue',
        layer: 'L1',
        owner: ownerV.value,
        repo: repoV.value,
        title: titleV.value,
        issueNumber: data.number || null,
        data,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle get_pull_request action -- get PR details.
 */
async function handleGetPullRequest(params, context) {
  const ownerV = validateOwnerRepo(params.owner, 'owner');
  if (!ownerV.valid) return { result: `Error: ${ownerV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const repoV = validateOwnerRepo(params.repo, 'repo');
  if (!repoV.valid) return { result: `Error: ${repoV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const prV = validateIssueNumber(params.prNumber, 'prNumber');
  if (!prV.valid) return { result: `Error: ${prV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/repos/${ownerV.value}/${repoV.value}/pulls/${prV.value}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const lines = [
      `PR #${data.number || prV.value}: ${data.title || 'Untitled'}`,
      `State: ${data.state || 'N/A'} | Merged: ${data.merged ? 'Yes' : 'No'}`,
      data.body ? `Body: ${data.body.substring(0, 500)}${data.body.length > 500 ? '...' : ''}` : null,
      `Author: ${data.user?.login || 'N/A'}`,
      `Base: ${data.base?.ref || 'N/A'} <- Head: ${data.head?.ref || 'N/A'}`,
      data.html_url ? `URL: ${data.html_url}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_pull_request',
        layer: 'L1',
        owner: ownerV.value,
        repo: repoV.value,
        prNumber: prV.value,
        data,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle list_pull_requests action -- list PRs in a repo.
 */
async function handleListPullRequests(params, context) {
  const ownerV = validateOwnerRepo(params.owner, 'owner');
  if (!ownerV.valid) return { result: `Error: ${ownerV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const repoV = validateOwnerRepo(params.repo, 'repo');
  if (!repoV.valid) return { result: `Error: ${repoV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const stateV = validateState(params.state, VALID_PR_STATES, 'open');
  if (!stateV.valid) return { result: `Error: ${stateV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const sortV = validateSort(params.sort, VALID_PR_SORTS, 'created');
  if (!sortV.valid) return { result: `Error: ${sortV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const limitV = validateLimit(params.limit);
  if (!limitV.valid) return { result: `Error: ${limitV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/repos/${ownerV.value}/${repoV.value}/pulls?state=${stateV.value}&sort=${sortV.value}&per_page=${limitV.value}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const prs = Array.isArray(data) ? data : (data?.items || []);
    const lines = [
      `Pull Requests for ${ownerV.value}/${repoV.value} (${prs.length} results, state: ${stateV.value}, sort: ${sortV.value})`,
      '',
      ...prs.map((pr, i) => `${i + 1}. #${pr.number} ${pr.title} [${pr.state}] (by ${pr.user?.login || 'N/A'})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_pull_requests',
        layer: 'L1',
        owner: ownerV.value,
        repo: repoV.value,
        state: stateV.value,
        sort: sortV.value,
        limit: limitV.value,
        count: prs.length,
        pullRequests: prs,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle search_code action -- search code across repos.
 */
async function handleSearchCode(params, context) {
  const queryV = validateQuery(params.query);
  if (!queryV.valid) return { result: `Error: ${queryV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const limitV = validateLimit(params.limit);
  if (!limitV.valid) return { result: `Error: ${limitV.error}`, metadata: { success: false, error: 'INVALID_INPUT' } };

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const path = `/search/code?q=${encodeURIComponent(queryV.value)}&per_page=${limitV.value}`;

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', path, null, timeoutMs);

    const items = data?.items || [];
    const totalCount = data?.total_count ?? items.length;
    const lines = [
      `Code search results for "${queryV.value}" (${items.length} of ${totalCount} total)`,
      '',
      ...items.map((item, i) => `${i + 1}. ${item.repository?.full_name || 'N/A'}/${item.path || 'N/A'} (score: ${item.score ?? 'N/A'})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_code',
        layer: 'L1',
        query: queryV.value,
        limit: limitV.value,
        totalCount,
        count: items.length,
        items,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Validate export
// ---------------------------------------------------------------------------

/**
 * Validate params before execution.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
export function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'get_repo': {
      const o = validateOwnerRepo(params.owner, 'owner');
      if (!o.valid) return { valid: false, error: o.error };
      const r = validateOwnerRepo(params.repo, 'repo');
      if (!r.valid) return { valid: false, error: r.error };
      break;
    }
    case 'list_repos': {
      const u = validateOwnerRepo(params.username, 'username');
      if (!u.valid) return { valid: false, error: u.error };
      const s = validateSort(params.sort, VALID_REPO_SORTS, 'updated');
      if (!s.valid) return { valid: false, error: s.error };
      const l = validateLimit(params.limit);
      if (!l.valid) return { valid: false, error: l.error };
      break;
    }
    case 'get_issue': {
      const o = validateOwnerRepo(params.owner, 'owner');
      if (!o.valid) return { valid: false, error: o.error };
      const r = validateOwnerRepo(params.repo, 'repo');
      if (!r.valid) return { valid: false, error: r.error };
      const i = validateIssueNumber(params.issueNumber, 'issueNumber');
      if (!i.valid) return { valid: false, error: i.error };
      break;
    }
    case 'list_issues': {
      const o = validateOwnerRepo(params.owner, 'owner');
      if (!o.valid) return { valid: false, error: o.error };
      const r = validateOwnerRepo(params.repo, 'repo');
      if (!r.valid) return { valid: false, error: r.error };
      const st = validateState(params.state, VALID_ISSUE_STATES, 'open');
      if (!st.valid) return { valid: false, error: st.error };
      const so = validateSort(params.sort, VALID_ISSUE_SORTS, 'created');
      if (!so.valid) return { valid: false, error: so.error };
      const l = validateLimit(params.limit);
      if (!l.valid) return { valid: false, error: l.error };
      break;
    }
    case 'create_issue': {
      const o = validateOwnerRepo(params.owner, 'owner');
      if (!o.valid) return { valid: false, error: o.error };
      const r = validateOwnerRepo(params.repo, 'repo');
      if (!r.valid) return { valid: false, error: r.error };
      const t = validateTitle(params.title);
      if (!t.valid) return { valid: false, error: t.error };
      const b = validateBody(params.body);
      if (!b.valid) return { valid: false, error: b.error };
      const lb = validateLabels(params.labels);
      if (!lb.valid) return { valid: false, error: lb.error };
      break;
    }
    case 'get_pull_request': {
      const o = validateOwnerRepo(params.owner, 'owner');
      if (!o.valid) return { valid: false, error: o.error };
      const r = validateOwnerRepo(params.repo, 'repo');
      if (!r.valid) return { valid: false, error: r.error };
      const p = validateIssueNumber(params.prNumber, 'prNumber');
      if (!p.valid) return { valid: false, error: p.error };
      break;
    }
    case 'list_pull_requests': {
      const o = validateOwnerRepo(params.owner, 'owner');
      if (!o.valid) return { valid: false, error: o.error };
      const r = validateOwnerRepo(params.repo, 'repo');
      if (!r.valid) return { valid: false, error: r.error };
      const st = validateState(params.state, VALID_PR_STATES, 'open');
      if (!st.valid) return { valid: false, error: st.error };
      const so = validateSort(params.sort, VALID_PR_SORTS, 'created');
      if (!so.valid) return { valid: false, error: so.error };
      const l = validateLimit(params.limit);
      if (!l.valid) return { valid: false, error: l.error };
      break;
    }
    case 'search_code': {
      const q = validateQuery(params.query);
      if (!q.valid) return { valid: false, error: q.error };
      const l = validateLimit(params.limit);
      if (!l.valid) return { valid: false, error: l.error };
      break;
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const meta = {
  name: 'github-api',
  version: '1.0.0',
  description: 'GitHub API interaction skill. Manage repositories, issues, pull requests, and search code across GitHub.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a GitHub API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of the VALID_ACTIONS
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  try {
    switch (action) {
      case 'get_repo':
        return await handleGetRepo(params, context);
      case 'list_repos':
        return await handleListRepos(params, context);
      case 'get_issue':
        return await handleGetIssue(params, context);
      case 'list_issues':
        return await handleListIssues(params, context);
      case 'create_issue':
        return await handleCreateIssue(params, context);
      case 'get_pull_request':
        return await handleGetPullRequest(params, context);
      case 'list_pull_requests':
        return await handleListPullRequests(params, context);
      case 'search_code':
        return await handleSearchCode(params, context);
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

// ---------------------------------------------------------------------------
// Export internals for testing
// ---------------------------------------------------------------------------

export {
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
};
