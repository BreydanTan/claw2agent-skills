/**
 * Image Upscaler Skill Handler (Layer 1)
 *
 * AI-powered image upscaling and enhancement via provider client.
 * Supports upscaling, enhancement (denoise + sharpen), image info,
 * model listing, and job status checking.
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
  'upscale',
  'enhance',
  'get_info',
  'list_models',
  'check_status',
];

const VALID_FORMATS = ['png', 'jpeg', 'webp'];

const DEFAULT_SCALE = 2;
const DEFAULT_FORMAT = 'png';
const DEFAULT_DENOISE_LEVEL = 1;
const DEFAULT_SHARPEN = true;

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

const AVAILABLE_MODELS = [
  { name: 'real-esrgan-x4', description: 'Real-ESRGAN 4x general purpose upscaler for photos and illustrations' },
  { name: 'real-esrgan-x2', description: 'Real-ESRGAN 2x balanced upscaler for everyday images' },
  { name: 'swinir-large', description: 'SwinIR large model for high-fidelity image restoration' },
  { name: 'edsr-baseline', description: 'EDSR baseline model for fast single-image super-resolution' },
  { name: 'waifu2x-cunet', description: 'Waifu2x CUNet model optimized for anime and illustration upscaling' },
];

const MAX_JOB_ID_LENGTH = 100;

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
    result: 'Error: Provider client required for image upscaling API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for image upscaling API access. Configure an API key or platform adapter.',
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
 * Validate an image parameter (non-empty string, file path or URL).
 *
 * @param {*} image
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateImage(image) {
  if (!image || typeof image !== 'string') {
    return { valid: false, error: 'The "image" parameter is required and must be a non-empty string.' };
  }
  const trimmed = image.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "image" parameter must not be empty.' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate a scale parameter (integer 2-4).
 *
 * @param {*} scale
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateScale(scale) {
  if (scale === undefined || scale === null) {
    return { valid: true, value: DEFAULT_SCALE };
  }
  if (typeof scale !== 'number' || !Number.isInteger(scale)) {
    return { valid: false, error: 'The "scale" parameter must be an integer (2, 3, or 4).' };
  }
  if (scale < 2 || scale > 4) {
    return { valid: false, error: `The "scale" parameter must be between 2 and 4. Received: ${scale}` };
  }
  return { valid: true, value: scale };
}

/**
 * Validate a format parameter (png, jpeg, or webp).
 *
 * @param {*} format
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateFormat(format) {
  if (format === undefined || format === null) {
    return { valid: true, value: DEFAULT_FORMAT };
  }
  if (typeof format !== 'string') {
    return { valid: false, error: 'The "format" parameter must be a string (png, jpeg, or webp).' };
  }
  const trimmed = format.trim().toLowerCase();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "format" parameter must not be empty.' };
  }
  if (!VALID_FORMATS.includes(trimmed)) {
    return { valid: false, error: `Invalid format "${format}". Must be one of: ${VALID_FORMATS.join(', ')}` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate a denoise_level parameter (integer 0-3).
 *
 * @param {*} denoiseLevel
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateDenoiseLevel(denoiseLevel) {
  if (denoiseLevel === undefined || denoiseLevel === null) {
    return { valid: true, value: DEFAULT_DENOISE_LEVEL };
  }
  if (typeof denoiseLevel !== 'number' || !Number.isInteger(denoiseLevel)) {
    return { valid: false, error: 'The "denoise_level" parameter must be an integer (0-3).' };
  }
  if (denoiseLevel < 0 || denoiseLevel > 3) {
    return { valid: false, error: `The "denoise_level" parameter must be between 0 and 3. Received: ${denoiseLevel}` };
  }
  return { valid: true, value: denoiseLevel };
}

/**
 * Validate a sharpen parameter (boolean).
 *
 * @param {*} sharpen
 * @returns {{ valid: boolean, value?: boolean, error?: string }}
 */
function validateSharpen(sharpen) {
  if (sharpen === undefined || sharpen === null) {
    return { valid: true, value: DEFAULT_SHARPEN };
  }
  if (typeof sharpen !== 'boolean') {
    return { valid: false, error: 'The "sharpen" parameter must be a boolean.' };
  }
  return { valid: true, value: sharpen };
}

