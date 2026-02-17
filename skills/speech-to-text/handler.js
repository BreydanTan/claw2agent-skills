/**
 * Speech to Text Skill Handler (Layer 1)
 *
 * Transcribe audio to text with language detection, timestamps,
 * and multiple format support (Whisper-compatible).
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
  'list_languages',
  'list_models',
  'transcribe_with_timestamps',
];

const VALID_RESPONSE_FORMATS = ['json', 'text', 'srt', 'vtt'];

const VALID_GRANULARITIES = ['word', 'segment'];

const DEFAULT_MODEL = 'whisper-1';
const DEFAULT_RESPONSE_FORMAT = 'json';
const DEFAULT_GRANULARITY = 'segment';

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMEOUT_MS = 120000;

// ---------------------------------------------------------------------------
// Supported languages (Whisper)
// ---------------------------------------------------------------------------

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Chinese' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'ru', name: 'Russian' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'ja', name: 'Japanese' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'ca', name: 'Catalan' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ar', name: 'Arabic' },
  { code: 'sv', name: 'Swedish' },
  { code: 'it', name: 'Italian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fi', name: 'Finnish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'he', name: 'Hebrew' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'el', name: 'Greek' },
  { code: 'ms', name: 'Malay' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'da', name: 'Danish' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ta', name: 'Tamil' },
  { code: 'no', name: 'Norwegian' },
  { code: 'th', name: 'Thai' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hr', name: 'Croatian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'la', name: 'Latin' },
  { code: 'mi', name: 'Maori' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'cy', name: 'Welsh' },
  { code: 'sk', name: 'Slovak' },
  { code: 'te', name: 'Telugu' },
  { code: 'fa', name: 'Persian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'sr', name: 'Serbian' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'kn', name: 'Kannada' },
  { code: 'et', name: 'Estonian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'br', name: 'Breton' },
  { code: 'eu', name: 'Basque' },
  { code: 'is', name: 'Icelandic' },
  { code: 'hy', name: 'Armenian' },
  { code: 'ne', name: 'Nepali' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'sq', name: 'Albanian' },
  { code: 'sw', name: 'Swahili' },
  { code: 'gl', name: 'Galician' },
  { code: 'mr', name: 'Marathi' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'si', name: 'Sinhala' },
  { code: 'km', name: 'Khmer' },
  { code: 'sn', name: 'Shona' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'so', name: 'Somali' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'oc', name: 'Occitan' },
  { code: 'ka', name: 'Georgian' },
  { code: 'be', name: 'Belarusian' },
  { code: 'tg', name: 'Tajik' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'am', name: 'Amharic' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'lo', name: 'Lao' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'fo', name: 'Faroese' },
  { code: 'ht', name: 'Haitian Creole' },
  { code: 'ps', name: 'Pashto' },
  { code: 'tk', name: 'Turkmen' },
  { code: 'nn', name: 'Nynorsk' },
  { code: 'mt', name: 'Maltese' },
  { code: 'sa', name: 'Sanskrit' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'my', name: 'Myanmar' },
  { code: 'bo', name: 'Tibetan' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'as', name: 'Assamese' },
  { code: 'tt', name: 'Tatar' },
  { code: 'haw', name: 'Hawaiian' },
  { code: 'ln', name: 'Lingala' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ba', name: 'Bashkir' },
  { code: 'jw', name: 'Javanese' },
  { code: 'su', name: 'Sundanese' },
];

// ---------------------------------------------------------------------------
// Known models list (for list_models action -- no API call needed)
// ---------------------------------------------------------------------------

const KNOWN_MODELS = [
  {
    id: 'whisper-1',
    name: 'Whisper V2',
    provider: 'OpenAI',
    supportedFormats: ['json', 'text', 'srt', 'vtt'],
    supportedActions: ['transcribe', 'translate', 'detect_language', 'transcribe_with_timestamps'],
    supportsTimestamps: true,
    maxFileSizeMB: 25,
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
    result: 'Error: Provider client required for speech-to-text. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for speech-to-text. Configure an API key or platform adapter.',
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
    const response = await client.request(method, path, {
      ...body,
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
 * Validate a URL string (must be http or https).
 *
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  if (typeof url !== 'string' || url.trim().length === 0) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate that the caller provided either audioUrl or audioData.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, source?: string, value?: string, error?: string }}
 */
function validateAudioInput(params) {
  const { audioUrl, audioData } = params || {};

  if (audioUrl) {
    if (!isValidUrl(audioUrl)) {
      return {
        valid: false,
        error: 'The "audioUrl" parameter must be a valid HTTP(S) URL.',
      };
    }
    return { valid: true, source: 'url', value: audioUrl };
  }

  if (audioData) {
    if (typeof audioData !== 'string' || audioData.trim().length === 0) {
      return {
        valid: false,
        error: 'The "audioData" parameter must be a non-empty string (base64-encoded audio).',
      };
    }
    return { valid: true, source: 'data', value: audioData };
  }

  return {
    valid: false,
    error: 'Either "audioUrl" or "audioData" parameter is required.',
  };
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
  if (typeof format !== 'string' || !VALID_RESPONSE_FORMATS.includes(format)) {
    return {
      valid: false,
      error: `Invalid response format "${format}". Must be one of: ${VALID_RESPONSE_FORMATS.join(', ')}`,
    };
  }
  return { valid: true, value: format };
}

