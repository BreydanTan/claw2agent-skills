/**
 * PDF OCR Parser Skill Handler (Layer 1)
 *
 * Parse PDFs and images via OCR provider client for text extraction,
 * table extraction, and metadata retrieval.
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
  'parse_pdf',
  'parse_image',
  'extract_tables',
  'get_metadata',
  'list_languages',
];

const SUPPORTED_LANGUAGES = [
  'eng', 'fra', 'deu', 'spa', 'ita', 'por', 'nld', 'pol',
  'rus', 'jpn', 'kor', 'zho', 'ara', 'hin', 'tha', 'vie',
];

const DEFAULT_LANGUAGE = 'eng';
const DEFAULT_PAGES = 'all';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

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
    result: 'Error: Provider client required for OCR API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for OCR API access. Configure an API key or platform adapter.',
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
 * Make a request through the provider client with timeout.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The resource path
 * @param {Object} opts - Additional options (body, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
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
      throw {
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms.`,
      };
    }

    throw {
      code: 'UPSTREAM_ERROR',
      message: err.message || 'Unknown upstream error',
    };
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
 * Validate a file parameter (non-empty string).
 *
 * @param {*} file
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateFile(file) {
  if (!file || typeof file !== 'string') {
    return { valid: false, error: 'The "file" parameter is required and must be a non-empty string.' };
  }
  const trimmed = file.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "file" parameter must not be empty.' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate a pages parameter.
 * Valid formats: "all", a single number (e.g. "3"), or a range "N-M".
 *
 * @param {*} pages
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validatePages(pages) {
  if (pages === undefined || pages === null) {
    return { valid: true, value: DEFAULT_PAGES };
  }
  if (typeof pages !== 'string') {
    return { valid: false, error: 'The "pages" parameter must be a string (e.g. "all", "3", or "1-5").' };
  }
  const trimmed = pages.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "pages" parameter must not be empty.' };
  }
  if (trimmed === 'all') {
    return { valid: true, value: 'all' };
  }
  // Single page number
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (num < 1) {
      return { valid: false, error: 'Page number must be at least 1.' };
    }
    return { valid: true, value: trimmed };
  }
  // Range: N-M
  const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start < 1) {
      return { valid: false, error: 'Page range start must be at least 1.' };
    }
    if (end < start) {
      return { valid: false, error: 'Page range end must be greater than or equal to start.' };
    }
    return { valid: true, value: trimmed };
  }
  return { valid: false, error: `Invalid pages format "${trimmed}". Must be "all", a single number, or a range like "1-5".` };
}

/**
 * Validate a language parameter (2-3 letter ISO code from supported list).
 *
 * @param {*} language
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateLanguage(language) {
  if (language === undefined || language === null) {
    return { valid: true, value: DEFAULT_LANGUAGE };
  }
  if (typeof language !== 'string') {
    return { valid: false, error: 'The "language" parameter must be a string.' };
  }
  const trimmed = language.trim().toLowerCase();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "language" parameter must not be empty.' };
  }
  if (!/^[a-z]{2,3}$/.test(trimmed)) {
    return { valid: false, error: `Invalid language code "${language}". Must be a 2-3 letter ISO 639-1 code.` };
  }
  if (!SUPPORTED_LANGUAGES.includes(trimmed)) {
    return { valid: false, error: `Unsupported language "${trimmed}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}` };
  }
  return { valid: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Validate export (checks required params per action)
// ---------------------------------------------------------------------------

/**
 * Validate params for a given action. Returns { valid: true } or { valid: false, error: string }.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'parse_pdf': {
      const fileVal = validateFile(params.file);
      if (!fileVal.valid) return { valid: false, error: fileVal.error };
      if (params.pages !== undefined && params.pages !== null) {
        const pagesVal = validatePages(params.pages);
        if (!pagesVal.valid) return { valid: false, error: pagesVal.error };
      }
      if (params.language !== undefined && params.language !== null) {
        const langVal = validateLanguage(params.language);
        if (!langVal.valid) return { valid: false, error: langVal.error };
      }
      return { valid: true };
    }
    case 'parse_image': {
      const fileVal = validateFile(params.file);
      if (!fileVal.valid) return { valid: false, error: fileVal.error };
      if (params.language !== undefined && params.language !== null) {
        const langVal = validateLanguage(params.language);
        if (!langVal.valid) return { valid: false, error: langVal.error };
      }
      return { valid: true };
    }
    case 'extract_tables': {
      const fileVal = validateFile(params.file);
      if (!fileVal.valid) return { valid: false, error: fileVal.error };
      if (params.pages !== undefined && params.pages !== null) {
        const pagesVal = validatePages(params.pages);
        if (!pagesVal.valid) return { valid: false, error: pagesVal.error };
      }
      return { valid: true };
    }
    case 'get_metadata': {
      const fileVal = validateFile(params.file);
      if (!fileVal.valid) return { valid: false, error: fileVal.error };
      return { valid: true };
    }
    case 'list_languages': {
      return { valid: true };
    }
    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle parse_pdf -- POST /ocr/pdf body: { file, pages, language }
 */
