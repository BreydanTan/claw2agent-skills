/**
 * Vision Model API Skill Handler (Layer 1)
 * Analyze images using vision AI models.
 */

const VALID_ACTIONS = ['analyze_image', 'detect_objects', 'extract_text', 'compare_images'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for Vision Model API access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'analyze_image': {
      const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
      if (!v_imageUrl.valid) return { valid: false, error: v_imageUrl.error };
      return { valid: true };
    }
    case 'detect_objects': {
      const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
      if (!v_imageUrl.valid) return { valid: false, error: v_imageUrl.error };
      return { valid: true };
    }
    case 'extract_text': {
      const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
      if (!v_imageUrl.valid) return { valid: false, error: v_imageUrl.error };
      return { valid: true };
    }
    case 'compare_images': {
      const v_imageUrl1 = validateNonEmptyString(params.imageUrl1, 'imageUrl1');
      if (!v_imageUrl1.valid) return { valid: false, error: v_imageUrl1.error };
      const v_imageUrl2 = validateNonEmptyString(params.imageUrl2, 'imageUrl2');
      if (!v_imageUrl2.valid) return { valid: false, error: v_imageUrl2.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleAnalyzeImage(params, context) {
  const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
  if (!v_imageUrl.valid) return { result: `Error: ${v_imageUrl.error}`, metadata: { success: false, action: 'analyze_image', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/analyze', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'analyze_image', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'analyze_image', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleDetectObjects(params, context) {
  const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
  if (!v_imageUrl.valid) return { result: `Error: ${v_imageUrl.error}`, metadata: { success: false, action: 'detect_objects', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/detect', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'detect_objects', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'detect_objects', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleExtractText(params, context) {
  const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
  if (!v_imageUrl.valid) return { result: `Error: ${v_imageUrl.error}`, metadata: { success: false, action: 'extract_text', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/ocr', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'extract_text', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'extract_text', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleCompareImages(params, context) {
  const v_imageUrl1 = validateNonEmptyString(params.imageUrl1, 'imageUrl1');
  if (!v_imageUrl1.valid) return { result: `Error: ${v_imageUrl1.error}`, metadata: { success: false, action: 'compare_images', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_imageUrl2 = validateNonEmptyString(params.imageUrl2, 'imageUrl2');
  if (!v_imageUrl2.valid) return { result: `Error: ${v_imageUrl2.error}`, metadata: { success: false, action: 'compare_images', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/compare', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'compare_images', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'compare_images', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'analyze_image': return await handleAnalyzeImage(params, context);
      case 'detect_objects': return await handleDetectObjects(params, context);
      case 'extract_text': return await handleExtractText(params, context);
      case 'compare_images': return await handleCompareImages(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'vision-model', version: '1.0.0', description: 'Analyze images using vision AI models.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
