import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  validate,
  meta,
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
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .request() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .request() triggers an AbortError (timeout).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      request: async (_method, _path, _body, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample event response */
const sampleEvent = {
  event: {
    id: 'evt001',
    summary: 'Team Meeting',
    start: { dateTime: '2025-06-15T10:00:00Z' },
    end: { dateTime: '2025-06-15T11:00:00Z' },
    description: 'Weekly sync with the team.',
    location: 'Conference Room A',
    status: 'confirmed',
    attendees: [
      { email: 'alice@example.com' },
      { email: 'bob@example.com' },
    ],
  },
};

/** Sample events list response */
const sampleEventsList = {
  events: [
    { summary: 'Standup', start: { dateTime: '2025-06-15T09:00:00Z' } },
    { summary: 'Lunch', start: { dateTime: '2025-06-15T12:00:00Z' } },
    { summary: 'Review', start: { dateTime: '2025-06-15T15:00:00Z' } },
  ],
};

/** Sample calendars list response */
const sampleCalendars = {
  calendars: [
    { id: 'primary', summary: 'My Calendar' },
    { id: 'work', summary: 'Work Calendar' },
    { id: 'personal', summary: 'Personal' },
  ],
};

/** Sample search results */
const sampleSearchResults = {
  events: [
    { summary: 'Team Meeting', start: { dateTime: '2025-06-15T10:00:00Z' } },
    { summary: 'Team Lunch', start: { dateTime: '2025-06-16T12:00:00Z' } },
  ],
};

/** Sample created event response */
const sampleCreatedEvent = {
  event: {
    id: 'evt_new_001',
    summary: 'New Event',
    start: { dateTime: '2025-07-01T14:00:00Z' },
    end: { dateTime: '2025-07-01T15:00:00Z' },
  },
};

/** Sample updated event response */
const sampleUpdatedEvent = {
  event: {
    id: 'evt001',
    summary: 'Updated Meeting',
  },
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('google-calendar-api: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const result = await execute({ action: 'invalid' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('invalid'));
  });

  it('should reject missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject undefined params', async () => {
    const result = await execute(undefined, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should list valid actions in error message', async () => {
    const result = await execute({ action: 'bad' }, {});
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Error message should mention "${a}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('google-calendar-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail list_events without client', async () => {
    const result = await execute({ action: 'list_events' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail get_event without client', async () => {
    const result = await execute({ action: 'get_event', eventId: 'evt001' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_event without client', async () => {
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-06-15T10:00:00Z',
      end: '2025-06-15T11:00:00Z',
    }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_event without client', async () => {
    const result = await execute({ action: 'update_event', eventId: 'evt001' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail delete_event without client', async () => {
    const result = await execute({ action: 'delete_event', eventId: 'evt001' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_calendars without client', async () => {
    const result = await execute({ action: 'list_calendars' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_events without client', async () => {
    const result = await execute({ action: 'search_events', query: 'meeting' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. list_events action
// ---------------------------------------------------------------------------
describe('google-calendar-api: list_events', () => {
  beforeEach(() => {});

  it('should list events from default calendar', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({ action: 'list_events' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_events');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.calendarId, 'primary');
    assert.equal(result.metadata.limit, 25);
    assert.equal(result.metadata.eventCount, 3);
    assert.ok(result.result.includes('Standup'));
  });

  it('should use custom calendarId', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({ action: 'list_events', calendarId: 'work' }, ctx);
    assert.equal(result.metadata.calendarId, 'work');
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({ action: 'list_events', limit: 10 }, ctx);
    assert.equal(result.metadata.limit, 10);
  });

  it('should clamp limit to MAX_LIMIT', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({ action: 'list_events', limit: 500 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should reject limit of 0', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({ action: 'list_events', limit: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid timeMin', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({ action: 'list_events', timeMin: 'not-a-date' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid timeMax', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({ action: 'list_events', timeMax: 'bad' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept valid timeMin and timeMax', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({
      action: 'list_events',
      timeMin: '2025-06-01T00:00:00Z',
      timeMax: '2025-06-30T23:59:59Z',
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleEventsList);
    const result = await execute({ action: 'list_events' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleEventsList;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_events', limit: 10 }, ctx);
    assert.ok(calledPath.includes('/calendars/primary/events'));
    assert.ok(calledPath.includes('limit=10'));
  });

  it('should handle items field in response', async () => {
    const ctx = mockContext({ items: [{ summary: 'Alt Event', start: '2025-06-15' }] });
    const result = await execute({ action: 'list_events' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.eventCount, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. get_event action
// ---------------------------------------------------------------------------
describe('google-calendar-api: get_event', () => {
  beforeEach(() => {});

  it('should fetch an event by ID', async () => {
    const ctx = mockContext(sampleEvent);
    const result = await execute({ action: 'get_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_event');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.eventId, 'evt001');
    assert.ok(result.result.includes('Team Meeting'));
  });

  it('should include event details in result', async () => {
    const ctx = mockContext(sampleEvent);
    const result = await execute({ action: 'get_event', eventId: 'evt001' }, ctx);
    assert.ok(result.result.includes('Conference Room A'));
    assert.ok(result.result.includes('confirmed'));
  });

  it('should reject missing eventId', async () => {
    const ctx = mockContext(sampleEvent);
    const result = await execute({ action: 'get_event' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty eventId', async () => {
    const ctx = mockContext(sampleEvent);
    const result = await execute({ action: 'get_event', eventId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only eventId', async () => {
    const ctx = mockContext(sampleEvent);
    const result = await execute({ action: 'get_event', eventId: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should use default calendarId', async () => {
    const ctx = mockContext(sampleEvent);
    const result = await execute({ action: 'get_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.calendarId, 'primary');
  });

  it('should use custom calendarId', async () => {
    const ctx = mockContext(sampleEvent);
    const result = await execute({ action: 'get_event', eventId: 'evt001', calendarId: 'work' }, ctx);
    assert.equal(result.metadata.calendarId, 'work');
  });

  it('should call correct endpoint path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleEvent;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_event', eventId: 'evt999' }, ctx);
    assert.ok(calledPath.includes('/calendars/primary/events/evt999'));
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleEvent);
    const result = await execute({ action: 'get_event', eventId: 'evt001' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 5. create_event action
// ---------------------------------------------------------------------------
describe('google-calendar-api: create_event', () => {
  beforeEach(() => {});

  it('should create an event', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'New Event',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_event');
    assert.equal(result.metadata.layer, 'L1');
    assert.ok(result.result.includes('New Event'));
  });

  it('should reject missing summary', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty summary', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: '',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject summary exceeding max length', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'x'.repeat(501),
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing start', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid start', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: 'not-a-date',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing end', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid end', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: 'bad-date',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject description exceeding max length', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
      description: 'x'.repeat(8001),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject location exceeding max length', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
      location: 'x'.repeat(501),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-array attendees', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
      attendees: 'alice@example.com',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid attendee email', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
      attendees: ['not-an-email'],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept valid attendees', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
      attendees: ['alice@example.com', 'bob@example.com'],
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept optional description and location', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
      description: 'A test event.',
      location: 'Room 101',
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should use POST method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => {
          calledMethod = method;
          return sampleCreatedEvent;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(calledMethod, 'POST');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleCreatedEvent;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(calledPath, '/calendars/primary/events');
  });
});

// ---------------------------------------------------------------------------
// 6. update_event action
// ---------------------------------------------------------------------------
describe('google-calendar-api: update_event', () => {
  beforeEach(() => {});

  it('should update an event', async () => {
    const ctx = mockContext(sampleUpdatedEvent);
    const result = await execute({
      action: 'update_event',
      eventId: 'evt001',
      summary: 'Updated Meeting',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update_event');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.eventId, 'evt001');
    assert.ok(result.result.includes('Updated Meeting'));
  });

  it('should reject missing eventId', async () => {
    const ctx = mockContext(sampleUpdatedEvent);
    const result = await execute({ action: 'update_event' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty eventId', async () => {
    const ctx = mockContext(sampleUpdatedEvent);
    const result = await execute({ action: 'update_event', eventId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid start in update', async () => {
    const ctx = mockContext(sampleUpdatedEvent);
    const result = await execute({
      action: 'update_event',
      eventId: 'evt001',
      start: 'bad-date',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid end in update', async () => {
    const ctx = mockContext(sampleUpdatedEvent);
    const result = await execute({
      action: 'update_event',
      eventId: 'evt001',
      end: 'bad-date',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject summary exceeding max length in update', async () => {
    const ctx = mockContext(sampleUpdatedEvent);
    const result = await execute({
      action: 'update_event',
      eventId: 'evt001',
      summary: 'x'.repeat(501),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject description exceeding max length in update', async () => {
    const ctx = mockContext(sampleUpdatedEvent);
    const result = await execute({
      action: 'update_event',
      eventId: 'evt001',
      description: 'x'.repeat(8001),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject location exceeding max length in update', async () => {
    const ctx = mockContext(sampleUpdatedEvent);
    const result = await execute({
      action: 'update_event',
      eventId: 'evt001',
      location: 'x'.repeat(501),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should use PATCH method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => {
          calledMethod = method;
          return sampleUpdatedEvent;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'update_event', eventId: 'evt001', summary: 'Test' }, ctx);
    assert.equal(calledMethod, 'PATCH');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleUpdatedEvent;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'update_event', eventId: 'evt001' }, ctx);
    assert.ok(calledPath.includes('/calendars/primary/events/evt001'));
  });
});

// ---------------------------------------------------------------------------
// 7. delete_event action
// ---------------------------------------------------------------------------
describe('google-calendar-api: delete_event', () => {
  beforeEach(() => {});

  it('should delete an event', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'delete_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'delete_event');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.eventId, 'evt001');
    assert.ok(result.result.includes('evt001'));
  });

  it('should reject missing eventId', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'delete_event' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty eventId', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'delete_event', eventId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should use DELETE method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => {
          calledMethod = method;
          return {};
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'delete_event', eventId: 'evt001' }, ctx);
    assert.equal(calledMethod, 'DELETE');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return {};
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'delete_event', eventId: 'evt999', calendarId: 'work' }, ctx);
    assert.ok(calledPath.includes('/calendars/work/events/evt999'));
  });
});

// ---------------------------------------------------------------------------
// 8. list_calendars action
// ---------------------------------------------------------------------------
describe('google-calendar-api: list_calendars', () => {
  beforeEach(() => {});

  it('should list calendars', async () => {
    const ctx = mockContext(sampleCalendars);
    const result = await execute({ action: 'list_calendars' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_calendars');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.calendarCount, 3);
    assert.ok(result.result.includes('My Calendar'));
    assert.ok(result.result.includes('Work Calendar'));
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleCalendars;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_calendars' }, ctx);
    assert.equal(calledPath, '/calendars');
  });

  it('should use GET method', async () => {
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => {
          calledMethod = method;
          return sampleCalendars;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_calendars' }, ctx);
    assert.equal(calledMethod, 'GET');
  });

  it('should handle empty calendars list', async () => {
    const ctx = mockContext({ calendars: [] });
    const result = await execute({ action: 'list_calendars' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.calendarCount, 0);
  });

  it('should handle items field in response', async () => {
    const ctx = mockContext({ items: [{ id: 'cal1', summary: 'Cal One' }] });
    const result = await execute({ action: 'list_calendars' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.calendarCount, 1);
  });
});

// ---------------------------------------------------------------------------
// 9. search_events action
// ---------------------------------------------------------------------------
describe('google-calendar-api: search_events', () => {
  beforeEach(() => {});

  it('should search events', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_events', query: 'Team' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_events');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'Team');
    assert.equal(result.metadata.eventCount, 2);
    assert.ok(result.result.includes('Team Meeting'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_events' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_events', query: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_events', query: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject query exceeding max length', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_events', query: 'x'.repeat(201) }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_events', query: 'test', limit: 50 }, ctx);
    assert.equal(result.metadata.limit, 50);
  });

  it('should encode query in path', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleSearchResults;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search_events', query: 'hello world' }, ctx);
    assert.ok(calledPath.includes('hello%20world'));
  });

  it('should use default calendarId', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search_events', query: 'test' }, ctx);
    assert.equal(result.metadata.calendarId, 'primary');
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('google-calendar-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on list_events abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_events' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_event abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on create_event abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on update_event abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'update_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on delete_event abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'delete_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_calendars abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_calendars' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search_events abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search_events', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('google-calendar-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on list_events failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_events' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_event failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'get_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on create_event failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on update_event failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'update_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on delete_event failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({ action: 'delete_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_calendars failure', async () => {
    const ctx = mockContextError(new Error('Not found'));
    const result = await execute({ action: 'list_calendars' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search_events failure', async () => {
    const ctx = mockContextError(new Error('Service unavailable'));
    const result = await execute({ action: 'search_events', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_events' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('google-calendar-api: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient over gatewayClient', () => {
    const result = getClient({
      providerClient: { request: () => {} },
      gatewayClient: { request: () => {} },
    });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });

  it('should return null for null context', () => {
    assert.equal(getClient(null), null);
  });
});

// ---------------------------------------------------------------------------
// 13. redactSensitive
// ---------------------------------------------------------------------------
describe('google-calendar-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: test_placeholder_value data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_placeholder_value'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: placeholder_jwt_value.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('placeholder_jwt_value'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: Bearer_placeholder123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Bearer_placeholder123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact password patterns', () => {
    const input = 'password=placeholder_pass_123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('placeholder_pass_123'));
  });

  it('should not alter clean strings', () => {
    const input = 'Listed 25 events from primary calendar';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 14. validateISO8601 helper
// ---------------------------------------------------------------------------
describe('google-calendar-api: validateISO8601', () => {
  beforeEach(() => {});

  it('should accept full ISO 8601 date-time with Z', () => {
    const result = validateISO8601('2025-06-15T10:00:00Z');
    assert.equal(result.valid, true);
    assert.equal(result.value, '2025-06-15T10:00:00Z');
  });

  it('should accept ISO 8601 date-time with offset', () => {
    const result = validateISO8601('2025-06-15T10:00:00+05:30');
    assert.equal(result.valid, true);
  });

  it('should accept date-only format', () => {
    const result = validateISO8601('2025-06-15');
    assert.equal(result.valid, true);
  });

  it('should accept date-time without seconds', () => {
    const result = validateISO8601('2025-06-15T10:00Z');
    assert.equal(result.valid, true);
  });

  it('should reject non-date string', () => {
    const result = validateISO8601('not-a-date');
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject empty string', () => {
    const result = validateISO8601('');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateISO8601(null);
    assert.equal(result.valid, false);
  });

  it('should reject undefined', () => {
    const result = validateISO8601(undefined);
    assert.equal(result.valid, false);
  });

  it('should trim whitespace', () => {
    const result = validateISO8601('  2025-06-15T10:00:00Z  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, '2025-06-15T10:00:00Z');
  });

  it('should reject whitespace-only string', () => {
    const result = validateISO8601('   ');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 15. validateEmail helper
// ---------------------------------------------------------------------------
describe('google-calendar-api: validateEmail', () => {
  beforeEach(() => {});

  it('should accept valid email', () => {
    const result = validateEmail('user@example.com');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'user@example.com');
  });

  it('should accept email with subdomain', () => {
    const result = validateEmail('user@mail.example.com');
    assert.equal(result.valid, true);
  });

  it('should reject missing @', () => {
    const result = validateEmail('userexample.com');
    assert.equal(result.valid, false);
  });

  it('should reject missing domain', () => {
    const result = validateEmail('user@');
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateEmail('');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateEmail(null);
    assert.equal(result.valid, false);
  });

  it('should reject non-string', () => {
    const result = validateEmail(123);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateLimit helper
// ---------------------------------------------------------------------------
describe('google-calendar-api: validateLimit', () => {
  beforeEach(() => {});

  it('should return default when limit is undefined', () => {
    const result = validateLimit(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should return default when limit is null', () => {
    const result = validateLimit(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should accept valid limit', () => {
    const result = validateLimit(50);
    assert.equal(result.valid, true);
    assert.equal(result.value, 50);
  });

  it('should clamp limit to MAX_LIMIT', () => {
    const result = validateLimit(200);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_LIMIT);
  });

  it('should accept MIN_LIMIT', () => {
    const result = validateLimit(MIN_LIMIT);
    assert.equal(result.valid, true);
    assert.equal(result.value, MIN_LIMIT);
  });

  it('should reject 0', () => {
    const result = validateLimit(0);
    assert.equal(result.valid, false);
  });

  it('should reject negative number', () => {
    const result = validateLimit(-5);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateLimit(1.5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validateStringLength helper
// ---------------------------------------------------------------------------
describe('google-calendar-api: validateStringLength', () => {
  beforeEach(() => {});

  it('should accept string within limit', () => {
    const result = validateStringLength('hello', 'test', 10);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'hello');
  });

  it('should reject string exceeding limit', () => {
    const result = validateStringLength('hello world', 'test', 5);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('test'));
  });

  it('should accept exact limit length', () => {
    const result = validateStringLength('12345', 'test', 5);
    assert.equal(result.valid, true);
  });

  it('should return undefined value for undefined input', () => {
    const result = validateStringLength(undefined, 'test', 10);
    assert.equal(result.valid, true);
    assert.equal(result.value, undefined);
  });

  it('should return undefined value for null input', () => {
    const result = validateStringLength(null, 'test', 10);
    assert.equal(result.valid, true);
    assert.equal(result.value, undefined);
  });

  it('should reject non-string input', () => {
    const result = validateStringLength(123, 'test', 10);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('string'));
  });
});

// ---------------------------------------------------------------------------
// 18. resolveCalendarId helper
// ---------------------------------------------------------------------------
describe('google-calendar-api: resolveCalendarId', () => {
  beforeEach(() => {});

  it('should return provided calendarId', () => {
    assert.equal(resolveCalendarId('work'), 'work');
  });

  it('should return default for undefined', () => {
    assert.equal(resolveCalendarId(undefined), DEFAULT_CALENDAR_ID);
  });

  it('should return default for null', () => {
    assert.equal(resolveCalendarId(null), DEFAULT_CALENDAR_ID);
  });

  it('should return default for empty string', () => {
    assert.equal(resolveCalendarId(''), DEFAULT_CALENDAR_ID);
  });

  it('should return default for whitespace-only', () => {
    assert.equal(resolveCalendarId('   '), DEFAULT_CALENDAR_ID);
  });

  it('should trim whitespace', () => {
    assert.equal(resolveCalendarId('  work  '), 'work');
  });

  it('should return default for non-string', () => {
    assert.equal(resolveCalendarId(123), DEFAULT_CALENDAR_ID);
  });
});

// ---------------------------------------------------------------------------
// 19. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('google-calendar-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should cap at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should ignore non-positive timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
    assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore non-number timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 20. validate() export
// ---------------------------------------------------------------------------
describe('google-calendar-api: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('bad'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate list_events accepts no required params', () => {
    assert.equal(validate({ action: 'list_events' }).valid, true);
  });

  it('should validate list_events rejects invalid timeMin', () => {
    assert.equal(validate({ action: 'list_events', timeMin: 'bad' }).valid, false);
  });

  it('should validate list_events rejects invalid timeMax', () => {
    assert.equal(validate({ action: 'list_events', timeMax: 'bad' }).valid, false);
  });

  it('should validate get_event requires eventId', () => {
    assert.equal(validate({ action: 'get_event' }).valid, false);
    assert.equal(validate({ action: 'get_event', eventId: '' }).valid, false);
    assert.equal(validate({ action: 'get_event', eventId: 'evt001' }).valid, true);
  });

  it('should validate create_event requires summary, start, end', () => {
    assert.equal(validate({ action: 'create_event' }).valid, false);
    assert.equal(validate({ action: 'create_event', summary: 'Test' }).valid, false);
    assert.equal(validate({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
    }).valid, false);
    assert.equal(validate({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }).valid, true);
  });

  it('should validate create_event rejects invalid start', () => {
    assert.equal(validate({
      action: 'create_event',
      summary: 'Test',
      start: 'bad',
      end: '2025-07-01T15:00:00Z',
    }).valid, false);
  });

  it('should validate create_event rejects invalid end', () => {
    assert.equal(validate({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: 'bad',
    }).valid, false);
  });

  it('should validate update_event requires eventId', () => {
    assert.equal(validate({ action: 'update_event' }).valid, false);
    assert.equal(validate({ action: 'update_event', eventId: '' }).valid, false);
    assert.equal(validate({ action: 'update_event', eventId: 'evt001' }).valid, true);
  });

  it('should validate update_event rejects invalid start', () => {
    assert.equal(validate({ action: 'update_event', eventId: 'evt001', start: 'bad' }).valid, false);
  });

  it('should validate update_event rejects invalid end', () => {
    assert.equal(validate({ action: 'update_event', eventId: 'evt001', end: 'bad' }).valid, false);
  });

  it('should validate delete_event requires eventId', () => {
    assert.equal(validate({ action: 'delete_event' }).valid, false);
    assert.equal(validate({ action: 'delete_event', eventId: 'evt001' }).valid, true);
  });

  it('should validate list_calendars requires nothing', () => {
    assert.equal(validate({ action: 'list_calendars' }).valid, true);
  });

  it('should validate search_events requires query', () => {
    assert.equal(validate({ action: 'search_events' }).valid, false);
    assert.equal(validate({ action: 'search_events', query: '' }).valid, false);
    assert.equal(validate({ action: 'search_events', query: 'meeting' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 21. meta export
// ---------------------------------------------------------------------------
describe('google-calendar-api: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'google-calendar-api');
  });

  it('should have version', () => {
    assert.ok(meta.version);
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('Calendar'));
  });

  it('should list all 7 actions', () => {
    assert.equal(meta.actions.length, 7);
    assert.ok(meta.actions.includes('list_events'));
    assert.ok(meta.actions.includes('get_event'));
    assert.ok(meta.actions.includes('create_event'));
    assert.ok(meta.actions.includes('update_event'));
    assert.ok(meta.actions.includes('delete_event'));
    assert.ok(meta.actions.includes('list_calendars'));
    assert.ok(meta.actions.includes('search_events'));
  });
});

// ---------------------------------------------------------------------------
// 22. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('google-calendar-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleEvent;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_event', eventId: 'evt001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('/calendars/primary/events/evt001'));
  });
});

// ---------------------------------------------------------------------------
// 23. Input sanitization edge cases
// ---------------------------------------------------------------------------
describe('google-calendar-api: input sanitization edge cases', () => {
  beforeEach(() => {});

  it('should trim eventId whitespace', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleEvent;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_event', eventId: '  evt001  ' }, ctx);
    assert.ok(calledPath.includes('evt001'));
    assert.ok(!calledPath.includes('  evt001  '));
  });

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('token: test_placeholder_credential'));
    const result = await execute({ action: 'list_events' }, ctx);
    assert.ok(!result.result.includes('test_placeholder_credential'));
  });

  it('should accept summary at exact max length', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'x'.repeat(500),
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept description at exact max length', async () => {
    const ctx = mockContext(sampleCreatedEvent);
    const result = await execute({
      action: 'create_event',
      summary: 'Test',
      start: '2025-07-01T14:00:00Z',
      end: '2025-07-01T15:00:00Z',
      description: 'x'.repeat(8000),
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept query at exact max length', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({
      action: 'search_events',
      query: 'x'.repeat(200),
    }, ctx);
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 24. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('google-calendar-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 25. Constants verification
// ---------------------------------------------------------------------------
describe('google-calendar-api: constants', () => {
  beforeEach(() => {});

  it('should have correct DEFAULT_TIMEOUT_MS', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 15000);
  });

  it('should have correct MAX_TIMEOUT_MS', () => {
    assert.equal(MAX_TIMEOUT_MS, 30000);
  });

  it('should have correct DEFAULT_LIMIT', () => {
    assert.equal(DEFAULT_LIMIT, 25);
  });

  it('should have correct MIN_LIMIT', () => {
    assert.equal(MIN_LIMIT, 1);
  });

  it('should have correct MAX_LIMIT', () => {
    assert.equal(MAX_LIMIT, 100);
  });

  it('should have correct DEFAULT_CALENDAR_ID', () => {
    assert.equal(DEFAULT_CALENDAR_ID, 'primary');
  });

  it('should have correct MAX_SUMMARY_LENGTH', () => {
    assert.equal(MAX_SUMMARY_LENGTH, 500);
  });

  it('should have correct MAX_DESCRIPTION_LENGTH', () => {
    assert.equal(MAX_DESCRIPTION_LENGTH, 8000);
  });

  it('should have correct MAX_LOCATION_LENGTH', () => {
    assert.equal(MAX_LOCATION_LENGTH, 500);
  });

  it('should have correct MAX_QUERY_LENGTH', () => {
    assert.equal(MAX_QUERY_LENGTH, 200);
  });

  it('should have 7 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 7);
  });
});
