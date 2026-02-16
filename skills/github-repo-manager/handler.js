/**
 * GitHub Repository Manager Skill Handler (Layer 1)
 *
 * Manage GitHub repositories via the GitHub API: get repo info, list repos,
 * create/list/get issues, create/list/get pull requests, and search code.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://api.github.com/...)
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
  'get_repo', 'list_repos',
  'create_issue', 'list_issues', 'get_issue',
  'create_pr', 'list_prs', 'get_pr',
  'search_code',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 30;

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
    result: 'Error: Provider client required for GitHub API access. Configure the platform adapter.',
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
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,
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
 * Clamp perPage to valid range.
 *
 * @param {*} value
 * @returns {number}
 */
function clampPerPage(value) {
  const n = typeof value === 'number' ? value : DEFAULT_PER_PAGE;
  if (n < 1) return 1;
  if (n > MAX_PER_PAGE) return MAX_PER_PAGE;
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
 * get_repo - Get repository information.
 */
async function handleGetRepo(params, context) {
  const owner = sanitizeString(params.owner);
  const repo = sanitizeString(params.repo);

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for get_repo.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }
  if (!repo) {
    return {
      result: 'Error: The "repo" parameter is required for get_repo.',
      metadata: { success: false, error: 'MISSING_REPO' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `github/repos/${owner}/${repo}`,
      { params: {} },
      timeoutMs
    );

    const result = [
      `Repository: ${data.full_name || `${owner}/${repo}`}`,
      `Description: ${data.description || 'N/A'}`,
      `Stars: ${data.stargazers_count ?? 'N/A'} | Forks: ${data.forks_count ?? 'N/A'}`,
      `Language: ${data.language || 'N/A'}`,
      `Topics: ${Array.isArray(data.topics) && data.topics.length > 0 ? data.topics.join(', ') : 'N/A'}`,
      `Default Branch: ${data.default_branch || 'N/A'}`,
      `URL: ${data.html_url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_repo',
        layer: 'L1',
        owner,
        repo,
        name: data.name || repo,
        description: data.description || null,
        stars: data.stargazers_count ?? null,
        forks: data.forks_count ?? null,
        language: data.language || null,
        topics: data.topics || [],
        default_branch: data.default_branch || null,
        url: data.html_url || null,
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
 * list_repos - List repositories for a user or organization.
 */
async function handleListRepos(params, context) {
  const owner = sanitizeString(params.owner);

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for list_repos.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const type = params.type || 'all';
  const sort = params.sort || 'updated';
  const perPage = clampPerPage(params.perPage);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `github/users/${owner}/repos`,
      { params: { type, sort, per_page: perPage } },
      timeoutMs
    );

    const repos = Array.isArray(data) ? data : [];

    if (repos.length === 0) {
      return {
        result: `No repositories found for ${owner}.`,
        metadata: {
          success: true,
          action: 'list_repos',
          layer: 'L1',
          owner,
          count: 0,
          repos: [],
        },
      };
    }

    const lines = repos.map(
      (r) => `${r.full_name || r.name} - ${r.description || 'No description'} (${r.stargazers_count ?? 0} stars)`
    );

    return {
      result: redactSensitive(`Repositories for ${owner} (${repos.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_repos',
        layer: 'L1',
        owner,
        count: repos.length,
        repos: repos.map((r) => ({
          name: r.name,
          full_name: r.full_name,
          description: r.description || null,
          stars: r.stargazers_count ?? 0,
          language: r.language || null,
          url: r.html_url || null,
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
 * create_issue - Create a new issue in a repository.
 */
async function handleCreateIssue(params, context) {
  const owner = sanitizeString(params.owner);
  const repo = sanitizeString(params.repo);
  const title = sanitizeString(params.title);

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for create_issue.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }
  if (!repo) {
    return {
      result: 'Error: The "repo" parameter is required for create_issue.',
      metadata: { success: false, error: 'MISSING_REPO' },
    };
  }
  if (!title) {
    return {
      result: 'Error: The "title" parameter is required for create_issue.',
      metadata: { success: false, error: 'MISSING_TITLE' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const body = sanitizeString(params.body) || '';
  const labels = Array.isArray(params.labels) ? params.labels.map((l) => sanitizeString(l)) : [];
  const assignees = Array.isArray(params.assignees) ? params.assignees.map((a) => sanitizeString(a)) : [];

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `github/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        params: { title, body, labels, assignees },
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Issue #${data.number} created: ${data.title || title}\nURL: ${data.html_url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'create_issue',
        layer: 'L1',
        owner,
        repo,
        issueNumber: data.number,
        title: data.title || title,
        url: data.html_url || null,
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
 * list_issues - List issues for a repository.
 */
async function handleListIssues(params, context) {
  const owner = sanitizeString(params.owner);
  const repo = sanitizeString(params.repo);

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for list_issues.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }
  if (!repo) {
    return {
      result: 'Error: The "repo" parameter is required for list_issues.',
      metadata: { success: false, error: 'MISSING_REPO' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const state = params.state || 'open';
  const perPage = clampPerPage(params.perPage);
  const labels = Array.isArray(params.labels) ? params.labels.join(',') : (params.labels || '');

  try {
    const fetchParams = { state, per_page: perPage };
    if (labels) fetchParams.labels = labels;

    const data = await fetchWithTimeout(
      resolved.client,
      `github/repos/${owner}/${repo}/issues`,
      { params: fetchParams },
      timeoutMs
    );

    const issues = Array.isArray(data) ? data : [];

    if (issues.length === 0) {
      return {
        result: `No ${state} issues found in ${owner}/${repo}.`,
        metadata: {
          success: true,
          action: 'list_issues',
          layer: 'L1',
          owner,
          repo,
          state,
          count: 0,
          issues: [],
        },
      };
    }

    const lines = issues.map(
      (i) => `#${i.number} [${i.state}] ${i.title} (${i.user?.login || 'unknown'})`
    );

    return {
      result: redactSensitive(`Issues in ${owner}/${repo} (${issues.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_issues',
        layer: 'L1',
        owner,
        repo,
        state,
        count: issues.length,
        issues: issues.map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          user: i.user?.login || null,
          url: i.html_url || null,
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
 * get_issue - Get a specific issue.
 */
async function handleGetIssue(params, context) {
  const owner = sanitizeString(params.owner);
  const repo = sanitizeString(params.repo);
  const issueNumber = params.issueNumber;

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for get_issue.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }
  if (!repo) {
    return {
      result: 'Error: The "repo" parameter is required for get_issue.',
      metadata: { success: false, error: 'MISSING_REPO' },
    };
  }
  if (issueNumber === undefined || issueNumber === null || typeof issueNumber !== 'number') {
    return {
      result: 'Error: The "issueNumber" parameter is required for get_issue.',
      metadata: { success: false, error: 'MISSING_ISSUE_NUMBER' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `github/repos/${owner}/${repo}/issues/${issueNumber}`,
      { params: {} },
      timeoutMs
    );

    const labelNames = Array.isArray(data.labels)
      ? data.labels.map((l) => (typeof l === 'string' ? l : l.name)).join(', ')
      : 'None';

    const result = [
      `Issue #${data.number}: ${data.title}`,
      `State: ${data.state}`,
      `Author: ${data.user?.login || 'N/A'}`,
      `Labels: ${labelNames || 'None'}`,
      `Assignees: ${Array.isArray(data.assignees) ? data.assignees.map((a) => a.login).join(', ') || 'None' : 'None'}`,
      `Created: ${data.created_at || 'N/A'}`,
      `Updated: ${data.updated_at || 'N/A'}`,
      `Body: ${data.body || 'No description'}`,
      `URL: ${data.html_url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_issue',
        layer: 'L1',
        owner,
        repo,
        issueNumber: data.number,
        title: data.title,
        state: data.state,
        user: data.user?.login || null,
        labels: Array.isArray(data.labels) ? data.labels.map((l) => (typeof l === 'string' ? l : l.name)) : [],
        url: data.html_url || null,
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
 * create_pr - Create a new pull request.
 */
async function handleCreatePr(params, context) {
  const owner = sanitizeString(params.owner);
  const repo = sanitizeString(params.repo);
  const title = sanitizeString(params.title);
  const head = sanitizeString(params.head);
  const base = sanitizeString(params.base);

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for create_pr.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }
  if (!repo) {
    return {
      result: 'Error: The "repo" parameter is required for create_pr.',
      metadata: { success: false, error: 'MISSING_REPO' },
    };
  }
  if (!title) {
    return {
      result: 'Error: The "title" parameter is required for create_pr.',
      metadata: { success: false, error: 'MISSING_TITLE' },
    };
  }
  if (!head) {
    return {
      result: 'Error: The "head" parameter is required for create_pr.',
      metadata: { success: false, error: 'MISSING_HEAD' },
    };
  }
  if (!base) {
    return {
      result: 'Error: The "base" parameter is required for create_pr.',
      metadata: { success: false, error: 'MISSING_BASE' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const body = sanitizeString(params.body) || '';
  const draft = params.draft === true;

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `github/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        params: { title, head, base, body, draft },
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`PR #${data.number} created: ${data.title || title}\nURL: ${data.html_url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'create_pr',
        layer: 'L1',
        owner,
        repo,
        prNumber: data.number,
        title: data.title || title,
        head,
        base,
        draft,
        url: data.html_url || null,
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
 * list_prs - List pull requests for a repository.
 */
async function handleListPrs(params, context) {
  const owner = sanitizeString(params.owner);
  const repo = sanitizeString(params.repo);

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for list_prs.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }
  if (!repo) {
    return {
      result: 'Error: The "repo" parameter is required for list_prs.',
      metadata: { success: false, error: 'MISSING_REPO' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const state = params.state || 'open';
  const perPage = clampPerPage(params.perPage);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `github/repos/${owner}/${repo}/pulls`,
      { params: { state, per_page: perPage } },
      timeoutMs
    );

    const prs = Array.isArray(data) ? data : [];

    if (prs.length === 0) {
      return {
        result: `No ${state} pull requests found in ${owner}/${repo}.`,
        metadata: {
          success: true,
          action: 'list_prs',
          layer: 'L1',
          owner,
          repo,
          state,
          count: 0,
          prs: [],
        },
      };
    }

    const lines = prs.map(
      (p) => `#${p.number} [${p.state}] ${p.title} (${p.user?.login || 'unknown'}) ${p.head?.ref || ''} -> ${p.base?.ref || ''}`
    );

    return {
      result: redactSensitive(`Pull Requests in ${owner}/${repo} (${prs.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_prs',
        layer: 'L1',
        owner,
        repo,
        state,
        count: prs.length,
        prs: prs.map((p) => ({
          number: p.number,
          title: p.title,
          state: p.state,
          user: p.user?.login || null,
          head: p.head?.ref || null,
          base: p.base?.ref || null,
          url: p.html_url || null,
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
 * get_pr - Get a specific pull request.
 */
async function handleGetPr(params, context) {
  const owner = sanitizeString(params.owner);
  const repo = sanitizeString(params.repo);
  const prNumber = params.prNumber;

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for get_pr.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }
  if (!repo) {
    return {
      result: 'Error: The "repo" parameter is required for get_pr.',
      metadata: { success: false, error: 'MISSING_REPO' },
    };
  }
  if (prNumber === undefined || prNumber === null || typeof prNumber !== 'number') {
    return {
      result: 'Error: The "prNumber" parameter is required for get_pr.',
      metadata: { success: false, error: 'MISSING_PR_NUMBER' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `github/repos/${owner}/${repo}/pulls/${prNumber}`,
      { params: {} },
      timeoutMs
    );

    const result = [
      `PR #${data.number}: ${data.title}`,
      `State: ${data.state} | Merged: ${data.merged ? 'Yes' : 'No'}`,
      `Author: ${data.user?.login || 'N/A'}`,
      `Head: ${data.head?.ref || 'N/A'} -> Base: ${data.base?.ref || 'N/A'}`,
      `Commits: ${data.commits ?? 'N/A'} | Changed Files: ${data.changed_files ?? 'N/A'}`,
      `Additions: +${data.additions ?? 'N/A'} | Deletions: -${data.deletions ?? 'N/A'}`,
      `Created: ${data.created_at || 'N/A'}`,
      `Updated: ${data.updated_at || 'N/A'}`,
      `Body: ${data.body || 'No description'}`,
      `URL: ${data.html_url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_pr',
        layer: 'L1',
        owner,
        repo,
        prNumber: data.number,
        title: data.title,
        state: data.state,
        merged: data.merged || false,
        user: data.user?.login || null,
        head: data.head?.ref || null,
        base: data.base?.ref || null,
        url: data.html_url || null,
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
 * search_code - Search code in a repository.
 */
async function handleSearchCode(params, context) {
  const owner = sanitizeString(params.owner);
  const repo = sanitizeString(params.repo);
  const query = sanitizeString(params.query);

  if (!owner) {
    return {
      result: 'Error: The "owner" parameter is required for search_code.',
      metadata: { success: false, error: 'MISSING_OWNER' },
    };
  }
  if (!repo) {
    return {
      result: 'Error: The "repo" parameter is required for search_code.',
      metadata: { success: false, error: 'MISSING_REPO' },
    };
  }
  if (!query) {
    return {
      result: 'Error: The "query" parameter is required for search_code.',
      metadata: { success: false, error: 'MISSING_QUERY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const perPage = clampPerPage(params.perPage);
  const searchQuery = `${query} repo:${owner}/${repo}`;

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'github/search/code',
      { params: { q: searchQuery, per_page: perPage } },
      timeoutMs
    );

    const items = Array.isArray(data?.items) ? data.items : [];
    const totalCount = data?.total_count ?? items.length;

    if (items.length === 0) {
      return {
        result: `No code matches found for "${query}" in ${owner}/${repo}.`,
        metadata: {
          success: true,
          action: 'search_code',
          layer: 'L1',
          owner,
          repo,
          query,
          totalCount: 0,
          count: 0,
          items: [],
        },
      };
    }

    const lines = items.map(
      (item) => `${item.path} (${item.name}) - score: ${item.score ?? 'N/A'}`
    );

    return {
      result: redactSensitive(
        `Code search results for "${query}" in ${owner}/${repo} (${totalCount} total, showing ${items.length}):\n${lines.join('\n')}`
      ),
      metadata: {
        success: true,
        action: 'search_code',
        layer: 'L1',
        owner,
        repo,
        query,
        totalCount,
        count: items.length,
        items: items.map((item) => ({
          name: item.name,
          path: item.path,
          sha: item.sha || null,
          url: item.html_url || null,
          score: item.score ?? null,
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

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a GitHub repository management operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of the VALID_ACTIONS
 * @param {string} [params.owner] - Repository owner
 * @param {string} [params.repo] - Repository name
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
      case 'get_repo':
        return await handleGetRepo(params, context);
      case 'list_repos':
        return await handleListRepos(params, context);
      case 'create_issue':
        return await handleCreateIssue(params, context);
      case 'list_issues':
        return await handleListIssues(params, context);
      case 'get_issue':
        return await handleGetIssue(params, context);
      case 'create_pr':
        return await handleCreatePr(params, context);
      case 'list_prs':
        return await handleListPrs(params, context);
      case 'get_pr':
        return await handleGetPr(params, context);
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