/**
 * Validate a jobId parameter (non-empty string, max 100 chars).
 *
 * @param {*} jobId
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateJobId(jobId) {
  if (!jobId || typeof jobId !== 'string') {
    return { valid: false, error: 'The "jobId" parameter is required and must be a non-empty string.' };
  }
  const trimmed = jobId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'The "jobId" parameter must not be empty.' };
  }
  if (trimmed.length > MAX_JOB_ID_LENGTH) {
    return { valid: false, error: `The "jobId" parameter must be at most ${MAX_JOB_ID_LENGTH} characters.` };
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
    case 'upscale': {
      const imageVal = validateImage(params.image);
      if (!imageVal.valid) return { valid: false, error: imageVal.error };
      if (params.scale !== undefined && params.scale !== null) {
        const scaleVal = validateScale(params.scale);
        if (!scaleVal.valid) return { valid: false, error: scaleVal.error };
      }
      if (params.format !== undefined && params.format !== null) {
        const formatVal = validateFormat(params.format);
        if (!formatVal.valid) return { valid: false, error: formatVal.error };
      }
      return { valid: true };
    }
    case 'enhance': {
      const imageVal = validateImage(params.image);
      if (!imageVal.valid) return { valid: false, error: imageVal.error };
      if (params.denoise_level !== undefined && params.denoise_level !== null) {
        const denoiseVal = validateDenoiseLevel(params.denoise_level);
        if (!denoiseVal.valid) return { valid: false, error: denoiseVal.error };
      }
      if (params.sharpen !== undefined && params.sharpen !== null) {
        const sharpenVal = validateSharpen(params.sharpen);
        if (!sharpenVal.valid) return { valid: false, error: sharpenVal.error };
      }
      return { valid: true };
    }
    case 'get_info': {
      const imageVal = validateImage(params.image);
      if (!imageVal.valid) return { valid: false, error: imageVal.error };
      return { valid: true };
    }
    case 'list_models': {
      return { valid: true };
    }
    case 'check_status': {
      const jobIdVal = validateJobId(params.jobId);
      if (!jobIdVal.valid) return { valid: false, error: jobIdVal.error };
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
 * Handle upscale -- POST /images/upscale body: { image, scale, format }
 */
