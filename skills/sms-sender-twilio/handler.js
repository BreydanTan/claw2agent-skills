/**
 * SMS Sender (Twilio) Skill Handler (Layer 1)
 *
 * Send SMS/MMS messages, retrieve message details, list messages,
 * get account info, and look up phone numbers via Twilio API.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 15s, max 30s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys and phone numbers from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = ['send_sms', 'get_message', 'list_messages', 'send_mms', 'get_account', 'check_number'];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const MAX_BODY_LENGTH = 1600;
const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const E164_REGEX = /^\+[1-9]\d{6,13}$/;

const MESSAGE_SID_REGEX = /^(SM|MM)[0-9a-fA-F]{32}$/;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the provider or gateway client from context.
 * L1 prefers providerClient; falls back to gatewayClient.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

/**
 * Return the standard PROVIDER_NOT_CONFIGURED error response.
 *
 * @returns {{ result: string, metadata: Object }}
 */
function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for Twilio SMS operations. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Twilio SMS operations. Configure an API key or platform adapter.',
        retriable: false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective timeout from context config.
 *
 * @param {Object} context
 * @returns {number}
 */
function resolveTimeout(context) {
  const configured = context?.config?.timeoutMs;
  if (typeof configured === 'number' && configured > 0) {
    return Math.min(configured, MAX_TIMEOUT_MS);
  }
  return DEFAULT_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Request with timeout
// ---------------------------------------------------------------------------

/**
 * Send a request through the provider client with timeout.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The resource path
 * @param {Object|null} body - Request body (for POST)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, body, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw {
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms.`,
      };
    }

    throw {
      code: 'UPSTREAM_ERROR',
      message: err.message || 'Unknown upstream error',
    };
  }
}

// ---------------------------------------------------------------------------
// Token / key / phone redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
];

/**
 * Redact sensitive tokens/keys from a string.
 *
 * @param {string} text
 * @returns {string}
 */
function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

/**
 * Redact a phone number for safe inclusion in error messages.
 * Shows only the last 4 digits: +1234567890 => ***7890
 *
 * @param {string} phone
 * @returns {string}
 */
function redactPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 4) return '****';
  return '***' + phone.slice(-4);
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate an E.164 phone number format.
 *
 * @param {string} phone
 * @returns {{ valid: boolean, error?: string }}
 */