async function handleParsePdf(params, context) {
  const fileVal = validateFile(params.file);
  if (!fileVal.valid) {
    return {
      result: `Error: ${fileVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const pagesVal = validatePages(params.pages);
  if (!pagesVal.valid) {
    return {
      result: `Error: ${pagesVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const langVal = validateLanguage(params.language);
  if (!langVal.valid) {
    return {
      result: `Error: ${langVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const file = fileVal.value;
  const pages = pagesVal.value;
  const language = langVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/ocr/pdf',
      { body: { file, pages, language } },
      timeoutMs
    );

    const text = data?.text || data?.content || '';
    const pageCount = data?.pageCount || data?.pages || 0;
    const lines = [
      `PDF OCR Result`,
      `File: ${file}`,
      `Pages: ${pages}`,
      `Language: ${language}`,
      pageCount ? `Pages processed: ${pageCount}` : null,
      '',
      text,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'parse_pdf',
        layer: 'L1',
        file,
        pages,
        language,
        pageCount,
        text,
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
 * Handle parse_image -- POST /ocr/image body: { file, language }
 */
async function handleParseImage(params, context) {
  const fileVal = validateFile(params.file);
  if (!fileVal.valid) {
    return {
      result: `Error: ${fileVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const langVal = validateLanguage(params.language);
  if (!langVal.valid) {
    return {
      result: `Error: ${langVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const file = fileVal.value;
  const language = langVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/ocr/image',
      { body: { file, language } },
      timeoutMs
    );

    const text = data?.text || data?.content || '';
    const confidence = data?.confidence;
    const lines = [
      `Image OCR Result`,
      `File: ${file}`,
      `Language: ${language}`,
      confidence !== undefined ? `Confidence: ${confidence}` : null,
      '',
      text,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'parse_image',
        layer: 'L1',
        file,
        language,
        confidence: confidence || null,
        text,
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
 * Handle extract_tables -- POST /ocr/tables body: { file, pages }
 */
async function handleExtractTables(params, context) {
  const fileVal = validateFile(params.file);
  if (!fileVal.valid) {
    return {
      result: `Error: ${fileVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const pagesVal = validatePages(params.pages);
  if (!pagesVal.valid) {
    return {
      result: `Error: ${pagesVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const file = fileVal.value;
  const pages = pagesVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/ocr/tables',
      { body: { file, pages } },
      timeoutMs
    );

    const tables = data?.tables || data?.data || [];
    const lines = [
      `Table Extraction Result`,
      `File: ${file}`,
      `Pages: ${pages}`,
      `Tables found: ${tables.length}`,
      '',
      ...tables.map((t, i) => {
        const rows = t.rows || t.data || [];
        const rowCount = rows.length;
        const label = t.title || t.name || `Table ${i + 1}`;
        return `${i + 1}. ${label} (${rowCount} rows)`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'extract_tables',
        layer: 'L1',
        file,
        pages,
        tableCount: tables.length,
        tables,
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
 * Handle get_metadata -- POST /ocr/metadata body: { file }
 */
async function handleGetMetadata(params, context) {
  const fileVal = validateFile(params.file);
  if (!fileVal.valid) {
    return {
      result: `Error: ${fileVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const file = fileVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/ocr/metadata',
      { body: { file } },
      timeoutMs
    );

    const meta = data?.metadata || data || {};
    const lines = [
      `PDF Metadata`,
      `File: ${file}`,
      meta.title ? `Title: ${meta.title}` : null,
      meta.author ? `Author: ${meta.author}` : null,
      meta.pages !== undefined ? `Pages: ${meta.pages}` : null,
      meta.creator ? `Creator: ${meta.creator}` : null,
      meta.producer ? `Producer: ${meta.producer}` : null,
      meta.createdAt ? `Created: ${meta.createdAt}` : null,
      meta.modifiedAt ? `Modified: ${meta.modifiedAt}` : null,
      meta.fileSize ? `Size: ${meta.fileSize}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_metadata',
        layer: 'L1',
        file,
        documentMetadata: meta,
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
 * Handle list_languages -- returns local data, no API call.
 */
function handleListLanguages() {
  const lines = [
    `Supported OCR Languages (${SUPPORTED_LANGUAGES.length})`,
    '',
    ...SUPPORTED_LANGUAGES.map((l, i) => `${i + 1}. ${l}`),
  ];

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_languages',
      layer: 'L1',
      languageCount: SUPPORTED_LANGUAGES.length,
      languages: [...SUPPORTED_LANGUAGES],
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a PDF OCR operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: parse_pdf, parse_image, extract_tables, get_metadata, list_languages
 * @param {string} [params.file] - File URL or path (required for parse_pdf, parse_image, extract_tables, get_metadata)
 * @param {string} [params.pages] - Pages to process: "all", single number, or "N-M" range (optional)
 * @param {string} [params.language] - OCR language ISO code (optional, default "eng")
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
      case 'parse_pdf':
        return await handleParsePdf(params, context);
      case 'parse_image':
        return await handleParseImage(params, context);
      case 'extract_tables':
        return await handleExtractTables(params, context);
      case 'get_metadata':
        return await handleGetMetadata(params, context);
      case 'list_languages':
        return handleListLanguages();
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: 'UPSTREAM_ERROR', detail: error.message },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'pdf-ocr-parser',
  version: '1.0.0',
  description: 'PDF and image OCR parsing skill. Extract text, tables, and metadata from PDFs and images via provider client.',
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
  validateFile,
  validatePages,
  validateLanguage,
  VALID_ACTIONS,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  DEFAULT_PAGES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
