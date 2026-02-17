/**
 * Note Taking Skill Handler
 *
 * L0 skill -- pure local processing, no external API calls.
 *
 * Create, read, update, delete, search, tag, and organize notes.
 * All data is stored in an in-memory Map-based store.
 */

// ---------------------------------------------------------------------------
// In-memory note store (module-level so it persists across calls)
// ---------------------------------------------------------------------------

const store = new Map();

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

/**
 * Clear the entire in-memory store. Used by tests for isolation.
 */
export function _clearStore() {
  store.clear();
}

/**
 * Return the current number of notes in the store.
 * @returns {number}
 */
export function _storeSize() {
  return store.size;
}

// ---------------------------------------------------------------------------
// Internal helpers
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
 * Build a structured error response.
 *
 * @param {string} message - Human-readable error description
 * @param {string} code    - Machine-readable error code
 * @returns {{ result: string, metadata: Object }}
 */
function errorResponse(message, code) {
  return {
    result: `Error: ${message}`,
    metadata: { success: false, error: code },
  };
}

/**
 * Build a structured success response.
 *
 * @param {string} result  - Human-readable result description
 * @param {Object} data    - Action-specific metadata fields
 * @returns {{ result: string, metadata: Object }}
 */
function successResponse(result, data) {
  return {
    result,
    metadata: { success: true, ...data },
  };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * Create a new note.
 *
 * @param {Object} params
 * @param {string} params.title   - Note title (required)
 * @param {string} [params.content] - Note body text
 * @param {string[]} [params.tags]  - Initial tags
 * @param {string} [params.folder]  - Folder to place the note in
 * @returns {{ result: string, metadata: Object }}
 */
function handleCreateNote(params) {
  const { title, content, tags, folder } = params;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return errorResponse('title is required and must be a non-empty string.', 'MISSING_TITLE');
  }

  const id = generateId();
  const now = new Date().toISOString();

  const note = {
    id,
    title: title.trim(),
    content: (content && typeof content === 'string') ? content : '',
    tags: Array.isArray(tags) ? [...new Set(tags.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim()))] : [],
    folder: (folder && typeof folder === 'string' && folder.trim().length > 0) ? folder.trim() : 'default',
    createdAt: now,
    updatedAt: now,
  };

  store.set(id, note);

  return successResponse(
    `Note "${note.title}" created successfully.`,
    { action: 'create_note', noteId: id, note }
  );
}

/**
 * Get a single note by its ID.
 *
 * @param {Object} params
 * @param {string} params.noteId - The note ID (required)
 * @returns {{ result: string, metadata: Object }}
 */
function handleGetNote(params) {
  const { noteId } = params;

  if (!noteId || typeof noteId !== 'string' || noteId.trim().length === 0) {
    return errorResponse('noteId is required.', 'MISSING_NOTE_ID');
  }

  const note = store.get(noteId.trim());
  if (!note) {
    return errorResponse(`Note with id "${noteId}" not found.`, 'NOTE_NOT_FOUND');
  }

  return successResponse(
    `Note "${note.title}" retrieved successfully.`,
    { action: 'get_note', noteId: note.id, note }
  );
}

/**
 * Update an existing note's title and/or content.
 *
 * @param {Object} params
 * @param {string} params.noteId   - The note ID (required)
 * @param {string} [params.title]  - New title
 * @param {string} [params.content] - New content
 * @returns {{ result: string, metadata: Object }}
 */
function handleUpdateNote(params) {
  const { noteId, title, content } = params;

  if (!noteId || typeof noteId !== 'string' || noteId.trim().length === 0) {
    return errorResponse('noteId is required.', 'MISSING_NOTE_ID');
  }

  const note = store.get(noteId.trim());
  if (!note) {
    return errorResponse(`Note with id "${noteId}" not found.`, 'NOTE_NOT_FOUND');
  }

  if (
    (title === undefined || title === null) &&
    (content === undefined || content === null)
  ) {
    return errorResponse('At least one of title or content must be provided for update.', 'NO_UPDATE_FIELDS');
  }

  if (title !== undefined && title !== null) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return errorResponse('title must be a non-empty string.', 'INVALID_TITLE');
    }
    note.title = title.trim();
  }

  if (content !== undefined && content !== null) {
    if (typeof content !== 'string') {
      return errorResponse('content must be a string.', 'INVALID_CONTENT');
    }
    note.content = content;
  }

  note.updatedAt = new Date().toISOString();

  return successResponse(
    `Note "${note.title}" updated successfully.`,
    { action: 'update_note', noteId: note.id, note }
  );
}

/**
 * Delete a note by its ID.
 *
 * @param {Object} params
 * @param {string} params.noteId - The note ID (required)
 * @returns {{ result: string, metadata: Object }}
 */
