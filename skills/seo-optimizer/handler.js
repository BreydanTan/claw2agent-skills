/**
 * SEO Optimizer Skill Handler (Layer 1)
 * Analyze and optimize web pages for search engine rankings.
 */

const VALID_ACTIONS = ['analyze_page', 'check_keywords', 'get_backlinks', 'check_speed'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for SEO Optimizer access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'analyze_page': {
      const v_url = validateNonEmptyString(params.url, 'url');
      if (!v_url.valid) return { valid: false, error: v_url.error };
      return { valid: true };
    }
    case 'check_keywords': {
      const v_url = validateNonEmptyString(params.url, 'url');
      if (!v_url.valid) return { valid: false, error: v_url.error };
      const v_keywords = validateNonEmptyString(params.keywords, 'keywords');
      if (!v_keywords.valid) return { valid: false, error: v_keywords.error };
      return { valid: true };
    }
    case 'get_backlinks': {
      const v_url = validateNonEmptyString(params.url, 'url');
      if (!v_url.valid) return { valid: false, error: v_url.error };
      return { valid: true };
    }
    case 'check_speed': {
      const v_url = validateNonEmptyString(params.url, 'url');
      if (!v_url.valid) return { valid: false, error: v_url.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleAnalyzePage(params, context) {
  const v_url = validateNonEmptyString(params.url, 'url');
  if (!v_url.valid) return { result: `Error: ${v_url.error}`, metadata: { success: false, action: 'analyze_page', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/analyze', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'analyze_page', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'analyze_page', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleCheckKeywords(params, context) {
  const v_url = validateNonEmptyString(params.url, 'url');
  if (!v_url.valid) return { result: `Error: ${v_url.error}`, metadata: { success: false, action: 'check_keywords', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_keywords = validateNonEmptyString(params.keywords, 'keywords');
  if (!v_keywords.valid) return { result: `Error: ${v_keywords.error}`, metadata: { success: false, action: 'check_keywords', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/keywords', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'check_keywords', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'check_keywords', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetBacklinks(params, context) {
  const v_url = validateNonEmptyString(params.url, 'url');
  if (!v_url.valid) return { result: `Error: ${v_url.error}`, metadata: { success: false, action: 'get_backlinks', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/backlinks?url=${encodeURIComponent(v_url.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_backlinks', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_backlinks', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleCheckSpeed(params, context) {
  const v_url = validateNonEmptyString(params.url, 'url');
  if (!v_url.valid) return { result: `Error: ${v_url.error}`, metadata: { success: false, action: 'check_speed', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/speed', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'check_speed', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'check_speed', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'analyze_page': return await handleAnalyzePage(params, context);
      case 'check_keywords': return await handleCheckKeywords(params, context);
      case 'get_backlinks': return await handleGetBacklinks(params, context);
      case 'check_speed': return await handleCheckSpeed(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'seo-optimizer', version: '1.0.0', description: 'Analyze and optimize web pages for search engine rankings.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
