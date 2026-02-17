/**
 * LinkedIn Marketing API Skill Handler (Layer 1)
 * Manage LinkedIn posts, company pages, and ad campaigns via Marketing API.
 */

const VALID_ACTIONS = [
  'create_post',
  'get_profile',
  'list_posts',
  'get_analytics',
];

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for LinkedIn Marketing API access. Configure an API key or platform adapter.',
    metadata: { success: false, error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider client required.', retriable: false } },
  };
}

function resolveTimeout(context) {
  const configured = context?.config?.timeoutMs;
  if (typeof configured === 'number' && configured > 0) return Math.min(configured, MAX_TIMEOUT_MS);
  return DEFAULT_TIMEOUT_MS;
}

async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await client.request(method, path, null, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    throw { code: 'UPSTREAM_ERROR', message: err.message || 'Unknown upstream error' };
  }
}

const SENSITIVE_PATTERNS = [/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi];

function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) cleaned = cleaned.replace(pattern, '[REDACTED]');
  return cleaned;
}

function validateNonEmptyString(value, fieldName) {
  if (!value || typeof value !== 'string') return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: `The "${fieldName}" parameter must not be empty.` };
  return { valid: true, value: trimmed };
}

export function validate(params) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  switch (action) {
    case 'create_post': {
      const validate_content = validateNonEmptyString(params.content, 'content');
      if (!validate_content.valid) return { valid: false, error: validate_content.error };
      return { valid: true };
    }
    case 'get_profile':
      return { valid: true };
    case 'list_posts':
      return { valid: true };
    case 'get_analytics': {
      const validate_postId = validateNonEmptyString(params.postId, 'postId');
      if (!validate_postId.valid) return { valid: false, error: validate_postId.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleCreatePost(params, context) {
  const v_content = validateNonEmptyString(params.content, 'content');
  if (!v_content.valid) {
    return { result: `Error: ${v_content.error}`, metadata: { success: false, action: 'create_post', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = '/ugcPosts';
    const data = await requestWithTimeout(resolved.client, 'POST', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'create_post',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'create_post', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetProfile(params, context) {


  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = '/me';
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'get_profile',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_profile', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleListPosts(params, context) {


  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/ugcPosts?q=authors&count=${encodeURIComponent(String(params.count ?? '10'))}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'list_posts',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_posts', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetAnalytics(params, context) {
  const v_postId = validateNonEmptyString(params.postId, 'postId');
  if (!v_postId.valid) {
    return { result: `Error: ${v_postId.error}`, metadata: { success: false, action: 'get_analytics', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/organizationalEntityShareStatistics?ugcPost=${encodeURIComponent(v_postId.value)}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'get_analytics',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_analytics', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

export async function execute(params, context) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, action: action || null, error: 'INVALID_ACTION', timestamp: new Date().toISOString() },
    };
  }
  try {
    switch (action) {
      case 'create_post': return await handleCreatePost(params, context);
      case 'get_profile': return await handleGetProfile(params, context);
      case 'list_posts': return await handleListPosts(params, context);
      case 'get_analytics': return await handleGetAnalytics(params, context);
      default: return { result: `Error: Unknown action "${action}".`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) {
    return { result: redactSensitive(`Error during ${action}: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export const meta = { name: 'linkedin-marketing-api', version: '1.0.0', description: 'Manage LinkedIn posts, company pages, and ad campaigns via Marketing API.', actions: VALID_ACTIONS };

export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
