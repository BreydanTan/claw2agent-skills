import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, _clearStore, _storeSize } from '../handler.js';

// ---------------------------------------------------------------------------
// Helper: create a note and return the result
// ---------------------------------------------------------------------------

async function createNote(overrides = {}) {
  const params = {
    action: 'create_note',
    title: 'Test Note',
    content: 'Some test content.',
    ...overrides,
  };
  return execute(params, {});
}

// ===========================================================================
// Action validation
// ===========================================================================

describe('note-taking: action validation', () => {
  beforeEach(() => { _clearStore(); });

  it('should return error when action is missing', async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
    assert.ok(res.result.includes('Error'));
  });

  it('should return error when action is null', async () => {
    const res = await execute({ action: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error when action is undefined', async () => {
    const res = await execute({ action: undefined }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for unknown action string', async () => {
    const res = await execute({ action: 'fly_to_moon' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
    assert.ok(res.result.includes('fly_to_moon'));
  });

  it('should return error when params is null', async () => {
    const res = await execute(null, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error when params is undefined', async () => {
    const res = await execute(undefined, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should list valid actions in the error message', async () => {
    const res = await execute({ action: 'invalid' }, {});
    assert.ok(res.result.includes('create_note'));
    assert.ok(res.result.includes('list_folders'));
  });
});

// ===========================================================================
// create_note action
// ===========================================================================

describe('note-taking: create_note', () => {
  beforeEach(() => { _clearStore(); });

  it('should create a note with title only', async () => {
    const res = await createNote({ content: undefined });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'create_note');
    assert.ok(res.metadata.noteId);
    assert.equal(res.metadata.note.title, 'Test Note');
    assert.equal(res.metadata.note.content, '');
    assert.equal(_storeSize(), 1);
  });

  it('should create a note with all fields', async () => {
    const res = await createNote({
      title: 'Full Note',
      content: 'Full content here.',
      tags: ['urgent', 'work'],
      folder: 'projects',
    });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.note.title, 'Full Note');
    assert.equal(res.metadata.note.content, 'Full content here.');
    assert.deepEqual(res.metadata.note.tags, ['urgent', 'work']);
    assert.equal(res.metadata.note.folder, 'projects');
  });

  it('should auto-generate a unique id for each note', async () => {
    const r1 = await createNote({ title: 'Note A' });
    const r2 = await createNote({ title: 'Note B' });
    assert.notEqual(r1.metadata.noteId, r2.metadata.noteId);
    assert.equal(_storeSize(), 2);
  });

  it('should set createdAt and updatedAt timestamps', async () => {
    const res = await createNote();
    assert.ok(res.metadata.note.createdAt);
    assert.ok(res.metadata.note.updatedAt);
    assert.equal(res.metadata.note.createdAt, res.metadata.note.updatedAt);
  });

  it('should default folder to "default" when not provided', async () => {
    const res = await createNote({ folder: undefined });
    assert.equal(res.metadata.note.folder, 'default');
  });

  it('should default tags to empty array when not provided', async () => {
    const res = await createNote({ tags: undefined });
    assert.deepEqual(res.metadata.note.tags, []);
  });

  it('should trim the title', async () => {
    const res = await createNote({ title: '  Trimmed Title  ' });
    assert.equal(res.metadata.note.title, 'Trimmed Title');
  });

  it('should trim the folder name', async () => {
    const res = await createNote({ folder: '  work  ' });
    assert.equal(res.metadata.note.folder, 'work');
  });

  it('should deduplicate tags', async () => {
    const res = await createNote({ tags: ['a', 'b', 'a', 'c', 'b'] });
    assert.deepEqual(res.metadata.note.tags, ['a', 'b', 'c']);
  });

  it('should filter out non-string tags', async () => {
    const res = await createNote({ tags: ['valid', 123, null, '', 'also-valid'] });
    assert.deepEqual(res.metadata.note.tags, ['valid', 'also-valid']);
  });

  it('should trim tags', async () => {
    const res = await createNote({ tags: ['  spaced  ', 'ok'] });
    assert.deepEqual(res.metadata.note.tags, ['spaced', 'ok']);
  });

  it('should return error when title is missing', async () => {
    const res = await execute({ action: 'create_note', content: 'text' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TITLE');
  });

  it('should return error when title is empty string', async () => {
    const res = await createNote({ title: '' });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TITLE');
  });

  it('should return error when title is whitespace only', async () => {
    const res = await createNote({ title: '   ' });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TITLE');
  });

  it('should return error when title is a number', async () => {
    const res = await createNote({ title: 42 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TITLE');
  });

  it('should handle non-string content gracefully', async () => {
    const res = await createNote({ content: 999 });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.note.content, '');
  });

  it('should handle non-array tags gracefully', async () => {
    const res = await createNote({ tags: 'not-an-array' });
    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.note.tags, []);
  });

  it('should handle empty folder string by defaulting', async () => {
    const res = await createNote({ folder: '' });
    assert.equal(res.metadata.note.folder, 'default');
  });

  it('should include the title in the result string', async () => {
    const res = await createNote({ title: 'My Title' });
    assert.ok(res.result.includes('My Title'));
  });
});

// ===========================================================================
// get_note action
// ===========================================================================

describe('note-taking: get_note', () => {
  beforeEach(() => { _clearStore(); });

  it('should retrieve a note by id', async () => {
    const created = await createNote({ title: 'Get Me' });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'get_note', noteId }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'get_note');
    assert.equal(res.metadata.note.title, 'Get Me');
    assert.equal(res.metadata.noteId, noteId);
  });

  it('should return full note object', async () => {
    const created = await createNote({ title: 'Full', content: 'Body', tags: ['t'], folder: 'f' });
    const res = await execute({ action: 'get_note', noteId: created.metadata.noteId }, {});
    const note = res.metadata.note;
    assert.equal(note.title, 'Full');
    assert.equal(note.content, 'Body');
    assert.deepEqual(note.tags, ['t']);
    assert.equal(note.folder, 'f');
    assert.ok(note.createdAt);
    assert.ok(note.updatedAt);
    assert.ok(note.id);
  });

  it('should return error when noteId is missing', async () => {
    const res = await execute({ action: 'get_note' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when noteId is empty', async () => {
    const res = await execute({ action: 'get_note', noteId: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when noteId is not a string', async () => {
    const res = await execute({ action: 'get_note', noteId: 123 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when note does not exist', async () => {
    const res = await execute({ action: 'get_note', noteId: 'nonexistent-id' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOTE_NOT_FOUND');
  });

  it('should include the noteId in the not-found error message', async () => {
    const res = await execute({ action: 'get_note', noteId: 'abc-xyz' }, {});
    assert.ok(res.result.includes('abc-xyz'));
  });
});

// ===========================================================================
// update_note action
// ===========================================================================

describe('note-taking: update_note', () => {
  beforeEach(() => { _clearStore(); });

  it('should update the title of a note', async () => {
    const created = await createNote({ title: 'Old Title' });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, title: 'New Title' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'update_note');
    assert.equal(res.metadata.note.title, 'New Title');
  });

  it('should update the content of a note', async () => {
    const created = await createNote({ content: 'Old content' });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, content: 'New content' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.note.content, 'New content');
  });

  it('should update both title and content', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, title: 'Both', content: 'Both content' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.note.title, 'Both');
    assert.equal(res.metadata.note.content, 'Both content');
  });

  it('should update the updatedAt timestamp', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;
    const originalUpdatedAt = created.metadata.note.updatedAt;

    // Small delay to ensure timestamp differs
    await new Promise(r => setTimeout(r, 5));

    const res = await execute({ action: 'update_note', noteId, title: 'Updated' }, {});
    assert.equal(res.metadata.success, true);
    assert.notEqual(res.metadata.note.updatedAt, originalUpdatedAt);
  });

  it('should not change createdAt on update', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;
    const originalCreatedAt = created.metadata.note.createdAt;

    const res = await execute({ action: 'update_note', noteId, title: 'Updated' }, {});
    assert.equal(res.metadata.note.createdAt, originalCreatedAt);
  });

  it('should trim the new title', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, title: '  Trimmed  ' }, {});
    assert.equal(res.metadata.note.title, 'Trimmed');
  });

  it('should allow content to be set to empty string', async () => {
    const created = await createNote({ content: 'Has content' });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, content: '' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.note.content, '');
  });

  it('should return error when noteId is missing', async () => {
    const res = await execute({ action: 'update_note', title: 'X' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when noteId is empty', async () => {
    const res = await execute({ action: 'update_note', noteId: '', title: 'X' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when note does not exist', async () => {
    const res = await execute({ action: 'update_note', noteId: 'ghost', title: 'X' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOTE_NOT_FOUND');
  });

  it('should return error when neither title nor content is provided', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NO_UPDATE_FIELDS');
  });

  it('should return error when title is empty string', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, title: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TITLE');
  });

  it('should return error when title is whitespace only', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, title: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TITLE');
  });

  it('should return error when title is not a string', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, title: 123 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TITLE');
  });

  it('should return error when content is not a string', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'update_note', noteId, content: 999 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CONTENT');
  });

  it('should reflect changes in subsequent get_note', async () => {
    const created = await createNote({ title: 'Before', content: 'Before content' });
    const noteId = created.metadata.noteId;

    await execute({ action: 'update_note', noteId, title: 'After', content: 'After content' }, {});
    const res = await execute({ action: 'get_note', noteId }, {});
    assert.equal(res.metadata.note.title, 'After');
    assert.equal(res.metadata.note.content, 'After content');
  });
});

// ===========================================================================
// delete_note action
// ===========================================================================

describe('note-taking: delete_note', () => {
  beforeEach(() => { _clearStore(); });

  it('should delete an existing note', async () => {
    const created = await createNote({ title: 'To Delete' });
    const noteId = created.metadata.noteId;
    assert.equal(_storeSize(), 1);

    const res = await execute({ action: 'delete_note', noteId }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'delete_note');
    assert.equal(res.metadata.noteId, noteId);
    assert.equal(res.metadata.title, 'To Delete');
    assert.equal(_storeSize(), 0);
  });

  it('should make note unretrievable after deletion', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;

    await execute({ action: 'delete_note', noteId }, {});
    const res = await execute({ action: 'get_note', noteId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOTE_NOT_FOUND');
  });

  it('should return error when noteId is missing', async () => {
    const res = await execute({ action: 'delete_note' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when noteId is empty', async () => {
    const res = await execute({ action: 'delete_note', noteId: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when note does not exist', async () => {
    const res = await execute({ action: 'delete_note', noteId: 'no-such-id' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOTE_NOT_FOUND');
  });

  it('should not affect other notes', async () => {
    const r1 = await createNote({ title: 'Keep' });
    const r2 = await createNote({ title: 'Delete Me' });
    assert.equal(_storeSize(), 2);

    await execute({ action: 'delete_note', noteId: r2.metadata.noteId }, {});
    assert.equal(_storeSize(), 1);

    const kept = await execute({ action: 'get_note', noteId: r1.metadata.noteId }, {});
    assert.equal(kept.metadata.success, true);
    assert.equal(kept.metadata.note.title, 'Keep');
  });

  it('should include the title in the result message', async () => {
    const created = await createNote({ title: 'Goodbye Note' });
    const res = await execute({ action: 'delete_note', noteId: created.metadata.noteId }, {});
    assert.ok(res.result.includes('Goodbye Note'));
  });
});

// ===========================================================================
// list_notes action
// ===========================================================================

describe('note-taking: list_notes', () => {
  beforeEach(() => { _clearStore(); });

  it('should return empty list when store is empty', async () => {
    const res = await execute({ action: 'list_notes' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'list_notes');
    assert.equal(res.metadata.count, 0);
    assert.deepEqual(res.metadata.notes, []);
  });

  it('should list all notes', async () => {
    await createNote({ title: 'Note 1' });
    await createNote({ title: 'Note 2' });
    await createNote({ title: 'Note 3' });

    const res = await execute({ action: 'list_notes' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.count, 3);
    assert.equal(res.metadata.notes.length, 3);
  });

  it('should filter by folder', async () => {
    await createNote({ title: 'Work 1', folder: 'work' });
    await createNote({ title: 'Personal 1', folder: 'personal' });
    await createNote({ title: 'Work 2', folder: 'work' });

    const res = await execute({ action: 'list_notes', folder: 'work' }, {});
    assert.equal(res.metadata.count, 2);
    assert.ok(res.metadata.notes.every(n => n.folder === 'work'));
  });

  it('should filter by folder case-insensitively', async () => {
    await createNote({ title: 'W1', folder: 'Work' });
    await createNote({ title: 'W2', folder: 'work' });

    const res = await execute({ action: 'list_notes', folder: 'WORK' }, {});
    assert.equal(res.metadata.count, 2);
  });

  it('should filter by tag', async () => {
    await createNote({ title: 'Tagged', tags: ['important'] });
    await createNote({ title: 'Not Tagged', tags: ['other'] });

    const res = await execute({ action: 'list_notes', tag: 'important' }, {});
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.notes[0].title, 'Tagged');
  });

  it('should filter by tag case-insensitively', async () => {
    await createNote({ title: 'T1', tags: ['Urgent'] });
    await createNote({ title: 'T2', tags: ['urgent'] });

    const res = await execute({ action: 'list_notes', tag: 'URGENT' }, {});
    assert.equal(res.metadata.count, 2);
  });

  it('should filter by both folder and tag', async () => {
    await createNote({ title: 'Match', folder: 'work', tags: ['high'] });
    await createNote({ title: 'Wrong Folder', folder: 'personal', tags: ['high'] });
    await createNote({ title: 'Wrong Tag', folder: 'work', tags: ['low'] });

    const res = await execute({ action: 'list_notes', folder: 'work', tag: 'high' }, {});
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.notes[0].title, 'Match');
  });

  it('should respect the limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await createNote({ title: `Note ${i}` });
    }

    const res = await execute({ action: 'list_notes', limit: 3 }, {});
    assert.equal(res.metadata.count, 3);
    assert.equal(res.metadata.notes.length, 3);
    assert.equal(res.metadata.truncated, true);
  });

  it('should default limit to 50', async () => {
    for (let i = 0; i < 5; i++) {
      await createNote({ title: `Note ${i}` });
    }

    const res = await execute({ action: 'list_notes' }, {});
    assert.equal(res.metadata.count, 5);
    assert.equal(res.metadata.truncated, false);
  });

  it('should sort notes by updatedAt descending', async () => {
    const r1 = await createNote({ title: 'First' });
    await new Promise(r => setTimeout(r, 5));
    const r2 = await createNote({ title: 'Second' });
    await new Promise(r => setTimeout(r, 5));
    const r3 = await createNote({ title: 'Third' });

    const res = await execute({ action: 'list_notes' }, {});
    assert.equal(res.metadata.notes[0].title, 'Third');
    assert.equal(res.metadata.notes[2].title, 'First');
  });

  it('should return note summaries (id, title, folder, tags, updatedAt)', async () => {
    await createNote({ title: 'Summary Test', tags: ['x'], folder: 'f' });

    const res = await execute({ action: 'list_notes' }, {});
    const note = res.metadata.notes[0];
    assert.ok(note.id);
    assert.equal(note.title, 'Summary Test');
    assert.equal(note.folder, 'f');
    assert.deepEqual(note.tags, ['x']);
    assert.ok(note.updatedAt);
    // Should NOT include full content in list view
    assert.equal(note.content, undefined);
  });

  it('should handle non-number limit gracefully', async () => {
    await createNote({ title: 'X' });
    const res = await execute({ action: 'list_notes', limit: 'abc' }, {});
    assert.equal(res.metadata.success, true);
    // Falls back to default of 50
    assert.equal(res.metadata.count, 1);
  });
});

// ===========================================================================
// search_notes action
// ===========================================================================

describe('note-taking: search_notes', () => {
  beforeEach(() => { _clearStore(); });

  it('should find notes matching title', async () => {
    await createNote({ title: 'JavaScript Guide', content: 'Basics of JS.' });
    await createNote({ title: 'Python Guide', content: 'Basics of Python.' });

    const res = await execute({ action: 'search_notes', query: 'JavaScript' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'search_notes');
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.notes[0].title, 'JavaScript Guide');
  });

  it('should find notes matching content', async () => {
    await createNote({ title: 'Note A', content: 'The quick brown fox.' });
    await createNote({ title: 'Note B', content: 'The lazy dog.' });

    const res = await execute({ action: 'search_notes', query: 'fox' }, {});
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.notes[0].title, 'Note A');
  });

  it('should search case-insensitively', async () => {
    await createNote({ title: 'UPPER CASE', content: 'lower content' });

    const res = await execute({ action: 'search_notes', query: 'upper' }, {});
    assert.equal(res.metadata.count, 1);

    const res2 = await execute({ action: 'search_notes', query: 'LOWER' }, {});
    assert.equal(res2.metadata.count, 1);
  });

  it('should return empty array when no matches found', async () => {
    await createNote({ title: 'Apples', content: 'Red fruit.' });

    const res = await execute({ action: 'search_notes', query: 'banana' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.count, 0);
    assert.deepEqual(res.metadata.notes, []);
  });

  it('should return multiple matching notes', async () => {
    await createNote({ title: 'Recipe 1', content: 'Add sugar.' });
    await createNote({ title: 'Recipe 2', content: 'Add sugar and cream.' });
    await createNote({ title: 'Workout', content: 'No sugar.' });

    const res = await execute({ action: 'search_notes', query: 'sugar' }, {});
    assert.equal(res.metadata.count, 3);
  });

  it('should respect the limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await createNote({ title: `Match ${i}`, content: 'common keyword' });
    }

    const res = await execute({ action: 'search_notes', query: 'common', limit: 3 }, {});
    assert.equal(res.metadata.count, 3);
    assert.equal(res.metadata.truncated, true);
  });

  it('should default limit to 25', async () => {
    for (let i = 0; i < 5; i++) {
      await createNote({ title: `Result ${i}`, content: 'shared' });
    }

    const res = await execute({ action: 'search_notes', query: 'shared' }, {});
    assert.equal(res.metadata.count, 5);
    assert.equal(res.metadata.truncated, false);
  });

  it('should return error when query is missing', async () => {
    const res = await execute({ action: 'search_notes' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_QUERY');
  });

  it('should return error when query is empty string', async () => {
    const res = await execute({ action: 'search_notes', query: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_QUERY');
  });

  it('should return error when query is whitespace only', async () => {
    const res = await execute({ action: 'search_notes', query: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_QUERY');
  });

  it('should return error when query is not a string', async () => {
    const res = await execute({ action: 'search_notes', query: 42 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_QUERY');
  });

  it('should include the query in the result message', async () => {
    const res = await execute({ action: 'search_notes', query: 'foobar' }, {});
    assert.ok(res.result.includes('foobar'));
  });

  it('should include the query in metadata', async () => {
    const res = await execute({ action: 'search_notes', query: 'test' }, {});
    assert.equal(res.metadata.query, 'test');
  });

  it('should trim the search query', async () => {
    await createNote({ title: 'Findme', content: 'here' });

    const res = await execute({ action: 'search_notes', query: '  Findme  ' }, {});
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.query, 'Findme');
  });
});

// ===========================================================================
// add_tag action
// ===========================================================================

describe('note-taking: add_tag', () => {
  beforeEach(() => { _clearStore(); });

  it('should add tags to a note', async () => {
    const created = await createNote({ tags: [] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'add_tag', noteId, tags: ['urgent', 'review'] }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'add_tag');
    assert.deepEqual(res.metadata.addedTags, ['urgent', 'review']);
    assert.deepEqual(res.metadata.allTags, ['urgent', 'review']);
  });

  it('should not duplicate tags that already exist', async () => {
    const created = await createNote({ tags: ['existing'] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'add_tag', noteId, tags: ['existing', 'new'] }, {});
    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.addedTags, ['new']);
    assert.deepEqual(res.metadata.allTags, ['existing', 'new']);
  });

  it('should handle all duplicates gracefully', async () => {
    const created = await createNote({ tags: ['a', 'b'] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'add_tag', noteId, tags: ['a', 'b'] }, {});
    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.addedTags, []);
    assert.ok(res.result.includes('No new tags'));
  });

  it('should update the updatedAt timestamp', async () => {
    const created = await createNote();
    const noteId = created.metadata.noteId;
    const originalUpdatedAt = created.metadata.note.updatedAt;

    await new Promise(r => setTimeout(r, 5));

    const res = await execute({ action: 'add_tag', noteId, tags: ['new-tag'] }, {});
    const refreshed = await execute({ action: 'get_note', noteId }, {});
    assert.notEqual(refreshed.metadata.note.updatedAt, originalUpdatedAt);
  });

  it('should return error when noteId is missing', async () => {
    const res = await execute({ action: 'add_tag', tags: ['x'] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when tags is missing', async () => {
    const created = await createNote();
    const res = await execute({ action: 'add_tag', noteId: created.metadata.noteId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TAGS');
  });

  it('should return error when tags is empty array', async () => {
    const created = await createNote();
    const res = await execute({ action: 'add_tag', noteId: created.metadata.noteId, tags: [] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TAGS');
  });

  it('should return error when tags is not an array', async () => {
    const created = await createNote();
    const res = await execute({ action: 'add_tag', noteId: created.metadata.noteId, tags: 'single' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TAGS');
  });

  it('should return error when note does not exist', async () => {
    const res = await execute({ action: 'add_tag', noteId: 'ghost', tags: ['x'] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOTE_NOT_FOUND');
  });

  it('should return error when all tags are invalid (empty strings)', async () => {
    const created = await createNote();
    const res = await execute({ action: 'add_tag', noteId: created.metadata.noteId, tags: ['', '  '] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TAGS');
  });

  it('should filter out invalid tags and add valid ones', async () => {
    const created = await createNote({ tags: [] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'add_tag', noteId, tags: ['good', '', null, 'also-good'] }, {});
    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.addedTags, ['good', 'also-good']);
  });

  it('should trim tags when adding', async () => {
    const created = await createNote({ tags: [] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'add_tag', noteId, tags: ['  spaced  '] }, {});
    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.allTags, ['spaced']);
  });
});

// ===========================================================================
// remove_tag action
// ===========================================================================

describe('note-taking: remove_tag', () => {
  beforeEach(() => { _clearStore(); });

  it('should remove tags from a note', async () => {
    const created = await createNote({ tags: ['a', 'b', 'c'] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'remove_tag', noteId, tags: ['b'] }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'remove_tag');
    assert.deepEqual(res.metadata.removedTags, ['b']);
    assert.deepEqual(res.metadata.allTags, ['a', 'c']);
  });

  it('should remove multiple tags at once', async () => {
    const created = await createNote({ tags: ['x', 'y', 'z'] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'remove_tag', noteId, tags: ['x', 'z'] }, {});
    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.removedTags, ['x', 'z']);
    assert.deepEqual(res.metadata.allTags, ['y']);
  });

  it('should handle removing tags that do not exist on the note', async () => {
    const created = await createNote({ tags: ['keep'] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'remove_tag', noteId, tags: ['nonexistent'] }, {});
    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.removedTags, []);
    assert.deepEqual(res.metadata.allTags, ['keep']);
    assert.ok(res.result.includes('No tags removed'));
  });

  it('should update the updatedAt timestamp', async () => {
    const created = await createNote({ tags: ['temp'] });
    const noteId = created.metadata.noteId;
    const originalUpdatedAt = created.metadata.note.updatedAt;

    await new Promise(r => setTimeout(r, 5));

    await execute({ action: 'remove_tag', noteId, tags: ['temp'] }, {});
    const refreshed = await execute({ action: 'get_note', noteId }, {});
    assert.notEqual(refreshed.metadata.note.updatedAt, originalUpdatedAt);
  });

  it('should return error when noteId is missing', async () => {
    const res = await execute({ action: 'remove_tag', tags: ['x'] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when tags is missing', async () => {
    const created = await createNote();
    const res = await execute({ action: 'remove_tag', noteId: created.metadata.noteId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TAGS');
  });

  it('should return error when tags is empty array', async () => {
    const created = await createNote();
    const res = await execute({ action: 'remove_tag', noteId: created.metadata.noteId, tags: [] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TAGS');
  });

  it('should return error when tags is not an array', async () => {
    const created = await createNote();
    const res = await execute({ action: 'remove_tag', noteId: created.metadata.noteId, tags: 'str' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_TAGS');
  });

  it('should return error when note does not exist', async () => {
    const res = await execute({ action: 'remove_tag', noteId: 'ghost', tags: ['x'] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOTE_NOT_FOUND');
  });

  it('should return error when all tags are invalid', async () => {
    const created = await createNote({ tags: ['a'] });
    const res = await execute({ action: 'remove_tag', noteId: created.metadata.noteId, tags: ['', '  '] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_TAGS');
  });

  it('should remove all tags leaving empty array', async () => {
    const created = await createNote({ tags: ['only'] });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'remove_tag', noteId, tags: ['only'] }, {});
    assert.equal(res.metadata.success, true);
    assert.deepEqual(res.metadata.allTags, []);
  });
});

// ===========================================================================
// move_to_folder action
// ===========================================================================

describe('note-taking: move_to_folder', () => {
  beforeEach(() => { _clearStore(); });

  it('should move a note to a new folder', async () => {
    const created = await createNote({ folder: 'inbox' });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'move_to_folder', noteId, folder: 'archive' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'move_to_folder');
    assert.equal(res.metadata.previousFolder, 'inbox');
    assert.equal(res.metadata.newFolder, 'archive');
  });

  it('should persist the folder change', async () => {
    const created = await createNote({ folder: 'old' });
    const noteId = created.metadata.noteId;

    await execute({ action: 'move_to_folder', noteId, folder: 'new' }, {});

    const res = await execute({ action: 'get_note', noteId }, {});
    assert.equal(res.metadata.note.folder, 'new');
  });

  it('should update the updatedAt timestamp', async () => {
    const created = await createNote({ folder: 'a' });
    const noteId = created.metadata.noteId;
    const originalUpdatedAt = created.metadata.note.updatedAt;

    await new Promise(r => setTimeout(r, 5));

    await execute({ action: 'move_to_folder', noteId, folder: 'b' }, {});
    const res = await execute({ action: 'get_note', noteId }, {});
    assert.notEqual(res.metadata.note.updatedAt, originalUpdatedAt);
  });

  it('should trim the folder name', async () => {
    const created = await createNote({ folder: 'inbox' });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'move_to_folder', noteId, folder: '  trimmed  ' }, {});
    assert.equal(res.metadata.newFolder, 'trimmed');
  });

  it('should allow moving to the same folder', async () => {
    const created = await createNote({ folder: 'same' });
    const noteId = created.metadata.noteId;

    const res = await execute({ action: 'move_to_folder', noteId, folder: 'same' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.previousFolder, 'same');
    assert.equal(res.metadata.newFolder, 'same');
  });

  it('should return error when noteId is missing', async () => {
    const res = await execute({ action: 'move_to_folder', folder: 'x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_NOTE_ID');
  });

  it('should return error when folder is missing', async () => {
    const created = await createNote();
    const res = await execute({ action: 'move_to_folder', noteId: created.metadata.noteId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_FOLDER');
  });

  it('should return error when folder is empty string', async () => {
    const created = await createNote();
    const res = await execute({ action: 'move_to_folder', noteId: created.metadata.noteId, folder: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_FOLDER');
  });

  it('should return error when folder is whitespace only', async () => {
    const created = await createNote();
    const res = await execute({ action: 'move_to_folder', noteId: created.metadata.noteId, folder: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'MISSING_FOLDER');
  });

  it('should return error when note does not exist', async () => {
    const res = await execute({ action: 'move_to_folder', noteId: 'phantom', folder: 'x' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOTE_NOT_FOUND');
  });

  it('should include folder names in the result message', async () => {
    const created = await createNote({ folder: 'src' });
    const res = await execute({ action: 'move_to_folder', noteId: created.metadata.noteId, folder: 'dest' }, {});
    assert.ok(res.result.includes('src'));
    assert.ok(res.result.includes('dest'));
  });
});

// ===========================================================================
// list_folders action
// ===========================================================================

describe('note-taking: list_folders', () => {
  beforeEach(() => { _clearStore(); });

  it('should return empty list when store is empty', async () => {
    const res = await execute({ action: 'list_folders' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'list_folders');
    assert.equal(res.metadata.count, 0);
    assert.deepEqual(res.metadata.folders, []);
  });

  it('should list all unique folders', async () => {
    await createNote({ folder: 'work' });
    await createNote({ folder: 'personal' });
    await createNote({ folder: 'work' }); // duplicate

    const res = await execute({ action: 'list_folders' }, {});
    assert.equal(res.metadata.count, 2);
    assert.ok(res.metadata.folders.includes('work'));
    assert.ok(res.metadata.folders.includes('personal'));
  });

  it('should sort folders alphabetically', async () => {
    await createNote({ folder: 'zebra' });
    await createNote({ folder: 'apple' });
    await createNote({ folder: 'mango' });

    const res = await execute({ action: 'list_folders' }, {});
    assert.deepEqual(res.metadata.folders, ['apple', 'mango', 'zebra']);
  });

  it('should include "default" folder for notes without explicit folder', async () => {
    await createNote({});

    const res = await execute({ action: 'list_folders' }, {});
    assert.ok(res.metadata.folders.includes('default'));
  });

  it('should include folder names in the result message', async () => {
    await createNote({ folder: 'inbox' });
    const res = await execute({ action: 'list_folders' }, {});
    assert.ok(res.result.includes('inbox'));
  });

  it('should update when notes are deleted', async () => {
    const r1 = await createNote({ folder: 'only-one' });

    let res = await execute({ action: 'list_folders' }, {});
    assert.ok(res.metadata.folders.includes('only-one'));

    await execute({ action: 'delete_note', noteId: r1.metadata.noteId }, {});

    res = await execute({ action: 'list_folders' }, {});
    assert.ok(!res.metadata.folders.includes('only-one'));
  });

  it('should update when notes are moved', async () => {
    const created = await createNote({ folder: 'before' });

    let res = await execute({ action: 'list_folders' }, {});
    assert.ok(res.metadata.folders.includes('before'));

    await execute({ action: 'move_to_folder', noteId: created.metadata.noteId, folder: 'after' }, {});

    res = await execute({ action: 'list_folders' }, {});
    assert.ok(!res.metadata.folders.includes('before'));
    assert.ok(res.metadata.folders.includes('after'));
  });
});

// ===========================================================================
// Integration / cross-action tests
// ===========================================================================

describe('note-taking: integration', () => {
  beforeEach(() => { _clearStore(); });

  it('should support full CRUD lifecycle', async () => {
    // Create
    const created = await createNote({ title: 'Lifecycle', content: 'v1' });
    assert.equal(created.metadata.success, true);
    const noteId = created.metadata.noteId;

    // Read
    const read = await execute({ action: 'get_note', noteId }, {});
    assert.equal(read.metadata.note.content, 'v1');

    // Update
    const updated = await execute({ action: 'update_note', noteId, content: 'v2' }, {});
    assert.equal(updated.metadata.note.content, 'v2');

    // Delete
    const deleted = await execute({ action: 'delete_note', noteId }, {});
    assert.equal(deleted.metadata.success, true);

    // Verify gone
    const gone = await execute({ action: 'get_note', noteId }, {});
    assert.equal(gone.metadata.success, false);
    assert.equal(gone.metadata.error, 'NOTE_NOT_FOUND');
  });

  it('should support tagging workflow', async () => {
    const created = await createNote({ title: 'Tag Test', tags: ['initial'] });
    const noteId = created.metadata.noteId;

    // Add tags
    await execute({ action: 'add_tag', noteId, tags: ['added1', 'added2'] }, {});

    // Verify via get
    let note = (await execute({ action: 'get_note', noteId }, {})).metadata.note;
    assert.deepEqual(note.tags, ['initial', 'added1', 'added2']);

    // Remove a tag
    await execute({ action: 'remove_tag', noteId, tags: ['initial'] }, {});

    note = (await execute({ action: 'get_note', noteId }, {})).metadata.note;
    assert.deepEqual(note.tags, ['added1', 'added2']);
  });

  it('should support folder organization workflow', async () => {
    const r1 = await createNote({ title: 'N1', folder: 'inbox' });
    const r2 = await createNote({ title: 'N2', folder: 'inbox' });

    // List inbox
    let res = await execute({ action: 'list_notes', folder: 'inbox' }, {});
    assert.equal(res.metadata.count, 2);

    // Move one to archive
    await execute({ action: 'move_to_folder', noteId: r1.metadata.noteId, folder: 'archive' }, {});

    // Inbox should have 1
    res = await execute({ action: 'list_notes', folder: 'inbox' }, {});
    assert.equal(res.metadata.count, 1);

    // Archive should have 1
    res = await execute({ action: 'list_notes', folder: 'archive' }, {});
    assert.equal(res.metadata.count, 1);

    // Folders should list both
    res = await execute({ action: 'list_folders' }, {});
    assert.equal(res.metadata.count, 2);
  });

  it('should find notes by tag after adding tags', async () => {
    const created = await createNote({ title: 'Searchable', tags: [] });
    const noteId = created.metadata.noteId;

    // Not found by tag yet
    let res = await execute({ action: 'list_notes', tag: 'findme' }, {});
    assert.equal(res.metadata.count, 0);

    // Add the tag
    await execute({ action: 'add_tag', noteId, tags: ['findme'] }, {});

    // Now found
    res = await execute({ action: 'list_notes', tag: 'findme' }, {});
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.notes[0].title, 'Searchable');
  });

  it('should search updated content', async () => {
    const created = await createNote({ title: 'Original', content: 'alpha' });
    const noteId = created.metadata.noteId;

    // Search for new term: not found
    let res = await execute({ action: 'search_notes', query: 'beta' }, {});
    assert.equal(res.metadata.count, 0);

    // Update content
    await execute({ action: 'update_note', noteId, content: 'beta gamma' }, {});

    // Now found
    res = await execute({ action: 'search_notes', query: 'beta' }, {});
    assert.equal(res.metadata.count, 1);
  });

  it('should handle many notes without error', async () => {
    for (let i = 0; i < 100; i++) {
      await createNote({ title: `Bulk ${i}`, folder: `folder-${i % 5}`, tags: [`tag-${i % 3}`] });
    }
    assert.equal(_storeSize(), 100);

    const listed = await execute({ action: 'list_notes', limit: 50 }, {});
    assert.equal(listed.metadata.count, 50);
    assert.equal(listed.metadata.truncated, true);

    const folders = await execute({ action: 'list_folders' }, {});
    assert.equal(folders.metadata.count, 5);

    const searched = await execute({ action: 'search_notes', query: 'Bulk 9' }, {});
    assert.ok(searched.metadata.count >= 1);
  });
});
