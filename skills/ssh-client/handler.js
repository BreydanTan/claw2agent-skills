/**
 * SSH Client Skill Handler (Layer 1)
 * Execute remote commands and manage files via SSH.
 */

const VALID_ACTIONS = ['exec_command', 'upload_file', 'download_file', 'list_dir'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for SSH Client access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'exec_command': {
      const v_host = validateNonEmptyString(params.host, 'host');
      if (!v_host.valid) return { valid: false, error: v_host.error };
      const v_command = validateNonEmptyString(params.command, 'command');
      if (!v_command.valid) return { valid: false, error: v_command.error };
      return { valid: true };
    }
    case 'upload_file': {
      const v_host = validateNonEmptyString(params.host, 'host');
      if (!v_host.valid) return { valid: false, error: v_host.error };
      const v_localPath = validateNonEmptyString(params.localPath, 'localPath');
      if (!v_localPath.valid) return { valid: false, error: v_localPath.error };
      const v_remotePath = validateNonEmptyString(params.remotePath, 'remotePath');
      if (!v_remotePath.valid) return { valid: false, error: v_remotePath.error };
      return { valid: true };
    }
    case 'download_file': {
      const v_host = validateNonEmptyString(params.host, 'host');
      if (!v_host.valid) return { valid: false, error: v_host.error };
      const v_remotePath = validateNonEmptyString(params.remotePath, 'remotePath');
      if (!v_remotePath.valid) return { valid: false, error: v_remotePath.error };
      const v_localPath = validateNonEmptyString(params.localPath, 'localPath');
      if (!v_localPath.valid) return { valid: false, error: v_localPath.error };
      return { valid: true };
    }
    case 'list_dir': {
      const v_host = validateNonEmptyString(params.host, 'host');
      if (!v_host.valid) return { valid: false, error: v_host.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleExecCommand(params, context) {
  const v_host = validateNonEmptyString(params.host, 'host');
  if (!v_host.valid) return { result: `Error: ${v_host.error}`, metadata: { success: false, action: 'exec_command', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_command = validateNonEmptyString(params.command, 'command');
  if (!v_command.valid) return { result: `Error: ${v_command.error}`, metadata: { success: false, action: 'exec_command', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/exec', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'exec_command', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'exec_command', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleUploadFile(params, context) {
  const v_host = validateNonEmptyString(params.host, 'host');
  if (!v_host.valid) return { result: `Error: ${v_host.error}`, metadata: { success: false, action: 'upload_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_localPath = validateNonEmptyString(params.localPath, 'localPath');
  if (!v_localPath.valid) return { result: `Error: ${v_localPath.error}`, metadata: { success: false, action: 'upload_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_remotePath = validateNonEmptyString(params.remotePath, 'remotePath');
  if (!v_remotePath.valid) return { result: `Error: ${v_remotePath.error}`, metadata: { success: false, action: 'upload_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/upload', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'upload_file', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'upload_file', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleDownloadFile(params, context) {
  const v_host = validateNonEmptyString(params.host, 'host');
  if (!v_host.valid) return { result: `Error: ${v_host.error}`, metadata: { success: false, action: 'download_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_remotePath = validateNonEmptyString(params.remotePath, 'remotePath');
  if (!v_remotePath.valid) return { result: `Error: ${v_remotePath.error}`, metadata: { success: false, action: 'download_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_localPath = validateNonEmptyString(params.localPath, 'localPath');
  if (!v_localPath.valid) return { result: `Error: ${v_localPath.error}`, metadata: { success: false, action: 'download_file', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/download', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'download_file', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'download_file', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleListDir(params, context) {
  const v_host = validateNonEmptyString(params.host, 'host');
  if (!v_host.valid) return { result: `Error: ${v_host.error}`, metadata: { success: false, action: 'list_dir', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/ls', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'list_dir', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'list_dir', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'exec_command': return await handleExecCommand(params, context);
      case 'upload_file': return await handleUploadFile(params, context);
      case 'download_file': return await handleDownloadFile(params, context);
      case 'list_dir': return await handleListDir(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'ssh-client', version: '1.0.0', description: 'Execute remote commands and manage files via SSH.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
