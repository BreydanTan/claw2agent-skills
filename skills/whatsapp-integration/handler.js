/**
 * WhatsApp Integration Skill Handler (Layer 1)
 *
 * Send messages, manage conversations, and handle read receipts via
 * WhatsApp Cloud API.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 30s, max 120s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'send_message',
  'mark_read',
  'get_messages',
  'send_template',
];

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

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
    result: 'Error: Provider client required for WhatsApp API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for WhatsApp API access. Configure an API key or platform adapter.',
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
 * Make a request through the provider client with timeout.
 *
 * @param {Object} client - The provider or gateway client (must have .request())
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - The resource path
 * @param {Object} opts - Additional options (body, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function requestWithTimeout(client, method, path, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, null, {
      ...opts,
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
// Token / key redaction
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

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/**
 * Validate params for a given action. Returns { valid: true } or { valid: false, error: string }.
 *
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }

  switch (action) {
    case 'send_message': {
      if (!params.to || typeof params.to !== 'string') {
        return { valid: false, error: 'The "to" parameter is required and must be a string.' };
      }
      if (!params.content || typeof params.content !== 'string') {
        return { valid: false, error: 'The "content" parameter is required and must be a string.' };
      }
      return { valid: true };
    }
    case 'mark_read': {
      if (!params.messageId || typeof params.messageId !== 'string') {
        return { valid: false, error: 'The "messageId" parameter is required and must be a string.' };
      }
      return { valid: true };
    }
    case 'get_messages': {
      // conversationId is optional
      return { valid: true };
    }
    case 'send_template': {
      if (!params.to || typeof params.to !== 'string') {
        return { valid: false, error: 'The "to" parameter is required and must be a string.' };
      }
      if (!params.templateName || typeof params.templateName !== 'string') {
        return { valid: false, error: 'The "templateName" parameter is required and must be a string.' };
      }
      return { valid: true };
    }
    default:
      return { valid: false, error: `Unknown action "${action}".` };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Handle send_message -- POST /messages
 * body: { messaging_product: "whatsapp", to, type: "text", text: { body: content } }
 */
async function handleSendMessage(params, context) {
  if (!params.to || typeof params.to !== 'string') {
    return {
      result: 'Error: The "to" parameter is required and must be a string.',
      metadata: { success: false, error: 'INVALID_INPUT', action: 'send_message', timestamp: new Date().toISOString() },
    };
  }
  if (!params.content || typeof params.content !== 'string') {
    return {
      result: 'Error: The "content" parameter is required and must be a string.',
      metadata: { success: false, error: 'INVALID_INPUT', action: 'send_message', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const body = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: { body: params.content },
    };

    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/messages',
      { body },
      timeoutMs
    );

    const messageId = data?.messages?.[0]?.id || null;

    return {
      result: redactSensitive(`Message sent to ${params.to}. Message ID: ${messageId}`),
      metadata: {
        success: true,
        action: 'send_message',
        messageId,
        to: params.to,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR', action: 'send_message', timestamp: new Date().toISOString() },
    };
  }
}

/**
 * Handle mark_read -- POST /messages
 * body: { messaging_product: "whatsapp", status: "read", message_id: messageId }
 */
async function handleMarkRead(params, context) {
  if (!params.messageId || typeof params.messageId !== 'string') {
    return {
      result: 'Error: The "messageId" parameter is required and must be a string.',
      metadata: { success: false, error: 'INVALID_INPUT', action: 'mark_read', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const body = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: params.messageId,
    };

    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/messages',
      { body },
      timeoutMs
    );

    return {
      result: redactSensitive(`Message ${params.messageId} marked as read.`),
      metadata: {
        success: true,
        action: 'mark_read',
        messageId: params.messageId,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR', action: 'mark_read', timestamp: new Date().toISOString() },
    };
  }
}

/**
 * Handle get_messages -- returns NOT_SUPPORTED immediately.
 * WhatsApp Cloud API is webhook-based and does not support message history retrieval.
 */
function handleGetMessages() {
  return {
    result: 'Error: The get_messages action is not supported. WhatsApp Cloud API is webhook-based and does not provide message history retrieval.',
    metadata: {
      success: false,
      error: 'NOT_SUPPORTED',
      action: 'get_messages',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Handle send_template -- POST /messages
 * body: { messaging_product: "whatsapp", to, type: "template", template: { name: templateName, language: { code: language } } }
 */
async function handleSendTemplate(params, context) {
  if (!params.to || typeof params.to !== 'string') {
    return {
      result: 'Error: The "to" parameter is required and must be a string.',
      metadata: { success: false, error: 'INVALID_INPUT', action: 'send_template', timestamp: new Date().toISOString() },
    };
  }
  if (!params.templateName || typeof params.templateName !== 'string') {
    return {
      result: 'Error: The "templateName" parameter is required and must be a string.',
      metadata: { success: false, error: 'INVALID_INPUT', action: 'send_template', timestamp: new Date().toISOString() },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const language = params.language || 'en';

  try {
    const body = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: language },
      },
    };

    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      '/messages',
      { body },
      timeoutMs
    );

    const messageId = data?.messages?.[0]?.id || null;

    return {
      result: redactSensitive(`Template "${params.templateName}" sent to ${params.to}. Message ID: ${messageId}`),
      metadata: {
        success: true,
        action: 'send_template',
        messageId,
        to: params.to,
        templateName: params.templateName,
        language,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR', action: 'send_template', timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a WhatsApp integration action.
 *
 * @param {Object} params
 * @param {string} params.action - One of: send_message, mark_read, get_messages, send_template
 * @param {string} [params.to] - Recipient phone number (required for send_message, send_template)
 * @param {string} [params.content] - Message text (required for send_message)
 * @param {string} [params.messageId] - Message ID (required for mark_read)
 * @param {string} [params.conversationId] - Conversation filter (optional for get_messages)
 * @param {string} [params.templateName] - Template name (required for send_template)
 * @param {string} [params.language] - Language code (optional for send_template, default "en")
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION', action: action || null, timestamp: new Date().toISOString() },
    };
  }

  try {
    switch (action) {
      case 'send_message':
        return await handleSendMessage(params, context);
      case 'mark_read':
        return await handleMarkRead(params, context);
      case 'get_messages':
        return handleGetMessages();
      case 'send_template':
        return await handleSendTemplate(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION', action, timestamp: new Date().toISOString() },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: 'UPSTREAM_ERROR', action, timestamp: new Date().toISOString() },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'whatsapp-integration',
  version: '1.0.0',
  description: 'Send messages, manage conversations, and handle read receipts via WhatsApp Cloud API.',
  actions: VALID_ACTIONS,
};

// Export validate and internals for testing
export {
  validate,
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
