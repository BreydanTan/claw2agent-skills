/**
 * Slack Integration Skill Handler (Layer 1)
 *
 * Interact with Slack workspaces via the Slack API: send messages, manage
 * channels, list messages, add reactions, invite users, and set topics.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://slack.com/api/...)
 * - All external access goes through context.providerClient or context.gatewayClient
 * - If no client is available: PROVIDER_NOT_CONFIGURED
 * - Enforces timeout (default 15s, max 30s)
 * - Redacts secrets from all outputs
 * - Sanitizes inputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'send_message', 'list_channels', 'get_channel', 'list_messages',
  'react', 'create_channel', 'invite_user', 'set_topic',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_CHANNEL_LIMIT = 100;
const DEFAULT_MESSAGE_LIMIT = 20;
const MAX_LIMIT = 1000;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the provider or gateway client from context.
 *
 * @param {Object} context - Execution context
 * @returns {{ client: Object, type: string } | null}
 */
export function getClient(context) {
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
    result: 'Error: Provider client required for Slack API access. Configure the platform adapter.',
    metadata: {
      success: false,
      error: 'PROVIDER_NOT_CONFIGURED',
    },
  };
}

// ---------------------------------------------------------------------------
// Token / key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
  /xoxb-[A-Za-z0-9-]+/g,
  /xoxp-[A-Za-z0-9-]+/g,
  /xoxa-[A-Za-z0-9-]+/g,
  /xoxr-[A-Za-z0-9-]+/g,
  /xoxs-[A-Za-z0-9-]+/g,
];

/**
 * Redact sensitive tokens/keys from a string.
 *
 * @param {string} text
 * @returns {string}
 */
export function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a string input by trimming and removing control characters.
 *
 * @param {*} value
 * @returns {string|undefined}
 */
