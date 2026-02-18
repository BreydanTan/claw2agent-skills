/**
 * Color Palette Extractor Skill Handler (Layer 1)
 * Extract dominant colors and generate palettes from images.
 */

const VALID_ACTIONS = ['extract_palette', 'get_complementary', 'analyze_image', 'generate_palette'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

function providerNotConfiguredError() {
  return { result: 'Error: Provider client required for Color Palette Extractor access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } };
}

function resolveTimeout(context) {
  const c = context?.config?.timeoutMs;
  if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS);
  return DEFAULT_TIMEOUT_MS;
}

async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; }
  catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; }
}

const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  switch (action) {
    case 'extract_palette': {
      const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
      if (!v_imageUrl.valid) return { valid: false, error: v_imageUrl.error };
      return { valid: true };
    }
    case 'get_complementary': {
      const v_color = validateNonEmptyString(params.color, 'color');
      if (!v_color.valid) return { valid: false, error: v_color.error };
      return { valid: true };
    }
    case 'analyze_image': {
      const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
      if (!v_imageUrl.valid) return { valid: false, error: v_imageUrl.error };
      return { valid: true };
    }
    case 'generate_palette': {
      const v_baseColor = validateNonEmptyString(params.baseColor, 'baseColor');
      if (!v_baseColor.valid) return { valid: false, error: v_baseColor.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleExtractPalette(params, context) {
  const v_imageUrl = validateNonEmptyString(params.imageUrl, 'imageUrl');
  if (!v_imageUrl.valid) return { result: `Error: ${v_imageUrl.error}`, metadata: { success: false, action: 'extract_palette', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/extract', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'extract_palette', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'extract_palette', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetComplementary(params, context) {
  const v_color = validateNonEmptyString(params.color, 'color');
  if (!v_color.valid) return { result: `Error: ${v_color.error}`, metadata: { success: false, action: 'get_complementary', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/complementary', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_complementary', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_complementary', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
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

async function handleGeneratePalette(params, context) {
  const v_baseColor = validateNonEmptyString(params.baseColor, 'baseColor');
  if (!v_baseColor.valid) return { result: `Error: ${v_baseColor.error}`, metadata: { success: false, action: 'generate_palette', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/generate', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'generate_palette', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'generate_palette', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
  try {
    switch (action) {
      case 'extract_palette': return await handleExtractPalette(params, context);
      case 'get_complementary': return await handleGetComplementary(params, context);
      case 'analyze_image': return await handleAnalyzeImage(params, context);
      case 'generate_palette': return await handleGeneratePalette(params, context);
      default: return { result: `Error: Unknown action.`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'color-palette-extractor', version: '1.0.0', description: 'Extract dominant colors and generate palettes from images.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
