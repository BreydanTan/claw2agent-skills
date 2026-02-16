/**
 * Translation Hub Skill Handler
 *
 * Translates text between languages using LibreTranslate API.
 * Supports single translation, language detection, batch translation,
 * and listing supported languages.
 */

const MAX_TEXT_LENGTH = 5000;
const MAX_BATCH_SIZE = 10;
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_BASE_URL = 'https://libretranslate.com';

/**
 * Perform a fetch request with a timeout.
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the base URL from params, context config, or the default.
 * @param {Object} params
 * @param {Object} context
 * @returns {string}
 */
function resolveBaseUrl(params, context) {
  return (
    context?.config?.baseUrl ||
    DEFAULT_BASE_URL
  );
}

/**
 * Resolve the API key from context, if present.
 * @param {Object} context
 * @returns {string|undefined}
 */
function resolveApiKey(context) {
  return context?.apiKey || context?.config?.apiKey;
}

/**
 * Build common headers for LibreTranslate requests.
 * @param {string|undefined} apiKey
 * @returns {Object}
 */
function buildHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Translate a single text from one language to another.
 * @param {Object} params
 * @param {string} baseUrl
 * @param {string|undefined} apiKey
 * @returns {Promise<{result: string, metadata: Object}>}
 */
async function handleTranslate(params, baseUrl, apiKey) {
  const { text, from = 'auto', to } = params;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      result: 'Error: The "text" parameter is required for translation.',
      metadata: { success: false, error: 'MISSING_TEXT' },
    };
  }

  if (!to || typeof to !== 'string' || to.trim().length === 0) {
    return {
      result: 'Error: The "to" parameter (target language code) is required for translation.',
      metadata: { success: false, error: 'MISSING_TARGET_LANG' },
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      result: `Error: Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters (received ${text.length}).`,
      metadata: { success: false, error: 'TEXT_TOO_LONG', maxLength: MAX_TEXT_LENGTH, actualLength: text.length },
    };
  }

  const body = {
    q: text,
    source: from,
    target: to,
    format: 'text',
  };

  if (apiKey) {
    body.api_key = apiKey;
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/translate`,
      {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: JSON.stringify(body),
      },
      REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorData = await response.text();
      return {
        result: `Error: Translation provider returned HTTP ${response.status}. ${errorData}`,
        metadata: { success: false, error: 'PROVIDER_ERROR', statusCode: response.status },
      };
    }

    const data = await response.json();

    return {
      result: data.translatedText,
      metadata: {
        success: true,
        action: 'translate',
        from: data.detectedLanguage?.language || from,
        to,
        confidence: data.detectedLanguage?.confidence || null,
        originalLength: text.length,
        translatedLength: data.translatedText.length,
      },
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        result: 'Error: Translation request timed out.',
        metadata: { success: false, error: 'TIMEOUT' },
      };
    }
    return {
      result: `Error: Failed to translate text. ${error.message}`,
      metadata: { success: false, error: 'PROVIDER_ERROR', errorMessage: error.message },
    };
  }
}

/**
 * Detect the language of the given text.
 * @param {Object} params
 * @param {string} baseUrl
 * @param {string|undefined} apiKey
 * @returns {Promise<{result: string, metadata: Object}>}
 */
async function handleDetect(params, baseUrl, apiKey) {
  const { text } = params;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      result: 'Error: The "text" parameter is required for language detection.',
      metadata: { success: false, error: 'MISSING_TEXT' },
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      result: `Error: Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters (received ${text.length}).`,
      metadata: { success: false, error: 'TEXT_TOO_LONG', maxLength: MAX_TEXT_LENGTH, actualLength: text.length },
    };
  }

  const body = { q: text };

  if (apiKey) {
    body.api_key = apiKey;
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/detect`,
      {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: JSON.stringify(body),
      },
      REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorData = await response.text();
      return {
        result: `Error: Detection provider returned HTTP ${response.status}. ${errorData}`,
        metadata: { success: false, error: 'PROVIDER_ERROR', statusCode: response.status },
      };
    }

    const data = await response.json();
    const top3 = Array.isArray(data) ? data.slice(0, 3) : [];

    const formatted = top3
      .map((d, i) => `${i + 1}. ${d.language} (confidence: ${(d.confidence * 100).toFixed(1)}%)`)
      .join('\n');

    return {
      result: `Detected language(s):\n${formatted}`,
      metadata: {
        success: true,
        action: 'detect',
        detections: top3,
        textLength: text.length,
      },
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        result: 'Error: Detection request timed out.',
        metadata: { success: false, error: 'TIMEOUT' },
      };
    }
    return {
      result: `Error: Failed to detect language. ${error.message}`,
      metadata: { success: false, error: 'PROVIDER_ERROR', errorMessage: error.message },
    };
  }
}

/**
 * Translate multiple texts to the same target language.
 * @param {Object} params
 * @param {string} baseUrl
 * @param {string|undefined} apiKey
 * @returns {Promise<{result: string, metadata: Object}>}
 */