async function handleUpscale(params, context) {
  const imageVal = validateImage(params.image);
  if (!imageVal.valid) {
    return {
      result: `Error: ${imageVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const scaleVal = validateScale(params.scale);
  if (!scaleVal.valid) {
    return {
      result: `Error: ${scaleVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const formatVal = validateFormat(params.format);
  if (!formatVal.valid) {
    return {
      result: `Error: ${formatVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const image = imageVal.value;
  const scale = scaleVal.value;
  const format = formatVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/images/upscale',
      { body: { image, scale, format } },
      timeoutMs
    );

    const outputUrl = data?.outputUrl || data?.url || '';
    const width = data?.width || 0;
    const height = data?.height || 0;
    const jobId = data?.jobId || null;
    const lines = [
      'Image Upscale Result',
      `Source: ${image}`,
      `Scale: ${scale}x`,
      `Format: ${format}`,
      width && height ? `Output dimensions: ${width}x${height}` : null,
      outputUrl ? `Output URL: ${outputUrl}` : null,
      jobId ? `Job ID: ${jobId}` : null,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'upscale',
        layer: 'L1',
        image,
        scale,
        format,
        outputUrl,
        width,
        height,
        jobId,
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
 * Handle enhance -- POST /images/enhance body: { image, denoise_level, sharpen }
 */
async function handleEnhance(params, context) {
  const imageVal = validateImage(params.image);
  if (!imageVal.valid) {
    return {
      result: `Error: ${imageVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const denoiseVal = validateDenoiseLevel(params.denoise_level);
  if (!denoiseVal.valid) {
    return {
      result: `Error: ${denoiseVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const sharpenVal = validateSharpen(params.sharpen);
  if (!sharpenVal.valid) {
    return {
      result: `Error: ${sharpenVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const image = imageVal.value;
  const denoise_level = denoiseVal.value;
  const sharpen = sharpenVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/images/enhance',
      { body: { image, denoise_level, sharpen } },
      timeoutMs
    );

    const outputUrl = data?.outputUrl || data?.url || '';
    const quality = data?.quality || null;
    const jobId = data?.jobId || null;
    const lines = [
      'Image Enhancement Result',
      `Source: ${image}`,
      `Denoise level: ${denoise_level}`,
      `Sharpen: ${sharpen}`,
      quality !== null ? `Quality score: ${quality}` : null,
      outputUrl ? `Output URL: ${outputUrl}` : null,
      jobId ? `Job ID: ${jobId}` : null,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'enhance',
        layer: 'L1',
        image,
        denoise_level,
        sharpen,
        outputUrl,
        quality,
        jobId,
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
 * Handle get_info -- POST /images/info body: { image }
 */
async function handleGetInfo(params, context) {
  const imageVal = validateImage(params.image);
  if (!imageVal.valid) {
    return {
      result: `Error: ${imageVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const image = imageVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/images/info',
      { body: { image } },
      timeoutMs
    );

    const info = data?.info || data || {};
    const width = info.width || 0;
    const height = info.height || 0;
    const format = info.format || 'unknown';
    const fileSize = info.fileSize || info.size || null;
    const colorSpace = info.colorSpace || null;
    const lines = [
      'Image Info',
      `File: ${image}`,
      width && height ? `Dimensions: ${width}x${height}` : null,
      `Format: ${format}`,
      fileSize ? `File size: ${fileSize}` : null,
      colorSpace ? `Color space: ${colorSpace}` : null,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_info',
        layer: 'L1',
        image,
        imageInfo: info,
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
 * Handle list_models -- returns local data, no API call.
 */
function handleListModels() {
  const lines = [
    `Available Upscaling Models (${AVAILABLE_MODELS.length})`,
    '',
    ...AVAILABLE_MODELS.map((m, i) => `${i + 1}. ${m.name} - ${m.description}`),
  ];

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'list_models',
      layer: 'L1',
      modelCount: AVAILABLE_MODELS.length,
      models: AVAILABLE_MODELS.map((m) => ({ ...m })),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Handle check_status -- GET /images/status/:jobId
 */
async function handleCheckStatus(params, context) {
  const jobIdVal = validateJobId(params.jobId);
  if (!jobIdVal.valid) {
    return {
      result: `Error: ${jobIdVal.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const jobId = jobIdVal.value;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/images/status/${jobId}`,
      {},
      timeoutMs
    );

    const status = data?.status || 'unknown';
    const progress = data?.progress !== undefined ? data.progress : null;
    const outputUrl = data?.outputUrl || data?.url || null;
    const lines = [
      'Job Status',
      `Job ID: ${jobId}`,
      `Status: ${status}`,
      progress !== null ? `Progress: ${progress}%` : null,
      outputUrl ? `Output URL: ${outputUrl}` : null,
    ].filter((l) => l !== null);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'check_status',
        layer: 'L1',
        jobId,
        status,
        progress,
        outputUrl,
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
 * Execute an image upscaling operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: upscale, enhance, get_info, list_models, check_status
 * @param {string} [params.image] - Image file path or URL (required for upscale, enhance, get_info)
 * @param {number} [params.scale] - Upscale factor 2-4 (optional, default 2)
 * @param {string} [params.format] - Output format: png, jpeg, webp (optional, default png)
 * @param {number} [params.denoise_level] - Denoise level 0-3 (optional, default 1)
 * @param {boolean} [params.sharpen] - Enable sharpening (optional, default true)
 * @param {string} [params.jobId] - Job ID for status check (required for check_status)
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
      case 'upscale':
        return await handleUpscale(params, context);
      case 'enhance':
        return await handleEnhance(params, context);
      case 'get_info':
        return await handleGetInfo(params, context);
      case 'list_models':
        return handleListModels();
      case 'check_status':
        return await handleCheckStatus(params, context);
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
  name: 'image-upscaler',
  version: '1.0.0',
  description: 'AI-powered image upscaling and enhancement skill. Upscale, enhance, inspect images, list models, and check job status via provider client.',
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
  validateImage,
  validateScale,
  validateFormat,
  validateDenoiseLevel,
  validateSharpen,
  validateJobId,
  VALID_ACTIONS,
  VALID_FORMATS,
  AVAILABLE_MODELS,
  DEFAULT_SCALE,
  DEFAULT_FORMAT,
  DEFAULT_DENOISE_LEVEL,
  DEFAULT_SHARPEN,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_JOB_ID_LENGTH,
};
