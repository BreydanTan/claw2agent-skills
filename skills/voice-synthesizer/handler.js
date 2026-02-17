/**
 * Voice Synthesizer Skill Handler (Layer 1)
 *
 * Convert text to speech with multiple voices, languages, speed control,
 * and audio format selection.
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
  'synthesize',
  'list_voices',
  'list_languages',
  'estimate_duration',
  'synthesize_ssml',
  'batch_synthesize',
];

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

const VALID_RESPONSE_FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav'];

const DEFAULT_VOICE = 'alloy';
const DEFAULT_MODEL = 'tts-1';
const DEFAULT_SPEED = 1.0;
const DEFAULT_RESPONSE_FORMAT = 'mp3';

const MIN_SPEED = 0.25;
const MAX_SPEED = 4.0;

const MAX_TEXT_LENGTH = 4096;
const MAX_BATCH_ITEMS = 5;

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMEOUT_MS = 120000;

const WORDS_PER_MINUTE = 150;

// ---------------------------------------------------------------------------
// Known voices (for list_voices action -- no API call needed)
// ---------------------------------------------------------------------------

const KNOWN_VOICES = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral', description: 'A balanced, versatile voice' },
  { id: 'echo', name: 'Echo', gender: 'male', description: 'A warm, resonant male voice' },
  { id: 'fable', name: 'Fable', gender: 'neutral', description: 'An expressive, storytelling voice' },
  { id: 'onyx', name: 'Onyx', gender: 'male', description: 'A deep, authoritative male voice' },
  { id: 'nova', name: 'Nova', gender: 'female', description: 'A bright, energetic female voice' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'A soft, gentle female voice' },
];

// ---------------------------------------------------------------------------
// Known languages (for list_languages action -- no API call needed)
// ---------------------------------------------------------------------------

const KNOWN_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pl', name: 'Polish' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turkish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'id', name: 'Indonesian' },
  { code: 'uk', name: 'Ukrainian' },
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
    result: 'Error: Provider client required for voice synthesis. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for voice synthesis. Configure an API key or platform adapter.',
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
      code: 'REQUEST_ERROR',
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
 * Validate and sanitize the text input.
 *
 * @param {string} text
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateText(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'The "text" parameter is required and must be a non-empty string.' };
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'The "text" parameter must not be empty.' };
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters (got ${trimmed.length}).`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate the voice parameter.
 *
 * @param {string} voice
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateVoice(voice) {
  if (voice === undefined || voice === null) {
    return { valid: true, value: DEFAULT_VOICE };
  }

  if (typeof voice !== 'string') {
    return { valid: false, error: 'The "voice" parameter must be a string.' };
  }

  const normalized = voice.toLowerCase().trim();

  if (!VALID_VOICES.includes(normalized)) {
    return {
      valid: false,
      error: `Invalid voice "${voice}". Must be one of: ${VALID_VOICES.join(', ')}`,
    };
  }

  return { valid: true, value: normalized };
}

/**
 * Validate and clamp the speed parameter.
 *
 * @param {*} speed
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateSpeed(speed) {
  if (speed === undefined || speed === null) {
    return { valid: true, value: DEFAULT_SPEED };
  }

  const num = Number(speed);

  if (isNaN(num)) {
    return { valid: false, error: 'The "speed" parameter must be a number.' };
  }

  if (num < MIN_SPEED || num > MAX_SPEED) {
    return {
      valid: false,
      error: `Speed must be between ${MIN_SPEED} and ${MAX_SPEED} (got ${num}).`,
    };
  }

  return { valid: true, value: num };
}

/**
 * Validate the response format parameter.
 *
 * @param {string} format
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateResponseFormat(format) {
  if (format === undefined || format === null) {
    return { valid: true, value: DEFAULT_RESPONSE_FORMAT };
  }

  if (typeof format !== 'string') {
    return { valid: false, error: 'The "responseFormat" parameter must be a string.' };
  }

  const normalized = format.toLowerCase().trim();

  if (!VALID_RESPONSE_FORMATS.includes(normalized)) {
    return {
      valid: false,
      error: `Invalid response format "${format}". Must be one of: ${VALID_RESPONSE_FORMATS.join(', ')}`,
    };
  }

  return { valid: true, value: normalized };
}

/**
 * Validate SSML input.
 *
 * @param {string} ssml
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateSsml(ssml) {
  if (!ssml || typeof ssml !== 'string') {
    return { valid: false, error: 'The "ssml" parameter is required and must be a non-empty string.' };
  }

  const trimmed = ssml.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'The "ssml" parameter must not be empty.' };
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      error: `SSML exceeds maximum length of ${MAX_TEXT_LENGTH} characters (got ${trimmed.length}).`,
    };
  }

  if (!trimmed.includes('<speak>') || !trimmed.includes('</speak>')) {
    return {
      valid: false,
      error: 'SSML must contain <speak> and </speak> tags.',
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate batch items array.
 *
 * @param {Array} items
 * @returns {{ valid: boolean, validated?: Array, error?: string }}
 */
