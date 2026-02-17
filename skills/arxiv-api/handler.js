/**
 * arXiv API Skill Handler (Layer 1)
 *
 * Search and retrieve academic papers from arXiv.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 30s, max 120s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'search_papers',
  'get_paper',
  'list_recent',
  'get_categories',
];

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for arXiv API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for arXiv API access. Configure an API key or platform adapter.',
        retriable: false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

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

async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, null, {
      ...opts,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }

    throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' };
  }
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
];

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

function validateQuery(query) {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'The "query" parameter is required and must be a non-empty string.' };
  }
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "query" parameter must not be empty.' };
  }
  return { valid: true, value: trimmed };
}

function validatePaperId(paperId) {
  if (!paperId || typeof paperId !== 'string') {
    return { valid: false, error: 'The "paperId" parameter is required and must be a non-empty string.' };
  }
  const trimmed = paperId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "paperId" parameter must not be empty.' };
  }
  return { valid: true, value: trimmed };
}

function validateCategory(category) {
  if (!category || typeof category !== 'string') {
    return { valid: false, error: 'The "category" parameter is required and must be a non-empty string.' };
  }
  const trimmed = category.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "category" parameter must not be empty.' };
  }
  return { valid: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Validate export
// ---------------------------------------------------------------------------

function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'search_papers': {
      const v = validateQuery(params.query);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'get_paper': {
      const v = validatePaperId(params.paperId);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'list_recent': {
      const v = validateCategory(params.category);
      if (!v.valid) return { valid: false, error: v.error };
      return { valid: true };
    }
    case 'get_categories':
      return { valid: true };
    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleSearchPapers(params, context) {
  const v = validateQuery(params.query);
  if (!v.valid) {
    return {
      result: `Error: ${v.error}`,
      metadata: { success: false, action: 'search_papers', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxResults = typeof params.maxResults === 'number' && params.maxResults > 0 ? Math.min(params.maxResults, 100) : 10;
  const sortBy = (params.sortBy && typeof params.sortBy === 'string') ? params.sortBy : 'relevance';

  try {
    const path = `/search?query=${encodeURIComponent(v.value)}&max_results=${maxResults}&sortBy=${encodeURIComponent(sortBy)}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    const papers = data?.papers || data?.results || [];
    const lines = [
      `arXiv Search Results`,
      `Query: ${v.value}`,
      `Found: ${papers.length} paper(s)`,
      '',
      ...papers.map((p, i) => {
        const title = p.title || 'Untitled';
        const authors = Array.isArray(p.authors) ? p.authors.join(', ') : (p.authors || '');
        const published = p.published || '';
        return `${i + 1}. ${title}${authors ? `\n   Authors: ${authors}` : ''}${published ? `\n   Published: ${published}` : ''}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_papers',
        query: v.value,
        paperCount: papers.length,
        sortBy,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'search_papers', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetPaper(params, context) {
  const v = validatePaperId(params.paperId);
  if (!v.valid) {
    return {
      result: `Error: ${v.error}`,
      metadata: { success: false, action: 'get_paper', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET', `/paper/${encodeURIComponent(v.value)}`, {}, timeoutMs
    );

    const lines = [
      `Paper Details`,
      `ID: ${data?.id || v.value}`,
      `Title: ${data?.title || 'N/A'}`,
      `Authors: ${Array.isArray(data?.authors) ? data.authors.join(', ') : (data?.authors || 'N/A')}`,
      `Published: ${data?.published || 'N/A'}`,
      `Summary: ${data?.summary || 'N/A'}`,
      data?.pdf_url ? `PDF: ${data.pdf_url}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_paper',
        paperId: v.value,
        title: data?.title,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_paper', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleListRecent(params, context) {
  const v = validateCategory(params.category);
  if (!v.valid) {
    return {
      result: `Error: ${v.error}`,
      metadata: { success: false, action: 'list_recent', error: 'INVALID_INPUT', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const maxResults = typeof params.maxResults === 'number' && params.maxResults > 0 ? Math.min(params.maxResults, 100) : 10;

  try {
    const path = `/recent?category=${encodeURIComponent(v.value)}&max_results=${maxResults}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    const papers = data?.papers || data?.results || [];
    const lines = [
      `Recent Papers in ${v.value}`,
      `Count: ${papers.length} paper(s)`,
      '',
      ...papers.map((p, i) => {
        const title = p.title || 'Untitled';
        const published = p.published || '';
        return `${i + 1}. ${title}${published ? ` (${published})` : ''}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_recent',
        category: v.value,
        paperCount: papers.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_recent', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetCategories(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(resolved.client, 'GET', '/categories', {}, timeoutMs);

    const categories = data?.categories || [];
    const lines = [
      `arXiv Categories`,
      `Total: ${categories.length} category(ies)`,
      '',
      ...categories.map((c, i) => {
        const id = c.id || c.code || 'N/A';
        const name = c.name || c.label || '';
        return `${i + 1}. ${id}${name ? ` — ${name}` : ''}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_categories',
        categoryCount: categories.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_categories', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

export async function execute(params, context) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() },
    };
  }

  try {
    switch (action) {
      case 'search_papers':
        return await handleSearchPapers(params, context);
      case 'get_paper':
        return await handleGetPaper(params, context);
      case 'list_recent':
        return await handleListRecent(params, context);
      case 'get_categories':
        return await handleGetCategories(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'arxiv-api',
  version: '1.0.0',
  description: 'Search and retrieve academic papers from arXiv.',
  actions: VALID_ACTIONS,
};

// Export validate and internals for testing
export {
  validate,
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  validateQuery,
  validatePaperId,
  validateCategory,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
