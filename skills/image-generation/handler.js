/**
 * Image Generation Skill Handler (Layer 1)
 *
 * Generate images from text prompts, create variations, edit images,
 * and list available image generation models.
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

const VALID_ACTIONS = ['generate', 'variations', 'edit', 'list_models'];

const VALID_SIZES = ['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024'];

const VALID_QUALITIES = ['standard', 'hd'];

const VALID_STYLES = ['vivid', 'natural'];

const DEFAULT_MODEL = 'dall-e-3';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_QUALITY = 'standard';
const DEFAULT_STYLE = 'vivid';
const DEFAULT_N = 1;
const MAX_N = 4;

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMEOUT_MS = 120000;

const MAX_PROMPT_LENGTH = 4000;

// ---------------------------------------------------------------------------
// Known models list (for list_models action -- no API call needed)
// ---------------------------------------------------------------------------

const KNOWN_MODELS = [
  {
    id: 'dall-e-3',
    name: 'DALL-E 3',
    provider: 'OpenAI',
    supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
    supportedActions: ['generate'],
    maxN: 1,
    supportsQuality: true,
    supportsStyle: true,
  },
  {
    id: 'dall-e-2',
    name: 'DALL-E 2',
    provider: 'OpenAI',
    supportedSizes: ['256x256', '512x512', '1024x1024'],
    supportedActions: ['generate', 'variations', 'edit'],
    maxN: 4,
    supportsQuality: false,
    supportsStyle: false,
  },
  {
    id: 'stable-diffusion-xl',
    name: 'Stable Diffusion XL',
    provider: 'Stability AI',
    supportedSizes: ['512x512', '1024x1024'],
    supportedActions: ['generate', 'variations'],
    maxN: 4,
    supportsQuality: true,
    supportsStyle: false,
  },
  {
    id: 'midjourney-v6',
    name: 'Midjourney v6',
    provider: 'Midjourney',
    supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
    supportedActions: ['generate', 'variations'],
    maxN: 4,
    supportsQuality: true,
    supportsStyle: true,
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
    result: 'Error: Provider client required for image generation. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for image generation. Configure an API key or platform adapter.',
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
// Fetch with timeout (no retry for image gen -- operations are expensive)
// ---------------------------------------------------------------------------

/**
 * Fetch data through the provider client with timeout.
 *
 * @param {Object} client - The provider or gateway client (must have .fetch())
 * @param {string} endpoint - The resource/endpoint identifier
 * @param {Object} options - Fetch options (params, etc.)
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
      throw {
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms.`,
      };
    }

    throw {
      code: 'FETCH_ERROR',
      message: err.message || 'Unknown fetch error',
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
 * Validate a URL string (basic format check).
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
 * Sanitize and validate the prompt text.
 *
 * @param {string} prompt
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, error: 'The "prompt" parameter is required and must be a non-empty string.' };
  }

  const trimmed = prompt.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'The "prompt" parameter must not be empty.' };
  }

  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return {
      valid: false,
      error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters (got ${trimmed.length}).`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate and clamp the "n" parameter.
 *
 * @param {*} n
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateN(n) {
  if (n === undefined || n === null) {
    return { valid: true, value: DEFAULT_N };
  }

  const num = Number(n);

  if (!Number.isInteger(num) || num < 1) {
    return { valid: false, error: 'The "n" parameter must be a positive integer.' };
  }

  if (num > MAX_N) {
    return { valid: false, error: `The "n" parameter must not exceed ${MAX_N} (got ${num}).` };
  }

  return { valid: true, value: num };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle the "generate" action -- generate image(s) from a text prompt.
 */
