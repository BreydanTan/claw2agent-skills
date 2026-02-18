/**
 * Quora/Zhihu Manager Skill Handler (Layer 1)
 * Manage Q&A content on Quora and Zhihu platforms.
 */

const VALID_ACTIONS = ['search_questions', 'get_answers', 'post_answer', 'get_trending'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for Quora/Zhihu Manager access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'search_questions': {
      const v_query = validateNonEmptyString(params.query, 'query');
      if (!v_query.valid) return { valid: false, error: v_query.error };
      return { valid: true };
    }
    case 'get_answers': {
      const v_questionId = validateNonEmptyString(params.questionId, 'questionId');
      if (!v_questionId.valid) return { valid: false, error: v_questionId.error };
      return { valid: true };
    }
    case 'post_answer': {
      const v_questionId = validateNonEmptyString(params.questionId, 'questionId');
      if (!v_questionId.valid) return { valid: false, error: v_questionId.error };
      const v_content = validateNonEmptyString(params.content, 'content');
      if (!v_content.valid) return { valid: false, error: v_content.error };
      return { valid: true };
    }
    case 'get_trending': return { valid: true };
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleSearchQuestions(params, context) {
  const v_query = validateNonEmptyString(params.query, 'query');
  if (!v_query.valid) return { result: `Error: ${v_query.error}`, metadata: { success: false, action: 'search_questions', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/questions/search?query=${encodeURIComponent(v_query.value)}&platform=${encodeURIComponent(String(params.platform ?? 'quora'))}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'search_questions', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'search_questions', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetAnswers(params, context) {
  const v_questionId = validateNonEmptyString(params.questionId, 'questionId');
  if (!v_questionId.valid) return { result: `Error: ${v_questionId.error}`, metadata: { success: false, action: 'get_answers', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/questions/${encodeURIComponent(v_questionId.value)}/answers`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_answers', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_answers', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handlePostAnswer(params, context) {
  const v_questionId = validateNonEmptyString(params.questionId, 'questionId');
  if (!v_questionId.valid) return { result: `Error: ${v_questionId.error}`, metadata: { success: false, action: 'post_answer', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_content = validateNonEmptyString(params.content, 'content');
  if (!v_content.valid) return { result: `Error: ${v_content.error}`, metadata: { success: false, action: 'post_answer', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', `/questions/${encodeURIComponent(v_questionId.value)}/answers`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'post_answer', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'post_answer', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetTrending(params, context) {

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/trending?platform=${encodeURIComponent(String(params.platform ?? 'quora'))}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_trending', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_trending', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'search_questions': return await handleSearchQuestions(params, context);
      case 'get_answers': return await handleGetAnswers(params, context);
      case 'post_answer': return await handlePostAnswer(params, context);
      case 'get_trending': return await handleGetTrending(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'quora-zhihu-manager', version: '1.0.0', description: 'Manage Q&A content on Quora and Zhihu platforms.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
