import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, onReminder } from '../handler.js';

// ---------------------------------------------------------------------------
// Helper: clean up all active reminders between tests to avoid timer leaks
// ---------------------------------------------------------------------------

async function cleanupReminders() {
  const list = await execute({ action: 'list' }, {});
  if (list.metadata.reminders && list.metadata.reminders.length > 0) {
    for (const r of list.metadata.reminders) {
      await execute({ action: 'cancel', reminderId: r.reminderId }, {});
    }
  }
}

// ===========================================================================
// Unknown / invalid action
// ===========================================================================

describe('remind-me: action validation', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should throw for unknown action', async () => {
    await assert.rejects(
      () => execute({ action: 'explode' }, {}),
      { message: /Unknown action.*explode/i }
    );
  });

  it('should throw for action "remove" (not supported)', async () => {
    await assert.rejects(
      () => execute({ action: 'remove' }, {}),
      { message: /Unknown action/i }
    );
  });

  it('should throw for null action', async () => {
    await assert.rejects(
      () => execute({ action: null }, {}),
      { message: /Unknown action/i }
    );
  });

  it('should throw for numeric action', async () => {
    await assert.rejects(
      () => execute({ action: 42 }, {}),
      { message: /Unknown action/i }
    );
  });

  it('should throw for empty string action', async () => {
    await assert.rejects(
      () => execute({ action: '' }, {}),
      { message: /Unknown action/i }
    );
  });

  it('should mention supported actions in error message', async () => {
    try {
      await execute({ action: 'unknown' }, {});
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('set'));
      assert.ok(e.message.includes('list'));
      assert.ok(e.message.includes('cancel'));
    }
  });
});

// ===========================================================================
// Set reminder: happy path
// ===========================================================================

describe('remind-me: set reminder (happy path)', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should set a reminder with seconds unit', async () => {
    const res = await execute({ action: 'set', message: 'Test', delay: 60, unit: 'seconds' }, {});
    assert.ok(res.result.includes('Reminder set'));
    assert.ok(res.metadata.reminderId.startsWith('reminder_'));
    // Cleanup
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should set a reminder with minutes unit (default)', async () => {
    const res = await execute({ action: 'set', message: 'Minutes Test', delay: 5 }, {});
    assert.ok(res.metadata.unit === 'minutes');
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should set a reminder with hours unit', async () => {
    const res = await execute({ action: 'set', message: 'Hours Test', delay: 1, unit: 'hours' }, {});
    assert.equal(res.metadata.unit, 'hours');
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should default unit to minutes when not specified', async () => {
    const res = await execute({ action: 'set', message: 'Default', delay: 10 }, {});
    assert.equal(res.metadata.unit, 'minutes');
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should return reminderId in metadata', async () => {
    const res = await execute({ action: 'set', message: 'ID Test', delay: 5 }, {});
    assert.ok(res.metadata.reminderId);
    assert.ok(res.metadata.reminderId.startsWith('reminder_'));
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should return scheduledFor in metadata', async () => {
    const res = await execute({ action: 'set', message: 'Sched Test', delay: 5 }, {});
    assert.ok(res.metadata.scheduledFor);
    // Should be a valid ISO date
    const d = new Date(res.metadata.scheduledFor);
    assert.ok(!isNaN(d.getTime()));
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should return message in metadata', async () => {
    const res = await execute({ action: 'set', message: 'Msg Meta', delay: 5 }, {});
    assert.equal(res.metadata.message, 'Msg Meta');
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should return delay in metadata', async () => {
    const res = await execute({ action: 'set', message: 'Delay Meta', delay: 7 }, {});
    assert.equal(res.metadata.delay, 7);
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should return activeReminders count in metadata', async () => {
    const res = await execute({ action: 'set', message: 'Active Count', delay: 5 }, {});
    assert.ok(res.metadata.activeReminders >= 1);
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should include message in result string', async () => {
    const res = await execute({ action: 'set', message: 'In Result', delay: 5 }, {});
    assert.ok(res.result.includes('In Result'));
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should include ID in result string', async () => {
    const res = await execute({ action: 'set', message: 'ID in result', delay: 5 }, {});
    assert.ok(res.result.includes(res.metadata.reminderId));
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should generate unique IDs for each reminder', async () => {
    const res1 = await execute({ action: 'set', message: 'First', delay: 60, unit: 'seconds' }, {});
    const res2 = await execute({ action: 'set', message: 'Second', delay: 60, unit: 'seconds' }, {});
    assert.notEqual(res1.metadata.reminderId, res2.metadata.reminderId);
    await execute({ action: 'cancel', reminderId: res1.metadata.reminderId }, {});
    await execute({ action: 'cancel', reminderId: res2.metadata.reminderId }, {});
  });

  it('should handle fractional delay', async () => {
    const res = await execute({ action: 'set', message: 'Frac', delay: 0.5 }, {});
    assert.ok(res.metadata.reminderId);
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should handle very large delay', async () => {
    const res = await execute({ action: 'set', message: 'Big', delay: 99999, unit: 'hours' }, {});
    assert.ok(res.metadata.reminderId);
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should handle message with special characters', async () => {
    const res = await execute({ action: 'set', message: 'Hello "world" & <friends>', delay: 5 }, {});
    assert.equal(res.metadata.message, 'Hello "world" & <friends>');
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should handle very long message', async () => {
    const longMsg = 'A'.repeat(1000);
    const res = await execute({ action: 'set', message: longMsg, delay: 5 }, {});
    assert.equal(res.metadata.message, longMsg);
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });
});