async function handleBatch(params, baseUrl, apiKey) {
  const { texts, from = 'auto', to } = params;

  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return {
      result: 'Error: The "texts" parameter (non-empty array of strings) is required for batch translation.',
      metadata: { success: false, error: 'MISSING_TEXT' },
    };
  }

  if (texts.length > MAX_BATCH_SIZE) {
    return {
      result: `Error: Batch size exceeds maximum of ${MAX_BATCH_SIZE} texts (received ${texts.length}).`,
      metadata: { success: false, error: 'BATCH_TOO_LARGE', maxBatchSize: MAX_BATCH_SIZE, actualSize: texts.length },
    };
  }

  if (!to || typeof to !== 'string' || to.trim().length === 0) {
    return {
      result: 'Error: The "to" parameter (target language code) is required for batch translation.',
      metadata: { success: false, error: 'MISSING_TARGET_LANG' },
    };
  }

  // Validate individual text lengths
  for (let i = 0; i < texts.length; i++) {
    if (typeof texts[i] !== 'string' || texts[i].trim().length === 0) {
      return {
        result: `Error: Text at index ${i} is empty or not a string.`,
        metadata: { success: false, error: 'MISSING_TEXT', index: i },
      };
    }
    if (texts[i].length > MAX_TEXT_LENGTH) {
      return {
        result: `Error: Text at index ${i} exceeds maximum length of ${MAX_TEXT_LENGTH} characters.`,
        metadata: { success: false, error: 'TEXT_TOO_LONG', index: i, maxLength: MAX_TEXT_LENGTH },
      };
    }
  }

  const translations = [];

  try {
    for (const text of texts) {
      const body = {
        q: text,
        source: from,
        target: to,
        format: 'text',
      };

      if (apiKey) {
        body.api_key = apiKey;
      }

      const response = await fetchWithTimeout(
        `${baseUrl}/translate`,
        {
          method: 'POST',
          headers: buildHeaders(apiKey),
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.text();
        return {
          result: `Error: Translation provider returned HTTP ${response.status} for batch item. ${errorData}`,
          metadata: { success: false, error: 'PROVIDER_ERROR', statusCode: response.status },
        };
      }

      const data = await response.json();
      translations.push({
        original: text,
        translated: data.translatedText,
      });
    }

    const formatted = translations
      .map((t, i) => `${i + 1}. "${t.original}" -> "${t.translated}"`)
      .join('\n');

    return {
      result: `Batch translation (${translations.length} texts):\n${formatted}`,
      metadata: {
        success: true,
        action: 'batch',
        from,
        to,
        count: translations.length,
        translations,
      },
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        result: 'Error: Batch translation request timed out.',
        metadata: { success: false, error: 'TIMEOUT' },
      };
    }
    return {
      result: `Error: Failed to perform batch translation. ${error.message}`,
      metadata: { success: false, error: 'PROVIDER_ERROR', errorMessage: error.message },
    };
  }
}

/**
 * List all supported languages from the translation provider.
 * @param {string} baseUrl
 * @param {string|undefined} apiKey
 * @returns {Promise<{result: string, metadata: Object}>}
 */
async function handleLanguages(baseUrl, apiKey) {
  try {
    const url = new URL('/languages', baseUrl);
    if (apiKey) {
      url.searchParams.set('api_key', apiKey);
    }

    const response = await fetchWithTimeout(
      url.toString(),
      {
        method: 'GET',
        headers: buildHeaders(apiKey),
      },
      REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorData = await response.text();
      return {
        result: `Error: Provider returned HTTP ${response.status} when listing languages. ${errorData}`,
        metadata: { success: false, error: 'PROVIDER_ERROR', statusCode: response.status },
      };
    }

    const data = await response.json();
    const languages = Array.isArray(data) ? data : [];

    const formatted = languages
      .map((lang) => `  ${lang.code} - ${lang.name}`)
      .join('\n');

    return {
      result: `Supported languages (${languages.length}):\n${formatted}`,
      metadata: {
        success: true,
        action: 'languages',
        count: languages.length,
        languages: languages.map((l) => ({ code: l.code, name: l.name })),
      },
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        result: 'Error: Request to list languages timed out.',
        metadata: { success: false, error: 'TIMEOUT' },
      };
    }
    return {
      result: `Error: Failed to list supported languages. ${error.message}`,
      metadata: { success: false, error: 'PROVIDER_ERROR', errorMessage: error.message },
    };
  }
}

/**
 * Execute the Translation Hub skill.
 *
 * @param {Object} params
 * @param {string} params.action - The action to perform: translate, detect, batch, languages
 * @param {string} [params.text] - Text to translate or detect
 * @param {string[]} [params.texts] - Array of texts for batch translation
 * @param {string} [params.from='auto'] - Source language code
 * @param {string} [params.to] - Target language code
 * @param {string} [params.provider='libre'] - Translation provider
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  if (!action) {
    return {
      result: 'Error: The "action" parameter is required. Use one of: translate, detect, batch, languages.',
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  const baseUrl = resolveBaseUrl(params, context);
  const apiKey = resolveApiKey(context);

  switch (action) {
    case 'translate':
      return handleTranslate(params, baseUrl, apiKey);
    case 'detect':
      return handleDetect(params, baseUrl, apiKey);
    case 'batch':
      return handleBatch(params, baseUrl, apiKey);
    case 'languages':
      return handleLanguages(baseUrl, apiKey);
    default:
      return {
        result: `Error: Unknown action "${action}". Supported actions: translate, detect, batch, languages.`,
        metadata: { success: false, error: 'INVALID_ACTION', action },
      };
  }
}