function handleDeleteNote(params) {
  const { noteId } = params;

  if (!noteId || typeof noteId !== 'string' || noteId.trim().length === 0) {
    return errorResponse('noteId is required.', 'MISSING_NOTE_ID');
  }

  const note = store.get(noteId.trim());
  if (!note) {
    return errorResponse(`Note with id "${noteId}" not found.`, 'NOTE_NOT_FOUND');
  }

  store.delete(noteId.trim());

  return successResponse(
    `Note "${note.title}" deleted successfully.`,
    { action: 'delete_note', noteId: note.id, title: note.title }
  );
}

/**
 * List notes with optional filtering by folder, tag, and limit.
 *
 * @param {Object} params
 * @param {string}  [params.folder] - Filter by folder name
 * @param {string}  [params.tag]    - Filter by tag
 * @param {number}  [params.limit]  - Maximum number of notes to return (default 50)
 * @returns {{ result: string, metadata: Object }}
 */
function handleListNotes(params) {
  const { folder, tag, limit } = params;

  let notes = [...store.values()];

  if (folder && typeof folder === 'string' && folder.trim().length > 0) {
    const normalizedFolder = folder.trim().toLowerCase();
    notes = notes.filter(n => n.folder.toLowerCase() === normalizedFolder);
  }

  if (tag && typeof tag === 'string' && tag.trim().length > 0) {
    const normalizedTag = tag.trim().toLowerCase();
    notes = notes.filter(n => n.tags.some(t => t.toLowerCase() === normalizedTag));
  }

  // Sort by updatedAt descending (most recent first)
  notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const maxNotes = (typeof limit === 'number' && limit > 0) ? limit : 50;
  const truncated = notes.length > maxNotes;
  notes = notes.slice(0, maxNotes);

  return successResponse(
    `Found ${notes.length} note(s).`,
    {
      action: 'list_notes',
      count: notes.length,
      truncated,
      notes: notes.map(n => ({ id: n.id, title: n.title, folder: n.folder, tags: n.tags, updatedAt: n.updatedAt })),
    }
  );
}

/**
 * Search notes by text query in title and content (case-insensitive).
 *
 * @param {Object} params
 * @param {string} params.query  - Search query (required)
 * @param {number} [params.limit] - Maximum number of results (default 25)
 * @returns {{ result: string, metadata: Object }}
 */
function handleSearchNotes(params) {
  const { query, limit } = params;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return errorResponse('query is required and must be a non-empty string.', 'MISSING_QUERY');
  }

  const normalizedQuery = query.trim().toLowerCase();
  let matches = [...store.values()].filter(n =>
    n.title.toLowerCase().includes(normalizedQuery) ||
    n.content.toLowerCase().includes(normalizedQuery)
  );

  // Sort by updatedAt descending
  matches.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const maxResults = (typeof limit === 'number' && limit > 0) ? limit : 25;
  const truncated = matches.length > maxResults;
  matches = matches.slice(0, maxResults);

  return successResponse(
    `Found ${matches.length} note(s) matching "${query.trim()}".`,
    {
      action: 'search_notes',
      query: query.trim(),
      count: matches.length,
      truncated,
      notes: matches.map(n => ({ id: n.id, title: n.title, folder: n.folder, tags: n.tags, updatedAt: n.updatedAt })),
    }
  );
}

/**
 * Add one or more tags to a note.
 *
 * @param {Object} params
 * @param {string}   params.noteId - The note ID (required)
 * @param {string[]} params.tags   - Tags to add (required)
 * @returns {{ result: string, metadata: Object }}
 */
function handleAddTag(params) {
  const { noteId, tags } = params;

  if (!noteId || typeof noteId !== 'string' || noteId.trim().length === 0) {
    return errorResponse('noteId is required.', 'MISSING_NOTE_ID');
  }

  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    return errorResponse('tags must be a non-empty array.', 'MISSING_TAGS');
  }

  const note = store.get(noteId.trim());
  if (!note) {
    return errorResponse(`Note with id "${noteId}" not found.`, 'NOTE_NOT_FOUND');
  }

  const validTags = tags.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim());

  if (validTags.length === 0) {
    return errorResponse('tags must contain at least one valid non-empty string.', 'INVALID_TAGS');
  }

  const existingSet = new Set(note.tags);
  const added = [];
  for (const t of validTags) {
    if (!existingSet.has(t)) {
      existingSet.add(t);
      added.push(t);
    }
  }

  note.tags = [...existingSet];
  note.updatedAt = new Date().toISOString();

  return successResponse(
    added.length > 0
      ? `Added tag(s) [${added.join(', ')}] to note "${note.title}".`
      : `No new tags added to note "${note.title}" (all already present).`,
    { action: 'add_tag', noteId: note.id, addedTags: added, allTags: note.tags }
  );
}

