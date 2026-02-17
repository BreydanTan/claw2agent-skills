/**
 * Translator (DeepL/Google) Skill Handler (Layer 1)
 *
 * Text translation and language detection via provider client.
 * Supports translate, detect_language, translate_batch, get_usage,
 * list_languages, and get_glossaries actions.
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
  'translate',
  'detect_language',
  'translate_batch',
  'get_usage',
  'list_languages',
  'get_glossaries',
];

const SUPPORTED_LANGUAGES = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  nb: 'Norwegian Bokmal',
  el: 'Greek',
  cs: 'Czech',
  ro: 'Romanian',
  hu: 'Hungarian',
  tr: 'Turkish',
  id: 'Indonesian',
  th: 'Thai',
  vi: 'Vietnamese',
  uk: 'Ukrainian',
};

const VALID_FORMALITY = ['default', 'more', 'less'];

const MAX_TEXT_LENGTH = 10000;
const MAX_DETECT_TEXT_LENGTH = 5000;
const MAX_BATCH_ITEMS = 50;
const MAX_BATCH_ITEM_LENGTH = 5000;

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
    result: 'Error: Provider client required for translation API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for translation API access. Configure an API key or platform adapter.',
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
 * @param {Object} body - Request body
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
 * Validate a text parameter for translation.
 *
 * @param {*} text
 * @param {number} maxLength
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateText(text, maxLength = MAX_TEXT_LENGTH) {
  if (text === undefined || text === null || typeof text !== 'string') {
    return { valid: false, error: 'The "text" parameter is required and must be a non-empty string.' };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "text" parameter must not be empty.' };
  }
  if (trimmed.length > maxLength) {
    return { valid: false, error: `The "text" parameter exceeds maximum length of ${maxLength} characters.` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate a texts array parameter for batch translation.
 *
 * @param {*} texts
 * @returns {{ valid: boolean, value?: string[], error?: string }}
 */
