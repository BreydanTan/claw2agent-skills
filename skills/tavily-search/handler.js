/**
 * Tavily Search Skill Handler (Layer 1)
 *
 * Web search and content extraction powered by Tavily API.
 * Supports general search, news, images, academic papers, code repositories,
 * direct answers, content extraction, and batch search.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'search',
  'extract',
  'search_news',
  'search_images',
  'get_answer',
  'search_academic',
  'search_code',
  'batch_search',
];

const VALID_SEARCH_DEPTHS = ['basic', 'advanced'];

const DEFAULT_MAX_RESULTS = 5;
const MAX_MAX_RESULTS = 20;
const MIN_MAX_RESULTS = 1;

const DEFAULT_SEARCH_DEPTH = 'basic';
const DEFAULT_EXTRACT_DEPTH = 'basic';
const DEFAULT_NEWS_DAYS = 7;
const MAX_NEWS_DAYS = 365;
const MIN_NEWS_DAYS = 1;

const MAX_BATCH_QUERIES = 5;
const MAX_URLS = 10;
const MAX_QUERY_LENGTH = 2000;

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
    result: 'Error: provider not configured',
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
  /tvly-[A-Za-z0-9]{20,}/g,
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
 * Validate and sanitize a query string.
 *
 * @param {*} query
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateQuery(query) {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'The "query" parameter is required and must be a non-empty string.' };
  }

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'The "query" parameter must not be empty.' };
  }

  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      valid: false,
      error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters (got ${trimmed.length}).`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate and clamp maxResults.
 *
 * @param {*} value
 * @returns {number}
 */
function clampMaxResults(value) {
  if (value === undefined || value === null) return DEFAULT_MAX_RESULTS;
  const n = Number(value);
  if (isNaN(n) || !Number.isFinite(n)) return DEFAULT_MAX_RESULTS;
  return Math.min(Math.max(Math.floor(n), MIN_MAX_RESULTS), MAX_MAX_RESULTS);
}

/**
 * Validate searchDepth parameter.
 *
 * @param {*} depth
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateSearchDepth(depth) {
  if (depth === undefined || depth === null) {
    return { valid: true, value: DEFAULT_SEARCH_DEPTH };
  }
  if (typeof depth !== 'string' || !VALID_SEARCH_DEPTHS.includes(depth)) {
    return {
      valid: false,
      error: `Invalid searchDepth "${depth}". Must be one of: ${VALID_SEARCH_DEPTHS.join(', ')}`,
    };
  }
  return { valid: true, value: depth };
}

/**
 * Validate an array of URLs.
 *
 * @param {*} urls
 * @returns {{ valid: boolean, sanitized?: string[], error?: string }}
 */
function validateUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { valid: false, error: 'The "urls" parameter is required and must be a non-empty array of URL strings.' };
  }

  if (urls.length > MAX_URLS) {
    return { valid: false, error: `Too many URLs. Maximum is ${MAX_URLS}, got ${urls.length}.` };
  }

  const sanitized = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (typeof url !== 'string' || url.trim().length === 0) {
      return { valid: false, error: `Invalid URL at index ${i}: must be a non-empty string.` };
    }
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, error: `Invalid URL at index ${i}: only http and https protocols are allowed.` };
      }
      sanitized.push(url.trim());
    } catch {
      return { valid: false, error: `Invalid URL at index ${i}: "${url}" is not a valid URL.` };
    }
  }

  return { valid: true, sanitized };
}

/**
 * Validate domains array (includeDomains / excludeDomains).
 *
 * @param {*} domains
 * @returns {string[]|undefined}
 */
function sanitizeDomains(domains) {
  if (!Array.isArray(domains)) return undefined;
  return domains.filter((d) => typeof d === 'string' && d.trim().length > 0).map((d) => d.trim());
}

/**
 * Validate and clamp the days parameter for news search.
 *
 * @param {*} value
 * @returns {number}
 */
function clampDays(value) {
  if (value === undefined || value === null) return DEFAULT_NEWS_DAYS;
  const n = Number(value);
  if (isNaN(n) || !Number.isFinite(n)) return DEFAULT_NEWS_DAYS;
  return Math.min(Math.max(Math.floor(n), MIN_NEWS_DAYS), MAX_NEWS_DAYS);
}

