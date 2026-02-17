/**
 * Outlook (Microsoft Graph) API Skill Handler (Layer 1)
 * Send emails, manage inbox, and handle calendar events via Microsoft Graph API.
 */

const VALID_ACTIONS = [
  'send_email',
  'list_messages',
  'get_message',
  'search_messages',
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
    result: 'Error: Provider client required for Outlook (Microsoft Graph) API access. Configure an API key or platform adapter.',
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
    case 'send_email': {
      const validate_to = validateNonEmptyString(params.to, 'to');
      if (!validate_to.valid) return { valid: false, error: validate_to.error };
      const validate_subject = validateNonEmptyString(params.subject, 'subject');
      if (!validate_subject.valid) return { valid: false, error: validate_subject.error };
      const validate_body = validateNonEmptyString(params.body, 'body');
      if (!validate_body.valid) return { valid: false, error: validate_body.error };
      return { valid: true };
    }
    case 'list_messages':
      return { valid: true };
    case 'get_message': {
      const validate_messageId = validateNonEmptyString(params.messageId, 'messageId');
      if (!validate_messageId.valid) return { valid: false, error: validate_messageId.error };
      return { valid: true };
    }
    case 'search_messages': {
      const validate_query = validateNonEmptyString(params.query, 'query');
      if (!validate_query.valid) return { valid: false, error: validate_query.error };
      return { valid: true };
    }
    default: return { valid: false, error: `Unknown action "${action}".` };
  }
}

async function handleSendEmail(params, context) {
  const v_to = validateNonEmptyString(params.to, 'to');
  if (!v_to.valid) {
    return { result: `Error: ${v_to.error}`, metadata: { success: false, action: 'send_email', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_subject = validateNonEmptyString(params.subject, 'subject');
  if (!v_subject.valid) {
    return { result: `Error: ${v_subject.error}`, metadata: { success: false, action: 'send_email', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }
  const v_body = validateNonEmptyString(params.body, 'body');
  if (!v_body.valid) {
    return { result: `Error: ${v_body.error}`, metadata: { success: false, action: 'send_email', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = '/me/sendMail';
    const data = await requestWithTimeout(resolved.client, 'POST', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'send_email',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'send_email', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleListMessages(params, context) {


  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/me/mailFolders/${encodeURIComponent(String(params.folder ?? 'inbox'))}/messages?$top=${encodeURIComponent(String(params.top ?? '10'))}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'list_messages',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'list_messages', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleGetMessage(params, context) {
  const v_messageId = validateNonEmptyString(params.messageId, 'messageId');
  if (!v_messageId.valid) {
    return { result: `Error: ${v_messageId.error}`, metadata: { success: false, action: 'get_message', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/me/messages/${encodeURIComponent(v_messageId.value)}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'get_message',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'get_message', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
    };
  }
}

async function handleSearchMessages(params, context) {
  const v_query = validateNonEmptyString(params.query, 'query');
  if (!v_query.valid) {
    return { result: `Error: ${v_query.error}`, metadata: { success: false, action: 'search_messages', error: 'INVALID_INPUT', timestamp: new Date().toISOString() } };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const path = `/me/messages?$search=${encodeURIComponent(v_query.value)}&$top=${encodeURIComponent(String(params.top ?? '10'))}`;
    const data = await requestWithTimeout(resolved.client, 'GET', path, {}, timeoutMs);

    return {
      result: redactSensitive(JSON.stringify(data, null, 2)),
      metadata: {
        success: true,
        action: 'search_messages',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, action: 'search_messages', error: err.code || 'UPSTREAM_ERROR', timestamp: new Date().toISOString() },
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
      case 'send_email': return await handleSendEmail(params, context);
      case 'list_messages': return await handleListMessages(params, context);
      case 'get_message': return await handleGetMessage(params, context);
      case 'search_messages': return await handleSearchMessages(params, context);
      default: return { result: `Error: Unknown action "${action}".`, metadata: { success: false, action, error: 'INVALID_ACTION', timestamp: new Date().toISOString() } };
    }
  } catch (error) {
    return { result: redactSensitive(`Error during ${action}: ${error.message}`), metadata: { success: false, action, error: 'UPSTREAM_ERROR', timestamp: new Date().toISOString() } };
  }
}

export const meta = { name: 'outlook-microsoft-graph-api', version: '1.0.0', description: 'Send emails, manage inbox, and handle calendar events via Microsoft Graph API.', actions: VALID_ACTIONS };

export { getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