/**
 * Remove one or more tags from a note.
 *
 * @param {Object} params
 * @param {string}   params.noteId - The note ID (required)
 * @param {string[]} params.tags   - Tags to remove (required)
 * @returns {{ result: string, metadata: Object }}
 */
function handleRemoveTag(params) {
  const { noteId, tags } = params;

  if (!noteId || typeof noteId !== 'string' || noteId.trim().length === 0) {
    return errorResponse('noteId is required.', 'MISSING_NOTE_ID');
  }

  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    return errorResponse('tags must be a non-empty array.', 'MISSING_TAGS');
  }

  const note = store.get(noteId.trim());
  if (!note) {
    return errorResponse(`Note with id "${noteId}" not found.`, 'NOTE_NOT_FOUND');
  }

  const validTags = tags.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim());

  if (validTags.length === 0) {
    return errorResponse('tags must contain at least one valid non-empty string.', 'INVALID_TAGS');
  }

  const toRemove = new Set(validTags);
  const removed = [];
  const remaining = [];

  for (const t of note.tags) {
    if (toRemove.has(t)) {
      removed.push(t);
    } else {
      remaining.push(t);
    }
  }

  note.tags = remaining;
  note.updatedAt = new Date().toISOString();

  return successResponse(
    removed.length > 0
      ? `Removed tag(s) [${removed.join(', ')}] from note "${note.title}".`
      : `No tags removed from note "${note.title}" (none matched).`,
    { action: 'remove_tag', noteId: note.id, removedTags: removed, allTags: note.tags }
  );
}

/**
 * Move a note to a different folder.
 *
 * @param {Object} params
 * @param {string} params.noteId - The note ID (required)
 * @param {string} params.folder - Target folder name (required)
 * @returns {{ result: string, metadata: Object }}
 */
function handleMoveToFolder(params) {
  const { noteId, folder } = params;

  if (!noteId || typeof noteId !== 'string' || noteId.trim().length === 0) {
    return errorResponse('noteId is required.', 'MISSING_NOTE_ID');
  }

  if (!folder || typeof folder !== 'string' || folder.trim().length === 0) {
    return errorResponse('folder is required and must be a non-empty string.', 'MISSING_FOLDER');
  }

  const note = store.get(noteId.trim());
  if (!note) {
    return errorResponse(`Note with id "${noteId}" not found.`, 'NOTE_NOT_FOUND');
  }

  const previousFolder = note.folder;
  note.folder = folder.trim();
  note.updatedAt = new Date().toISOString();

  return successResponse(
    `Note "${note.title}" moved from "${previousFolder}" to "${note.folder}".`,
    { action: 'move_to_folder', noteId: note.id, previousFolder, newFolder: note.folder }
  );
}

/**
 * List all unique folders that contain at least one note.
 *
 * @returns {{ result: string, metadata: Object }}
 */
function handleListFolders() {
  const folders = [...new Set([...store.values()].map(n => n.folder))].sort();

  return successResponse(
    folders.length > 0
      ? `Found ${folders.length} folder(s): ${folders.join(', ')}`
      : 'No folders found (store is empty).',
    { action: 'list_folders', count: folders.length, folders }
  );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'create_note',
  'get_note',
  'update_note',
  'delete_note',
  'list_notes',
  'search_notes',
  'add_tag',
  'remove_tag',
  'move_to_folder',
  'list_folders',
];

/**
 * Execute a note-taking operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of the VALID_ACTIONS
 * @param {Object} context       - Execution context from the runtime
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
export async function execute(params, context) {
  const { action, ...rest } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return errorResponse(
      `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      'INVALID_ACTION'
    );
  }

  try {
    switch (action) {
      case 'create_note':
        return handleCreateNote(rest);
      case 'get_note':
        return handleGetNote(rest);
      case 'update_note':
        return handleUpdateNote(rest);
      case 'delete_note':
        return handleDeleteNote(rest);
      case 'list_notes':
        return handleListNotes(rest);
      case 'search_notes':
        return handleSearchNotes(rest);
      case 'add_tag':
        return handleAddTag(rest);
      case 'remove_tag':
        return handleRemoveTag(rest);
      case 'move_to_folder':
        return handleMoveToFolder(rest);
      case 'list_folders':
        return handleListFolders();
      default:
        return errorResponse(`Unknown action "${action}".`, 'UNKNOWN_ACTION');
    }
  } catch (error) {
    return errorResponse(
      `Unexpected error during "${action}" operation: ${error.message}`,
      'UNEXPECTED_ERROR'
    );
  }
}