async function handleGenerate(params, context) {
  const promptValidation = validatePrompt(params.prompt);
  if (!promptValidation.valid) {
    return {
      result: `Error: ${promptValidation.error}`,
      metadata: { success: false, error: 'INVALID_PROMPT' },
    };
  }

  const {
    model = DEFAULT_MODEL,
    size = DEFAULT_SIZE,
    quality = DEFAULT_QUALITY,
    style = DEFAULT_STYLE,
  } = params;

  if (!VALID_SIZES.includes(size)) {
    return {
      result: `Error: Invalid size "${size}". Must be one of: ${VALID_SIZES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_SIZE' },
    };
  }

  if (!VALID_QUALITIES.includes(quality)) {
    return {
      result: `Error: Invalid quality "${quality}". Must be one of: ${VALID_QUALITIES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_QUALITY' },
    };
  }

  if (!VALID_STYLES.includes(style)) {
    return {
      result: `Error: Invalid style "${style}". Must be one of: ${VALID_STYLES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_STYLE' },
    };
  }

  const nValidation = validateN(params.n);
  if (!nValidation.valid) {
    return {
      result: `Error: ${nValidation.error}`,
      metadata: { success: false, error: 'INVALID_N' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'image/generate',
      {
        prompt: promptValidation.sanitized,
        model,
        size,
        quality,
        style,
        n: nValidation.value,
      },
      timeoutMs
    );

    const images = data?.images || data?.data || [];
    const urls = images.map((img) => img.url || img).filter(Boolean);

    const lines = [
      `Generated ${urls.length} image(s)`,
      `Model: ${model}`,
      `Size: ${size} | Quality: ${quality} | Style: ${style}`,
      '',
      ...urls.map((url, i) => `Image ${i + 1}: ${url}`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'generate',
        layer: 'L1',
        model,
        size,
        quality,
        style,
        n: nValidation.value,
        imageCount: urls.length,
        images: urls,
        timestamp: new Date().toISOString(),
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
 * Handle the "variations" action -- generate variations of an existing image.
 */
async function handleVariations(params, context) {
  const { imageUrl, model = DEFAULT_MODEL, size = DEFAULT_SIZE } = params;

  if (!imageUrl || !isValidUrl(imageUrl)) {
    return {
      result: 'Error: The "imageUrl" parameter is required and must be a valid HTTP(S) URL.',
      metadata: { success: false, error: 'INVALID_IMAGE_URL' },
    };
  }

  if (!VALID_SIZES.includes(size)) {
    return {
      result: `Error: Invalid size "${size}". Must be one of: ${VALID_SIZES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_SIZE' },
    };
  }

  const nValidation = validateN(params.n);
  if (!nValidation.valid) {
    return {
      result: `Error: ${nValidation.error}`,
      metadata: { success: false, error: 'INVALID_N' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'image/variations',
      {
        imageUrl,
        model,
        size,
        n: nValidation.value,
      },
      timeoutMs
    );

    const images = data?.images || data?.data || [];
    const urls = images.map((img) => img.url || img).filter(Boolean);

    const lines = [
      `Generated ${urls.length} variation(s)`,
      `Source: ${imageUrl}`,
      `Model: ${model} | Size: ${size}`,
      '',
      ...urls.map((url, i) => `Variation ${i + 1}: ${url}`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'variations',
        layer: 'L1',
        model,
        size,
        n: nValidation.value,
        sourceImage: imageUrl,
        imageCount: urls.length,
        images: urls,
        timestamp: new Date().toISOString(),
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
 * Handle the "edit" action -- edit an existing image with a text prompt.
 */
async function handleEdit(params, context) {
  const { imageUrl, mask, model = DEFAULT_MODEL, size = DEFAULT_SIZE } = params;

  if (!imageUrl || !isValidUrl(imageUrl)) {
    return {
      result: 'Error: The "imageUrl" parameter is required and must be a valid HTTP(S) URL.',
      metadata: { success: false, error: 'INVALID_IMAGE_URL' },
    };
  }

  const promptValidation = validatePrompt(params.prompt);
  if (!promptValidation.valid) {
    return {
      result: `Error: ${promptValidation.error}`,
      metadata: { success: false, error: 'INVALID_PROMPT' },
    };
  }

  if (!VALID_SIZES.includes(size)) {
    return {
      result: `Error: Invalid size "${size}". Must be one of: ${VALID_SIZES.join(', ')}`,
      metadata: { success: false, error: 'INVALID_SIZE' },
    };
  }

  if (mask !== undefined && mask !== null && !isValidUrl(mask)) {
    return {
      result: 'Error: The "mask" parameter must be a valid HTTP(S) URL when provided.',
      metadata: { success: false, error: 'INVALID_MASK_URL' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const fetchOptions = {
    imageUrl,
    prompt: promptValidation.sanitized,
    model,
    size,
  };

  if (mask && isValidUrl(mask)) {
    fetchOptions.mask = mask;
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'image/edit',
      fetchOptions,
      timeoutMs
    );

    const images = data?.images || data?.data || [];
    const urls = images.map((img) => img.url || img).filter(Boolean);

    const lines = [
      `Edited image (${urls.length} result(s))`,
      `Source: ${imageUrl}`,
      `Prompt: ${promptValidation.sanitized}`,
      `Model: ${model} | Size: ${size}`,
      mask ? `Mask: ${mask}` : null,
      '',
      ...urls.map((url, i) => `Result ${i + 1}: ${url}`),
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'edit',
        layer: 'L1',
        model,
        size,
        sourceImage: imageUrl,
        mask: mask || null,
        imageCount: urls.length,
        images: urls,
        timestamp: new Date().toISOString(),
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
 * Handle the "list_models" action -- return hardcoded list of known models.
 * No API call needed.
 */
function handleListModels() {
  const lines = [
    'Available Image Generation Models',
    '=================================',
    '',
  ];

  for (const model of KNOWN_MODELS) {
    lines.push(`${model.name} (${model.id})`);
    lines.push(`  Provider: ${model.provider}`);
    lines.push(`  Sizes: ${model.supportedSizes.join(', ')}`);
    lines.push(`  Actions: ${model.supportedActions.join(', ')}`);
    lines.push(`  Max Images: ${model.maxN}`);
    lines.push(`  Quality: ${model.supportsQuality ? 'Yes' : 'No'} | Style: ${model.supportsStyle ? 'Yes' : 'No'}`);
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

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute an image generation operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: generate, variations, edit, list_models
 * @param {string} [params.prompt] - Text prompt (required for generate/edit)
 * @param {string} [params.imageUrl] - Source image URL (required for variations/edit)
 * @param {string} [params.mask] - Mask image URL (optional for edit)
 * @param {string} [params.model="dall-e-3"] - Model identifier
 * @param {string} [params.size="1024x1024"] - Image size
 * @param {string} [params.quality="standard"] - Quality level
 * @param {string} [params.style="vivid"] - Style
 * @param {number} [params.n=1] - Number of images (max 4)
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
      case 'generate':
        return await handleGenerate(params, context);
      case 'variations':
        return await handleVariations(params, context);
      case 'edit':
        return await handleEdit(params, context);
      case 'list_models':
        return handleListModels();
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
  fetchWithTimeout,
  isValidUrl,
  validatePrompt,
  validateN,
  KNOWN_MODELS,
  VALID_SIZES,
  VALID_QUALITIES,
  VALID_STYLES,
  VALID_ACTIONS,
  MAX_PROMPT_LENGTH,
  MAX_N,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