/**
 * Validate batch queries array.
 *
 * @param {*} queries
 * @returns {{ valid: boolean, sanitized?: Array<{query: string, maxResults: number}>, error?: string }}
 */
function validateBatchQueries(queries) {
  if (!Array.isArray(queries) || queries.length === 0) {
    return { valid: false, error: 'The "queries" parameter is required and must be a non-empty array.' };
  }

  if (queries.length > MAX_BATCH_QUERIES) {
    return { valid: false, error: `Too many queries. Maximum is ${MAX_BATCH_QUERIES}, got ${queries.length}.` };
  }

  const sanitized = [];
  for (let i = 0; i < queries.length; i++) {
    const item = queries[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `Invalid query at index ${i}: must be an object with a "query" field.` };
    }

    const qv = validateQuery(item.query);
    if (!qv.valid) {
      return { valid: false, error: `Invalid query at index ${i}: ${qv.error}` };
    }

    sanitized.push({
      query: qv.sanitized,
      maxResults: clampMaxResults(item.maxResults),
    });
  }

  return { valid: true, sanitized };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * search - General web search.
 */
async function handleSearch(params, context) {
  const qv = validateQuery(params.query);
  if (!qv.valid) {
    return {
      result: `Error: ${qv.error}`,
      metadata: { success: false, error: 'INVALID_QUERY' },
    };
  }

  const depthValidation = validateSearchDepth(params.searchDepth);
  if (!depthValidation.valid) {
    return {
      result: `Error: ${depthValidation.error}`,
      metadata: { success: false, error: 'INVALID_SEARCH_DEPTH' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const maxResults = clampMaxResults(params.maxResults);
  const searchDepth = depthValidation.value;
  const includeDomains = sanitizeDomains(params.includeDomains);
  const excludeDomains = sanitizeDomains(params.excludeDomains);
  const includeAnswer = params.includeAnswer === true;

  const body = {
    query: qv.sanitized,
    max_results: maxResults,
    search_depth: searchDepth,
    include_answer: includeAnswer,
  };

  if (includeDomains && includeDomains.length > 0) {
    body.include_domains = includeDomains;
  }
  if (excludeDomains && excludeDomains.length > 0) {
    body.exclude_domains = excludeDomains;
  }

  try {
    const response = await resolved.client.request('POST', '/search', body);
    const results = response?.results || [];

    if (results.length === 0) {
      return {
        result: `No results found for query: "${qv.sanitized}".`,
        metadata: {
          success: true,
          action: 'search',
          layer: 'L1',
          query: qv.sanitized,
          resultCount: 0,
          results: [],
        },
      };
    }

    const formatted = results
      .map((r, idx) => `${idx + 1}. ${r.title || 'Untitled'}\n   URL: ${r.url || 'N/A'}\n   ${r.content || r.snippet || ''}`)
      .join('\n\n');

    const resultText = `Search results for "${qv.sanitized}":\n\n${formatted}`;

    return {
      result: redactSensitive(resultText),
      metadata: {
        success: true,
        action: 'search',
        layer: 'L1',
        query: qv.sanitized,
        searchDepth,
        maxResults,
        resultCount: results.length,
        answer: response?.answer || null,
        results: results.map((r) => ({
          title: r.title || null,
          url: r.url || null,
          content: r.content || r.snippet || null,
          score: r.score ?? null,
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
 * extract - Extract content from URLs.
 */
async function handleExtract(params, context) {
  const urlValidation = validateUrls(params.urls);
  if (!urlValidation.valid) {
    return {
      result: `Error: ${urlValidation.error}`,
      metadata: { success: false, error: 'INVALID_URLS' },
    };
  }

  const depthValidation = validateSearchDepth(params.extractDepth);
  if (!depthValidation.valid) {
    return {
      result: `Error: ${depthValidation.error}`,
      metadata: { success: false, error: 'INVALID_EXTRACT_DEPTH' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const body = {
    urls: urlValidation.sanitized,
    extract_depth: depthValidation.value,
  };

  try {
    const response = await resolved.client.request('POST', '/extract', body);
    const results = response?.results || [];

    if (results.length === 0) {
      return {
        result: 'No content could be extracted from the provided URLs.',
        metadata: {
          success: true,
          action: 'extract',
          layer: 'L1',
          urlCount: urlValidation.sanitized.length,
          extractedCount: 0,
          results: [],
        },
      };
    }

    const formatted = results
      .map((r, idx) => {
        const title = r.title || 'Untitled';
        const url = r.url || urlValidation.sanitized[idx] || 'N/A';
        const content = r.raw_content || r.content || 'No content extracted';
        const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
        return `${idx + 1}. ${title}\n   URL: ${url}\n   ${truncated}`;
      })
      .join('\n\n');

    return {
      result: redactSensitive(`Extracted content from ${results.length} URL(s):\n\n${formatted}`),
      metadata: {
        success: true,
        action: 'extract',
        layer: 'L1',
        urlCount: urlValidation.sanitized.length,
        extractedCount: results.length,
        extractDepth: depthValidation.value,
        results: results.map((r) => ({
          url: r.url || null,
          title: r.title || null,
          contentLength: (r.raw_content || r.content || '').length,
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
 * search_news - Search recent news articles.
 */
async function handleSearchNews(params, context) {
  const qv = validateQuery(params.query);
  if (!qv.valid) {
    return {
      result: `Error: ${qv.error}`,
      metadata: { success: false, error: 'INVALID_QUERY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const maxResults = clampMaxResults(params.maxResults);
  const days = clampDays(params.days);

  const body = {
    query: qv.sanitized,
    max_results: maxResults,
    days,
    topic: 'news',
  };

  if (params.topic && typeof params.topic === 'string' && params.topic.trim().length > 0) {
    body.topic = params.topic.trim();
  }

  try {
    const response = await resolved.client.request('POST', '/search', body);
    const results = response?.results || [];

    if (results.length === 0) {
      return {
        result: `No news found for query: "${qv.sanitized}" in the last ${days} day(s).`,
        metadata: {
          success: true,
          action: 'search_news',
          layer: 'L1',
          query: qv.sanitized,
          days,
          resultCount: 0,
          results: [],
        },
      };
    }

    const formatted = results
      .map((r, idx) => {
        const date = r.published_date || r.date || '';
        return `${idx + 1}. ${r.title || 'Untitled'}${date ? ` (${date})` : ''}\n   URL: ${r.url || 'N/A'}\n   ${r.content || r.snippet || ''}`;
      })
      .join('\n\n');

    return {
      result: redactSensitive(`News results for "${qv.sanitized}" (last ${days} days):\n\n${formatted}`),
      metadata: {
        success: true,
        action: 'search_news',
        layer: 'L1',
        query: qv.sanitized,
        days,
        maxResults,
        resultCount: results.length,
        results: results.map((r) => ({
          title: r.title || null,
          url: r.url || null,
          content: r.content || r.snippet || null,
          publishedDate: r.published_date || r.date || null,
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
 * search_images - Search for images.
 */
async function handleSearchImages(params, context) {
  const qv = validateQuery(params.query);
  if (!qv.valid) {
    return {
      result: `Error: ${qv.error}`,
      metadata: { success: false, error: 'INVALID_QUERY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const maxResults = clampMaxResults(params.maxResults);

  const body = {
    query: qv.sanitized,
    max_results: maxResults,
    search_type: 'images',
  };

  try {
    const response = await resolved.client.request('POST', '/search', body);
    const images = response?.images || response?.results || [];

    if (images.length === 0) {
      return {
        result: `No images found for query: "${qv.sanitized}".`,
        metadata: {
          success: true,
          action: 'search_images',
          layer: 'L1',
          query: qv.sanitized,
          resultCount: 0,
          images: [],
        },
      };
    }

    const formatted = images
      .map((img, idx) => {
        const url = img.url || img;
        const desc = img.description || img.title || '';
        return `${idx + 1}. ${desc || 'Image'}\n   URL: ${url}`;
      })
      .join('\n\n');

    return {
      result: redactSensitive(`Image results for "${qv.sanitized}":\n\n${formatted}`),
      metadata: {
        success: true,
        action: 'search_images',
        layer: 'L1',
        query: qv.sanitized,
        maxResults,
        resultCount: images.length,
        images: images.map((img) => ({
          url: img.url || img,
          description: img.description || img.title || null,
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
 * get_answer - Get a direct answer with sources.
 */
async function handleGetAnswer(params, context) {
  const qv = validateQuery(params.query);
  if (!qv.valid) {
    return {
      result: `Error: ${qv.error}`,
      metadata: { success: false, error: 'INVALID_QUERY' },
    };
  }

  const depthValidation = validateSearchDepth(params.searchDepth);
  if (!depthValidation.valid) {
    return {
      result: `Error: ${depthValidation.error}`,
      metadata: { success: false, error: 'INVALID_SEARCH_DEPTH' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const includeRawContent = params.includeRawContent === true;

  const body = {
    query: qv.sanitized,
    search_depth: depthValidation.value,
    include_answer: true,
    include_raw_content: includeRawContent,
  };

  try {
    const response = await resolved.client.request('POST', '/search', body);
    const answer = response?.answer || null;
    const results = response?.results || [];

    if (!answer && results.length === 0) {
      return {
        result: `No answer found for query: "${qv.sanitized}".`,
        metadata: {
          success: true,
          action: 'get_answer',
          layer: 'L1',
          query: qv.sanitized,
          hasAnswer: false,
          sourceCount: 0,
        },
      };
    }

    const lines = [];
    if (answer) {
      lines.push(`Answer: ${answer}`);
      lines.push('');
    }

    if (results.length > 0) {
      lines.push('Sources:');
      results.forEach((r, idx) => {
        lines.push(`${idx + 1}. ${r.title || 'Untitled'} - ${r.url || 'N/A'}`);
      });
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_answer',
        layer: 'L1',
        query: qv.sanitized,
        searchDepth: depthValidation.value,
        hasAnswer: !!answer,
        answer: answer || null,
        sourceCount: results.length,
        sources: results.map((r) => ({
          title: r.title || null,
          url: r.url || null,
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
 * search_academic - Search academic papers.
 */
async function handleSearchAcademic(params, context) {
  const qv = validateQuery(params.query);
  if (!qv.valid) {
    return {
      result: `Error: ${qv.error}`,
      metadata: { success: false, error: 'INVALID_QUERY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const maxResults = clampMaxResults(params.maxResults);

  const body = {
    query: qv.sanitized,
    max_results: maxResults,
    topic: 'academic',
  };

  if (params.year !== undefined && params.year !== null) {
    const yearNum = Number(params.year);
    if (!isNaN(yearNum) && Number.isFinite(yearNum) && Number.isInteger(yearNum)) {
      body.year = yearNum;
    }
  }

  try {
    const response = await resolved.client.request('POST', '/search', body);
    const results = response?.results || [];

    if (results.length === 0) {
      return {
        result: `No academic papers found for query: "${qv.sanitized}".`,
        metadata: {
          success: true,
          action: 'search_academic',
          layer: 'L1',
          query: qv.sanitized,
          resultCount: 0,
          results: [],
        },
      };
    }

    const formatted = results
      .map((r, idx) => {
        const authors = r.authors || '';
        const year = r.year || r.published_date || '';
        return `${idx + 1}. ${r.title || 'Untitled'}${authors ? ` - ${authors}` : ''}${year ? ` (${year})` : ''}\n   URL: ${r.url || 'N/A'}\n   ${r.content || r.snippet || ''}`;
      })
      .join('\n\n');

    return {
      result: redactSensitive(`Academic results for "${qv.sanitized}":\n\n${formatted}`),
      metadata: {
        success: true,
        action: 'search_academic',
        layer: 'L1',
        query: qv.sanitized,
        maxResults,
        resultCount: results.length,
        year: body.year || null,
        results: results.map((r) => ({
          title: r.title || null,
          url: r.url || null,
          authors: r.authors || null,
          year: r.year || null,
          content: r.content || r.snippet || null,
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
 * search_code - Search code repositories.
 */
async function handleSearchCode(params, context) {
  const qv = validateQuery(params.query);
  if (!qv.valid) {
    return {
      result: `Error: ${qv.error}`,
      metadata: { success: false, error: 'INVALID_QUERY' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const maxResults = clampMaxResults(params.maxResults);

  const body = {
    query: qv.sanitized,
    max_results: maxResults,
    topic: 'code',
  };

  if (params.language && typeof params.language === 'string' && params.language.trim().length > 0) {
    body.language = params.language.trim();
  }

  try {
    const response = await resolved.client.request('POST', '/search', body);
    const results = response?.results || [];

    if (results.length === 0) {
      return {
        result: `No code results found for query: "${qv.sanitized}".`,
        metadata: {
          success: true,
          action: 'search_code',
          layer: 'L1',
          query: qv.sanitized,
          resultCount: 0,
          results: [],
        },
      };
    }

    const formatted = results
      .map((r, idx) => {
        const lang = r.language || '';
        return `${idx + 1}. ${r.title || 'Untitled'}${lang ? ` [${lang}]` : ''}\n   URL: ${r.url || 'N/A'}\n   ${r.content || r.snippet || ''}`;
      })
      .join('\n\n');

    return {
      result: redactSensitive(`Code results for "${qv.sanitized}":\n\n${formatted}`),
      metadata: {
        success: true,
        action: 'search_code',
        layer: 'L1',
        query: qv.sanitized,
        maxResults,
        resultCount: results.length,
        language: body.language || null,
        results: results.map((r) => ({
          title: r.title || null,
          url: r.url || null,
          language: r.language || null,
          content: r.content || r.snippet || null,
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
 * batch_search - Perform multiple searches.
 */
async function handleBatchSearch(params, context) {
  const bv = validateBatchQueries(params.queries);
  if (!bv.valid) {
    return {
      result: `Error: ${bv.error}`,
      metadata: { success: false, error: 'INVALID_QUERIES' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const batchResults = [];
  const errors = [];

  for (let i = 0; i < bv.sanitized.length; i++) {
    const q = bv.sanitized[i];
    try {
      const response = await resolved.client.request('POST', '/search', {
        query: q.query,
        max_results: q.maxResults,
      });
      const results = response?.results || [];
      batchResults.push({
        query: q.query,
        resultCount: results.length,
        results: results.map((r) => ({
          title: r.title || null,
          url: r.url || null,
          content: r.content || r.snippet || null,
        })),
      });
    } catch (err) {
      errors.push({
        query: q.query,
        error: err.message || 'Unknown error',
      });
      batchResults.push({
        query: q.query,
        resultCount: 0,
        results: [],
        error: err.message || 'Unknown error',
      });
    }
  }

  const lines = [];
  for (const br of batchResults) {
    lines.push(`Query: "${br.query}" (${br.resultCount} results)`);
    if (br.error) {
      lines.push(`  Error: ${br.error}`);
    } else if (br.results.length > 0) {
      br.results.forEach((r, idx) => {
        lines.push(`  ${idx + 1}. ${r.title || 'Untitled'} - ${r.url || 'N/A'}`);
      });
    } else {
      lines.push('  No results found.');
    }
    lines.push('');
  }

  const totalResults = batchResults.reduce((sum, br) => sum + br.resultCount, 0);

  return {
    result: redactSensitive(`Batch search results (${bv.sanitized.length} queries, ${totalResults} total results):\n\n${lines.join('\n')}`),
    metadata: {
      success: errors.length === 0,
      action: 'batch_search',
      layer: 'L1',
      queryCount: bv.sanitized.length,
      totalResults,
      errorCount: errors.length,
      batchResults,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Tavily search operation.
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
      case 'search':
        return await handleSearch(params, context);
      case 'extract':
        return await handleExtract(params, context);
      case 'search_news':
        return await handleSearchNews(params, context);
      case 'search_images':
        return await handleSearchImages(params, context);
      case 'get_answer':
        return await handleGetAnswer(params, context);
      case 'search_academic':
        return await handleSearchAcademic(params, context);
      case 'search_code':
        return await handleSearchCode(params, context);
      case 'batch_search':
        return await handleBatchSearch(params, context);
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

// Export internals for testing
export {
  getClient,
  redactSensitive,
  validateQuery,
  validateUrls,
  validateSearchDepth,
  validateBatchQueries,
  clampMaxResults,
  clampDays,
  sanitizeDomains,
  VALID_ACTIONS,
  VALID_SEARCH_DEPTHS,
  MAX_QUERY_LENGTH,
  MAX_BATCH_QUERIES,
  MAX_URLS,
  MAX_MAX_RESULTS,
  DEFAULT_MAX_RESULTS,
  DEFAULT_NEWS_DAYS,
};
