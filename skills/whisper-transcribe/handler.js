/**
 * Whisper Transcribe Skill Handler (Layer 1)
 *
 * OpenAI Whisper speech-to-text transcription skill.
 * Transcribe audio, translate to English, detect language,
 * and list supported models and response formats.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 60s, max 120s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'transcribe',
  'translate',
  'detect_language',
  'list_models',
  'list_formats',
];

const VALID_RESPONSE_FORMATS = ['json', 'text', 'srt', 'vtt', 'verbose_json'];

const DEFAULT_MODEL = 'whisper-1';
const DEFAULT_RESPONSE_FORMAT = 'json';

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMEOUT_MS = 120000;

const MAX_PROMPT_LENGTH = 500;

// ---------------------------------------------------------------------------
// Known models list (for list_models action -- no API call needed)
// ---------------------------------------------------------------------------

const KNOWN_MODELS = [
  {
    id: 'whisper-1',
    name: 'Whisper V2',
    provider: 'OpenAI',
    supportedFormats: ['json', 'text', 'srt', 'vtt', 'verbose_json'],
    supportedActions: ['transcribe', 'translate', 'detect_language'],
    maxFileSizeMB: 25,
    supportedAudioFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
  },
];

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
    result: 'Error: Provider client required for whisper transcription. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for whisper transcription. Configure an API key or platform adapter.',
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
 * @param {string} method - HTTP method
 * @param {string} path - The API path
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
      message: err.message || 'Unknown request error',
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
 * Validate the file parameter (non-empty string -- URL or path).
 *
 * @param {*} file
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateFile(file) {
  if (!file || typeof file !== 'string') {
    return {
      valid: false,
      error: 'The "file" parameter is required and must be a non-empty string.',
    };
  }
  const trimmed = file.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'The "file" parameter must not be empty.',
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate the response format parameter.
 *
 * @param {*} format
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateResponseFormat(format) {
  if (format === undefined || format === null) {
    return { valid: true, value: DEFAULT_RESPONSE_FORMAT };
  }
  if (typeof format !== 'string' || !VALID_RESPONSE_FORMATS.includes(format)) {
    return {
      valid: false,
      error: `Invalid response format "${format}". Must be one of: ${VALID_RESPONSE_FORMATS.join(', ')}`,
    };
  }
  return { valid: true, value: format };
}

/**
 * Validate the language code (ISO 639-1, 2-letter code).
 *
 * @param {*} language
 * @returns {{ valid: boolean, value?: string|null, error?: string }}
 */
function validateLanguage(language) {
  if (language === undefined || language === null) {
    return { valid: true, value: null };
  }
  if (typeof language !== 'string' || language.trim().length === 0) {
    return { valid: false, error: 'The "language" parameter must be a non-empty string.' };
  }
  const code = language.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) {
    return {
      valid: false,
      error: `Invalid language code "${code}". Must be a 2-letter ISO 639-1 code (e.g. "en", "fr", "de").`,
    };
  }
  return { valid: true, value: code };
}

/**
 * Validate the prompt parameter (optional context hint, max 500 chars).
 *
 * @param {*} prompt
 * @returns {{ valid: boolean, value?: string|null, error?: string }}
 */