/**
 * Validate the granularity parameter.
 *
 * @param {string} granularity
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateGranularity(granularity) {
  if (granularity === undefined || granularity === null) {
    return { valid: true, value: DEFAULT_GRANULARITY };
  }
  if (typeof granularity !== 'string' || !VALID_GRANULARITIES.includes(granularity)) {
    return {
      valid: false,
      error: `Invalid granularity "${granularity}". Must be one of: ${VALID_GRANULARITIES.join(', ')}`,
    };
  }
  return { valid: true, value: granularity };
}

/**
 * Validate the language code against supported languages.
 *
 * @param {string} language
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateLanguage(language) {
  if (language === undefined || language === null) {
    return { valid: true, value: null };
  }
  if (typeof language !== 'string' || language.trim().length === 0) {
    return { valid: false, error: 'The "language" parameter must be a non-empty string.' };
  }
  const code = language.trim().toLowerCase();
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  if (!found) {
    return {
      valid: false,
      error: `Unsupported language code "${code}". Use list_languages action to see supported languages.`,
    };
  }
  return { valid: true, value: code };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle the "transcribe" action -- transcribe audio to text.
 */
async function handleTranscribe(params, context) {
  const audioValidation = validateAudioInput(params);
  if (!audioValidation.valid) {
    return {
      result: `Error: ${audioValidation.error}`,
      metadata: { success: false, error: 'INVALID_AUDIO_INPUT' },
    };
  }

  const formatValidation = validateResponseFormat(params.responseFormat);
  if (!formatValidation.valid) {
    return {
      result: `Error: ${formatValidation.error}`,
      metadata: { success: false, error: 'INVALID_RESPONSE_FORMAT' },
    };
  }

  const langValidation = validateLanguage(params.language);
  if (!langValidation.valid) {
    return {
      result: `Error: ${langValidation.error}`,
      metadata: { success: false, error: 'INVALID_LANGUAGE' },
    };
  }

  const model = params.model || DEFAULT_MODEL;
  const responseFormat = formatValidation.value;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const requestBody = {
    model,
    file: audioValidation.source === 'url' ? audioValidation.value : undefined,
    file_data: audioValidation.source === 'data' ? audioValidation.value : undefined,
    response_format: responseFormat,
  };

  if (langValidation.value) {
    requestBody.language = langValidation.value;
  }

  if (params.prompt) {
    requestBody.prompt = params.prompt;
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
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

/**
 * Handle the "translate" action -- translate audio to English text.
 */
async function handleTranslate(params, context) {
  const audioValidation = validateAudioInput(params);
  if (!audioValidation.valid) {
    return {
      result: `Error: ${audioValidation.error}`,
      metadata: { success: false, error: 'INVALID_AUDIO_INPUT' },
    };
  }

  const formatValidation = validateResponseFormat(params.responseFormat);
  if (!formatValidation.valid) {
    return {
      result: `Error: ${formatValidation.error}`,
      metadata: { success: false, error: 'INVALID_RESPONSE_FORMAT' },
    };
  }

  const model = params.model || DEFAULT_MODEL;
  const responseFormat = formatValidation.value;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const requestBody = {
    model,
    file: audioValidation.source === 'url' ? audioValidation.value : undefined,
    file_data: audioValidation.source === 'data' ? audioValidation.value : undefined,
    response_format: responseFormat,
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
      `Format: ${responseFormat}`,
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
        responseFormat,
        textLength: text.length,
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
 * Handle the "detect_language" action -- detect the language of audio.
 */
async function handleDetectLanguage(params, context) {
  const audioValidation = validateAudioInput(params);
  if (!audioValidation.valid) {
    return {
      result: `Error: ${audioValidation.error}`,
      metadata: { success: false, error: 'INVALID_AUDIO_INPUT' },
    };
  }

  const model = params.model || DEFAULT_MODEL;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const requestBody = {
    model,
    file: audioValidation.source === 'url' ? audioValidation.value : undefined,
    file_data: audioValidation.source === 'data' ? audioValidation.value : undefined,
    response_format: 'json',
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
    const languageInfo = SUPPORTED_LANGUAGES.find((l) => l.code === detectedLanguage);
    const languageName = languageInfo ? languageInfo.name : detectedLanguage;

    const lines = [
      'Language Detection Result',
      `Detected Language: ${languageName} (${detectedLanguage})`,
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
        languageName,
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
 * Handle the "list_languages" action -- return the list of supported languages.
 * No API call needed.
 */
function handleListLanguages() {
  const lines = [
    'Supported Languages',
    '===================',
    '',
  ];

  for (const lang of SUPPORTED_LANGUAGES) {
    lines.push(`${lang.name} (${lang.code})`);
  }

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_languages',
      layer: 'L1',
      languageCount: SUPPORTED_LANGUAGES.length,
      languages: SUPPORTED_LANGUAGES.map((l) => ({
        code: l.code,
        name: l.name,
      })),
    },
  };
}

/**
 * Handle the "list_models" action -- return hardcoded list of known models.
 * No API call needed.
 */
function handleListModels() {
  const lines = [
    'Available Speech-to-Text Models',
    '===============================',
    '',
  ];

  for (const model of KNOWN_MODELS) {
    lines.push(`${model.name} (${model.id})`);
    lines.push(`  Provider: ${model.provider}`);
    lines.push(`  Formats: ${model.supportedFormats.join(', ')}`);
    lines.push(`  Actions: ${model.supportedActions.join(', ')}`);
    lines.push(`  Timestamps: ${model.supportsTimestamps ? 'Yes' : 'No'}`);
    lines.push(`  Max File Size: ${model.maxFileSizeMB}MB`);
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
 * Handle the "transcribe_with_timestamps" action -- transcribe with word-level timestamps.
 */
async function handleTranscribeWithTimestamps(params, context) {
  const audioValidation = validateAudioInput(params);
  if (!audioValidation.valid) {
    return {
      result: `Error: ${audioValidation.error}`,
      metadata: { success: false, error: 'INVALID_AUDIO_INPUT' },
    };
  }

  const granularityValidation = validateGranularity(params.granularity);
  if (!granularityValidation.valid) {
    return {
      result: `Error: ${granularityValidation.error}`,
      metadata: { success: false, error: 'INVALID_GRANULARITY' },
    };
  }

  const langValidation = validateLanguage(params.language);
  if (!langValidation.valid) {
    return {
      result: `Error: ${langValidation.error}`,
      metadata: { success: false, error: 'INVALID_LANGUAGE' },
    };
  }

  const model = params.model || DEFAULT_MODEL;
  const granularity = granularityValidation.value;

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const requestBody = {
    model,
    file: audioValidation.source === 'url' ? audioValidation.value : undefined,
    file_data: audioValidation.source === 'data' ? audioValidation.value : undefined,
    response_format: 'verbose_json',
    timestamp_granularities: [granularity],
  };

  if (langValidation.value) {
    requestBody.language = langValidation.value;
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
    const segments = data?.segments || [];
    const words = data?.words || [];

    const lines = [
      'Transcription with Timestamps',
      `Language: ${language}`,
      duration !== null ? `Duration: ${duration}s` : null,
      `Model: ${model}`,
      `Granularity: ${granularity}`,
      '',
      text,
    ].filter((l) => l !== null);

    if (granularity === 'segment' && segments.length > 0) {
      lines.push('');
      lines.push('Segments:');
      for (const seg of segments) {
        lines.push(`  [${seg.start}s - ${seg.end}s] ${seg.text}`);
      }
    }

    if (granularity === 'word' && words.length > 0) {
      lines.push('');
      lines.push('Words:');
      for (const w of words) {
        lines.push(`  [${w.start}s - ${w.end}s] ${w.word}`);
      }
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'transcribe_with_timestamps',
        layer: 'L1',
        model,
        language,
        duration,
        granularity,
        segmentCount: segments.length,
        wordCount: words.length,
        textLength: text.length,
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

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a speech-to-text operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: transcribe, translate, detect_language, list_languages, list_models, transcribe_with_timestamps
 * @param {string} [params.audioUrl] - HTTP(S) URL of the audio file
 * @param {string} [params.audioData] - Base64-encoded audio data
 * @param {string} [params.language] - ISO 639-1 language code
 * @param {string} [params.model="whisper-1"] - Model identifier
 * @param {string} [params.responseFormat="json"] - Response format: json, text, srt, vtt
 * @param {string} [params.prompt] - Optional context prompt for transcription
 * @param {string} [params.granularity="segment"] - Timestamp granularity: word, segment
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
      case 'list_languages':
        return handleListLanguages();
      case 'list_models':
        return handleListModels();
      case 'transcribe_with_timestamps':
        return await handleTranscribeWithTimestamps(params, context);
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
  isValidUrl,
  validateAudioInput,
  validateResponseFormat,
  validateGranularity,
  validateLanguage,
  KNOWN_MODELS,
  SUPPORTED_LANGUAGES,
  VALID_ACTIONS,
  VALID_RESPONSE_FORMATS,
  VALID_GRANULARITIES,
  DEFAULT_MODEL,
  DEFAULT_RESPONSE_FORMAT,
  DEFAULT_GRANULARITY,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
