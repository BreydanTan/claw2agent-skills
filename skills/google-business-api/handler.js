/**
 * Google Business API Skill Handler (Layer 1)
 * Manage Google Business Profile listings, reviews, and posts.
 */

const VALID_ACTIONS = [
  'get_listing',
  'list_reviews',
  'reply_review',
  'create_post',
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
    result: 'Error: Provider client required for Google Business API access. Configure an API key or platform adapter.',
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
    case 'get_listing': {
      const validate_locationId = validateNonEmptyString(params.locationId, 'locationId');
      if (!validate_locationId.valid) return { valid: false, error: validate_locationId.error };
      return { valid: true };
    }
    case 'list_reviews': {
      const validate_locationId = validateNonEmptyString(params.locationId, 'locationId');
      if (!validate_locationId.valid) return { valid: false, error: validate_locationId.error };
      return { valid: true };
    }
    case 'reply_review': {
      const validate_locationId = validateNonEmptyString(params.locationId, 'locationId');
      if (!validate_locationId.valid) return { valid: false, error: validate_locationId.error };
      const validate_reviewId = validateNonEmptyString(params.reviewId, 'reviewId');
      if (!validate_reviewId.valid) return { valid: false, error: validate_reviewId.error };
      const validate_comment = validateNonEmptyString(params.comment, 'comment');
      if (!validate_comment.valid) return { valid: false, error: validate_comment.error };
      return { valid: true };
    }
    case 'create_post': {
      const validate_locationId = validateNonEmptyString(params.locationId, 'locationId');
      if (!validate_locationId.valid) return { valid: false, error: validate_locationId.error };
      const validate_content = validateNonEmptyString(params.content, 'content');
      if (!validate_content.valid) return { valid: false, error: validate_content.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleGetListing(params, context) {
  const v_locationId = validateNonEmptyString(params.locationId, 'locationId');
  if (!v_locationId.valid) {
    return { result: `Error: ${v_locationId.error}`, metadata: { success: false, action: 'get_listing', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/locations/${encodeURIComponent(v_locationId.value)}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'get_listing',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_listing', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleListReviews(params, context) {
  const v_locationId = validateNonEmptyString(params.locationId, 'locationId');
  if (!v_locationId.valid) {
    return { result: `Error: ${v_locationId.error}`, metadata: { success: false, action: 'list_reviews', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/locations/${encodeURIComponent(v_locationId.value)}/reviews?pageSize=${encodeURIComponent(String(params.pageSize ?? '10'))}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'list_reviews',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_reviews', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleReplyReview(params, context) {
  const v_locationId = validateNonEmptyString(params.locationId, 'locationId');
  if (!v_locationId.valid) {
    return { result: `Error: ${v_locationId.error}`, metadata: { success: false, action: 'reply_review', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_reviewId = validateNonEmptyString(params.reviewId, 'reviewId');
  if (!v_reviewId.valid) {
    return { result: `Error: ${v_reviewId.error}`, metadata: { success: false, action: 'reply_review', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_comment = validateNonEmptyString(params.comment, 'comment');
  if (!v_comment.valid) {
    return { result: `Error: ${v_comment.error}`, metadata: { success: false, action: 'reply_review', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/locations/${encodeURIComponent(v_locationId.value)}/reviews/${encodeURIComponent(v_reviewId.value)}/reply`;
    const data = await requestWithTimeout(resolved.client, 'PUT', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'reply_review',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'reply_review', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleCreatePost(params, context) {
  const v_locationId = validateNonEmptyString(params.locationId, 'locationId');
  if (!v_locationId.valid) {
    return { result: `Error: ${v_locationId.error}`, metadata: { success: false, action: 'create_post', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_content = validateNonEmptyString(params.content, 'content');
  if (!v_content.valid) {
    return { result: `Error: ${v_content.error}`, metadata: { success: false, action: 'create_post', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/locations/${encodeURIComponent(v_locationId.value)}/localPosts`;
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
      case 'get_listing': return await handleGetListing(params, context);
      case 'list_reviews': return await handleListReviews(params, context);
      case 'reply_review': return await handleReplyReview(params, context);
      case 'create_post': return await handleCreatePost(params, context);
      default: return { result: `Error: Unknown action "${action}".`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) {
    return { result: redactSensitive(`Error during ${action}: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export const meta = { name: 'google-business-api', version: '1.0.0', description: 'Manage Google Business Profile listings, reviews, and posts.', actions: VALID_ACTIONS };

export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
