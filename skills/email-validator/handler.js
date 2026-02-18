/**
 * Email Validator Skill Handler (Layer 1)
 * Validate email addresses and check deliverability.
 */

const VALID_ACTIONS = ['validate_email', 'bulk_validate', 'check_domain', 'get_suggestions'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for Email Validator access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'validate_email': {
      const v_email = validateNonEmptyString(params.email, 'email');
      if (!v_email.valid) return { valid: false, error: v_email.error };
      return { valid: true };
    }
    case 'bulk_validate': {
      const v_emails = validateNonEmptyString(params.emails, 'emails');
      if (!v_emails.valid) return { valid: false, error: v_emails.error };
      return { valid: true };
    }
    case 'check_domain': {
      const v_domain = validateNonEmptyString(params.domain, 'domain');
      if (!v_domain.valid) return { valid: false, error: v_domain.error };
      return { valid: true };
    }
    case 'get_suggestions': {
      const v_email = validateNonEmptyString(params.email, 'email');
      if (!v_email.valid) return { valid: false, error: v_email.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleValidateEmail(params, context) {
  const v_email = validateNonEmptyString(params.email, 'email');
  if (!v_email.valid) return { result: `Error: ${v_email.error}`, metadata: { success: false, action: 'validate_email', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/validate', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'validate_email', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'validate_email', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleBulkValidate(params, context) {
  const v_emails = validateNonEmptyString(params.emails, 'emails');
  if (!v_emails.valid) return { result: `Error: ${v_emails.error}`, metadata: { success: false, action: 'bulk_validate', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/bulk', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'bulk_validate', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'bulk_validate', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleCheckDomain(params, context) {
  const v_domain = validateNonEmptyString(params.domain, 'domain');
  if (!v_domain.valid) return { result: `Error: ${v_domain.error}`, metadata: { success: false, action: 'check_domain', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/domain/${encodeURIComponent(v_domain.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'check_domain', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'check_domain', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetSuggestions(params, context) {
  const v_email = validateNonEmptyString(params.email, 'email');
  if (!v_email.valid) return { result: `Error: ${v_email.error}`, metadata: { success: false, action: 'get_suggestions', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/suggest', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_suggestions', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_suggestions', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'validate_email': return await handleValidateEmail(params, context);
      case 'bulk_validate': return await handleBulkValidate(params, context);
      case 'check_domain': return await handleCheckDomain(params, context);
      case 'get_suggestions': return await handleGetSuggestions(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'email-validator', version: '1.0.0', description: 'Validate email addresses and check deliverability.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
