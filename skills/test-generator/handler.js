/**
 * Test Generator Skill Handler (Layer 1)
 * Automatically generate unit and integration tests for code.
 */

const VALID_ACTIONS = ['generate_tests', 'analyze_coverage', 'suggest_cases', 'validate_tests'];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
function getClient(context) { if (context?.providerClient) return { client: context.providerClient, type: 'provider' }; if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' }; return null; }
function providerNotConfiguredError() { return { result: 'Error: Provider client required for Test Generator access.', metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } } }; }
function resolveTimeout(context) { const c = context?.config?.timeoutMs; if (typeof c === 'number' && c > 0) return Math.min(c, MAX_TIMEOUT_MS); return DEFAULT_TIMEOUT_MS; }
async function requestWithTimeout(client, method, path, opts, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await client.request(method, path, null, { ...opts, signal: controller.signal }); clearTimeout(timer); return r; } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` }; throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' }; } }
const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];
function redactSensitive(text) { if (typeof text !== 'string') return text; let c = text; for (const p of SENSITIVE_PATTERNS) c = c.replace(p, '[REDACTED]'); return c; }
function validateNonEmptyString(value, fieldName) { if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` }; const t = value.trim(); if (!t.length) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` }; return { valid: true, value: t }; }

export function validate(params) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` }; switch (action) {
    case 'generate_tests': {
      const v_code = validateNonEmptyString(params.code, 'code');
      if (!v_code.valid) return { valid: false, error: v_code.error };
      return { valid: true };
    }
    case 'analyze_coverage': {
      const v_code = validateNonEmptyString(params.code, 'code');
      if (!v_code.valid) return { valid: false, error: v_code.error };
      const v_tests = validateNonEmptyString(params.tests, 'tests');
      if (!v_tests.valid) return { valid: false, error: v_tests.error };
      return { valid: true };
    }
    case 'suggest_cases': {
      const v_code = validateNonEmptyString(params.code, 'code');
      if (!v_code.valid) return { valid: false, error: v_code.error };
      return { valid: true };
    }
    case 'validate_tests': {
      const v_tests = validateNonEmptyString(params.tests, 'tests');
      if (!v_tests.valid) return { valid: false, error: v_tests.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown.` };
  }
}

async function handleGenerateTests(params, context) {
  const v_code = validateNonEmptyString(params.code, 'code');
  if (!v_code.valid) return { result: `Error: ${v_code.error}`, metadata: { success: false, action: 'generate_tests', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/generate', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'generate_tests', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'generate_tests', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleAnalyzeCoverage(params, context) {
  const v_code = validateNonEmptyString(params.code, 'code');
  if (!v_code.valid) return { result: `Error: ${v_code.error}`, metadata: { success: false, action: 'analyze_coverage', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const v_tests = validateNonEmptyString(params.tests, 'tests');
  if (!v_tests.valid) return { result: `Error: ${v_tests.error}`, metadata: { success: false, action: 'analyze_coverage', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/coverage', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'analyze_coverage', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'analyze_coverage', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleSuggestCases(params, context) {
  const v_code = validateNonEmptyString(params.code, 'code');
  if (!v_code.valid) return { result: `Error: ${v_code.error}`, metadata: { success: false, action: 'suggest_cases', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/suggest', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'suggest_cases', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'suggest_cases', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

async function handleValidateTests(params, context) {
  const v_tests = validateNonEmptyString(params.tests, 'tests');
  if (!v_tests.valid) return { result: `Error: ${v_tests.error}`, metadata: { success: false, action: 'validate_tests', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();
  const timeoutMs = resolveTimeout(context);
  try {
    const data = await requestWithTimeout(resolved.client, 'POST', '/validate', {}, timeoutMs);
    return { result: redactSensitive(JSON.stringify(data, null, 2)), metadata: { success: true, action: 'validate_tests', timestamp: new Date().toISOString() } };
  } catch (err) {
    return { result: redactSensitive(`Error: ${err.message}`), metadata: { success: false, action: 'validate_tests', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export async function execute(params, context) { const { action } = params || {}; if (!action || !VALID_ACTIONS.includes(action)) return { result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`, metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } }; try { switch (action) {
      case 'generate_tests': return await handleGenerateTests(params, context);
      case 'analyze_coverage': return await handleAnalyzeCoverage(params, context);
      case 'suggest_cases': return await handleSuggestCases(params, context);
      case 'validate_tests': return await handleValidateTests(params, context);
      default: return { result: 'Error: Unknown action.', metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    } } catch (error) { return { result: redactSensitive(`Error: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } }; }
}

export const meta = { name: 'test-generator', version: '1.0.0', description: 'Automatically generate unit and integration tests for code.', actions: VALID_ACTIONS };
export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