function validateE164(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required and must be a string.' };
  }

  const trimmed = phone.trim();

  if (!E164_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `Phone number "${redactPhone(trimmed)}" is not valid E.164 format. Must start with + followed by 7-14 digits.`,
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate a Twilio message SID.
 * Must start with SM or MM and be exactly 34 characters.
 *
 * @param {string} sid
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMessageSid(sid) {
  if (!sid || typeof sid !== 'string') {
    return { valid: false, error: 'Message SID is required and must be a string.' };
  }

  const trimmed = sid.trim();

  if (!MESSAGE_SID_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid message SID "${trimmed}". Must start with "SM" or "MM" and be 34 characters long.`,
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate a message body.
 *
 * @param {string} body
 * @param {boolean} [required=true]
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
function validateBody(body, required = true) {
  if (body === undefined || body === null) {
    if (required) {
      return { valid: false, error: 'Message body is required.' };
    }
    return { valid: true, sanitized: undefined };
  }

  if (typeof body !== 'string') {
    return { valid: false, error: 'Message body must be a string.' };
  }

  const trimmed = body.trim();

  if (required && trimmed.length === 0) {
    return { valid: false, error: 'Message body must not be empty.' };
  }

  if (trimmed.length > MAX_BODY_LENGTH) {
    return {
      valid: false,
      error: `Message body exceeds maximum length of ${MAX_BODY_LENGTH} characters (got ${trimmed.length}).`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate a URL string (basic format check, HTTP(S) only).
 *
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  if (typeof url !== 'string' || url.trim().length === 0) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate a limit parameter.
 *
 * @param {*} limit
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLimit(limit) {
  if (limit === undefined || limit === null) {
    return { valid: true, value: DEFAULT_LIMIT };
  }

  const num = Number(limit);

  if (!Number.isInteger(num) || num < MIN_LIMIT || num > MAX_LIMIT) {
    return {
      valid: false,
      error: `Limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT} (got ${limit}).`,
    };
  }

  return { valid: true, value: num };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle the "send_sms" action -- send an SMS message.
 */
async function handleSendSms(params, context) {
  const toValidation = validateE164(params.to);
  if (!toValidation.valid) {
    return {
      result: `Error: ${toValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: toValidation.error } },
    };
  }

  const fromValidation = validateE164(params.from);
  if (!fromValidation.valid) {
    return {
      result: `Error: ${fromValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: fromValidation.error } },
    };
  }

  const bodyValidation = validateBody(params.body, true);
  if (!bodyValidation.valid) {
    return {
      result: `Error: ${bodyValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: bodyValidation.error } },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/messages',
      {
        to: toValidation.value,
        from: fromValidation.value,
        body: bodyValidation.sanitized,
      },
      timeoutMs
    );

    const sid = data?.sid || data?.messageSid || 'unknown';
    const status = data?.status || 'queued';

    const lines = [
      'SMS sent successfully',
      `SID: ${sid}`,
      `Status: ${status}`,
      `To: ${redactPhone(toValidation.value)}`,
      `From: ${redactPhone(fromValidation.value)}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'send_sms',
        layer: 'L1',
        sid,
        status,
        to: toValidation.value,
        from: fromValidation.value,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: { code: err.code || 'UPSTREAM_ERROR', message: err.message } },
    };
  }
}

/**
 * Handle the "get_message" action -- retrieve details for a specific message.
 */
async function handleGetMessage(params, context) {
  const sidValidation = validateMessageSid(params.messageSid);
  if (!sidValidation.valid) {
    return {
      result: `Error: ${sidValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: sidValidation.error } },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/messages/${sidValidation.value}`,
      null,
      timeoutMs
    );

    const lines = [
      'Message details',
      `SID: ${data?.sid || sidValidation.value}`,
      `Status: ${data?.status || 'unknown'}`,
      `Direction: ${data?.direction || 'unknown'}`,
      `To: ${data?.to ? redactPhone(data.to) : 'unknown'}`,
      `From: ${data?.from ? redactPhone(data.from) : 'unknown'}`,
      `Body: ${data?.body || '(empty)'}`,
      `Date Sent: ${data?.dateSent || data?.date_sent || 'unknown'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_message',
        layer: 'L1',
        message: data || {},
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: { code: err.code || 'UPSTREAM_ERROR', message: err.message } },
    };
  }
}

/**
 * Handle the "list_messages" action -- list messages with optional filters.
 */
async function handleListMessages(params, context) {
  // Validate optional to filter
  if (params.to !== undefined && params.to !== null) {
    const toValidation = validateE164(params.to);
    if (!toValidation.valid) {
      return {
        result: `Error: ${toValidation.error}`,
        metadata: { success: false, error: { code: 'INVALID_INPUT', message: toValidation.error } },
      };
    }
  }

  // Validate optional from filter
  if (params.from !== undefined && params.from !== null) {
    const fromValidation = validateE164(params.from);
    if (!fromValidation.valid) {
      return {
        result: `Error: ${fromValidation.error}`,
        metadata: { success: false, error: { code: 'INVALID_INPUT', message: fromValidation.error } },
      };
    }
  }

  const limitValidation = validateLimit(params.limit);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: limitValidation.error } },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  // Build query string
  const queryParts = [];
  if (params.to) queryParts.push(`to=${encodeURIComponent(params.to)}`);
  if (params.from) queryParts.push(`from=${encodeURIComponent(params.from)}`);
  queryParts.push(`limit=${limitValidation.value}`);

  const path = `/messages?${queryParts.join('&')}`;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      null,
      timeoutMs
    );

    const messages = data?.messages || data?.data || [];
    const count = messages.length;

    const lines = [
      `Listed ${count} message(s)`,
    ];

    if (params.to) lines.push(`Filter To: ${redactPhone(params.to)}`);
    if (params.from) lines.push(`Filter From: ${redactPhone(params.from)}`);
    lines.push(`Limit: ${limitValidation.value}`);
    lines.push('');

    for (const msg of messages) {
      lines.push(`- SID: ${msg.sid || 'unknown'} | Status: ${msg.status || 'unknown'} | To: ${msg.to ? redactPhone(msg.to) : 'unknown'}`);
    }

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_messages',
        layer: 'L1',
        count,
        limit: limitValidation.value,
        messages,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: { code: err.code || 'UPSTREAM_ERROR', message: err.message } },
    };
  }
}