function validatePrompt(prompt) {
  if (prompt === undefined || prompt === null) {
    return { valid: true, value: null };
  }
  if (typeof prompt !== 'string') {
    return { valid: false, error: 'The "prompt" parameter must be a string.' };
  }
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return { valid: true, value: null };
  }
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return {
      valid: false,
      error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters (got ${trimmed.length}).`,
    };
  }
  return { valid: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle the "transcribe" action -- transcribe audio to text.
 * POST /audio/transcriptions
 */
async function handleTranscribe(params, context) {
  const fileValidation = validateFile(params.file);
  if (!fileValidation.valid) {
    return {
      result: `Error: ${fileValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const formatValidation = validateResponseFormat(params.responseFormat);
  if (!formatValidation.valid) {
    return {
      result: `Error: ${formatValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const langValidation = validateLanguage(params.language);
  if (!langValidation.valid) {
    return {
      result: `Error: ${langValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const promptValidation = validatePrompt(params.prompt);
  if (!promptValidation.valid) {
    return {
      result: `Error: ${promptValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const model = params.model || DEFAULT_MODEL;
  const responseFormat = formatValidation.value;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const requestBody = {
    model,
    file: fileValidation.value,
    response_format: responseFormat,
  };

  if (langValidation.value) {
    requestBody.language = langValidation.value;
  }

  if (promptValidation.value) {
    requestBody.prompt = promptValidation.value;
  }

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/audio/transcriptions',
      requestBody,
      timeoutMs
    );

    const text = data?.text || '';
    const language = data?.language || langValidation.value || 'auto';
    const duration = data?.duration || null;

    const lines = [
      'Transcription Result',
      `Language: ${language}`,
      duration !== null ? `Duration: ${duration}s` : null,
      `Model: ${model}`,
      `Format: ${responseFormat}`,
      '',
      text,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'transcribe',
        layer: 'L1',
        model,
        language,
        duration,
        responseFormat,
        textLength: text.length,
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
 * Handle the "translate" action -- translate audio to English text.
 * POST /audio/translations
 */
async function handleTranslate(params, context) {
  const fileValidation = validateFile(params.file);
  if (!fileValidation.valid) {
    return {
      result: `Error: ${fileValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const model = params.model || DEFAULT_MODEL;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const requestBody = {
    model,
    file: fileValidation.value,
  };

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/audio/translations',
      requestBody,
      timeoutMs
    );

    const text = data?.text || '';
    const sourceLanguage = data?.language || 'unknown';
    const duration = data?.duration || null;

    const lines = [
      'Translation Result (to English)',
      `Source Language: ${sourceLanguage}`,
      duration !== null ? `Duration: ${duration}s` : null,
      `Model: ${model}`,
      '',
      text,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'translate',
        layer: 'L1',
        model,
        sourceLanguage,
        targetLanguage: 'en',
        duration,
        textLength: text.length,
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
 * Handle the "detect_language" action -- detect the language of audio.
 * POST /audio/transcriptions with verbose_json to extract language.
 */
async function handleDetectLanguage(params, context) {
  const fileValidation = validateFile(params.file);
  if (!fileValidation.valid) {
    return {
      result: `Error: ${fileValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const model = params.model || DEFAULT_MODEL;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const requestBody = {
    model,
    file: fileValidation.value,
    response_format: 'verbose_json',
  };

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/audio/transcriptions',
      requestBody,
      timeoutMs
    );

    const detectedLanguage = data?.language || 'unknown';

    const lines = [
      'Language Detection Result',
      `Detected Language: ${detectedLanguage}`,
      `Model: ${model}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'detect_language',
        layer: 'L1',
        model,
        detectedLanguage,
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
 * Handle the "list_models" action -- return hardcoded list of known models.
 * No API call needed.
 */
function handleListModels() {
  const lines = [
    'Available Whisper Models',
    '=======================',
    '',
  ];

  for (const model of KNOWN_MODELS) {
    lines.push(`${model.name} (${model.id})`);
    lines.push(`  Provider: ${model.provider}`);
    lines.push(`  Formats: ${model.supportedFormats.join(', ')}`);
    lines.push(`  Actions: ${model.supportedActions.join(', ')}`);
    lines.push(`  Max File Size: ${model.maxFileSizeMB}MB`);
    lines.push(`  Audio Formats: ${model.supportedAudioFormats.join(', ')}`);
    lines.push('');
  }

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_models',
      layer: 'L1',
      modelCount: KNOWN_MODELS.length,
      models: KNOWN_MODELS.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
      })),
    },
  };
}

/**
 * Handle the "list_formats" action -- return supported response formats.
 * No API call needed.
 */
function handleListFormats() {
  const formatDescriptions = [
    { format: 'json', description: 'JSON object with text field' },
    { format: 'text', description: 'Plain text transcription' },
    { format: 'srt', description: 'SubRip subtitle format' },
    { format: 'vtt', description: 'WebVTT subtitle format' },
    { format: 'verbose_json', description: 'JSON with timestamps, language, and segments' },
  ];

  const lines = [
    'Supported Response Formats',
    '==========================',
    '',
  ];

  for (const f of formatDescriptions) {
    lines.push(`${f.format}: ${f.description}`);
  }

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_formats',
      layer: 'L1',
      formatCount: formatDescriptions.length,
      formats: formatDescriptions,
    },
  };
}

// ---------------------------------------------------------------------------
// Input validation for execute entry point
// ---------------------------------------------------------------------------

/**
 * Validate the top-level params for the skill.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
export function validate(params) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      valid: false,
      error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Skill metadata
// ---------------------------------------------------------------------------

export const meta = {
  name: 'whisper-transcribe',
  displayName: 'Whisper Transcribe',
  version: '1.0.0',
  layer: 'L1',
  category: 'AI',
  description: 'OpenAI Whisper speech-to-text transcription skill.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a whisper transcription operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: transcribe, translate, detect_language, list_models, list_formats
 * @param {string} [params.file] - Audio file URL or path (required for transcribe, translate, detect_language)
 * @param {string} [params.model="whisper-1"] - Model identifier
 * @param {string} [params.language] - ISO 639-1 2-letter language code (optional)
 * @param {string} [params.responseFormat="json"] - Response format: json, text, srt, vtt, verbose_json
 * @param {string} [params.prompt] - Optional context hint for transcription (max 500 chars)
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient for API actions)
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
      case 'transcribe':
        return await handleTranscribe(params, context);
      case 'translate':
        return await handleTranslate(params, context);
      case 'detect_language':
        return await handleDetectLanguage(params, context);
      case 'list_models':
        return handleListModels();
      case 'list_formats':
        return handleListFormats();
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

// Export internals for testing
export {
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  validateFile,
  validateResponseFormat,
  validateLanguage,
  validatePrompt,
  KNOWN_MODELS,
  VALID_ACTIONS,
  VALID_RESPONSE_FORMATS,
  DEFAULT_MODEL,
  DEFAULT_RESPONSE_FORMAT,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_PROMPT_LENGTH,
};
