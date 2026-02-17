/**
 * WordPress REST API Skill Handler (Layer 1)
 * Manage WordPress posts, pages, and media via REST API.
 */

const VALID_ACTIONS = [
  'create_post',
  'list_posts',
  'update_post',
  'delete_post',
  'upload_media',
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
    result: 'Error: Provider client required for WordPress REST API access. Configure an API key or platform adapter.',
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
      const validate_title = validateNonEmptyString(params.title, 'title');
      if (!validate_title.valid) return { valid: false, error: validate_title.error };
      const validate_content = validateNonEmptyString(params.content, 'content');
      if (!validate_content.valid) return { valid: false, error: validate_content.error };
      return { valid: true };
    }
    case 'list_posts':
      return { valid: true };
    case 'update_post': {
      const validate_postId = validateNonEmptyString(params.postId, 'postId');
      if (!validate_postId.valid) return { valid: false, error: validate_postId.error };
      return { valid: true };
    }
    case 'delete_post': {
      const validate_postId = validateNonEmptyString(params.postId, 'postId');
      if (!validate_postId.valid) return { valid: false, error: validate_postId.error };
      return { valid: true };
    }
    case 'upload_media': {
      const validate_fileName = validateNonEmptyString(params.fileName, 'fileName');
      if (!validate_fileName.valid) return { valid: false, error: validate_fileName.error };
      const validate_mimeType = validateNonEmptyString(params.mimeType, 'mimeType');
      if (!validate_mimeType.valid) return { valid: false, error: validate_mimeType.error };
      const validate_data = validateNonEmptyString(params.data, 'data');
      if (!validate_data.valid) return { valid: false, error: validate_data.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleCreatePost(params, context) {
  const v_title = validateNonEmptyString(params.title, 'title');
  if (!v_title.valid) {
    return { result: `Error: ${v_title.error}`, metadata: { success: false, action: 'create_post', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_content = validateNonEmptyString(params.content, 'content');
  if (!v_content.valid) {
    return { result: `Error: ${v_content.error}`, metadata: { success: false, action: 'create_post', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = '/wp/v2/posts';
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

async function handleListPosts(params, context) {


  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/wp/v2/posts?per_page=${encodeURIComponent(String(params.perPage ?? '10'))}&page=${encodeURIComponent(String(params.page ?? '1'))}`;
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

async function handleUpdatePost(params, context) {
  const v_postId = validateNonEmptyString(params.postId, 'postId');
  if (!v_postId.valid) {
    return { result: `Error: ${v_postId.error}`, metadata: { success: false, action: 'update_post', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/wp/v2/posts/${encodeURIComponent(v_postId.value)}`;
    const data = await requestWithTimeout(resolved.client, 'PUT', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'update_post',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'update_post', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleDeletePost(params, context) {
  const v_postId = validateNonEmptyString(params.postId, 'postId');
  if (!v_postId.valid) {
    return { result: `Error: ${v_postId.error}`, metadata: { success: false, action: 'delete_post', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/wp/v2/posts/${encodeURIComponent(v_postId.value)}?force=${encodeURIComponent(String(params.force ?? 'false'))}`;
    const data = await requestWithTimeout(resolved.client, 'DELETE', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'delete_post',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'delete_post', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleUploadMedia(params, context) {
  const v_fileName = validateNonEmptyString(params.fileName, 'fileName');
  if (!v_fileName.valid) {
    return { result: `Error: ${v_fileName.error}`, metadata: { success: false, action: 'upload_media', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_mimeType = validateNonEmptyString(params.mimeType, 'mimeType');
  if (!v_mimeType.valid) {
    return { result: `Error: ${v_mimeType.error}`, metadata: { success: false, action: 'upload_media', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_data = validateNonEmptyString(params.data, 'data');
  if (!v_data.valid) {
    return { result: `Error: ${v_data.error}`, metadata: { success: false, action: 'upload_media', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = '/wp/v2/media';
    const data = await requestWithTimeout(resolved.client, 'POST', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'upload_media',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'upload_media', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
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
      case 'list_posts': return await handleListPosts(params, context);
      case 'update_post': return await handleUpdatePost(params, context);
      case 'delete_post': return await handleDeletePost(params, context);
      case 'upload_media': return await handleUploadMedia(params, context);
      default: return { result: `Error: Unknown action "${action}".`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) {
    return { result: redactSensitive(`Error during ${action}: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export const meta = { name: 'wordpress-rest-api', version: '1.0.0', description: 'Manage WordPress posts, pages, and media via REST API.', actions: VALID_ACTIONS };

export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
