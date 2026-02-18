/**
 * Apple Health Parser Skill Handler (Layer 1)
 * Parse and analyze Apple Health export data.
 */

const VALID_ACTIONS = ['parse_export', 'get_summary', 'get_workouts', 'export_csv'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for Apple Health Parser access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'parse_export': {
      const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
      if (!v_filePath.valid) return { valid: false, error: v_filePath.error };
      return { valid: true };
    }
    case 'get_summary': {
      const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
      if (!v_filePath.valid) return { valid: false, error: v_filePath.error };
      return { valid: true };
    }
    case 'get_workouts': {
      const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
      if (!v_filePath.valid) return { valid: false, error: v_filePath.error };
      return { valid: true };
    }
    case 'export_csv': {
      const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
      if (!v_filePath.valid) return { valid: false, error: v_filePath.error };
      const v_metric = validateNonEmptyString(params.metric, 'metric');
      if (!v_metric.valid) return { valid: false, error: v_metric.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleParseExport(params, context) {
  const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
  if (!v_filePath.valid) return { result: `Error: ${v_filePath.error}`, metadata: { success: false, action: 'parse_export', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/parse', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'parse_export', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'parse_export', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetSummary(params, context) {
  const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
  if (!v_filePath.valid) return { result: `Error: ${v_filePath.error}`, metadata: { success: false, action: 'get_summary', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/summary', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_summary', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_summary', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetWorkouts(params, context) {
  const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
  if (!v_filePath.valid) return { result: `Error: ${v_filePath.error}`, metadata: { success: false, action: 'get_workouts', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/workouts', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_workouts', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_workouts', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleExportCsv(params, context) {
  const v_filePath = validateNonEmptyString(params.filePath, 'filePath');
  if (!v_filePath.valid) return { result: `Error: ${v_filePath.error}`, metadata: { success: false, action: 'export_csv', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_metric = validateNonEmptyString(params.metric, 'metric');
  if (!v_metric.valid) return { result: `Error: ${v_metric.error}`, metadata: { success: false, action: 'export_csv', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/export-csv', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'export_csv', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'export_csv', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'parse_export': return await handleParseExport(params, context);
      case 'get_summary': return await handleGetSummary(params, context);
      case 'get_workouts': return await handleGetWorkouts(params, context);
      case 'export_csv': return await handleExportCsv(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'apple-health-parser', version: '1.0.0', description: 'Parse and analyze Apple Health export data.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
