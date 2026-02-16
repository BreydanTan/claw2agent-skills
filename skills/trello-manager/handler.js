/**
 * Trello Manager Skill Handler (Layer 1)
 *
 * Manage Trello boards, lists, and cards via the Trello API: list boards,
 * get board info, list lists, list/get/create/update/move cards, and add comments.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints (no https://api.trello.com/...)
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
  'list_boards', 'get_board',
  'list_lists', 'list_cards', 'get_card',
  'create_card', 'update_card', 'move_card',
  'add_comment',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

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
    result: 'Error: Provider client required for Trello API access. Configure the platform adapter.',
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
  /[a-f0-9]{32,}/gi,
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
 * list_boards - List boards for the authenticated user.
 */
async function handleListBoards(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'trello/members/me/boards',
      { params: {} },
      timeoutMs
    );

    const boards = Array.isArray(data) ? data : [];

    if (boards.length === 0) {
      return {
        result: 'No boards found for the authenticated user.',
        metadata: {
          success: true,
          action: 'list_boards',
          layer: 'L1',
          count: 0,
          boards: [],
        },
      };
    }

    const lines = boards.map(
      (b) => `${b.name || 'Untitled'} (${b.id}) - ${b.desc || 'No description'}`
    );

    return {
      result: redactSensitive(`Boards (${boards.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_boards',
        layer: 'L1',
        count: boards.length,
        boards: boards.map((b) => ({
          id: b.id,
          name: b.name || null,
          desc: b.desc || null,
          closed: b.closed || false,
          url: b.url || null,
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
 * get_board - Get board information.
 */
async function handleGetBoard(params, context) {
  const boardId = sanitizeString(params.boardId);

  if (!boardId) {
    return {
      result: 'Error: The "boardId" parameter is required for get_board.',
      metadata: { success: false, error: 'MISSING_BOARD_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `trello/boards/${boardId}`,
      { params: {} },
      timeoutMs
    );

    const result = [
      `Board: ${data.name || 'Untitled'}`,
      `ID: ${data.id || boardId}`,
      `Description: ${data.desc || 'N/A'}`,
      `Closed: ${data.closed ? 'Yes' : 'No'}`,
      `URL: ${data.url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_board',
        layer: 'L1',
        boardId: data.id || boardId,
        name: data.name || null,
        desc: data.desc || null,
        closed: data.closed || false,
        url: data.url || null,
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
 * list_lists - List lists in a board.
 */
async function handleListLists(params, context) {
  const boardId = sanitizeString(params.boardId);

  if (!boardId) {
    return {
      result: 'Error: The "boardId" parameter is required for list_lists.',
      metadata: { success: false, error: 'MISSING_BOARD_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `trello/boards/${boardId}/lists`,
      { params: {} },
      timeoutMs
    );

    const lists = Array.isArray(data) ? data : [];

    if (lists.length === 0) {
      return {
        result: `No lists found in board ${boardId}.`,
        metadata: {
          success: true,
          action: 'list_lists',
          layer: 'L1',
          boardId,
          count: 0,
          lists: [],
        },
      };
    }

    const lines = lists.map(
      (l) => `${l.name || 'Untitled'} (${l.id})`
    );

    return {
      result: redactSensitive(`Lists in board ${boardId} (${lists.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_lists',
        layer: 'L1',
        boardId,
        count: lists.length,
        lists: lists.map((l) => ({
          id: l.id,
          name: l.name || null,
          closed: l.closed || false,
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
 * list_cards - List cards in a list.
 */
async function handleListCards(params, context) {
  const listId = sanitizeString(params.listId);

  if (!listId) {
    return {
      result: 'Error: The "listId" parameter is required for list_cards.',
      metadata: { success: false, error: 'MISSING_LIST_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `trello/lists/${listId}/cards`,
      { params: {} },
      timeoutMs
    );

    const cards = Array.isArray(data) ? data : [];

    if (cards.length === 0) {
      return {
        result: `No cards found in list ${listId}.`,
        metadata: {
          success: true,
          action: 'list_cards',
          layer: 'L1',
          listId,
          count: 0,
          cards: [],
        },
      };
    }

    const lines = cards.map(
      (c) => `${c.name || 'Untitled'} (${c.id})${c.due ? ` - Due: ${c.due}` : ''}`
    );

    return {
      result: redactSensitive(`Cards in list ${listId} (${cards.length}):\n${lines.join('\n')}`),
      metadata: {
        success: true,
        action: 'list_cards',
        layer: 'L1',
        listId,
        count: cards.length,
        cards: cards.map((c) => ({
          id: c.id,
          name: c.name || null,
          desc: c.desc || null,
          due: c.due || null,
          closed: c.closed || false,
          url: c.url || null,
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
 * get_card - Get card details.
 */
async function handleGetCard(params, context) {
  const cardId = sanitizeString(params.cardId);

  if (!cardId) {
    return {
      result: 'Error: The "cardId" parameter is required for get_card.',
      metadata: { success: false, error: 'MISSING_CARD_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `trello/cards/${cardId}`,
      { params: {} },
      timeoutMs
    );

    const labelNames = Array.isArray(data.labels)
      ? data.labels.map((l) => l.name || l.id).join(', ')
      : 'None';

    const result = [
      `Card: ${data.name || 'Untitled'}`,
      `ID: ${data.id || cardId}`,
      `Description: ${data.desc || 'N/A'}`,
      `List ID: ${data.idList || 'N/A'}`,
      `Board ID: ${data.idBoard || 'N/A'}`,
      `Due: ${data.due || 'N/A'}`,
      `Labels: ${labelNames || 'None'}`,
      `Closed: ${data.closed ? 'Yes' : 'No'}`,
      `URL: ${data.url || 'N/A'}`,
    ].join('\n');

    return {
      result: redactSensitive(result),
      metadata: {
        success: true,
        action: 'get_card',
        layer: 'L1',
        cardId: data.id || cardId,
        name: data.name || null,
        desc: data.desc || null,
        idList: data.idList || null,
        idBoard: data.idBoard || null,
        due: data.due || null,
        labels: Array.isArray(data.labels) ? data.labels.map((l) => l.name || l.id) : [],
        closed: data.closed || false,
        url: data.url || null,
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
 * create_card - Create a new card in a list.
 */
async function handleCreateCard(params, context) {
  const listId = sanitizeString(params.listId);
  const name = sanitizeString(params.name);

  if (!listId) {
    return {
      result: 'Error: The "listId" parameter is required for create_card.',
      metadata: { success: false, error: 'MISSING_LIST_ID' },
    };
  }
  if (!name) {
    return {
      result: 'Error: The "name" parameter is required for create_card.',
      metadata: { success: false, error: 'MISSING_NAME' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const desc = sanitizeString(params.desc) || '';
  const due = sanitizeString(params.due) || '';
  const labels = Array.isArray(params.labels) ? params.labels.map((l) => sanitizeString(l)) : [];

  const body = { idList: listId, name };
  if (desc) body.desc = desc;
  if (due) body.due = due;
  if (labels.length > 0) body.idLabels = labels.join(',');

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      'trello/cards',
      {
        method: 'POST',
        params: body,
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Card created: ${data.name || name} (${data.id})\nURL: ${data.url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'create_card',
        layer: 'L1',
        cardId: data.id,
        name: data.name || name,
        listId,
        url: data.url || null,
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
 * update_card - Update an existing card.
 */
async function handleUpdateCard(params, context) {
  const cardId = sanitizeString(params.cardId);

  if (!cardId) {
    return {
      result: 'Error: The "cardId" parameter is required for update_card.',
      metadata: { success: false, error: 'MISSING_CARD_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const updateParams = {};

  const name = sanitizeString(params.name);
  const desc = sanitizeString(params.desc);
  const due = sanitizeString(params.due);
  if (name) updateParams.name = name;
  if (desc !== undefined && desc !== null) updateParams.desc = desc;
  if (due !== undefined && due !== null) updateParams.due = due;
  if (typeof params.closed === 'boolean') updateParams.closed = params.closed;
  if (Array.isArray(params.labels)) {
    updateParams.idLabels = params.labels.map((l) => sanitizeString(l)).join(',');
  }

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `trello/cards/${cardId}`,
      {
        method: 'PUT',
        params: updateParams,
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Card updated: ${data.name || 'Untitled'} (${data.id || cardId})\nURL: ${data.url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'update_card',
        layer: 'L1',
        cardId: data.id || cardId,
        name: data.name || null,
        url: data.url || null,
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
 * move_card - Move a card to another list.
 */
async function handleMoveCard(params, context) {
  const cardId = sanitizeString(params.cardId);
  const listId = sanitizeString(params.listId);

  if (!cardId) {
    return {
      result: 'Error: The "cardId" parameter is required for move_card.',
      metadata: { success: false, error: 'MISSING_CARD_ID' },
    };
  }
  if (!listId) {
    return {
      result: 'Error: The "listId" parameter is required for move_card.',
      metadata: { success: false, error: 'MISSING_LIST_ID' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `trello/cards/${cardId}`,
      {
        method: 'PUT',
        params: { idList: listId },
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Card ${data.name || cardId} moved to list ${listId}.\nURL: ${data.url || 'N/A'}`),
      metadata: {
        success: true,
        action: 'move_card',
        layer: 'L1',
        cardId: data.id || cardId,
        listId,
        name: data.name || null,
        url: data.url || null,
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
 * add_comment - Add a comment to a card.
 */
async function handleAddComment(params, context) {
  const cardId = sanitizeString(params.cardId);
  const text = sanitizeString(params.text);

  if (!cardId) {
    return {
      result: 'Error: The "cardId" parameter is required for add_comment.',
      metadata: { success: false, error: 'MISSING_CARD_ID' },
    };
  }
  if (!text) {
    return {
      result: 'Error: The "text" parameter is required for add_comment.',
      metadata: { success: false, error: 'MISSING_TEXT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await fetchWithTimeout(
      resolved.client,
      `trello/cards/${cardId}/actions/comments`,
      {
        method: 'POST',
        params: { text },
      },
      timeoutMs
    );

    return {
      result: redactSensitive(`Comment added to card ${cardId}.\nComment ID: ${data.id || 'N/A'}`),
      metadata: {
        success: true,
        action: 'add_comment',
        layer: 'L1',
        cardId,
        commentId: data.id || null,
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
 * Execute a Trello management operation.
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
      case 'list_boards':
        return await handleListBoards(params, context);
      case 'get_board':
        return await handleGetBoard(params, context);
      case 'list_lists':
        return await handleListLists(params, context);
      case 'list_cards':
        return await handleListCards(params, context);
      case 'get_card':
        return await handleGetCard(params, context);
      case 'create_card':
        return await handleCreateCard(params, context);
      case 'update_card':
        return await handleUpdateCard(params, context);
      case 'move_card':
        return await handleMoveCard(params, context);
      case 'add_comment':
        return await handleAddComment(params, context);
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