/**
 * Handle the "send_mms" action -- send an MMS with media.
 */
async function handleSendMms(params, context) {
  const toValidation = validateE164(params.to);
  if (!toValidation.valid) {
    return {
      result: `Error: ${toValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: toValidation.error } },
    };
  }

  const fromValidation = validateE164(params.from);
  if (!fromValidation.valid) {
    return {
      result: `Error: ${fromValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: fromValidation.error } },
    };
  }

  // Body is optional for MMS
  const bodyValidation = validateBody(params.body, false);
  if (!bodyValidation.valid) {
    return {
      result: `Error: ${bodyValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: bodyValidation.error } },
    };
  }

  // mediaUrl is required
  if (!params.mediaUrl || !isValidUrl(params.mediaUrl)) {
    return {
      result: 'Error: The "mediaUrl" parameter is required and must be a valid HTTP(S) URL.',
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: 'The "mediaUrl" parameter is required and must be a valid HTTP(S) URL.' } },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const requestBody = {
    to: toValidation.value,
    from: fromValidation.value,
    mediaUrl: params.mediaUrl,
  };

  if (bodyValidation.sanitized !== undefined) {
    requestBody.body = bodyValidation.sanitized;
  }

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/messages',
      requestBody,
      timeoutMs
    );

    const sid = data?.sid || data?.messageSid || 'unknown';
    const status = data?.status || 'queued';

    const lines = [
      'MMS sent successfully',
      `SID: ${sid}`,
      `Status: ${status}`,
      `To: ${redactPhone(toValidation.value)}`,
      `From: ${redactPhone(fromValidation.value)}`,
      `Media URL: ${params.mediaUrl}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'send_mms',
        layer: 'L1',
        sid,
        status,
        to: toValidation.value,
        from: fromValidation.value,
        mediaUrl: params.mediaUrl,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: { code: err.code || 'UPSTREAM_ERROR', message: err.message } },
    };
  }
}

/**
 * Handle the "get_account" action -- retrieve Twilio account info.
 */
