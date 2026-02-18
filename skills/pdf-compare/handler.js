/**
 * PDF Compare Skill Handler (Layer 1)
 * Compare two PDF documents and highlight differences.
 */

const VALID_ACTIONS = ['compare_pdfs', 'get_text_diff', 'get_visual_diff', 'get_metadata_diff'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for PDF Compare access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'compare_pdfs': {
      const v_file1 = validateNonEmptyString(params.file1, 'file1');
      if (!v_file1.valid) return { valid: false, error: v_file1.error };
      const v_file2 = validateNonEmptyString(params.file2, 'file2');
      if (!v_file2.valid) return { valid: false, error: v_file2.error };
      return { valid: true };
    }
    case 'get_text_diff': {
      const v_file1 = validateNonEmptyString(params.file1, 'file1');
      if (!v_file1.valid) return { valid: false, error: v_file1.error };
      const v_file2 = validateNonEmptyString(params.file2, 'file2');
      if (!v_file2.valid) return { valid: false, error: v_file2.error };
      return { valid: true };
    }
    case 'get_visual_diff': {
      const v_file1 = validateNonEmptyString(params.file1, 'file1');
      if (!v_file1.valid) return { valid: false, error: v_file1.error };
      const v_file2 = validateNonEmptyString(params.file2, 'file2');
      if (!v_file2.valid) return { valid: false, error: v_file2.error };
      return { valid: true };
    }
    case 'get_metadata_diff': {
      const v_file1 = validateNonEmptyString(params.file1, 'file1');
      if (!v_file1.valid) return { valid: false, error: v_file1.error };
      const v_file2 = validateNonEmptyString(params.file2, 'file2');
      if (!v_file2.valid) return { valid: false, error: v_file2.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleComparePdfs(params, context) {
  const v_file1 = validateNonEmptyString(params.file1, 'file1');
  if (!v_file1.valid) return { result: `Error: ${v_file1.error}`, metadata: { success: false, action: 'compare_pdfs', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_file2 = validateNonEmptyString(params.file2, 'file2');
  if (!v_file2.valid) return { result: `Error: ${v_file2.error}`, metadata: { success: false, action: 'compare_pdfs', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/compare', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'compare_pdfs', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'compare_pdfs', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetTextDiff(params, context) {
  const v_file1 = validateNonEmptyString(params.file1, 'file1');
  if (!v_file1.valid) return { result: `Error: ${v_file1.error}`, metadata: { success: false, action: 'get_text_diff', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_file2 = validateNonEmptyString(params.file2, 'file2');
  if (!v_file2.valid) return { result: `Error: ${v_file2.error}`, metadata: { success: false, action: 'get_text_diff', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/text-diff', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_text_diff', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_text_diff', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetVisualDiff(params, context) {
  const v_file1 = validateNonEmptyString(params.file1, 'file1');
  if (!v_file1.valid) return { result: `Error: ${v_file1.error}`, metadata: { success: false, action: 'get_visual_diff', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_file2 = validateNonEmptyString(params.file2, 'file2');
  if (!v_file2.valid) return { result: `Error: ${v_file2.error}`, metadata: { success: false, action: 'get_visual_diff', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/visual-diff', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_visual_diff', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_visual_diff', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetMetadataDiff(params, context) {
  const v_file1 = validateNonEmptyString(params.file1, 'file1');
  if (!v_file1.valid) return { result: `Error: ${v_file1.error}`, metadata: { success: false, action: 'get_metadata_diff', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_file2 = validateNonEmptyString(params.file2, 'file2');
  if (!v_file2.valid) return { result: `Error: ${v_file2.error}`, metadata: { success: false, action: 'get_metadata_diff', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/metadata-diff', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_metadata_diff', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_metadata_diff', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'compare_pdfs': return await handleComparePdfs(params, context);
      case 'get_text_diff': return await handleGetTextDiff(params, context);
      case 'get_visual_diff': return await handleGetVisualDiff(params, context);
      case 'get_metadata_diff': return await handleGetMetadataDiff(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'pdf-compare', version: '1.0.0', description: 'Compare two PDF documents and highlight differences.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
