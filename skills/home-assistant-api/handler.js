/**
 * Home Assistant API Skill Handler (Layer 1)
 * Control smart home devices and automations via Home Assistant API.
 */

const VALID_ACTIONS = ['get_states', 'get_entity', 'call_service', 'get_history'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

function providerNotConfiguredError() {
  return { result: 'Error: Provider client required for Home Assistant API access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } };
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
    case 'get_states': return { valid: true };
    case 'get_entity': {
      const v_entityId = validateNonEmptyString(params.entityId, 'entityId');
      if (!v_entityId.valid) return { valid: false, error: v_entityId.error };
      return { valid: true };
    }
    case 'call_service': {
      const v_domain = validateNonEmptyString(params.domain, 'domain');
      if (!v_domain.valid) return { valid: false, error: v_domain.error };
      const v_service = validateNonEmptyString(params.service, 'service');
      if (!v_service.valid) return { valid: false, error: v_service.error };
      return { valid: true };
    }
    case 'get_history': {
      const v_entityId = validateNonEmptyString(params.entityId, 'entityId');
      if (!v_entityId.valid) return { valid: false, error: v_entityId.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleGetStates(params, context) {

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', '/api/states', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_states', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_states', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetEntity(params, context) {
  const v_entityId = validateNonEmptyString(params.entityId, 'entityId');
  if (!v_entityId.valid) return { result: `Error: ${v_entityId.error}`, metadata: { success: false, action: 'get_entity', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/api/states/${encodeURIComponent(v_entityId.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_entity', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_entity', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleCallService(params, context) {
  const v_domain = validateNonEmptyString(params.domain, 'domain');
  if (!v_domain.valid) return { result: `Error: ${v_domain.error}`, metadata: { success: false, action: 'call_service', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_service = validateNonEmptyString(params.service, 'service');
  if (!v_service.valid) return { result: `Error: ${v_service.error}`, metadata: { success: false, action: 'call_service', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', `/api/services/${encodeURIComponent(v_domain.value)}/${encodeURIComponent(v_service.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'call_service', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'call_service', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleGetHistory(params, context) {
  const v_entityId = validateNonEmptyString(params.entityId, 'entityId');
  if (!v_entityId.valid) return { result: `Error: ${v_entityId.error}`, metadata: { success: false, action: 'get_history', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'GET', `/api/history/period?filter_entity_id=${encodeURIComponent(v_entityId.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'get_history', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'get_history', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
  try {
    switch (action) {
      case 'get_states': return await handleGetStates(params, context);
      case 'get_entity': return await handleGetEntity(params, context);
      case 'call_service': return await handleCallService(params, context);
      case 'get_history': return await handleGetHistory(params, context);
      default: return { result: `Error: Unknown action.`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'home-assistant-api', version: '1.0.0', description: 'Control smart home devices and automations via Home Assistant API.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
