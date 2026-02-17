/**
 * Meta Ad Library API Skill Handler (Layer 1)
 * Search and analyze ads from Meta platforms (Facebook/Instagram) via Ad Library API.
 */

const VALID_ACTIONS = [
  'search_ads',
  'get_ad_details',
  'get_page_ads',
  'get_ad_spend',
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
    result: 'Error: Provider client required for Meta Ad Library API access. Configure an API key or platform adapter.',
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
    case 'search_ads': {
      const validate_query = validateNonEmptyString(params.query, 'query');
      if (!validate_query.valid) return { valid: false, error: validate_query.error };
      return { valid: true };
    }
    case 'get_ad_details': {
      const validate_adId = validateNonEmptyString(params.adId, 'adId');
      if (!validate_adId.valid) return { valid: false, error: validate_adId.error };
      return { valid: true };
    }
    case 'get_page_ads': {
      const validate_pageId = validateNonEmptyString(params.pageId, 'pageId');
      if (!validate_pageId.valid) return { valid: false, error: validate_pageId.error };
      return { valid: true };
    }
    case 'get_ad_spend': {
      const validate_pageId = validateNonEmptyString(params.pageId, 'pageId');
      if (!validate_pageId.valid) return { valid: false, error: validate_pageId.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleSearchAds(params, context) {
  const v_query = validateNonEmptyString(params.query, 'query');
  if (!v_query.valid) {
    return { result: `Error: ${v_query.error}`, metadata: { success: false, action: 'search_ads', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/ads_archive?search_terms=${encodeURIComponent(v_query.value)}&ad_type=${encodeURIComponent(String(params.adType ?? 'ALL'))}&ad_reached_countries=${encodeURIComponent(String(params.country ?? 'US'))}&limit=${encodeURIComponent(String(params.limit ?? '25'))}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'search_ads',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'search_ads', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetAdDetails(params, context) {
  const v_adId = validateNonEmptyString(params.adId, 'adId');
  if (!v_adId.valid) {
    return { result: `Error: ${v_adId.error}`, metadata: { success: false, action: 'get_ad_details', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/ads_archive/${encodeURIComponent(v_adId.value)}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'get_ad_details',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_ad_details', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetPageAds(params, context) {
  const v_pageId = validateNonEmptyString(params.pageId, 'pageId');
  if (!v_pageId.valid) {
    return { result: `Error: ${v_pageId.error}`, metadata: { success: false, action: 'get_page_ads', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/ads_archive?search_page_ids=${encodeURIComponent(v_pageId.value)}&limit=${encodeURIComponent(String(params.limit ?? '25'))}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'get_page_ads',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_page_ads', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetAdSpend(params, context) {
  const v_pageId = validateNonEmptyString(params.pageId, 'pageId');
  if (!v_pageId.valid) {
    return { result: `Error: ${v_pageId.error}`, metadata: { success: false, action: 'get_ad_spend', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/ads_archive?search_page_ids=${encodeURIComponent(v_pageId.value)}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'get_ad_spend',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_ad_spend', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
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
      case 'search_ads': return await handleSearchAds(params, context);
      case 'get_ad_details': return await handleGetAdDetails(params, context);
      case 'get_page_ads': return await handleGetPageAds(params, context);
      case 'get_ad_spend': return await handleGetAdSpend(params, context);
      default: return { result: `Error: Unknown action "${action}".`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) {
    return { result: redactSensitive(`Error during ${action}: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export const meta = { name: 'meta-ad-library-api', version: '1.0.0', description: 'Search and analyze ads from Meta platforms (Facebook/Instagram) via Ad Library API.', actions: VALID_ACTIONS };

export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
