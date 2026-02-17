/**
 * Google Calendar API Skill Handler (Layer 1)
 *
 * Interact with the Google Calendar API to list, create, update, delete,
 * and search calendar events, as well as list available calendars.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints or API URLs
 * - No direct API key access from skill code
 * - All external access goes through injected providerClient (preferred) or gatewayClient (fallback)
 * - Enforces timeout (default 15s, max 30s)
 * - Validates/sanitizes all inputs
 * - Redacts tokens/keys from all outputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'list_events',
  'get_event',
  'create_event',
  'update_event',
  'delete_event',
  'list_calendars',
  'search_events',
];

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const MAX_SUMMARY_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 8000;
const MAX_LOCATION_LENGTH = 500;
const MAX_QUERY_LENGTH = 200;

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const DEFAULT_CALENDAR_ID = 'primary';

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
    result: 'Error: Provider client required for Google Calendar API access. Configure an API key or platform adapter.',
    metadata: {
      success: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider client required for Google Calendar API access. Configure an API key or platform adapter.',
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
 * @param {Object} opts - Additional options (query params, body, etc.)
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
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate an ISO 8601 date/time string (basic check).
 *
 * @param {string} value
 * @returns {{ valid: boolean, error?: string }}
 */
function validateISO8601(value) {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Value must be a non-empty ISO 8601 date string.' };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Value must be a non-empty ISO 8601 date string.' };
  }
  // Basic ISO 8601 check: must start with a year-like pattern
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  if (!iso8601Pattern.test(trimmed)) {
    return { valid: false, error: `Invalid ISO 8601 format: "${trimmed}".` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate a basic email format.
 *
 * @param {string} email
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email must be a non-empty string.' };
  }
  const trimmed = email.trim();
  // Basic email pattern check
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(trimmed)) {
    return { valid: false, error: `Invalid email format: "${trimmed}".` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validate and clamp the "limit" parameter.
 *
 * @param {*} limit
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateLimit(limit) {
  if (limit === undefined || limit === null) {
    return { valid: true, value: DEFAULT_LIMIT };
  }
  const num = Number(limit);
  if (!Number.isInteger(num) || num < MIN_LIMIT) {
    return { valid: false, error: `The "limit" parameter must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}.` };
  }
  return { valid: true, value: Math.min(num, MAX_LIMIT) };
}

/**
 * Validate a string length constraint.
 *
 * @param {string} value
 * @param {string} fieldName
 * @param {number} maxLength
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function validateStringLength(value, fieldName, maxLength) {
  if (value === undefined || value === null) {
    return { valid: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { valid: false, error: `The "${fieldName}" parameter must be a string.` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `The "${fieldName}" parameter must not exceed ${maxLength} characters.` };
  }
  return { valid: true, value };
}

/**
 * Resolve the calendar ID, defaulting to "primary".
 *
 * @param {*} calendarId
 * @returns {string}
 */
function resolveCalendarId(calendarId) {
  if (calendarId && typeof calendarId === 'string' && calendarId.trim().length > 0) {
    return calendarId.trim();
  }
  return DEFAULT_CALENDAR_ID;
}

// ---------------------------------------------------------------------------
// Validate export (checks required params per action)
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
    case 'list_events': {
      if (params.timeMin !== undefined) {
        const v = validateISO8601(params.timeMin);
        if (!v.valid) return { valid: false, error: `Invalid timeMin: ${v.error}` };
      }
      if (params.timeMax !== undefined) {
        const v = validateISO8601(params.timeMax);
        if (!v.valid) return { valid: false, error: `Invalid timeMax: ${v.error}` };
      }
      return { valid: true };
    }
    case 'get_event': {
      if (!params.eventId || typeof params.eventId !== 'string' || params.eventId.trim().length === 0) {
        return { valid: false, error: 'The "eventId" parameter is required for get_event.' };
      }
      return { valid: true };
    }
    case 'create_event': {
      if (!params.summary || typeof params.summary !== 'string' || params.summary.trim().length === 0) {
        return { valid: false, error: 'The "summary" parameter is required for create_event.' };
      }
      if (!params.start) {
        return { valid: false, error: 'The "start" parameter is required for create_event.' };
      }
      if (!params.end) {
        return { valid: false, error: 'The "end" parameter is required for create_event.' };
      }
      const startV = validateISO8601(params.start);
      if (!startV.valid) return { valid: false, error: `Invalid start: ${startV.error}` };
      const endV = validateISO8601(params.end);
      if (!endV.valid) return { valid: false, error: `Invalid end: ${endV.error}` };
      return { valid: true };
    }
    case 'update_event': {
      if (!params.eventId || typeof params.eventId !== 'string' || params.eventId.trim().length === 0) {
        return { valid: false, error: 'The "eventId" parameter is required for update_event.' };
      }
      if (params.start !== undefined) {
        const v = validateISO8601(params.start);
        if (!v.valid) return { valid: false, error: `Invalid start: ${v.error}` };
      }
      if (params.end !== undefined) {
        const v = validateISO8601(params.end);
        if (!v.valid) return { valid: false, error: `Invalid end: ${v.error}` };
      }
      return { valid: true };
    }
    case 'delete_event': {
      if (!params.eventId || typeof params.eventId !== 'string' || params.eventId.trim().length === 0) {
        return { valid: false, error: 'The "eventId" parameter is required for delete_event.' };
      }
      return { valid: true };
    }
    case 'list_calendars': {
      return { valid: true };
    }
    case 'search_events': {
      if (!params.query || typeof params.query !== 'string' || params.query.trim().length === 0) {
        return { valid: false, error: 'The "query" parameter is required for search_events.' };
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
 * Handle list_events -- GET /calendars/{calendarId}/events?timeMin={timeMin}&timeMax={timeMax}&limit={limit}
 */
async function handleListEvents(params, context) {
  const calendarId = resolveCalendarId(params.calendarId);

  if (params.timeMin !== undefined) {
    const v = validateISO8601(params.timeMin);
    if (!v.valid) {
      return {
        result: `Error: Invalid timeMin: ${v.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  if (params.timeMax !== undefined) {
    const v = validateISO8601(params.timeMax);
    if (!v.valid) {
      return {
        result: `Error: Invalid timeMax: ${v.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  const limitValidation = validateLimit(params.limit);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = limitValidation.value;

  let path = `/calendars/${encodeURIComponent(calendarId)}/events?limit=${limit}`;
  if (params.timeMin) {
    path += `&timeMin=${encodeURIComponent(params.timeMin.trim())}`;
  }
  if (params.timeMax) {
    path += `&timeMax=${encodeURIComponent(params.timeMax.trim())}`;
  }

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      {},
      timeoutMs
    );

    const events = data?.events || data?.items || data?.data || [];
    const lines = [
      `Calendar: ${calendarId} (${events.length} events)`,
      '',
      ...events.map((e, i) => {
        const start = e.start?.dateTime || e.start || '';
        return `${i + 1}. ${e.summary || 'Untitled'} (${start})`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_events',
        layer: 'L1',
        calendarId,
        limit,
        eventCount: events.length,
        events,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle get_event -- GET /calendars/{calendarId}/events/{eventId}
 */
async function handleGetEvent(params, context) {
  if (!params.eventId || typeof params.eventId !== 'string' || params.eventId.trim().length === 0) {
    return {
      result: 'Error: The "eventId" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const eventId = params.eventId.trim();
  const calendarId = resolveCalendarId(params.calendarId);
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {},
      timeoutMs
    );

    const event = data?.event || data || {};
    const lines = [
      `Event: ${event.summary || eventId}`,
      event.start?.dateTime || event.start ? `Start: ${event.start?.dateTime || event.start}` : null,
      event.end?.dateTime || event.end ? `End: ${event.end?.dateTime || event.end}` : null,
      event.description ? `Description: ${event.description}` : null,
      event.location ? `Location: ${event.location}` : null,
      event.status ? `Status: ${event.status}` : null,
      event.attendees ? `Attendees: ${Array.isArray(event.attendees) ? event.attendees.map(a => a.email || a).join(', ') : event.attendees}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'get_event',
        layer: 'L1',
        calendarId,
        eventId,
        event,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle create_event -- POST /calendars/{calendarId}/events
 */
async function handleCreateEvent(params, context) {
  if (!params.summary || typeof params.summary !== 'string' || params.summary.trim().length === 0) {
    return {
      result: 'Error: The "summary" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const summaryValidation = validateStringLength(params.summary, 'summary', MAX_SUMMARY_LENGTH);
  if (!summaryValidation.valid) {
    return {
      result: `Error: ${summaryValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!params.start) {
    return {
      result: 'Error: The "start" parameter is required for create_event.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const startValidation = validateISO8601(params.start);
  if (!startValidation.valid) {
    return {
      result: `Error: Invalid start: ${startValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (!params.end) {
    return {
      result: 'Error: The "end" parameter is required for create_event.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const endValidation = validateISO8601(params.end);
  if (!endValidation.valid) {
    return {
      result: `Error: Invalid end: ${endValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  if (params.description !== undefined) {
    const descValidation = validateStringLength(params.description, 'description', MAX_DESCRIPTION_LENGTH);
    if (!descValidation.valid) {
      return {
        result: `Error: ${descValidation.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  if (params.location !== undefined) {
    const locValidation = validateStringLength(params.location, 'location', MAX_LOCATION_LENGTH);
    if (!locValidation.valid) {
      return {
        result: `Error: ${locValidation.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  if (params.attendees !== undefined) {
    if (!Array.isArray(params.attendees)) {
      return {
        result: 'Error: The "attendees" parameter must be an array of email strings.',
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
    for (const email of params.attendees) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        return {
          result: `Error: Invalid attendee email: ${emailValidation.error}`,
          metadata: { success: false, error: 'INVALID_INPUT' },
        };
      }
    }
  }

  const calendarId = resolveCalendarId(params.calendarId);
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const body = {
    summary: params.summary.trim(),
    start: startValidation.value,
    end: endValidation.value,
  };
  if (params.description !== undefined) body.description = params.description;
  if (params.location !== undefined) body.location = params.location;
  if (params.attendees !== undefined) body.attendees = params.attendees.map(e => e.trim());

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'POST',
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { body },
      timeoutMs
    );

    const event = data?.event || data || {};
    const lines = [
      `Event created: ${event.summary || params.summary}`,
      `Start: ${event.start?.dateTime || event.start || params.start}`,
      `End: ${event.end?.dateTime || event.end || params.end}`,
      event.id ? `ID: ${event.id}` : null,
      event.location || params.location ? `Location: ${event.location || params.location}` : null,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'create_event',
        layer: 'L1',
        calendarId,
        event,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle update_event -- PATCH /calendars/{calendarId}/events/{eventId}
 */
async function handleUpdateEvent(params, context) {
  if (!params.eventId || typeof params.eventId !== 'string' || params.eventId.trim().length === 0) {
    return {
      result: 'Error: The "eventId" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const eventId = params.eventId.trim();

  if (params.summary !== undefined) {
    const sv = validateStringLength(params.summary, 'summary', MAX_SUMMARY_LENGTH);
    if (!sv.valid) {
      return {
        result: `Error: ${sv.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  if (params.start !== undefined) {
    const v = validateISO8601(params.start);
    if (!v.valid) {
      return {
        result: `Error: Invalid start: ${v.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  if (params.end !== undefined) {
    const v = validateISO8601(params.end);
    if (!v.valid) {
      return {
        result: `Error: Invalid end: ${v.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  if (params.description !== undefined) {
    const dv = validateStringLength(params.description, 'description', MAX_DESCRIPTION_LENGTH);
    if (!dv.valid) {
      return {
        result: `Error: ${dv.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  if (params.location !== undefined) {
    const lv = validateStringLength(params.location, 'location', MAX_LOCATION_LENGTH);
    if (!lv.valid) {
      return {
        result: `Error: ${lv.error}`,
        metadata: { success: false, error: 'INVALID_INPUT' },
      };
    }
  }

  const calendarId = resolveCalendarId(params.calendarId);
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  const body = {};
  if (params.summary !== undefined) body.summary = params.summary;
  if (params.start !== undefined) body.start = params.start.trim();
  if (params.end !== undefined) body.end = params.end.trim();
  if (params.description !== undefined) body.description = params.description;
  if (params.location !== undefined) body.location = params.location;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'PATCH',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { body },
      timeoutMs
    );

    const event = data?.event || data || {};
    const lines = [
      `Event updated: ${event.summary || eventId}`,
      event.id ? `ID: ${event.id}` : `ID: ${eventId}`,
    ].filter(Boolean);

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'update_event',
        layer: 'L1',
        calendarId,
        eventId,
        event,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle delete_event -- DELETE /calendars/{calendarId}/events/{eventId}
 */
async function handleDeleteEvent(params, context) {
  if (!params.eventId || typeof params.eventId !== 'string' || params.eventId.trim().length === 0) {
    return {
      result: 'Error: The "eventId" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const eventId = params.eventId.trim();
  const calendarId = resolveCalendarId(params.calendarId);
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    await requestWithTimeout(
      resolved.client,
      'DELETE',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {},
      timeoutMs
    );

    return {
      result: `Event deleted: ${eventId}`,
      metadata: {
        success: true,
        action: 'delete_event',
        layer: 'L1',
        calendarId,
        eventId,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle list_calendars -- GET /calendars
 */
async function handleListCalendars(params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      '/calendars',
      {},
      timeoutMs
    );

    const calendars = data?.calendars || data?.items || data?.data || [];
    const lines = [
      `Available calendars (${calendars.length})`,
      '',
      ...calendars.map((c, i) => `${i + 1}. ${c.summary || c.name || 'Untitled'} (${c.id || 'no-id'})`),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'list_calendars',
        layer: 'L1',
        calendarCount: calendars.length,
        calendars,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

/**
 * Handle search_events -- GET /calendars/{calendarId}/events?q={query}&limit={limit}
 */
async function handleSearchEvents(params, context) {
  if (!params.query || typeof params.query !== 'string' || params.query.trim().length === 0) {
    return {
      result: 'Error: The "query" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const query = params.query.trim();

  const queryValidation = validateStringLength(query, 'query', MAX_QUERY_LENGTH);
  if (!queryValidation.valid) {
    return {
      result: `Error: ${queryValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const limitValidation = validateLimit(params.limit);
  if (!limitValidation.valid) {
    return {
      result: `Error: ${limitValidation.error}`,
      metadata: { success: false, error: 'INVALID_INPUT' },
    };
  }

  const calendarId = resolveCalendarId(params.calendarId);
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);
  const limit = limitValidation.value;

  const path = `/calendars/${encodeURIComponent(calendarId)}/events?q=${encodeURIComponent(query)}&limit=${limit}`;

  try {
    const data = await requestWithTimeout(
      resolved.client,
      'GET',
      path,
      {},
      timeoutMs
    );

    const events = data?.events || data?.items || data?.data || [];
    const lines = [
      `Search: "${query}" in ${calendarId} (${events.length} results)`,
      '',
      ...events.map((e, i) => {
        const start = e.start?.dateTime || e.start || '';
        return `${i + 1}. ${e.summary || 'Untitled'} (${start})`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true,
        action: 'search_events',
        layer: 'L1',
        calendarId,
        query,
        limit,
        eventCount: events.length,
        events,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'UPSTREAM_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Google Calendar API operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: list_events, get_event, create_event, update_event, delete_event, list_calendars, search_events
 * @param {string} [params.calendarId="primary"] - Calendar ID (defaults to "primary")
 * @param {string} [params.eventId] - Event ID (required for get_event, update_event, delete_event)
 * @param {string} [params.summary] - Event summary/title (required for create_event)
 * @param {string} [params.start] - Start time in ISO 8601 (required for create_event)
 * @param {string} [params.end] - End time in ISO 8601 (required for create_event)
 * @param {string} [params.description] - Event description
 * @param {string} [params.location] - Event location
 * @param {string[]} [params.attendees] - Array of attendee email strings
 * @param {string} [params.query] - Search query (required for search_events)
 * @param {string} [params.timeMin] - Minimum time filter (ISO 8601)
 * @param {string} [params.timeMax] - Maximum time filter (ISO 8601)
 * @param {number} [params.limit=25] - Number of results (1-100)
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
      case 'list_events':
        return await handleListEvents(params, context);
      case 'get_event':
        return await handleGetEvent(params, context);
      case 'create_event':
        return await handleCreateEvent(params, context);
      case 'update_event':
        return await handleUpdateEvent(params, context);
      case 'delete_event':
        return await handleDeleteEvent(params, context);
      case 'list_calendars':
        return await handleListCalendars(params, context);
      case 'search_events':
        return await handleSearchEvents(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: redactSensitive(`Error during ${action}: ${error.message}`),
      metadata: { success: false, error: 'UPSTREAM_ERROR', detail: error.message },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'google-calendar-api',
  version: '1.0.0',
  description: 'Google Calendar API interaction skill. List, create, update, delete, and search calendar events via provider client.',
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
  validateISO8601,
  validateEmail,
  validateLimit,
  validateStringLength,
  resolveCalendarId,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
  DEFAULT_CALENDAR_ID,
  MAX_SUMMARY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_QUERY_LENGTH,
};
