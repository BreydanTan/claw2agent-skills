/**
 * i18n Tool Skill Handler (Layer 1)
 * Manage internationalization keys, translations, and locale files.
 */

const VALID_ACTIONS = ['extract_keys', 'translate_keys', 'validate_locale', 'merge_locales'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for i18n Tool access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'extract_keys': {
      const v_code = validateNonEmptyString(params.code, 'code');
      if (!v_code.valid) return { valid: false, error: v_code.error };
      return { valid: true };
    }
    case 'translate_keys': {
      const v_keys = validateNonEmptyString(params.keys, 'keys');
      if (!v_keys.valid) return { valid: false, error: v_keys.error };
      const v_targetLang = validateNonEmptyString(params.targetLang, 'targetLang');
      if (!v_targetLang.valid) return { valid: false, error: v_targetLang.error };
      return { valid: true };
    }
    case 'validate_locale': {
      const v_locale = validateNonEmptyString(params.locale, 'locale');
      if (!v_locale.valid) return { valid: false, error: v_locale.error };
      const v_reference = validateNonEmptyString(params.reference, 'reference');
      if (!v_reference.valid) return { valid: false, error: v_reference.error };
      return { valid: true };
    }
    case 'merge_locales': {
      const v_base = validateNonEmptyString(params.base, 'base');
      if (!v_base.valid) return { valid: false, error: v_base.error };
      const v_override = validateNonEmptyString(params.override, 'override');
      if (!v_override.valid) return { valid: false, error: v_override.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleExtractKeys(params, context) {
  const v_code = validateNonEmptyString(params.code, 'code');
  if (!v_code.valid) return { result: `Error: ${v_code.error}`, metadata: { success: false, action: 'extract_keys', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/extract', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'extract_keys', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'extract_keys', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleTranslateKeys(params, context) {
  const v_keys = validateNonEmptyString(params.keys, 'keys');
  if (!v_keys.valid) return { result: `Error: ${v_keys.error}`, metadata: { success: false, action: 'translate_keys', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_targetLang = validateNonEmptyString(params.targetLang, 'targetLang');
  if (!v_targetLang.valid) return { result: `Error: ${v_targetLang.error}`, metadata: { success: false, action: 'translate_keys', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/translate', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'translate_keys', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'translate_keys', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleValidateLocale(params, context) {
  const v_locale = validateNonEmptyString(params.locale, 'locale');
  if (!v_locale.valid) return { result: `Error: ${v_locale.error}`, metadata: { success: false, action: 'validate_locale', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_reference = validateNonEmptyString(params.reference, 'reference');
  if (!v_reference.valid) return { result: `Error: ${v_reference.error}`, metadata: { success: false, action: 'validate_locale', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/validate', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'validate_locale', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'validate_locale', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleMergeLocales(params, context) {
  const v_base = validateNonEmptyString(params.base, 'base');
  if (!v_base.valid) return { result: `Error: ${v_base.error}`, metadata: { success: false, action: 'merge_locales', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_override = validateNonEmptyString(params.override, 'override');
  if (!v_override.valid) return { result: `Error: ${v_override.error}`, metadata: { success: false, action: 'merge_locales', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/merge', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'merge_locales', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'merge_locales', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'extract_keys': return await handleExtractKeys(params, context);
      case 'translate_keys': return await handleTranslateKeys(params, context);
      case 'validate_locale': return await handleValidateLocale(params, context);
      case 'merge_locales': return await handleMergeLocales(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'i18n-tool', version: '1.0.0', description: 'Manage internationalization keys, translations, and locale files.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