function validateBatchItems(items) {
  if (!Array.isArray(items)) {
    return { valid: false, error: 'The "items" parameter must be an array.' };
  }

  if (items.length === 0) {
    return { valid: false, error: 'The "items" array must not be empty.' };
  }

  if (items.length > MAX_BATCH_ITEMS) {
    return {
      valid: false,
      error: `Batch size exceeds maximum of ${MAX_BATCH_ITEMS} items (got ${items.length}).`,
    };
  }

  const validated = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!item || typeof item !== 'object') {
      return { valid: false, error: `Item at index ${i} must be an object.` };
    }

    const textValidation = validateText(item.text);
    if (!textValidation.valid) {
      return { valid: false, error: `Item at index ${i}: ${textValidation.error}` };
    }

    const voiceValidation = validateVoice(item.voice);
    if (!voiceValidation.valid) {
      return { valid: false, error: `Item at index ${i}: ${voiceValidation.error}` };
    }

    const speedValidation = validateSpeed(item.speed);
    if (!speedValidation.valid) {
      return { valid: false, error: `Item at index ${i}: ${speedValidation.error}` };
    }

    validated.push({
      text: textValidation.sanitized,
      voice: voiceValidation.value,
      speed: speedValidation.value,
    });
  }

  return { valid: true, validated };
}

// ---------------------------------------------------------------------------
// Duration estimation helper
// ---------------------------------------------------------------------------

/**
 * Estimate audio duration from text at a given speed.
 * Assumes approximately 150 words per minute at speed 1.0.
 *
 * @param {string} text - The text to estimate duration for
 * @param {number} speed - Playback speed multiplier
 * @returns {number} Estimated duration in seconds
 */
function estimateDurationSeconds(text, speed) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutesAtNormal = words / WORDS_PER_MINUTE;
  const seconds = (minutesAtNormal * 60) / speed;
  return Math.round(seconds * 10) / 10;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle the "synthesize" action -- convert text to speech.
 */
