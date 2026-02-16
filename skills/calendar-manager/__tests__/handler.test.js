import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, _clearStore, _storeSize } from '../handler.js';

// ---------------------------------------------------------------------------
// Reset store before every test so tests are isolated
// ---------------------------------------------------------------------------

beforeEach(() => {
  _clearStore();
});

// ---------------------------------------------------------------------------
// Helper: create a default event and return its id
// ---------------------------------------------------------------------------

async function createEvent(overrides = {}) {
  const params = {
    action: 'create',
    title: 'Test Event',
    startTime: '2025-06-15T10:00:00Z',
    ...overrides,
  };
  return execute(params, {});
}

// ---------------------------------------------------------------------------
// create action
// ---------------------------------------------------------------------------

describe('calendar-manager: create', () => {
  beforeEach(() => _clearStore());

  it('should create an event with required fields only', async () => {
    const result = await execute(
      { action: 'create', title: 'Standup', startTime: '2025-06-01T09:00:00Z' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create');
    assert.ok(result.metadata.eventId);
    assert.equal(result.metadata.event.title, 'Standup');
    assert.equal(result.metadata.event.startTime, '2025-06-01T09:00:00Z');
    assert.equal(result.metadata.event.endTime, null);
    assert.equal(_storeSize(), 1);
  });

  it('should create an event with all optional fields', async () => {
    const result = await createEvent({
      title: 'Full Event',
      endTime: '2025-06-15T11:00:00Z',
      description: 'A big meeting',
      location: 'Room 42',
      attendees: ['alice', 'bob'],
      reminders: [15, 5],
      recurring: 'weekly',
    });
    assert.equal(result.metadata.success, true);
    const evt = result.metadata.event;
    assert.equal(evt.description, 'A big meeting');
    assert.equal(evt.location, 'Room 42');
    assert.deepEqual(evt.attendees, ['alice', 'bob']);
    assert.deepEqual(evt.reminders, [15, 5]);
    assert.equal(evt.recurring, 'weekly');
  });

  it('should auto-generate a unique id for each event', async () => {
    const r1 = await createEvent({ title: 'Event A' });
    const r2 = await createEvent({ title: 'Event B' });
    assert.notEqual(r1.metadata.eventId, r2.metadata.eventId);
    assert.equal(_storeSize(), 2);
  });

  it('should return error when title is missing', async () => {
    const result = await execute(
      { action: 'create', startTime: '2025-06-01T09:00:00Z' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TITLE');
  });

  it('should return error when startTime is missing', async () => {
    const result = await execute({ action: 'create', title: 'No Time' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_START_TIME');
  });

  it('should return error for invalid startTime', async () => {
    const result = await execute(
      { action: 'create', title: 'Bad Date', startTime: 'not-a-date' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_DATE');
  });

  it('should return error for invalid endTime', async () => {
    const result = await execute(
      { action: 'create', title: 'Bad End', startTime: '2025-06-01T09:00:00Z', endTime: 'nope' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_DATE');
  });

  it('should return error when endTime is before startTime', async () => {
    const result = await execute(
      {
        action: 'create',
        title: 'Backward',
        startTime: '2025-06-15T12:00:00Z',
        endTime: '2025-06-15T10:00:00Z',
      },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_DATE_RANGE');
  });

  it('should return error for invalid recurring value', async () => {
    const result = await execute(
      { action: 'create', title: 'Recur', startTime: '2025-06-01T09:00:00Z', recurring: 'biweekly' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_RECURRING');
  });

  it('should sanitize XSS in title and description', async () => {
    const result = await execute(
      {
        action: 'create',
        title: '<script>alert("xss")</script>',
        startTime: '2025-06-01T09:00:00Z',
        description: '<img onerror=alert(1)>',
      },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.ok(!result.metadata.event.title.includes('<script>'));
    assert.ok(result.metadata.event.title.includes('&lt;script&gt;'));
    assert.ok(!result.metadata.event.description.includes('<img'));
    assert.ok(result.metadata.event.description.includes('&lt;img'));
  });
});

// ---------------------------------------------------------------------------
// list action
// ---------------------------------------------------------------------------

describe('calendar-manager: list', () => {
  beforeEach(() => _clearStore());

  it('should return empty list when no events exist', async () => {
    const result = await execute({ action: 'list' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.deepEqual(result.metadata.events, []);
    assert.ok(result.result.includes('No events found'));
  });

  it('should list all events sorted by startTime', async () => {
    await createEvent({ title: 'Later', startTime: '2025-06-20T10:00:00Z' });
    await createEvent({ title: 'Earlier', startTime: '2025-06-10T10:00:00Z' });

    const result = await execute({ action: 'list' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.events[0].title, 'Earlier');
    assert.equal(result.metadata.events[1].title, 'Later');
  });

  it('should filter events by date range', async () => {
    await createEvent({ title: 'June 5', startTime: '2025-06-05T10:00:00Z' });
    await createEvent({ title: 'June 15', startTime: '2025-06-15T10:00:00Z' });
    await createEvent({ title: 'June 25', startTime: '2025-06-25T10:00:00Z' });

    const result = await execute(
      { action: 'list', startRange: '2025-06-10T00:00:00Z', endRange: '2025-06-20T00:00:00Z' },
      {}
    );
    assert.equal(result.metadata.count, 1);
    assert.equal(result.metadata.events[0].title, 'June 15');
  });

  it('should return error for invalid startRange date', async () => {
    const result = await execute(
      { action: 'list', startRange: 'bad-date' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_DATE');
  });
});

// ---------------------------------------------------------------------------
// update action
// ---------------------------------------------------------------------------

describe('calendar-manager: update', () => {
  beforeEach(() => _clearStore());

  it('should update title of an existing event', async () => {
    const created = await createEvent({ title: 'Original' });
    const id = created.metadata.eventId;

    const result = await execute(
      { action: 'update', id, title: 'Updated' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update');
    assert.equal(result.metadata.event.title, 'Updated');
  });

  it('should support partial update (only change description)', async () => {
    const created = await createEvent({ title: 'Keep Me', description: 'Old' });
    const id = created.metadata.eventId;

    const result = await execute(
      { action: 'update', id, description: 'New description' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.event.title, 'Keep Me');
    assert.equal(result.metadata.event.description, 'New description');
  });

  it('should return error when id is missing', async () => {
    const result = await execute({ action: 'update', title: 'No ID' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ID');
  });

  it('should return error for non-existent event id', async () => {
    const result = await execute(
      { action: 'update', id: 'does-not-exist', title: 'Ghost' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'EVENT_NOT_FOUND');
  });

  it('should return error for invalid startTime on update', async () => {
    const created = await createEvent();
    const id = created.metadata.eventId;

    const result = await execute(
      { action: 'update', id, startTime: 'not-valid' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_DATE');
  });
});

// ---------------------------------------------------------------------------
// delete action
// ---------------------------------------------------------------------------

describe('calendar-manager: delete', () => {
  beforeEach(() => _clearStore());

  it('should delete an existing event', async () => {
    const created = await createEvent({ title: 'To Delete' });
    const id = created.metadata.eventId;
    assert.equal(_storeSize(), 1);

    const result = await execute({ action: 'delete', id }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'delete');
    assert.equal(result.metadata.eventId, id);
    assert.equal(_storeSize(), 0);
  });

  it('should return error when id is missing', async () => {
    const result = await execute({ action: 'delete' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_ID');
  });

  it('should return error for non-existent event id', async () => {
    const result = await execute(
      { action: 'delete', id: 'ghost-id' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'EVENT_NOT_FOUND');
  });

  it('should not be able to delete the same event twice', async () => {
    const created = await createEvent({ title: 'Once' });
    const id = created.metadata.eventId;

    await execute({ action: 'delete', id }, {});
    const second = await execute({ action: 'delete', id }, {});
    assert.equal(second.metadata.success, false);
    assert.equal(second.metadata.error, 'EVENT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// search action
// ---------------------------------------------------------------------------

describe('calendar-manager: search', () => {
  beforeEach(() => _clearStore());

  it('should find events matching title keyword', async () => {
    await createEvent({ title: 'Sprint Planning' });
    await createEvent({ title: 'Code Review' });

    const result = await execute({ action: 'search', query: 'sprint' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 1);
    assert.equal(result.metadata.events[0].title, 'Sprint Planning');
  });

  it('should find events matching description keyword', async () => {
    await createEvent({ title: 'Meeting', description: 'Discuss budget allocation' });
    await createEvent({ title: 'Lunch' });

    const result = await execute({ action: 'search', query: 'budget' }, {});
    assert.equal(result.metadata.count, 1);
    assert.equal(result.metadata.events[0].title, 'Meeting');
  });

  it('should be case-insensitive', async () => {
    await createEvent({ title: 'IMPORTANT Meeting' });

    const result = await execute({ action: 'search', query: 'important' }, {});
    assert.equal(result.metadata.count, 1);
  });

  it('should return empty results when no match', async () => {
    await createEvent({ title: 'Standup' });

    const result = await execute({ action: 'search', query: 'zzzzz' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should return error when query is missing', async () => {
    const result = await execute({ action: 'search' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_QUERY');
  });

  it('should return error when query is empty string', async () => {
    const result = await execute({ action: 'search', query: '' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_QUERY');
  });
});

// ---------------------------------------------------------------------------
// upcoming action
// ---------------------------------------------------------------------------

describe('calendar-manager: upcoming', () => {
  beforeEach(() => _clearStore());

  it('should return events within the next N hours', async () => {
    const now = Date.now();
    const inOneHour = new Date(now + 1 * 60 * 60 * 1000).toISOString();
    const inTenHours = new Date(now + 10 * 60 * 60 * 1000).toISOString();
    const inTwoDays = new Date(now + 48 * 60 * 60 * 1000).toISOString();

    await createEvent({ title: 'Soon', startTime: inOneHour });
    await createEvent({ title: 'Later Today', startTime: inTenHours });
    await createEvent({ title: 'Far Away', startTime: inTwoDays });

    const result = await execute({ action: 'upcoming', hours: 12 }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.hours, 12);

    const titles = result.metadata.events.map((e) => e.title);
    assert.ok(titles.includes('Soon'));
    assert.ok(titles.includes('Later Today'));
    assert.ok(!titles.includes('Far Away'));
  });

  it('should default to 24 hours when hours is not provided', async () => {
    const result = await execute({ action: 'upcoming' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.hours, 24);
  });

  it('should return empty list when no upcoming events', async () => {
    // Create an event far in the past (won't match upcoming)
    await createEvent({ title: 'Old', startTime: '2020-01-01T00:00:00Z' });

    const result = await execute({ action: 'upcoming', hours: 1 }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases and validation
// ---------------------------------------------------------------------------

describe('calendar-manager: edge cases', () => {
  beforeEach(() => _clearStore());

  it('should return error for invalid action', async () => {
    const result = await execute({ action: 'purge' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('purge'));
  });

  it('should return error for missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should handle create with empty title string', async () => {
    const result = await execute(
      { action: 'create', title: '', startTime: '2025-06-01T09:00:00Z' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TITLE');
  });

  it('should handle create with whitespace-only title', async () => {
    const result = await execute(
      { action: 'create', title: '   ', startTime: '2025-06-01T09:00:00Z' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TITLE');
  });

  it('should filter out negative reminder values', async () => {
    const result = await createEvent({ reminders: [10, -5, 30, -1] });
    assert.equal(result.metadata.success, true);
    assert.deepEqual(result.metadata.event.reminders, [10, 30]);
  });

  it('should handle attendees with non-string values by converting', async () => {
    const result = await createEvent({ attendees: [123, true, 'alice'] });
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.event.attendees.length, 3);
    assert.equal(result.metadata.event.attendees[2], 'alice');
  });

  it('should handle update with empty string title as error', async () => {
    const created = await createEvent();
    const id = created.metadata.eventId;

    const result = await execute(
      { action: 'update', id, title: '' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TITLE');
  });

  it('should list events from an empty store without error', async () => {
    const result = await execute({ action: 'list' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should search an empty store without error', async () => {
    const result = await execute({ action: 'search', query: 'anything' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });
});
