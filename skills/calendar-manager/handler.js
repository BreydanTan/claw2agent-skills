/**
 * Calendar Manager Skill Handler
 *
 * Manage calendar events with full CRUD operations, keyword search,
 * and upcoming-event queries. Uses an in-memory Map store -- no
 * external dependencies required.
 *
 * SECURITY NOTES:
 * - All string inputs are sanitized to prevent XSS.
 * - Date strings are validated before use.
 * - No arbitrary code execution paths exist.
 */

// ---------------------------------------------------------------------------
// In-memory event store (module-level so it persists across calls)
// ---------------------------------------------------------------------------

const eventStore = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 string using only built-in Math.random.
 * Not cryptographically secure, but sufficient for in-memory IDs.
 *
 * @returns {string}
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Sanitize a string to prevent XSS / injection.
 * Strips HTML-significant characters.
 *
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate that a string is a parsable ISO 8601 date.
 *
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

/**
 * Return all events from the store as an array, sorted by startTime ascending.
 *
 * @returns {Array<Object>}
 */
function allEventsSorted() {
  return [...eventStore.values()].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

/**
 * Format a single event into a human-readable string.
 *
 * @param {Object} event
 * @returns {string}
 */
function formatEvent(event) {
  const parts = [
    `  ID: ${event.id}`,
    `  Title: ${event.title}`,
    `  Start: ${event.startTime}`,
  ];
  if (event.endTime) parts.push(`  End: ${event.endTime}`);
  if (event.description) parts.push(`  Description: ${event.description}`);
  if (event.location) parts.push(`  Location: ${event.location}`);
  if (event.attendees && event.attendees.length > 0) {
    parts.push(`  Attendees: ${event.attendees.join(', ')}`);
  }
  if (event.reminders && event.reminders.length > 0) {
    parts.push(`  Reminders: ${event.reminders.map((m) => `${m}min`).join(', ')}`);
  }
  if (event.recurring) parts.push(`  Recurring: ${event.recurring}`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

/**
 * Create a new calendar event.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleCreate(params) {
  const { title, startTime, endTime, description, location, attendees, reminders, recurring } = params;

  // Required fields
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return {
      result: 'Error: The "title" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'MISSING_TITLE' },
    };
  }

  if (!startTime) {
    return {
      result: 'Error: The "startTime" parameter is required.',
      metadata: { success: false, error: 'MISSING_START_TIME' },
    };
  }

  if (!isValidDate(startTime)) {
    return {
      result: 'Error: The "startTime" parameter is not a valid date format.',
      metadata: { success: false, error: 'INVALID_DATE' },
    };
  }

  if (endTime && !isValidDate(endTime)) {
    return {
      result: 'Error: The "endTime" parameter is not a valid date format.',
      metadata: { success: false, error: 'INVALID_DATE' },
    };
  }

  if (endTime && new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    return {
      result: 'Error: The "endTime" must be after "startTime".',
      metadata: { success: false, error: 'INVALID_DATE_RANGE' },
    };
  }

  const validRecurring = ['daily', 'weekly', 'monthly', 'yearly'];
  if (recurring && !validRecurring.includes(recurring)) {
    return {
      result: `Error: Invalid recurring value "${recurring}". Must be one of: ${validRecurring.join(', ')}`,
      metadata: { success: false, error: 'INVALID_RECURRING' },
    };
  }

  const id = generateId();
  const event = {
    id,
    title: sanitize(title.trim()),
    startTime,
    endTime: endTime || null,
    description: description ? sanitize(description.trim()) : null,
    location: location ? sanitize(location.trim()) : null,
    attendees: Array.isArray(attendees) ? attendees.map((a) => sanitize(String(a).trim())) : [],
    reminders: Array.isArray(reminders) ? reminders.filter((r) => typeof r === 'number' && r >= 0) : [],
    recurring: recurring || null,
    createdAt: new Date().toISOString(),
  };

  eventStore.set(id, event);

  return {
    result: `Event created successfully.\n\n${formatEvent(event)}`,
    metadata: {
      success: true,
      action: 'create',
      eventId: id,
      event,
    },
  };
}

/**
 * List all events, optionally filtered by a date range.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleList(params) {
  const { startRange, endRange } = params;

  if (startRange && !isValidDate(startRange)) {
    return {
      result: 'Error: The "startRange" parameter is not a valid date format.',
      metadata: { success: false, error: 'INVALID_DATE' },
    };
  }
  if (endRange && !isValidDate(endRange)) {
    return {
      result: 'Error: The "endRange" parameter is not a valid date format.',
      metadata: { success: false, error: 'INVALID_DATE' },
    };
  }

  let events = allEventsSorted();

  if (startRange) {
    const start = new Date(startRange).getTime();
    events = events.filter((e) => new Date(e.startTime).getTime() >= start);
  }
  if (endRange) {
    const end = new Date(endRange).getTime();
    events = events.filter((e) => new Date(e.startTime).getTime() <= end);
  }

  if (events.length === 0) {
    return {
      result: 'No events found.',
      metadata: { success: true, action: 'list', count: 0, events: [] },
    };
  }

  const formatted = events.map((e, i) => `${i + 1}.\n${formatEvent(e)}`).join('\n\n');

  return {
    result: `Found ${events.length} event(s):\n\n${formatted}`,
    metadata: { success: true, action: 'list', count: events.length, events },
  };
}

/**
 * Update an existing event by ID (partial update).
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleUpdate(params) {
  const { id, title, startTime, endTime, description, location, attendees, reminders, recurring } = params;

  if (!id || typeof id !== 'string') {
    return {
      result: 'Error: The "id" parameter is required for update.',
      metadata: { success: false, error: 'MISSING_ID' },
    };
  }

  const existing = eventStore.get(id);
  if (!existing) {
    return {
      result: `Error: No event found with id "${id}".`,
      metadata: { success: false, error: 'EVENT_NOT_FOUND' },
    };
  }

  // Validate dates if provided
  if (startTime !== undefined && startTime !== null && !isValidDate(startTime)) {
    return {
      result: 'Error: The "startTime" parameter is not a valid date format.',
      metadata: { success: false, error: 'INVALID_DATE' },
    };
  }
  if (endTime !== undefined && endTime !== null && !isValidDate(endTime)) {
    return {
      result: 'Error: The "endTime" parameter is not a valid date format.',
      metadata: { success: false, error: 'INVALID_DATE' },
    };
  }

  const validRecurring = ['daily', 'weekly', 'monthly', 'yearly'];
  if (recurring && !validRecurring.includes(recurring)) {
    return {
      result: `Error: Invalid recurring value "${recurring}". Must be one of: ${validRecurring.join(', ')}`,
      metadata: { success: false, error: 'INVALID_RECURRING' },
    };
  }

  // Apply partial updates
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return {
        result: 'Error: The "title" parameter must be a non-empty string.',
        metadata: { success: false, error: 'INVALID_TITLE' },
      };
    }
    existing.title = sanitize(title.trim());
  }
  if (startTime !== undefined && startTime !== null) {
    existing.startTime = startTime;
  }
  if (endTime !== undefined && endTime !== null) {
    existing.endTime = endTime;
  }
  if (description !== undefined) {
    existing.description = description ? sanitize(description.trim()) : null;
  }
  if (location !== undefined) {
    existing.location = location ? sanitize(location.trim()) : null;
  }
  if (attendees !== undefined) {
    existing.attendees = Array.isArray(attendees) ? attendees.map((a) => sanitize(String(a).trim())) : [];
  }
  if (reminders !== undefined) {
    existing.reminders = Array.isArray(reminders) ? reminders.filter((r) => typeof r === 'number' && r >= 0) : [];
  }
  if (recurring !== undefined) {
    existing.recurring = recurring || null;
  }

  existing.updatedAt = new Date().toISOString();
  eventStore.set(id, existing);

  return {
    result: `Event updated successfully.\n\n${formatEvent(existing)}`,
    metadata: {
      success: true,
      action: 'update',
      eventId: id,
      event: existing,
    },
  };
}

/**
 * Delete an event by ID.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleDelete(params) {
  const { id } = params;

  if (!id || typeof id !== 'string') {
    return {
      result: 'Error: The "id" parameter is required for delete.',
      metadata: { success: false, error: 'MISSING_ID' },
    };
  }

  const existing = eventStore.get(id);
  if (!existing) {
    return {
      result: `Error: No event found with id "${id}".`,
      metadata: { success: false, error: 'EVENT_NOT_FOUND' },
    };
  }

  eventStore.delete(id);

  return {
    result: `Event "${existing.title}" (${id}) deleted successfully.`,
    metadata: {
      success: true,
      action: 'delete',
      eventId: id,
      deletedEvent: existing,
    },
  };
}

/**
 * Search events by keyword in title or description.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleSearch(params) {
  const { query } = params;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      result: 'Error: The "query" parameter is required and must be a non-empty string.',
      metadata: { success: false, error: 'MISSING_QUERY' },
    };
  }

  const keyword = query.trim().toLowerCase();
  const events = allEventsSorted().filter((e) => {
    const titleMatch = e.title.toLowerCase().includes(keyword);
    const descMatch = e.description ? e.description.toLowerCase().includes(keyword) : false;
    return titleMatch || descMatch;
  });

  if (events.length === 0) {
    return {
      result: `No events found matching "${sanitize(query.trim())}".`,
      metadata: { success: true, action: 'search', query: query.trim(), count: 0, events: [] },
    };
  }

  const formatted = events.map((e, i) => `${i + 1}.\n${formatEvent(e)}`).join('\n\n');

  return {
    result: `Found ${events.length} event(s) matching "${sanitize(query.trim())}":\n\n${formatted}`,
    metadata: { success: true, action: 'search', query: query.trim(), count: events.length, events },
  };
}

/**
 * Get events within the next N hours.
 *
 * @param {Object} params
 * @returns {{result: string, metadata: object}}
 */
function handleUpcoming(params) {
  const hours = typeof params.hours === 'number' && params.hours > 0 ? params.hours : 24;

  const now = Date.now();
  const cutoff = now + hours * 60 * 60 * 1000;

  const events = allEventsSorted().filter((e) => {
    const start = new Date(e.startTime).getTime();
    return start >= now && start <= cutoff;
  });

  if (events.length === 0) {
    return {
      result: `No upcoming events in the next ${hours} hour(s).`,
      metadata: { success: true, action: 'upcoming', hours, count: 0, events: [] },
    };
  }

  const formatted = events.map((e, i) => `${i + 1}.\n${formatEvent(e)}`).join('\n\n');

  return {
    result: `${events.length} upcoming event(s) in the next ${hours} hour(s):\n\n${formatted}`,
    metadata: { success: true, action: 'upcoming', hours, count: events.length, events },
  };
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

/**
 * Clear all events from the store. Exposed for test isolation.
 */
export function _clearStore() {
  eventStore.clear();
}

/**
 * Get the current size of the event store. Exposed for test assertions.
 *
 * @returns {number}
 */
export function _storeSize() {
  return eventStore.size;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute a calendar management operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: create, list, update, delete, search, upcoming
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  const validActions = ['create', 'list', 'update', 'delete', 'search', 'upcoming'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  try {
    switch (action) {
      case 'create':
        return handleCreate(params);
      case 'list':
        return handleList(params);
      case 'update':
        return handleUpdate(params);
      case 'delete':
        return handleDelete(params);
      case 'search':
        return handleSearch(params);
      case 'upcoming':
        return handleUpcoming(params);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: { success: false, error: 'INVALID_ACTION' },
        };
    }
  } catch (error) {
    return {
      result: `Error during ${action} operation: ${error.message}`,
      metadata: { success: false, error: 'OPERATION_FAILED', detail: error.message },
    };
  }
}
