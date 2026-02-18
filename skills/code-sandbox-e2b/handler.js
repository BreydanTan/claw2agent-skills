/**
 * Code Sandbox (E2B) Skill Handler (Layer 1)
 * Run code in isolated sandboxes via E2B platform.
 */

const VALID_ACTIONS = ['create_sandbox', 'exec_code', 'upload_file', 'close_sandbox'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for Code Sandbox (E2B) access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'create_sandbox': return { valid: true };
    case 'exec_code': {
      const v_sandboxId = validateNonEmptyString(params.sandboxId, 'sandboxId');
      if (!v_sandboxId.valid) return { valid: false, error: v_sandboxId.error };
      const v_code = validateNonEmptyString(params.code, 'code');
      if (!v_code.valid) return { valid: false, error: v_code.error };
      return { valid: true };
    }
    case 'upload_file': {
      const v_sandboxId = validateNonEmptyString(params.sandboxId, 'sandboxId');
      if (!v_sandboxId.valid) return { valid: false, error: v_sandboxId.error };
      const v_path = validateNonEmptyString(params.path, 'path');
      if (!v_path.valid) return { valid: false, error: v_path.error };
      const v_content = validateNonEmptyString(params.content, 'content');
      if (!v_content.valid) return { valid: false, error: v_content.error };
      return { valid: true };
    }
    case 'close_sandbox': {
      const v_sandboxId = validateNonEmptyString(params.sandboxId, 'sandboxId');
      if (!v_sandboxId.valid) return { valid: false, error: v_sandboxId.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleCreateSandbox(params, context) {

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/sandboxes', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'create_sandbox', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'create_sandbox', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleExecCode(params, context) {
  const v_sandboxId = validateNonEmptyString(params.sandboxId, 'sandboxId');
  if (!v_sandboxId.valid) return { result: `Error: ${v_sandboxId.error}`, metadata: { success: false, action: 'exec_code', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_code = validateNonEmptyString(params.code, 'code');
  if (!v_code.valid) return { result: `Error: ${v_code.error}`, metadata: { success: false, action: 'exec_code', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', `/sandboxes/${encodeURIComponent(v_sandboxId.value)}/execute`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'exec_code', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'exec_code', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleUploadFile(params, context) {
  const v_sandboxId = validateNonEmptyString(params.sandboxId, 'sandboxId');
  if (!v_sandboxId.valid) return { result: `Error: ${v_sandboxId.error}`, metadata: { success: false, action: 'upload_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_path = validateNonEmptyString(params.path, 'path');
  if (!v_path.valid) return { result: `Error: ${v_path.error}`, metadata: { success: false, action: 'upload_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_content = validateNonEmptyString(params.content, 'content');
  if (!v_content.valid) return { result: `Error: ${v_content.error}`, metadata: { success: false, action: 'upload_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', `/sandboxes/${encodeURIComponent(v_sandboxId.value)}/files`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'upload_file', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'upload_file', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleCloseSandbox(params, context) {
  const v_sandboxId = validateNonEmptyString(params.sandboxId, 'sandboxId');
  if (!v_sandboxId.valid) return { result: `Error: ${v_sandboxId.error}`, metadata: { success: false, action: 'close_sandbox', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'DELETE', `/sandboxes/${encodeURIComponent(v_sandboxId.value)}`, {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'close_sandbox', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'close_sandbox', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'create_sandbox': return await handleCreateSandbox(params, context);
      case 'exec_code': return await handleExecCode(params, context);
      case 'upload_file': return await handleUploadFile(params, context);
      case 'close_sandbox': return await handleCloseSandbox(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'code-sandbox-e2b', version: '1.0.0', description: 'Run code in isolated sandboxes via E2B platform.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