function validateTexts(texts) {
  if (!Array.isArray(texts)) {
    return { valid: false, error: 'The "texts" parameter is required and must be an array of strings.' };
  }
  if (texts.length === 0) {
    return { valid: false, error: 'The "texts" array must contain at least 1 item.' };
  }
  if (texts.length > MAX_BATCH_ITEMS) {
    return { valid: false, error: `The "texts" array exceeds maximum of ${MAX_BATCH_ITEMS} items.` };
  }
  const trimmed = [];
  for (let i = 0; i < texts.length; i++) {
    const item = texts[i];
    if (typeof item !== 'string') {
      return { valid: false, error: `Item at index ${i} in "texts" must be a string.` };
    }
    const t = item.trim();
    if (t.length === 0) {
      return { valid: false, error: `Item at index ${i} in "texts" must not be empty.` };
    }
    if (t.length > MAX_BATCH_ITEM_LENGTH) {
      return { valid: false, error: `Item at index ${i} in "texts" exceeds maximum length of ${MAX_BATCH_ITEM_LENGTH} characters.` };
    }
    trimmed.push(t);
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate a language code parameter (2-5 letter code).
 *
 * @param {*} lang
 * @param {string} paramName
 * @param {boolean} required
 * @returns {{ valid: boolean, value?: string|null, error?: string }}
 */
function validateLangCode(lang, paramName, required) {
  if (lang === undefined || lang === null) {
    if (required) {
      return { valid: false, error: `The "${paramName}" parameter is required.` };
    }
    return { valid: true, value: null };
  }
  if (typeof lang !== 'string') {
    return { valid: false, error: `The "${paramName}" parameter must be a string.` };
  }
  const trimmed = lang.trim().toLowerCase();
  if (trimmed.length === 0) {
    if (required) {
      return { valid: false, error: `The "${paramName}" parameter must not be empty.` };
    }
    return { valid: true, value: null };
  }
  if (!/^[a-zA-Z]{2,5}$/i.test(trimmed)) {
    return { valid: false, error: `Invalid "${paramName}" code "${lang}". Must be a 2-5 letter language code.` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate the formality parameter.
 *
 * @param {*} formality
 * @returns {{ valid: boolean, value?: string|null, error?: string }}
 */
function validateFormality(formality) {
  if (formality === undefined || formality === null) {
    return { valid: true, value: null };
  }
  if (typeof formality !== 'string') {
    return { valid: false, error: 'The "formality" parameter must be a string.' };
  }
  const lower = formality.trim().toLowerCase();
  if (!VALID_FORMALITY.includes(lower)) {
    return { valid: false, error: `Invalid formality "${formality}". Must be one of: ${VALID_FORMALITY.join(', ')}` };
  }
  return { valid: true, value: lower };
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
    case 'translate': {
      const textVal = validateText(params.text);
      if (!textVal.valid) return { valid: false, error: textVal.error };
      const targetVal = validateLangCode(params.target_lang, 'target_lang', true);
      if (!targetVal.valid) return { valid: false, error: targetVal.error };
      if (params.source_lang !== undefined && params.source_lang !== null) {
        const srcVal = validateLangCode(params.source_lang, 'source_lang', false);
        if (!srcVal.valid) return { valid: false, error: srcVal.error };
      }
      if (params.formality !== undefined && params.formality !== null) {
        const fVal = validateFormality(params.formality);
        if (!fVal.valid) return { valid: false, error: fVal.error };
      }
      return { valid: true };
    }
    case 'detect_language': {
      const textVal = validateText(params.text, MAX_DETECT_TEXT_LENGTH);
      if (!textVal.valid) return { valid: false, error: textVal.error };
      return { valid: true };
    }
    case 'translate_batch': {
      const textsVal = validateTexts(params.texts);
      if (!textsVal.valid) return { valid: false, error: textsVal.error };
      const targetVal = validateLangCode(params.target_lang, 'target_lang', true);
      if (!targetVal.valid) return { valid: false, error: targetVal.error };
      if (params.source_lang !== undefined && params.source_lang !== null) {
        const srcVal = validateLangCode(params.source_lang, 'source_lang', false);
        if (!srcVal.valid) return { valid: false, error: srcVal.error };
      }
      return { valid: true };
    }
    case 'get_usage':
    case 'list_languages':
    case 'get_glossaries': {
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
 * Handle translate -- POST /translate body: { text, source_lang, target_lang, formality }
 */
async function handleTranslate(params, context) {
  const textVal = validateText(params.text);
  if (!textVal.valid) {
    return {
      result: `Error: ${textVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const targetVal = validateLangCode(params.target_lang, 'target_lang', true);
  if (!targetVal.valid) {
    return {
      result: `Error: ${targetVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const srcVal = validateLangCode(params.source_lang, 'source_lang', false);
  if (!srcVal.valid) {
    return {
      result: `Error: ${srcVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const fmtVal = validateFormality(params.formality);
  if (!fmtVal.valid) {
    return {
      result: `Error: ${fmtVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const text = textVal.value;
  const target_lang = targetVal.value;
  const source_lang = srcVal.value;
  const formality = fmtVal.value;

  const body = { text, target_lang };
  if (source_lang) body.source_lang = source_lang;
  if (formality) body.formality = formality;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/translate',
      body,
      timeoutMs
    );

    const translated = data?.translated_text || data?.text || data?.translation || '';
    const detectedLang = data?.detected_language || data?.source_lang || source_lang || 'auto';
    const charCount = data?.character_count || text.length;

    const lines = [
      'Translation Result',
      `Source language: ${detectedLang}`,
      `Target language: ${target_lang}`,
      formality ? `Formality: ${formality}` : null,
      `Characters: ${charCount}`,
      '',
      translated,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'translate',
        layer: 'L1',
        source_lang: detectedLang,
        target_lang,
        formality: formality || 'default',
        character_count: charCount,
        translated_text: translated,
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
 * Handle detect_language -- POST /detect body: { text }
 */
async function handleDetectLanguage(params, context) {
  const textVal = validateText(params.text, MAX_DETECT_TEXT_LENGTH);
  if (!textVal.valid) {
    return {
      result: `Error: ${textVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const text = textVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/detect',
      { text },
      timeoutMs
    );

    const language = data?.language || data?.detected_language || 'unknown';
    const confidence = data?.confidence ?? null;
    const alternatives = data?.alternatives || [];

    const lines = [
      'Language Detection Result',
      `Detected language: ${language}`,
      confidence !== null ? `Confidence: ${confidence}` : null,
      alternatives.length > 0 ? `Alternatives: ${alternatives.map((a) => `${a.language} (${a.confidence})`).join(', ')}` : null,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'detect_language',
        layer: 'L1',
        detected_language: language,
        confidence,
        alternatives,
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
 * Handle translate_batch -- POST /translate/batch body: { texts, source_lang, target_lang }
 */
async function handleTranslateBatch(params, context) {
  const textsVal = validateTexts(params.texts);
  if (!textsVal.valid) {
    return {
      result: `Error: ${textsVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const targetVal = validateLangCode(params.target_lang, 'target_lang', true);
  if (!targetVal.valid) {
    return {
      result: `Error: ${targetVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const srcVal = validateLangCode(params.source_lang, 'source_lang', false);
  if (!srcVal.valid) {
    return {
      result: `Error: ${srcVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const texts = textsVal.value;
  const target_lang = targetVal.value;
  const source_lang = srcVal.value;

  const body = { texts, target_lang };
  if (source_lang) body.source_lang = source_lang;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/translate/batch',
      body,
      timeoutMs
    );

    const translations = data?.translations || data?.results || [];
    const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

    const lines = [
      'Batch Translation Result',
      `Items: ${texts.length}`,
      `Target language: ${target_lang}`,
      source_lang ? `Source language: ${source_lang}` : 'Source language: auto-detect',
      `Total characters: ${totalChars}`,
      '',
      ...translations.map((t, i) => {
        const translated = typeof t === 'string' ? t : (t?.translated_text || t?.text || '');
        return `${i + 1}. ${translated}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'translate_batch',
        layer: 'L1',
        source_lang: source_lang || 'auto',
        target_lang,
        item_count: texts.length,
        total_characters: totalChars,
        translations,
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
 * Handle get_usage -- GET /usage
 */
async function handleGetUsage(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      '/usage',
      null,
      timeoutMs
    );

    const charCount = data?.character_count ?? 0;
    const charLimit = data?.character_limit ?? 0;
    const remaining = charLimit - charCount;

    const lines = [
      'Translation Usage',
      `Characters used: ${charCount}`,
      `Character limit: ${charLimit}`,
      `Remaining: ${remaining}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_usage',
        layer: 'L1',
        character_count: charCount,
        character_limit: charLimit,
        remaining,
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
  const codes = Object.keys(SUPPORTED_LANGUAGES);
  const lines = [
    `Supported Languages (${codes.length})`,
    '',
    ...codes.map((code, i) => `${i + 1}. ${code} - ${SUPPORTED_LANGUAGES[code]}`),
  ];

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_languages',
      layer: 'L1',
      languageCount: codes.length,
      languages: codes.map((code) => ({ code, name: SUPPORTED_LANGUAGES[code] })),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Handle get_glossaries -- GET /glossaries
 */
async function handleGetGlossaries(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      '/glossaries',
      null,
      timeoutMs
    );

    const glossaries = data?.glossaries || data?.data || [];

    const lines = [
      `Glossaries (${glossaries.length})`,
      '',
      ...glossaries.map((g, i) => {
        const name = g.name || g.title || `Glossary ${i + 1}`;
        const sourceLang = g.source_lang || '';
        const targetLang = g.target_lang || '';
        const entryCount = g.entry_count ?? 0;
        return `${i + 1}. ${name} (${sourceLang} -> ${targetLang}, ${entryCount} entries)`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_glossaries',
        layer: 'L1',
        glossary_count: glossaries.length,
        glossaries,
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
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a translation operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: translate, detect_language, translate_batch, get_usage, list_languages, get_glossaries
 * @param {string} [params.text] - Text to translate or detect (required for translate, detect_language)
 * @param {string[]} [params.texts] - Array of texts (required for translate_batch)
 * @param {string} [params.source_lang] - Source language code (optional, auto-detect)
 * @param {string} [params.target_lang] - Target language code (required for translate, translate_batch)
 * @param {string} [params.formality] - Formality level: default, more, less (optional)
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
      case 'translate':
        return await handleTranslate(params, context);
      case 'detect_language':
        return await handleDetectLanguage(params, context);
      case 'translate_batch':
        return await handleTranslateBatch(params, context);
      case 'get_usage':
        return await handleGetUsage(params, context);
      case 'list_languages':
        return handleListLanguages();
      case 'get_glossaries':
        return await handleGetGlossaries(params, context);
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
  name: 'translator-deepl-google',
  version: '1.0.0',
  description: 'Text translation and language detection skill. Translate text, detect languages, batch translate, and manage glossaries via provider client.',
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
  validateText,
  validateTexts,
  validateLangCode,
  validateFormality,
  VALID_ACTIONS,
  SUPPORTED_LANGUAGES,
  VALID_FORMALITY,
  MAX_TEXT_LENGTH,
  MAX_DETECT_TEXT_LENGTH,
  MAX_BATCH_ITEMS,
  MAX_BATCH_ITEM_LENGTH,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
