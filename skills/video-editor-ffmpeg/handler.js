/**
 * Video Editor (FFmpeg) Skill Handler (Layer 1)
 * Process and transform video/audio files using FFmpeg commands.
 */

const VALID_ACTIONS = ['get_info', 'convert', 'extract_audio', 'thumbnail'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

function providerNotConfiguredError() {
  return { result: 'Error: Provider client required for Video Editor (FFmpeg) access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } };
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
    case 'get_info': {
      const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
      if (!v_filePath.valid) return { valid: false, error: v_filePath.error };
      return { valid: true };
    }
    case 'convert': {
      const v_input = validateNonEmptyString(params.input, 'input');
      if (!v_input.valid) return { valid: false, error: v_input.error };
      const v_output = validateNonEmptyString(params.output, 'output');
      if (!v_output.valid) return { valid: false, error: v_output.error };
      return { valid: true };
    }
    case 'extract_audio': {
      const v_input = validateNonEmptyString(params.input, 'input');
      if (!v_input.valid) return { valid: false, error: v_input.error };
      const v_output = validateNonEmptyString(params.output, 'output');
      if (!v_output.valid) return { valid: false, error: v_output.error };
      return { valid: true };
    }
    case 'thumbnail': {
      const v_input = validateNonEmptyString(params.input, 'input');
      if (!v_input.valid) return { valid: false, error: v_input.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleGetInfo(params, context) {
  const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
  if (!v_filePath.valid) return { result: `Error: ${v_filePath.error}`, metadata: { success: false, action: 'get_info', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/probe?file=${encodeURIComponent(v_filePath.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_info', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_info', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleConvert(params, context) {
  const v_input = validateNonEmptyString(params.input, 'input');
  if (!v_input.valid) return { result: `Error: ${v_input.error}`, metadata: { success: false, action: 'convert', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_output = validateNonEmptyString(params.output, 'output');
  if (!v_output.valid) return { result: `Error: ${v_output.error}`, metadata: { success: false, action: 'convert', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/convert', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'convert', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'convert', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleExtractAudio(params, context) {
  const v_input = validateNonEmptyString(params.input, 'input');
  if (!v_input.valid) return { result: `Error: ${v_input.error}`, metadata: { success: false, action: 'extract_audio', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_output = validateNonEmptyString(params.output, 'output');
  if (!v_output.valid) return { result: `Error: ${v_output.error}`, metadata: { success: false, action: 'extract_audio', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/extract-audio', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'extract_audio', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'extract_audio', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleThumbnail(params, context) {
  const v_input = validateNonEmptyString(params.input, 'input');
  if (!v_input.valid) return { result: `Error: ${v_input.error}`, metadata: { success: false, action: 'thumbnail', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/thumbnail', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'thumbnail', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'thumbnail', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
  try {
    switch (action) {
      case 'get_info': return await handleGetInfo(params, context);
      case 'convert': return await handleConvert(params, context);
      case 'extract_audio': return await handleExtractAudio(params, context);
      case 'thumbnail': return await handleThumbnail(params, context);
      default: return { result: `Error: Unknown action.`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'video-editor-ffmpeg', version: '1.0.0', description: 'Process and transform video/audio files using FFmpeg commands.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