export function sanitizeString(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return String(value);
  // eslint-disable-next-line no-control-regex
  return value.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Clamp a limit value to valid range.
 *
 * @param {*} value
 * @param {number} defaultVal
 * @returns {number}
 */
function clampLimit(value, defaultVal) {
  const n = typeof value === 'number' ? value : defaultVal;
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(n);
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
// Fetch with timeout
// ---------------------------------------------------------------------------

/**
 * Fetch data through the provider client with timeout enforcement.
 *
 * @param {Object} client - The provider or gateway client (must have .fetch())
 * @param {string} endpoint - The resource/endpoint identifier
 * @param {Object} options - Fetch options (params, method, body, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Object>} Parsed response data
 * @throws {{ code: string, message: string }} On failure
 */
async function fetchWithTimeout(client, endpoint, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.fetch(endpoint, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'FETCH_ERROR', message: err.message || 'Unknown fetch error' };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * send_message - Send a message to a Slack channel.
 */
async function handleSendMessage(params, context) {
  const channel = sanitizeString(params.channel);
  const text = sanitizeString(params.text);

  if (!channel) {
    return {
      result: 'Error: The "channel" parameter is required for send_message.',
      metadata: { success: false, error: 'MISSING_CHANNEL' },
    };
  }
  if (!text) {
    return {
      result: 'Error: The "text" parameter is required for send_message.',
      metadata: { success: false, error: 'MISSING_TEXT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const threadTs = sanitizeString(params.threadTs) || undefined;

  const fetchParams = { channel, text };
  if (threadTs) fetchParams.thread_ts = threadTs;

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'slack/chat.postMessage',
      { method: 'POST', params: fetchParams },
      timeoutMs
    );

    const ts = data.ts || data.message?.ts || 'N/A';

    return {
      result: redactSensitive(`Message sent to ${channel}. Timestamp: ${ts}`),
      metadata: {
        success: true,
        action: 'send_message',
        layer: 'L1',
        channel,
        ts,
        threadTs: threadTs || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * list_channels - List workspace channels.
 */
async function handleListChannels(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const type = params.type || 'public';
  const limit = clampLimit(params.limit, DEFAULT_CHANNEL_LIMIT);

  const fetchParams = { limit };
  if (type === 'public') {
    fetchParams.types = 'public_channel';
  } else if (type === 'private') {
    fetchParams.types = 'private_channel';
  } else {
    fetchParams.types = 'public_channel,private_channel';
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'slack/conversations.list',
      { params: fetchParams },
      timeoutMs
    );

    const channels = Array.isArray(data.channels) ? data.channels : [];

    if (channels.length === 0) {
      return {
        result: 'No channels found.',
        metadata: {
          success: true,
          action: 'list_channels',
          layer: 'L1',
          type,
          count: 0,
          channels: [],
        },
      };
    }

    const lines = channels.map(
      (c) => `#${c.name || c.id} - ${c.topic?.value || c.purpose?.value || 'No topic'} (${c.num_members ?? '?'} members)`
    );

    return {
      result: redactSensitive(`Channels (${channels.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_channels',
        layer: 'L1',
        type,
        count: channels.length,
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name || null,
          topic: c.topic?.value || null,
          purpose: c.purpose?.value || null,
          numMembers: c.num_members ?? null,
          isPrivate: c.is_private || false,
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * get_channel - Get channel information.
 */
async function handleGetChannel(params, context) {
  const channel = sanitizeString(params.channel);

  if (!channel) {
    return {
      result: 'Error: The "channel" parameter is required for get_channel.',
      metadata: { success: false, error: 'MISSING_CHANNEL' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'slack/conversations.info',
      { params: { channel } },
      timeoutMs
    );

    const ch = data.channel || data;

    const result = [
      `Channel: #${ch.name || ch.id || channel}`,
      `ID: ${ch.id || channel}`,
      `Topic: ${ch.topic?.value || 'N/A'}`,
      `Purpose: ${ch.purpose?.value || 'N/A'}`,
      `Members: ${ch.num_members ?? 'N/A'}`,
      `Private: ${ch.is_private ? 'Yes' : 'No'}`,
      `Archived: ${ch.is_archived ? 'Yes' : 'No'}`,
      `Created: ${ch.created || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_channel',
        layer: 'L1',
        channel,
        id: ch.id || channel,
        name: ch.name || null,
        topic: ch.topic?.value || null,
        purpose: ch.purpose?.value || null,
        numMembers: ch.num_members ?? null,
        isPrivate: ch.is_private || false,
        isArchived: ch.is_archived || false,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * list_messages - Get messages from a channel.
 */
async function handleListMessages(params, context) {
  const channel = sanitizeString(params.channel);

  if (!channel) {
    return {
      result: 'Error: The "channel" parameter is required for list_messages.',
      metadata: { success: false, error: 'MISSING_CHANNEL' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = clampLimit(params.limit, DEFAULT_MESSAGE_LIMIT);
  const oldest = sanitizeString(params.oldest) || undefined;
  const latest = sanitizeString(params.latest) || undefined;

  const fetchParams = { channel, limit };
  if (oldest) fetchParams.oldest = oldest;
  if (latest) fetchParams.latest = latest;

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'slack/conversations.history',
      { params: fetchParams },
      timeoutMs
    );

    const messages = Array.isArray(data.messages) ? data.messages : [];

    if (messages.length === 0) {
      return {
        result: `No messages found in ${channel}.`,
        metadata: {
          success: true,
          action: 'list_messages',
          layer: 'L1',
          channel,
          count: 0,
          messages: [],
        },
      };
    }

    const lines = messages.map(
      (m) => `[${m.ts || 'N/A'}] ${m.user || 'unknown'}: ${(m.text || '').substring(0, 120)}`
    );

    return {
      result: redactSensitive(`Messages in ${channel} (${messages.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_messages',
        layer: 'L1',
        channel,
        count: messages.length,
        messages: messages.map((m) => ({
          ts: m.ts || null,
          user: m.user || null,
          text: m.text || null,
          type: m.type || null,
        })),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * react - Add a reaction to a message.
 */
async function handleReact(params, context) {
  const channel = sanitizeString(params.channel);
  const timestamp = sanitizeString(params.timestamp);
  const emoji = sanitizeString(params.emoji);

  if (!channel) {
    return {
      result: 'Error: The "channel" parameter is required for react.',
      metadata: { success: false, error: 'MISSING_CHANNEL' },
    };
  }
  if (!timestamp) {
    return {
      result: 'Error: The "timestamp" parameter is required for react.',
      metadata: { success: false, error: 'MISSING_TIMESTAMP' },
    };
  }
  if (!emoji) {
    return {
      result: 'Error: The "emoji" parameter is required for react.',
      metadata: { success: false, error: 'MISSING_EMOJI' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  // Strip colons from emoji name if provided (e.g., ":thumbsup:" -> "thumbsup")
  const cleanEmoji = emoji.replace(/^:+|:+$/g, '');

  try {
    await fetchWithTimeout(
      resolved.client,
      'slack/reactions.add',
      { method: 'POST', params: { channel, timestamp: timestamp, name: cleanEmoji } },
      timeoutMs
    );

    return {
      result: redactSensitive(`Reaction :${cleanEmoji}: added to message ${timestamp} in ${channel}.`),
      metadata: {
        success: true,
        action: 'react',
        layer: 'L1',
        channel,
        timestamp,
        emoji: cleanEmoji,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * create_channel - Create a new Slack channel.
 */
async function handleCreateChannel(params, context) {
  const name = sanitizeString(params.name);

  if (!name) {
    return {
      result: 'Error: The "name" parameter is required for create_channel.',
      metadata: { success: false, error: 'MISSING_NAME' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const isPrivate = params.isPrivate === true;
  const description = sanitizeString(params.description) || undefined;

  const fetchParams = { name, is_private: isPrivate };

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'slack/conversations.create',
      { method: 'POST', params: fetchParams },
      timeoutMs
    );

    const ch = data.channel || data;
    const channelId = ch.id || 'N/A';
    const channelName = ch.name || name;

    // If a description was provided, set the purpose
    if (description && channelId !== 'N/A') {
      try {
        await fetchWithTimeout(
          resolved.client,
          'slack/conversations.setPurpose',
          { method: 'POST', params: { channel: channelId, purpose: description } },
          timeoutMs
        );
      } catch (_) {
        // Non-fatal: channel was created but purpose could not be set
      }
    }

    return {
      result: redactSensitive(`Channel #${channelName} created. ID: ${channelId}`),
      metadata: {
        success: true,
        action: 'create_channel',
        layer: 'L1',
        id: channelId,
        name: channelName,
        isPrivate,
        description: description || null,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * invite_user - Invite a user to a channel.
 */
async function handleInviteUser(params, context) {
  const channel = sanitizeString(params.channel);
  const user = sanitizeString(params.user);

  if (!channel) {
    return {
      result: 'Error: The "channel" parameter is required for invite_user.',
      metadata: { success: false, error: 'MISSING_CHANNEL' },
    };
  }
  if (!user) {
    return {
      result: 'Error: The "user" parameter is required for invite_user.',
      metadata: { success: false, error: 'MISSING_USER' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    await fetchWithTimeout(
      resolved.client,
      'slack/conversations.invite',
      { method: 'POST', params: { channel, users: user } },
      timeoutMs
    );

    return {
      result: redactSensitive(`User ${user} invited to ${channel}.`),
      metadata: {
        success: true,
        action: 'invite_user',
        layer: 'L1',
        channel,
        user,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

/**
 * set_topic - Set channel topic.
 */
async function handleSetTopic(params, context) {
  const channel = sanitizeString(params.channel);
  const topic = sanitizeString(params.topic);

  if (!channel) {
    return {
      result: 'Error: The "channel" parameter is required for set_topic.',
      metadata: { success: false, error: 'MISSING_CHANNEL' },
    };
  }
  if (!topic) {
    return {
      result: 'Error: The "topic" parameter is required for set_topic.',
      metadata: { success: false, error: 'MISSING_TOPIC' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'slack/conversations.setTopic',
      { method: 'POST', params: { channel, topic } },
      timeoutMs
    );

    const ch = data.channel || data;

    return {
      result: redactSensitive(`Topic set for ${channel}: ${topic}`),
      metadata: {
        success: true,
        action: 'set_topic',
        layer: 'L1',
        channel,
        topic: ch.topic?.value || topic,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'FETCH_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Slack integration operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of the VALID_ACTIONS
 * @param {Object} context - Execution context (must contain providerClient or gatewayClient)
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  try {
    switch (action) {
      case 'send_message':
        return await handleSendMessage(params, context);
      case 'list_channels':
        return await handleListChannels(params, context);
      case 'get_channel':
        return await handleGetChannel(params, context);
      case 'list_messages':
        return await handleListMessages(params, context);
      case 'react':
        return await handleReact(params, context);
      case 'create_channel':
        return await handleCreateChannel(params, context);
      case 'invite_user':
        return await handleInviteUser(params, context);
      case 'set_topic':
        return await handleSetTopic(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: 'OPERATION_FAILED', detail: error.message },
    };
  }
}