async function handleSynthesize(params, context) {
  const textValidation = validateText(params.text);
  if (!textValidation.valid) {
    return {
      result: `Error: ${textValidation.error}`,
      metadata: { success: false, error: 'INVALID_TEXT' },
    };
  }

  const voiceValidation = validateVoice(params.voice);
  if (!voiceValidation.valid) {
    return {
      result: `Error: ${voiceValidation.error}`,
      metadata: { success: false, error: 'INVALID_VOICE' },
    };
  }

  const speedValidation = validateSpeed(params.speed);
  if (!speedValidation.valid) {
    return {
      result: `Error: ${speedValidation.error}`,
      metadata: { success: false, error: 'INVALID_SPEED' },
    };
  }

  const formatValidation = validateResponseFormat(params.responseFormat);
  if (!formatValidation.valid) {
    return {
      result: `Error: ${formatValidation.error}`,
      metadata: { success: false, error: 'INVALID_FORMAT' },
    };
  }

  const model = params.model || DEFAULT_MODEL;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/audio/speech',
      {
        model,
        input: textValidation.sanitized,
        voice: voiceValidation.value,
        speed: speedValidation.value,
        response_format: formatValidation.value,
      },
      timeoutMs
    );

    const audioUrl = data?.audio_url || '';
    const durationSeconds = data?.duration_seconds || estimateDurationSeconds(textValidation.sanitized, speedValidation.value);
    const format = data?.format || formatValidation.value;
    const sizeBytes = data?.size_bytes || 0;

    const lines = [
      'Speech synthesized successfully',
      `Voice: ${voiceValidation.value} | Model: ${model}`,
      `Speed: ${speedValidation.value}x | Format: ${format}`,
      `Duration: ${durationSeconds}s | Size: ${sizeBytes} bytes`,
      '',
      `Audio URL: ${audioUrl}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'synthesize',
        layer: 'L1',
        model,
        voice: voiceValidation.value,
        speed: speedValidation.value,
        responseFormat: format,
        audioUrl,
        durationSeconds,
        sizeBytes,
        textLength: textValidation.sanitized.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

/**
 * Handle the "list_voices" action -- return hardcoded list of known voices.
 * No API call needed.
 */
function handleListVoices() {
  const lines = [
    'Available Voices',
    '================',
    '',
  ];

  for (const voice of KNOWN_VOICES) {
    lines.push(`${voice.name} (${voice.id})`);
    lines.push(`  Gender: ${voice.gender}`);
    lines.push(`  Description: ${voice.description}`);
    lines.push('');
  }

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_voices',
      layer: 'L1',
      voiceCount: KNOWN_VOICES.length,
      voices: KNOWN_VOICES.map((v) => ({
        id: v.id,
        name: v.name,
        gender: v.gender,
      })),
    },
  };
}

/**
 * Handle the "list_languages" action -- return hardcoded list of known languages.
 * No API call needed.
 */
function handleListLanguages() {
  const lines = [
    'Supported Languages',
    '===================',
    '',
  ];

  for (const lang of KNOWN_LANGUAGES) {
    lines.push(`${lang.name} (${lang.code})`);
  }

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_languages',
      layer: 'L1',
      languageCount: KNOWN_LANGUAGES.length,
      languages: KNOWN_LANGUAGES.map((l) => ({
        code: l.code,
        name: l.name,
      })),
    },
  };
}

/**
 * Handle the "estimate_duration" action -- estimate audio duration from text.
 * No API call needed.
 */
function handleEstimateDuration(params) {
  const textValidation = validateText(params.text);
  if (!textValidation.valid) {
    return {
      result: `Error: ${textValidation.error}`,
      metadata: { success: false, error: 'INVALID_TEXT' },
    };
  }

  const speedValidation = validateSpeed(params.speed);
  if (!speedValidation.valid) {
    return {
      result: `Error: ${speedValidation.error}`,
      metadata: { success: false, error: 'INVALID_SPEED' },
    };
  }

  const text = textValidation.sanitized;
  const speed = speedValidation.value;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const durationSeconds = estimateDurationSeconds(text, speed);

  const lines = [
    'Duration Estimate',
    `Words: ${wordCount}`,
    `Speed: ${speed}x`,
    `Estimated duration: ${durationSeconds}s`,
  ];

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'estimate_duration',
      layer: 'L1',
      wordCount,
      speed,
      estimatedDurationSeconds: durationSeconds,
    },
  };
}

/**
 * Handle the "synthesize_ssml" action -- synthesize from SSML input.
 */
async function handleSynthesizeSsml(params, context) {
  const ssmlValidation = validateSsml(params.ssml);
  if (!ssmlValidation.valid) {
    return {
      result: `Error: ${ssmlValidation.error}`,
      metadata: { success: false, error: 'INVALID_SSML' },
    };
  }

  const voiceValidation = validateVoice(params.voice);
  if (!voiceValidation.valid) {
    return {
      result: `Error: ${voiceValidation.error}`,
      metadata: { success: false, error: 'INVALID_VOICE' },
    };
  }

  const formatValidation = validateResponseFormat(params.responseFormat);
  if (!formatValidation.valid) {
    return {
      result: `Error: ${formatValidation.error}`,
      metadata: { success: false, error: 'INVALID_FORMAT' },
    };
  }

  const model = params.model || DEFAULT_MODEL;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/audio/speech',
      {
        model,
        input: ssmlValidation.sanitized,
        voice: voiceValidation.value,
        response_format: formatValidation.value,
      },
      timeoutMs
    );

    const audioUrl = data?.audio_url || '';
    const durationSeconds = data?.duration_seconds || 0;
    const format = data?.format || formatValidation.value;
    const sizeBytes = data?.size_bytes || 0;

    const lines = [
      'SSML speech synthesized successfully',
      `Voice: ${voiceValidation.value} | Model: ${model}`,
      `Format: ${format}`,
      `Duration: ${durationSeconds}s | Size: ${sizeBytes} bytes`,
      '',
      `Audio URL: ${audioUrl}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'synthesize_ssml',
        layer: 'L1',
        model,
        voice: voiceValidation.value,
        responseFormat: format,
        audioUrl,
        durationSeconds,
        sizeBytes,
        ssmlLength: ssmlValidation.sanitized.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

/**
 * Handle the "batch_synthesize" action -- synthesize multiple texts.
 */
async function handleBatchSynthesize(params, context) {
  const itemsValidation = validateBatchItems(params.items);
  if (!itemsValidation.valid) {
    return {
      result: `Error: ${itemsValidation.error}`,
      metadata: { success: false, error: 'INVALID_BATCH' },
    };
  }

  const formatValidation = validateResponseFormat(params.responseFormat);
  if (!formatValidation.valid) {
    return {
      result: `Error: ${formatValidation.error}`,
      metadata: { success: false, error: 'INVALID_FORMAT' },
    };
  }

  const model = params.model || DEFAULT_MODEL;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const results = [];
  const errors = [];

  for (let i = 0; i < itemsValidation.validated.length; i++) {
    const item = itemsValidation.validated[i];

    try {
      const data = await requestWithTimeout(
        resolved.client,
        'POST',
        '/audio/speech',
        {
          model,
          input: item.text,
          voice: item.voice,
          speed: item.speed,
          response_format: formatValidation.value,
        },
        timeoutMs
      );

      results.push({
        index: i,
        success: true,
        audioUrl: data?.audio_url || '',
        durationSeconds: data?.duration_seconds || estimateDurationSeconds(item.text, item.speed),
        format: data?.format || formatValidation.value,
        sizeBytes: data?.size_bytes || 0,
      });
    } catch (err) {
      errors.push({
        index: i,
        error: err.code || 'REQUEST_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  }

  const totalItems = itemsValidation.validated.length;
  const successCount = results.length;
  const errorCount = errors.length;

  const lines = [
    `Batch synthesis complete: ${successCount}/${totalItems} succeeded`,
    `Model: ${model} | Format: ${formatValidation.value}`,
    '',
  ];

  for (const r of results) {
    lines.push(`Item ${r.index + 1}: ${r.audioUrl} (${r.durationSeconds}s)`);
  }

  for (const e of errors) {
    lines.push(`Item ${e.index + 1}: ERROR - ${e.message}`);
  }

  return {
    result: redactSensitive(lines.join('\n')),
    metadata: {
      success: errorCount === 0,
      action: 'batch_synthesize',
      layer: 'L1',
      model,
      responseFormat: formatValidation.value,
      totalItems,
      successCount,
      errorCount,
      results,
      errors,
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a voice synthesis operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: synthesize, list_voices, list_languages, estimate_duration, synthesize_ssml, batch_synthesize
 * @param {string} [params.text] - Text to synthesize (required for synthesize/estimate_duration)
 * @param {string} [params.ssml] - SSML input (required for synthesize_ssml)
 * @param {Array}  [params.items] - Batch items (required for batch_synthesize)
 * @param {string} [params.voice="alloy"] - Voice identifier
 * @param {string} [params.model="tts-1"] - Model identifier
 * @param {number} [params.speed=1.0] - Speed multiplier (0.25 - 4.0)
 * @param {string} [params.responseFormat="mp3"] - Output audio format
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
      case 'synthesize':
        return await handleSynthesize(params, context);
      case 'list_voices':
        return handleListVoices();
      case 'list_languages':
        return handleListLanguages();
      case 'estimate_duration':
        return handleEstimateDuration(params);
      case 'synthesize_ssml':
        return await handleSynthesizeSsml(params, context);
      case 'batch_synthesize':
        return await handleBatchSynthesize(params, context);
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
  requestWithTimeout,
  validateText,
  validateVoice,
  validateSpeed,
  validateResponseFormat,
  validateSsml,
  validateBatchItems,
  estimateDurationSeconds,
  KNOWN_VOICES,
  KNOWN_LANGUAGES,
  VALID_ACTIONS,
  VALID_VOICES,
  VALID_RESPONSE_FORMATS,
  MAX_TEXT_LENGTH,
  MAX_BATCH_ITEMS,
  MIN_SPEED,
  MAX_SPEED,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  WORDS_PER_MINUTE,
};