// ===========================================================================
// Set reminder: validation errors
// ===========================================================================

describe('remind-me: set reminder validation', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should throw when message is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'set', delay: 5 }, {}),
      { message: /message.*required/i }
    );
  });

  it('should throw when message is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: '', delay: 5 }, {}),
      { message: /message.*required/i }
    );
  });

  it('should throw when message is whitespace only', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: '   ', delay: 5 }, {}),
      { message: /message.*required/i }
    );
  });

  it('should throw when message is null', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: null, delay: 5 }, {}),
      { message: /message.*required/i }
    );
  });

  it('should throw when delay is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test' }, {}),
      { message: /delay.*required|positive.*numeric/i }
    );
  });

  it('should throw when delay is 0', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test', delay: 0 }, {}),
      { message: /positive.*numeric/i }
    );
  });

  it('should throw when delay is negative', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test', delay: -5 }, {}),
      { message: /positive.*numeric/i }
    );
  });

  it('should throw when delay is a string', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test', delay: 'five' }, {}),
      { message: /positive.*numeric/i }
    );
  });

  it('should throw for NaN delay (causes invalid Date)', async () => {
    // NaN passes typeof check but Date(Date.now() + NaN) is invalid,
    // causing toISOString() to throw RangeError
    await assert.rejects(
      () => execute({ action: 'set', message: 'NaN delay', delay: NaN }, {}),
      { name: 'RangeError' }
    );
  });

  it('should throw when delay is null', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test', delay: null }, {}),
      { message: /positive.*numeric/i }
    );
  });

  it('should throw when delay is boolean', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test', delay: true }, {}),
      { message: /positive.*numeric/i }
    );
  });

  it('should throw for invalid unit', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test', delay: 5, unit: 'days' }, {}),
      { message: /Invalid unit/i }
    );
  });

  it('should throw for unit "weeks"', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test', delay: 1, unit: 'weeks' }, {}),
      { message: /Invalid unit/i }
    );
  });

  it('should throw for unit "milliseconds"', async () => {
    await assert.rejects(
      () => execute({ action: 'set', message: 'Test', delay: 1000, unit: 'milliseconds' }, {}),
      { message: /Invalid unit/i }
    );
  });

  it('should mention supported units in invalid unit error', async () => {
    try {
      await execute({ action: 'set', message: 'Test', delay: 5, unit: 'lightyears' }, {});
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('seconds'));
      assert.ok(e.message.includes('minutes'));
      assert.ok(e.message.includes('hours'));
    }
  });
});

// ===========================================================================
// List reminders
// ===========================================================================