async function handleGetAccount(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      '/account',
      null,
      timeoutMs
    );

    const lines = [
      'Account Information',
      `SID: ${data?.sid || 'unknown'}`,
      `Friendly Name: ${data?.friendlyName || data?.friendly_name || 'unknown'}`,
      `Status: ${data?.status || 'unknown'}`,
      `Type: ${data?.type || 'unknown'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_account',
        layer: 'L1',
        account: data || {},
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: { code: err.code || 'UPSTREAM_ERROR', message: err.message } },
    };
  }
}

/**
 * Handle the "check_number" action -- look up phone number information.
 */
async function handleCheckNumber(params, context) {
  const numberValidation = validateE164(params.number);
  if (!numberValidation.valid) {
    return {
      result: `Error: ${numberValidation.error}`,
      metadata: { success: false, error: { code: 'INVALID_INPUT', message: numberValidation.error } },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/phone-numbers/${numberValidation.value}/lookup`,
      null,
      timeoutMs
    );

    const lines = [
      'Phone Number Lookup',
      `Number: ${redactPhone(numberValidation.value)}`,
      `Country: ${data?.countryCode || data?.country_code || 'unknown'}`,
      `Carrier: ${data?.carrier?.name || data?.carrier || 'unknown'}`,
      `Type: ${data?.type || data?.carrier?.type || 'unknown'}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'check_number',
        layer: 'L1',
        lookup: data || {},
        number: numberValidation.value,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: { code: err.code || 'UPSTREAM_ERROR', message: err.message } },
    };
  }
}

// ---------------------------------------------------------------------------
// validate() export
// ---------------------------------------------------------------------------

/**
 * Validate params for a given action without executing.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
export function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'send_sms': {
      const toCheck = validateE164(params.to);
      if (!toCheck.valid) return { valid: false, error: toCheck.error };
      const fromCheck = validateE164(params.from);
      if (!fromCheck.valid) return { valid: false, error: fromCheck.error };
      const bodyCheck = validateBody(params.body, true);
      if (!bodyCheck.valid) return { valid: false, error: bodyCheck.error };
      return { valid: true };
    }

    case 'get_message': {
      const sidCheck = validateMessageSid(params.messageSid);
      if (!sidCheck.valid) return { valid: false, error: sidCheck.error };
      return { valid: true };
    }

    case 'list_messages': {
      if (params.to !== undefined && params.to !== null) {
        const toCheck = validateE164(params.to);
        if (!toCheck.valid) return { valid: false, error: toCheck.error };
      }
      if (params.from !== undefined && params.from !== null) {
        const fromCheck = validateE164(params.from);
        if (!fromCheck.valid) return { valid: false, error: fromCheck.error };
      }
      const limitCheck = validateLimit(params.limit);
      if (!limitCheck.valid) return { valid: false, error: limitCheck.error };
      return { valid: true };
    }

    case 'send_mms': {
      const toCheck = validateE164(params.to);
      if (!toCheck.valid) return { valid: false, error: toCheck.error };
      const fromCheck = validateE164(params.from);
      if (!fromCheck.valid) return { valid: false, error: fromCheck.error };
      const bodyCheck = validateBody(params.body, false);
      if (!bodyCheck.valid) return { valid: false, error: bodyCheck.error };
      if (!params.mediaUrl || !isValidUrl(params.mediaUrl)) {
        return { valid: false, error: 'The "mediaUrl" parameter is required and must be a valid HTTP(S) URL.' };
      }
      return { valid: true };
    }

    case 'get_account': {
      return { valid: true };
    }

    case 'check_number': {
      const numCheck = validateE164(params.number);
      if (!numCheck.valid) return { valid: false, error: numCheck.error };
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'sms-sender-twilio',
  version: '1.0.0',
  description: 'Twilio SMS API interaction skill. Send SMS/MMS, retrieve message details, list messages, get account info, and look up phone numbers. Layer 1 skill using provider client for API access.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Twilio SMS API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: send_sms, get_message, list_messages, send_mms, get_account, check_number
 * @param {string} [params.to] - Destination phone number (E.164)
 * @param {string} [params.from] - Sender phone number (E.164)
 * @param {string} [params.body] - Message body text (max 1600 chars)
 * @param {string} [params.messageSid] - Twilio message SID
 * @param {number} [params.limit] - Number of results to return (1-100)
 * @param {string} [params.mediaUrl] - Media URL for MMS
 * @param {string} [params.number] - Phone number for lookup (E.164)
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, error: { code: 'INVALID_ACTION', message: `Invalid action "${action}".` } },
    };
  }

  try {
    switch (action) {
      case 'send_sms':
        return await handleSendSms(params, context);
      case 'get_message':
        return await handleGetMessage(params, context);
      case 'list_messages':
        return await handleListMessages(params, context);
      case 'send_mms':
        return await handleSendMms(params, context);
      case 'get_account':
        return await handleGetAccount(params, context);
      case 'check_number':
        return await handleCheckNumber(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: { code: 'INVALID_ACTION', message: `Unknown action "${action}".` } },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: { code: 'UPSTREAM_ERROR', message: error.message } },
    };
  }
}

// ---------------------------------------------------------------------------
// Export internals for testing
// ---------------------------------------------------------------------------

export {
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  redactPhone,
  validateE164,
  validateMessageSid,
  validateBody,
  isValidUrl,
  validateLimit,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_BODY_LENGTH,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
  E164_REGEX,
  MESSAGE_SID_REGEX,
};
