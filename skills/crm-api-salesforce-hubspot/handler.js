/**
 * CRM API (Salesforce/HubSpot) Skill Handler (Layer 1)
 * Unified CRM access for Salesforce and HubSpot — manage contacts, deals, and pipelines.
 */

const VALID_ACTIONS = [
  'find_contact',
  'create_contact',
  'list_deals',
  'update_deal',
  'get_pipeline',
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
    result: 'Error: Provider client required for CRM API (Salesforce/HubSpot) access. Configure an API key or platform adapter.',
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
    case 'find_contact': {
      const validate_query = validateNonEmptyString(params.query, 'query');
      if (!validate_query.valid) return { valid: false, error: validate_query.error };
      return { valid: true };
    }
    case 'create_contact': {
      const validate_email = validateNonEmptyString(params.email, 'email');
      if (!validate_email.valid) return { valid: false, error: validate_email.error };
      const validate_firstName = validateNonEmptyString(params.firstName, 'firstName');
      if (!validate_firstName.valid) return { valid: false, error: validate_firstName.error };
      const validate_lastName = validateNonEmptyString(params.lastName, 'lastName');
      if (!validate_lastName.valid) return { valid: false, error: validate_lastName.error };
      return { valid: true };
    }
    case 'list_deals':
      return { valid: true };
    case 'update_deal': {
      const validate_dealId = validateNonEmptyString(params.dealId, 'dealId');
      if (!validate_dealId.valid) return { valid: false, error: validate_dealId.error };
      return { valid: true };
    }
    case 'get_pipeline':
      return { valid: true };
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleFindContact(params, context) {
  const v_query = validateNonEmptyString(params.query, 'query');
  if (!v_query.valid) {
    return { result: `Error: ${v_query.error}`, metadata: { success: false, action: 'find_contact', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = '/contacts/search';
    const data = await requestWithTimeout(resolved.client, 'POST', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'find_contact',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'find_contact', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleCreateContact(params, context) {
  const v_email = validateNonEmptyString(params.email, 'email');
  if (!v_email.valid) {
    return { result: `Error: ${v_email.error}`, metadata: { success: false, action: 'create_contact', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_firstName = validateNonEmptyString(params.firstName, 'firstName');
  if (!v_firstName.valid) {
    return { result: `Error: ${v_firstName.error}`, metadata: { success: false, action: 'create_contact', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_lastName = validateNonEmptyString(params.lastName, 'lastName');
  if (!v_lastName.valid) {
    return { result: `Error: ${v_lastName.error}`, metadata: { success: false, action: 'create_contact', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = '/contacts';
    const data = await requestWithTimeout(resolved.client, 'POST', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'create_contact',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'create_contact', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleListDeals(params, context) {


  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/deals?stage=${encodeURIComponent(String(params.stage ?? ''))}&limit=${encodeURIComponent(String(params.limit ?? '10'))}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'list_deals',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_deals', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleUpdateDeal(params, context) {
  const v_dealId = validateNonEmptyString(params.dealId, 'dealId');
  if (!v_dealId.valid) {
    return { result: `Error: ${v_dealId.error}`, metadata: { success: false, action: 'update_deal', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/deals/${encodeURIComponent(v_dealId.value)}`;
    const data = await requestWithTimeout(resolved.client, 'PATCH', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'update_deal',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'update_deal', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetPipeline(params, context) {


  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/pipelines/${encodeURIComponent(String(params.pipelineId ?? ''))}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'get_pipeline',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_pipeline', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
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
      case 'find_contact': return await handleFindContact(params, context);
      case 'create_contact': return await handleCreateContact(params, context);
      case 'list_deals': return await handleListDeals(params, context);
      case 'update_deal': return await handleUpdateDeal(params, context);
      case 'get_pipeline': return await handleGetPipeline(params, context);
      default: return { result: `Error: Unknown action "${action}".`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) {
    return { result: redactSensitive(`Error during ${action}: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export const meta = { name: 'crm-api-salesforce-hubspot', version: '1.0.0', description: 'Unified CRM access for Salesforce and HubSpot — manage contacts, deals, and pipelines.', actions: VALID_ACTIONS };

export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