describe('remind-me: list reminders', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should return empty list when no reminders exist', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.activeReminders, 0);
    assert.deepEqual(res.metadata.reminders, []);
  });

  it('should mention "No active reminders" for empty list', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('No active reminders'));
  });

  it('should list one active reminder', async () => {
    const set = await execute({ action: 'set', message: 'Listed', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.activeReminders, 1);
    assert.equal(res.metadata.reminders.length, 1);
    assert.equal(res.metadata.reminders[0].reminderId, set.metadata.reminderId);
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should list multiple active reminders', async () => {
    const s1 = await execute({ action: 'set', message: 'R1', delay: 60, unit: 'seconds' }, {});
    const s2 = await execute({ action: 'set', message: 'R2', delay: 120, unit: 'seconds' }, {});
    const s3 = await execute({ action: 'set', message: 'R3', delay: 180, unit: 'seconds' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.activeReminders, 3);
    assert.equal(res.metadata.reminders.length, 3);
    await execute({ action: 'cancel', reminderId: s1.metadata.reminderId }, {});
    await execute({ action: 'cancel', reminderId: s2.metadata.reminderId }, {});
    await execute({ action: 'cancel', reminderId: s3.metadata.reminderId }, {});
  });

  it('should include message in listed reminder', async () => {
    const set = await execute({ action: 'set', message: 'Find Me', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.reminders[0].message, 'Find Me');
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should include scheduledFor in listed reminder', async () => {
    const set = await execute({ action: 'set', message: 'Scheduled', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.metadata.reminders[0].scheduledFor);
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should include remainingMs in listed reminder', async () => {
    const set = await execute({ action: 'set', message: 'Remaining', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(typeof res.metadata.reminders[0].remainingMs, 'number');
    assert.ok(res.metadata.reminders[0].remainingMs > 0);
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should include count in result string', async () => {
    const set = await execute({ action: 'set', message: 'Count', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('Active reminders'));
    assert.ok(res.result.includes('1'));
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should format remaining time in seconds for short durations', async () => {
    const set = await execute({ action: 'set', message: 'Short', delay: 30, unit: 'seconds' }, {});
    const res = await execute({ action: 'list' }, {});
    // Should show seconds format (Ns)
    assert.ok(res.result.includes('s'));
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should format remaining time with minutes and seconds for medium durations', async () => {
    const set = await execute({ action: 'set', message: 'Medium', delay: 5, unit: 'minutes' }, {});
    const res = await execute({ action: 'list' }, {});
    // Should show Nm Ns format
    assert.ok(res.result.includes('m'));
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should format remaining time with hours for long durations', async () => {
    const set = await execute({ action: 'set', message: 'Long', delay: 2, unit: 'hours' }, {});
    const res = await execute({ action: 'list' }, {});
    // Should show Nh Nm format
    assert.ok(res.result.includes('h'));
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should not list cancelled reminders', async () => {
    const set = await execute({ action: 'set', message: 'Gone', delay: 60, unit: 'seconds' }, {});
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.activeReminders, 0);
  });
});

// ===========================================================================
// Cancel reminder
// ===========================================================================

describe('remind-me: cancel reminder', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should cancel a reminder by exact reminderId', async () => {
    const set = await execute({ action: 'set', message: 'Cancel Me', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    assert.equal(res.metadata.cancelled, true);
    assert.equal(res.metadata.reminderId, set.metadata.reminderId);
  });

  it('should cancel a reminder by key parameter', async () => {
    const set = await execute({ action: 'set', message: 'By Key', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', key: set.metadata.reminderId }, {});
    assert.equal(res.metadata.cancelled, true);
  });

  it('should cancel a reminder by id parameter', async () => {
    const set = await execute({ action: 'set', message: 'By Id', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', id: set.metadata.reminderId }, {});
    assert.equal(res.metadata.cancelled, true);
  });

  it('should cancel a reminder by message parameter as fallback', async () => {
    const set = await execute({ action: 'set', message: 'By Msg', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', message: set.metadata.reminderId }, {});
    assert.equal(res.metadata.cancelled, true);
  });

  it('should return cancelled message details', async () => {
    const set = await execute({ action: 'set', message: 'Details', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    assert.equal(res.metadata.cancelledMessage, 'Details');
  });

  it('should return wasScheduledFor in cancel metadata', async () => {
    const set = await execute({ action: 'set', message: 'Sched', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    assert.ok(res.metadata.wasScheduledFor);
  });

  it('should return activeReminders count after cancel', async () => {
    const s1 = await execute({ action: 'set', message: 'R1', delay: 60, unit: 'seconds' }, {});
    const s2 = await execute({ action: 'set', message: 'R2', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', reminderId: s1.metadata.reminderId }, {});
    assert.equal(res.metadata.activeReminders, 1);
    await execute({ action: 'cancel', reminderId: s2.metadata.reminderId }, {});
  });

  it('should include success confirmation in cancel result', async () => {
    const set = await execute({ action: 'set', message: 'Confirm', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    assert.ok(res.result.includes('cancelled'));
  });

  it('should handle cancelling non-existent reminder', async () => {
    const res = await execute({ action: 'cancel', reminderId: 'reminder_99999' }, {});
    assert.equal(res.metadata.cancelled, false);
  });

  it('should include not-found message for non-existent reminder', async () => {
    const res = await execute({ action: 'cancel', reminderId: 'reminder_99999' }, {});
    assert.ok(res.result.includes('No active reminder'));
  });

  it('should support partial matching for cancel', async () => {
    const set = await execute({ action: 'set', message: 'Partial', delay: 60, unit: 'seconds' }, {});
    // Extract the numeric ID part
    const numPart = set.metadata.reminderId.replace('reminder_', '');
    const res = await execute({ action: 'cancel', reminderId: numPart }, {});
    // Should match partially
    assert.equal(res.metadata.cancelled, true);
  });

  it('should handle multiple partial matches', async () => {
    // Create two reminders - they will have sequential IDs like reminder_X, reminder_X+1
    // Both contain "reminder_" so searching for "reminder_" will match both
    const s1 = await execute({ action: 'set', message: 'M1', delay: 60, unit: 'seconds' }, {});
    const s2 = await execute({ action: 'set', message: 'M2', delay: 60, unit: 'seconds' }, {});
    const res = await execute({ action: 'cancel', reminderId: 'reminder_' }, {});
    // Should report multiple matches
    assert.equal(res.metadata.cancelled, false);
    assert.ok(res.metadata.matchingIds);
    assert.ok(res.metadata.matchingIds.length >= 2);
    // Cleanup
    await execute({ action: 'cancel', reminderId: s1.metadata.reminderId }, {});
    await execute({ action: 'cancel', reminderId: s2.metadata.reminderId }, {});
  });

  it('should throw when no reminder ID is provided for cancel', async () => {
    await assert.rejects(
      () => execute({ action: 'cancel' }, {}),
      { message: /reminder ID.*required/i }
    );
  });

  it('should throw when cancel ID is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'cancel', reminderId: '' }, {}),
      { message: /reminder ID.*required/i }
    );
  });

  it('should throw when cancel ID is whitespace only', async () => {
    await assert.rejects(
      () => execute({ action: 'cancel', reminderId: '   ' }, {}),
      { message: /reminder ID.*required/i }
    );
  });
});

// ===========================================================================
// onReminder callback
// ===========================================================================

describe('remind-me: onReminder callback', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should accept a function callback without error', () => {
    // onReminder should not throw for a valid function
    assert.doesNotThrow(() => onReminder(() => {}));
  });

  it('should silently ignore non-function arguments', () => {
    // Should not throw for non-function args
    assert.doesNotThrow(() => onReminder('not a function'));
    assert.doesNotThrow(() => onReminder(42));
    assert.doesNotThrow(() => onReminder(null));
    assert.doesNotThrow(() => onReminder(undefined));
  });
});

// ===========================================================================
// Return shape
// ===========================================================================

describe('remind-me: return shape', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should return { result, metadata } for set action', async () => {
    const res = await execute({ action: 'set', message: 'Shape', delay: 60, unit: 'seconds' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
    assert.equal(typeof res.result, 'string');
    assert.equal(typeof res.metadata, 'object');
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should return { result, metadata } for list action', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should return { result, metadata } for cancel action (non-existent)', async () => {
    const res = await execute({ action: 'cancel', reminderId: 'reminder_00000' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should return result as string for all actions', async () => {
    const set = await execute({ action: 'set', message: 'R', delay: 60, unit: 'seconds' }, {});
    assert.equal(typeof set.result, 'string');
    const list = await execute({ action: 'list' }, {});
    assert.equal(typeof list.result, 'string');
    const cancel = await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    assert.equal(typeof cancel.result, 'string');
  });

  it('should return metadata as object for all actions', async () => {
    const set = await execute({ action: 'set', message: 'R', delay: 60, unit: 'seconds' }, {});
    assert.equal(typeof set.metadata, 'object');
    const list = await execute({ action: 'list' }, {});
    assert.equal(typeof list.metadata, 'object');
    const cancel = await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    assert.equal(typeof cancel.metadata, 'object');
  });
});

// ===========================================================================
// Multiple reminders workflow
// ===========================================================================

describe('remind-me: multiple reminders workflow', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should correctly track count with multiple set and cancel operations', async () => {
    const s1 = await execute({ action: 'set', message: 'A', delay: 60, unit: 'seconds' }, {});
    assert.equal(s1.metadata.activeReminders, 1);

    const s2 = await execute({ action: 'set', message: 'B', delay: 60, unit: 'seconds' }, {});
    assert.equal(s2.metadata.activeReminders, 2);

    const c1 = await execute({ action: 'cancel', reminderId: s1.metadata.reminderId }, {});
    assert.equal(c1.metadata.activeReminders, 1);

    const s3 = await execute({ action: 'set', message: 'C', delay: 60, unit: 'seconds' }, {});
    assert.equal(s3.metadata.activeReminders, 2);

    // Cleanup
    await execute({ action: 'cancel', reminderId: s2.metadata.reminderId }, {});
    await execute({ action: 'cancel', reminderId: s3.metadata.reminderId }, {});
  });

  it('should list all messages correctly', async () => {
    const s1 = await execute({ action: 'set', message: 'Alpha', delay: 60, unit: 'seconds' }, {});
    const s2 = await execute({ action: 'set', message: 'Beta', delay: 120, unit: 'seconds' }, {});
    const list = await execute({ action: 'list' }, {});
    const messages = list.metadata.reminders.map(r => r.message);
    assert.ok(messages.includes('Alpha'));
    assert.ok(messages.includes('Beta'));
    await execute({ action: 'cancel', reminderId: s1.metadata.reminderId }, {});
    await execute({ action: 'cancel', reminderId: s2.metadata.reminderId }, {});
  });

  it('should cancel only the specified reminder', async () => {
    const s1 = await execute({ action: 'set', message: 'Keep', delay: 60, unit: 'seconds' }, {});
    const s2 = await execute({ action: 'set', message: 'Remove', delay: 60, unit: 'seconds' }, {});
    await execute({ action: 'cancel', reminderId: s2.metadata.reminderId }, {});
    const list = await execute({ action: 'list' }, {});
    assert.equal(list.metadata.activeReminders, 1);
    assert.equal(list.metadata.reminders[0].message, 'Keep');
    await execute({ action: 'cancel', reminderId: s1.metadata.reminderId }, {});
  });
});

// ===========================================================================
// Context parameter
// ===========================================================================

describe('remind-me: context parameter', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should accept undefined context', async () => {
    const res = await execute({ action: 'list' }, undefined);
    assert.deepEqual(res.metadata.reminders, []);
  });

  it('should accept null context', async () => {
    const res = await execute({ action: 'list' }, null);
    assert.equal(res.metadata.activeReminders, 0);
  });

  it('should accept empty object context', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.activeReminders, 0);
  });

  it('should accept context with extra fields', async () => {
    const res = await execute({ action: 'list' }, { userId: 'u1', sessionId: 's1' });
    assert.equal(res.metadata.activeReminders, 0);
  });
});

// ===========================================================================
// Additional edge cases
// ===========================================================================

describe('remind-me: edge cases', () => {
  beforeEach(async () => {
    await cleanupReminders();
  });

  it('should handle setting many reminders sequentially', async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const res = await execute({ action: 'set', message: `Reminder ${i}`, delay: 60, unit: 'seconds' }, {});
      ids.push(res.metadata.reminderId);
    }
    const list = await execute({ action: 'list' }, {});
    assert.equal(list.metadata.activeReminders, 5);
    for (const id of ids) {
      await execute({ action: 'cancel', reminderId: id }, {});
    }
  });

  it('should handle cancelling already-cancelled reminder gracefully', async () => {
    const set = await execute({ action: 'set', message: 'Double cancel', delay: 60, unit: 'seconds' }, {});
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    const res = await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
    assert.equal(res.metadata.cancelled, false);
  });

  it('should return delay value of 1 correctly', async () => {
    const res = await execute({ action: 'set', message: 'One', delay: 1, unit: 'seconds' }, {});
    assert.equal(res.metadata.delay, 1);
    assert.equal(res.metadata.unit, 'seconds');
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });

  it('should include reminder ID in list result string', async () => {
    const set = await execute({ action: 'set', message: 'ID in list', delay: 60, unit: 'seconds' }, {});
    const list = await execute({ action: 'list' }, {});
    assert.ok(list.result.includes(set.metadata.reminderId));
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should include message in list result string', async () => {
    const set = await execute({ action: 'set', message: 'Visible message', delay: 60, unit: 'seconds' }, {});
    const list = await execute({ action: 'list' }, {});
    assert.ok(list.result.includes('Visible message'));
    await execute({ action: 'cancel', reminderId: set.metadata.reminderId }, {});
  });

  it('should handle delay of exactly 1 hour', async () => {
    const res = await execute({ action: 'set', message: 'One hour', delay: 1, unit: 'hours' }, {});
    assert.equal(res.metadata.delay, 1);
    assert.equal(res.metadata.unit, 'hours');
    await execute({ action: 'cancel', reminderId: res.metadata.reminderId }, {});
  });
});
