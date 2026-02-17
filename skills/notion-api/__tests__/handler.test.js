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
  validateUUID,
  clampLimit,
  extractPageTitle,
  extractDatabaseTitle,
  VALID_ACTIONS,
  VALID_PARENT_TYPES,
  VALID_SEARCH_FILTERS,
  VALID_SORT_VALUES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_TITLE_LENGTH,
  MAX_QUERY_LENGTH,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_QUERY_LIMIT,
  DEFAULT_BLOCK_CHILDREN_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_UUID_NO_HYPHENS = 'a1b2c3d4e5f67890abcdef1234567890';
const VALID_UUID_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (_method, _path, _body, _opts) => requestResponse,
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

/** Sample page response. */
const samplePage = {
  id: VALID_UUID,
  object: 'page',
  created_time: '2025-01-15T10:00:00.000Z',
  last_edited_time: '2025-01-15T12:00:00.000Z',
  url: 'https://www.notion.so/My-Page-abc123',
  properties: {
    title: {
      type: 'title',
      title: [{ plain_text: 'My Test Page' }],
    },
  },
};

/** Sample database response. */
const sampleDatabase = {
  id: VALID_UUID,
  object: 'database',
  created_time: '2025-01-10T08:00:00.000Z',
  last_edited_time: '2025-01-14T16:00:00.000Z',
  url: 'https://www.notion.so/My-Database-def456',
  title: [{ plain_text: 'My Test Database' }],
  properties: {
    Name: { type: 'title', title: {} },
    Status: { type: 'select', select: {} },
    Priority: { type: 'number', number: {} },
  },
};

/** Sample search response. */
const sampleSearchResults = {
  results: [
    {
      id: VALID_UUID,
      object: 'page',
      properties: { title: { type: 'title', title: [{ plain_text: 'Result 1' }] } },
    },
    {
      id: VALID_UUID_2,
      object: 'database',
      properties: { title: { type: 'title', title: [{ plain_text: 'Result 2' }] } },
    },
  ],
  has_more: false,
};

/** Sample query database response. */
const sampleQueryResults = {
  results: [
    {
      id: VALID_UUID,
      object: 'page',
      properties: { title: { type: 'title', title: [{ plain_text: 'Entry 1' }] } },
    },
  ],
  has_more: true,
};

/** Sample block children response. */
const sampleBlockChildren = {
  results: [
    { id: 'block-1', type: 'paragraph', object: 'block' },
    { id: 'block-2', type: 'heading_1', object: 'block' },
    { id: 'block-3', type: 'bulleted_list_item', object: 'block' },
  ],
  has_more: false,
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('notion-api: action validation', () => {
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
    const result = await execute({ action: 'nope' }, {});
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Error should mention action "${a}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all API actions
// ---------------------------------------------------------------------------
describe('notion-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_page without client', async () => {
    const result = await execute({ action: 'get_page', pageId: VALID_UUID }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail create_page without client', async () => {
    const result = await execute({ action: 'create_page', parentId: VALID_UUID, title: 'Test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_page without client', async () => {
    const result = await execute({ action: 'update_page', pageId: VALID_UUID, properties: { x: 1 } }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search without client', async () => {
    const result = await execute({ action: 'search', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_database without client', async () => {
    const result = await execute({ action: 'get_database', databaseId: VALID_UUID }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail query_database without client', async () => {
    const result = await execute({ action: 'query_database', databaseId: VALID_UUID }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_block_children without client', async () => {
    const result = await execute({ action: 'get_block_children', blockId: VALID_UUID }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_page action
// ---------------------------------------------------------------------------
describe('notion-api: get_page', () => {
  beforeEach(() => {});

  it('should get page with valid UUID', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page', pageId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_page');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.pageId, VALID_UUID);
    assert.ok(result.result.includes('My Test Page'));
    assert.ok(result.metadata.timestamp);
  });

  it('should accept UUID without hyphens', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page', pageId: VALID_UUID_NO_HYPHENS }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should reject missing pageId', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('pageId'));
  });

  it('should reject invalid pageId', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page', pageId: 'not-a-uuid' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty string pageId', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page', pageId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include created and edited times', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page', pageId: VALID_UUID }, ctx);
    assert.ok(result.result.includes('2025-01-15'));
  });

  it('should include page URL', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page', pageId: VALID_UUID }, ctx);
    assert.ok(result.result.includes('notion.so'));
  });
});

// ---------------------------------------------------------------------------
// 4. create_page action
// ---------------------------------------------------------------------------
describe('notion-api: create_page', () => {
  beforeEach(() => {});

  it('should create page with valid params', async () => {
    const created = { ...samplePage, id: VALID_UUID_2 };
    const ctx = mockContext(created);
    const result = await execute({
      action: 'create_page',
      parentId: VALID_UUID,
      title: 'New Page',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_page');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.parentId, VALID_UUID);
    assert.equal(result.metadata.title, 'New Page');
    assert.equal(result.metadata.parentType, 'page');
    assert.ok(result.result.includes('Page created successfully'));
  });

  it('should create page with content', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_m, _p, body) => { capturedBody = body; return samplePage; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'create_page',
      parentId: VALID_UUID,
      title: 'With Content',
      content: 'Hello world',
    }, ctx);
    assert.ok(capturedBody.children);
    assert.equal(capturedBody.children.length, 1);
    assert.equal(capturedBody.children[0].type, 'paragraph');
  });

  it('should create page with database parent type', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_m, _p, body) => { capturedBody = body; return samplePage; },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({
      action: 'create_page',
      parentId: VALID_UUID,
      title: 'DB Entry',
      parentType: 'database',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.parentType, 'database');
    assert.ok(capturedBody.parent.database_id);
  });

  it('should create page with page parent type (default)', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_m, _p, body) => { capturedBody = body; return samplePage; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'create_page',
      parentId: VALID_UUID,
      title: 'Sub Page',
    }, ctx);
    assert.ok(capturedBody.parent.page_id);
  });

  it('should reject missing parentId', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'create_page', title: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('parentId'));
  });

  it('should reject invalid parentId', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'create_page', parentId: 'bad', title: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing title', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'create_page', parentId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('title'));
  });

  it('should reject empty title', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'create_page', parentId: VALID_UUID, title: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject title exceeding max length', async () => {
    const ctx = mockContext(samplePage);
    const longTitle = 'x'.repeat(MAX_TITLE_LENGTH + 1);
    const result = await execute({ action: 'create_page', parentId: VALID_UUID, title: longTitle }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should reject invalid parentType', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'create_page',
      parentId: VALID_UUID,
      title: 'Test',
      parentType: 'workspace',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('parentType'));
  });

  it('should trim title before use', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'create_page',
      parentId: VALID_UUID,
      title: '  My Trimmed Title  ',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.title, 'My Trimmed Title');
  });

  it('should not include children when content is empty', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_m, _p, body) => { capturedBody = body; return samplePage; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'create_page',
      parentId: VALID_UUID,
      title: 'No Content',
    }, ctx);
    assert.equal(capturedBody.children, undefined);
  });
});

// ---------------------------------------------------------------------------
// 5. update_page action
// ---------------------------------------------------------------------------
describe('notion-api: update_page', () => {
  beforeEach(() => {});

  it('should update page with valid params', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'update_page',
      pageId: VALID_UUID,
      properties: { Status: { select: { name: 'Done' } } },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update_page');
    assert.equal(result.metadata.layer, 'L1');
    assert.ok(result.result.includes('Page updated successfully'));
  });

  it('should reject missing pageId', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'update_page',
      properties: { x: 1 },
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid pageId', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'update_page',
      pageId: 'bad-id',
      properties: { x: 1 },
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing properties', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'update_page',
      pageId: VALID_UUID,
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('properties'));
  });

  it('should reject non-object properties', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'update_page',
      pageId: VALID_UUID,
      properties: 'not-object',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject array properties', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'update_page',
      pageId: VALID_UUID,
      properties: [1, 2, 3],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty object properties', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({
      action: 'update_page',
      pageId: VALID_UUID,
      properties: {},
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should send PATCH method', async () => {
    let capturedMethod = null;
    const ctx = {
      providerClient: {
        request: async (method) => { capturedMethod = method; return samplePage; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'update_page',
      pageId: VALID_UUID,
      properties: { x: 1 },
    }, ctx);
    assert.equal(capturedMethod, 'PATCH');
  });
});

// ---------------------------------------------------------------------------
// 6. search action
// ---------------------------------------------------------------------------
describe('notion-api: search', () => {
  beforeEach(() => {});

  it('should search with valid query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'meeting notes' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'meeting notes');
    assert.equal(result.metadata.resultCount, 2);
    assert.ok(result.result.includes('meeting notes'));
    assert.ok(result.result.includes('Result 1'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('query'));
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject query exceeding max length', async () => {
    const ctx = mockContext(sampleSearchResults);
    const longQuery = 'x'.repeat(MAX_QUERY_LENGTH + 1);
    const result = await execute({ action: 'search', query: longQuery }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should accept valid filter "page"', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test', filter: 'page' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.filter, 'page');
  });

  it('should accept valid filter "database"', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test', filter: 'database' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.filter, 'database');
  });

  it('should reject invalid filter', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test', filter: 'block' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('filter'));
  });

  it('should accept valid sort "created_time"', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test', sort: 'created_time' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.sort, 'created_time');
  });

  it('should default sort to last_edited_time', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.sort, 'last_edited_time');
  });

  it('should reject invalid sort', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test', sort: 'alphabetical' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('sort'));
  });

  it('should clamp limit to valid range', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test', limit: 200 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should default limit to 25', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.limit, DEFAULT_SEARCH_LIMIT);
  });

  it('should set filter to null when not provided', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.filter, null);
  });

  it('should include hasMore in metadata', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.hasMore, false);
  });

  it('should trim query before use', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: '  trimmed  ' }, ctx);
    assert.equal(result.metadata.query, 'trimmed');
  });
});

// ---------------------------------------------------------------------------
// 7. get_database action
// ---------------------------------------------------------------------------
describe('notion-api: get_database', () => {
  beforeEach(() => {});

  it('should get database with valid UUID', async () => {
    const ctx = mockContext(sampleDatabase);
    const result = await execute({ action: 'get_database', databaseId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_database');
    assert.equal(result.metadata.layer, 'L1');
    assert.ok(result.result.includes('My Test Database'));
    assert.ok(result.result.includes('Name'));
    assert.ok(result.result.includes('Status'));
  });

  it('should reject missing databaseId', async () => {
    const ctx = mockContext(sampleDatabase);
    const result = await execute({ action: 'get_database' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('databaseId'));
  });

  it('should reject invalid databaseId', async () => {
    const ctx = mockContext(sampleDatabase);
    const result = await execute({ action: 'get_database', databaseId: 'xyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include property names in result', async () => {
    const ctx = mockContext(sampleDatabase);
    const result = await execute({ action: 'get_database', databaseId: VALID_UUID }, ctx);
    assert.ok(result.result.includes('Priority'));
  });
});

// ---------------------------------------------------------------------------
// 8. query_database action
// ---------------------------------------------------------------------------
describe('notion-api: query_database', () => {
  beforeEach(() => {});

  it('should query database with valid UUID', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({ action: 'query_database', databaseId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'query_database');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.resultCount, 1);
    assert.equal(result.metadata.hasMore, true);
    assert.ok(result.result.includes('Entry 1'));
  });

  it('should reject missing databaseId', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({ action: 'query_database' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid databaseId', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({ action: 'query_database', databaseId: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept optional filter object', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_m, _p, body) => { capturedBody = body; return sampleQueryResults; },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({
      action: 'query_database',
      databaseId: VALID_UUID,
      filter: { property: 'Status', select: { equals: 'Done' } },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(capturedBody.filter);
    assert.equal(capturedBody.filter.property, 'Status');
  });

  it('should reject non-object filter', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({
      action: 'query_database',
      databaseId: VALID_UUID,
      filter: 'bad-filter',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('filter'));
  });

  it('should reject array filter', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({
      action: 'query_database',
      databaseId: VALID_UUID,
      filter: [1, 2],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept optional sorts array', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_m, _p, body) => { capturedBody = body; return sampleQueryResults; },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({
      action: 'query_database',
      databaseId: VALID_UUID,
      sorts: [{ property: 'Name', direction: 'ascending' }],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(capturedBody.sorts);
    assert.equal(capturedBody.sorts.length, 1);
  });

  it('should reject non-array sorts', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({
      action: 'query_database',
      databaseId: VALID_UUID,
      sorts: 'bad-sorts',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('sorts'));
  });

  it('should default limit to 25', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({ action: 'query_database', databaseId: VALID_UUID }, ctx);
    assert.equal(result.metadata.limit, DEFAULT_QUERY_LIMIT);
  });

  it('should clamp limit to max', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({ action: 'query_database', databaseId: VALID_UUID, limit: 500 }, ctx);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should clamp limit to min', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({ action: 'query_database', databaseId: VALID_UUID, limit: 0 }, ctx);
    assert.equal(result.metadata.limit, MIN_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// 9. get_block_children action
// ---------------------------------------------------------------------------
describe('notion-api: get_block_children', () => {
  beforeEach(() => {});

  it('should get block children with valid blockId', async () => {
    const ctx = mockContext(sampleBlockChildren);
    const result = await execute({ action: 'get_block_children', blockId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_block_children');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.resultCount, 3);
    assert.ok(result.result.includes('paragraph'));
    assert.ok(result.result.includes('heading_1'));
  });

  it('should reject missing blockId', async () => {
    const ctx = mockContext(sampleBlockChildren);
    const result = await execute({ action: 'get_block_children' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('blockId'));
  });

  it('should reject invalid blockId', async () => {
    const ctx = mockContext(sampleBlockChildren);
    const result = await execute({ action: 'get_block_children', blockId: 'bad' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should default limit to 50', async () => {
    const ctx = mockContext(sampleBlockChildren);
    const result = await execute({ action: 'get_block_children', blockId: VALID_UUID }, ctx);
    assert.equal(result.metadata.limit, DEFAULT_BLOCK_CHILDREN_LIMIT);
  });

  it('should clamp limit to valid range', async () => {
    const ctx = mockContext(sampleBlockChildren);
    const result = await execute({ action: 'get_block_children', blockId: VALID_UUID, limit: 999 }, ctx);
    assert.equal(result.metadata.limit, MAX_LIMIT);
  });

  it('should include hasMore in metadata', async () => {
    const ctx = mockContext(sampleBlockChildren);
    const result = await execute({ action: 'get_block_children', blockId: VALID_UUID }, ctx);
    assert.equal(result.metadata.hasMore, false);
  });

  it('should construct correct path with page_size query param', async () => {
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (_m, path) => { capturedPath = path; return sampleBlockChildren; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_block_children', blockId: VALID_UUID, limit: 30 }, ctx);
    assert.ok(capturedPath.includes(`/blocks/${VALID_UUID}/children`));
    assert.ok(capturedPath.includes('page_size=30'));
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('notion-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on get_page abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_page', pageId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on create_page abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'create_page', parentId: VALID_UUID, title: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on search abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on query_database abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'query_database', databaseId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_block_children abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_block_children', blockId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Upstream error handling
// ---------------------------------------------------------------------------
describe('notion-api: upstream errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on get_page failure', async () => {
    const ctx = mockContextError(new Error('Not found'));
    const result = await execute({ action: 'get_page', pageId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
    assert.ok(result.result.includes('Not found'));
  });

  it('should return UPSTREAM_ERROR on create_page failure', async () => {
    const ctx = mockContextError(new Error('Forbidden'));
    const result = await execute({ action: 'create_page', parentId: VALID_UUID, title: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on update_page failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({
      action: 'update_page',
      pageId: VALID_UUID,
      properties: { x: 1 },
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on search failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_database failure', async () => {
    const ctx = mockContextError(new Error('Not found'));
    const result = await execute({ action: 'get_database', databaseId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on query_database failure', async () => {
    const ctx = mockContextError(new Error('Bad request'));
    const result = await execute({ action: 'query_database', databaseId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_block_children failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_block_children', blockId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('notion-api: getClient', () => {
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
// 13. resolveTimeout
// ---------------------------------------------------------------------------
describe('notion-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should return configured timeout when within range', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should cap at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should ignore non-positive values', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
    assert.equal(resolveTimeout({ config: { timeoutMs: -100 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore non-number values', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 14. redactSensitive
// ---------------------------------------------------------------------------
describe('notion-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: ntn_abc123secret data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('ntn_abc123secret'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: Bearer_secret_xxx extra';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Bearer_secret_xxx'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Page created successfully at 2025-01-15';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 15. validateUUID helper
// ---------------------------------------------------------------------------
describe('notion-api: validateUUID', () => {
  beforeEach(() => {});

  it('should accept standard UUID with hyphens', () => {
    assert.equal(validateUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), true);
  });

  it('should accept UUID without hyphens', () => {
    assert.equal(validateUUID('a1b2c3d4e5f67890abcdef1234567890'), true);
  });

  it('should accept uppercase UUID', () => {
    assert.equal(validateUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890'), true);
  });

  it('should reject too-short string', () => {
    assert.equal(validateUUID('abc123'), false);
  });

  it('should reject too-long string', () => {
    assert.equal(validateUUID('a1b2c3d4e5f67890abcdef1234567890extra'), false);
  });

  it('should reject non-hex characters', () => {
    assert.equal(validateUUID('g1b2c3d4-e5f6-7890-abcd-ef1234567890'), false);
  });

  it('should reject null', () => {
    assert.equal(validateUUID(null), false);
  });

  it('should reject undefined', () => {
    assert.equal(validateUUID(undefined), false);
  });

  it('should reject number', () => {
    assert.equal(validateUUID(12345), false);
  });

  it('should reject empty string', () => {
    assert.equal(validateUUID(''), false);
  });
});

// ---------------------------------------------------------------------------
// 16. clampLimit helper
// ---------------------------------------------------------------------------
describe('notion-api: clampLimit', () => {
  beforeEach(() => {});

  it('should return default for undefined', () => {
    assert.equal(clampLimit(undefined, 25), 25);
  });

  it('should return default for null', () => {
    assert.equal(clampLimit(null, 25), 25);
  });

  it('should return value within range', () => {
    assert.equal(clampLimit(50, 25), 50);
  });

  it('should clamp to min', () => {
    assert.equal(clampLimit(0, 25), MIN_LIMIT);
  });

  it('should clamp to max', () => {
    assert.equal(clampLimit(200, 25), MAX_LIMIT);
  });

  it('should floor decimals', () => {
    assert.equal(clampLimit(25.9, 10), 25);
  });

  it('should return default for NaN', () => {
    assert.equal(clampLimit('abc', 25), 25);
  });

  it('should return default for Infinity', () => {
    assert.equal(clampLimit(Infinity, 25), 25);
  });

  it('should clamp negative to min', () => {
    assert.equal(clampLimit(-5, 25), MIN_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// 17. extractPageTitle helper
// ---------------------------------------------------------------------------
describe('notion-api: extractPageTitle', () => {
  beforeEach(() => {});

  it('should extract title from page with plain_text', () => {
    const page = {
      properties: {
        title: { type: 'title', title: [{ plain_text: 'My Page' }] },
      },
    };
    assert.equal(extractPageTitle(page), 'My Page');
  });

  it('should extract title from page with text.content', () => {
    const page = {
      properties: {
        Name: { type: 'title', title: [{ text: { content: 'Named Page' } }] },
      },
    };
    assert.equal(extractPageTitle(page), 'Named Page');
  });

  it('should return Untitled for page without properties', () => {
    assert.equal(extractPageTitle({}), 'Untitled');
    assert.equal(extractPageTitle(null), 'Untitled');
    assert.equal(extractPageTitle(undefined), 'Untitled');
  });

  it('should return Untitled for page with empty title array', () => {
    const page = {
      properties: {
        title: { type: 'title', title: [] },
      },
    };
    assert.equal(extractPageTitle(page), 'Untitled');
  });

  it('should concatenate multiple title segments', () => {
    const page = {
      properties: {
        title: {
          type: 'title',
          title: [{ plain_text: 'Hello ' }, { plain_text: 'World' }],
        },
      },
    };
    assert.equal(extractPageTitle(page), 'Hello World');
  });
});

// ---------------------------------------------------------------------------
// 18. extractDatabaseTitle helper
// ---------------------------------------------------------------------------
describe('notion-api: extractDatabaseTitle', () => {
  beforeEach(() => {});

  it('should extract title from database', () => {
    const db = { title: [{ plain_text: 'My DB' }] };
    assert.equal(extractDatabaseTitle(db), 'My DB');
  });

  it('should return Untitled for database without title', () => {
    assert.equal(extractDatabaseTitle({}), 'Untitled');
    assert.equal(extractDatabaseTitle(null), 'Untitled');
    assert.equal(extractDatabaseTitle(undefined), 'Untitled');
  });

  it('should return Untitled for empty title array', () => {
    assert.equal(extractDatabaseTitle({ title: [] }), 'Untitled');
  });
});

// ---------------------------------------------------------------------------
// 19. validate function
// ---------------------------------------------------------------------------
describe('notion-api: validate', () => {
  beforeEach(() => {});

  it('should accept valid action', () => {
    for (const action of VALID_ACTIONS) {
      const result = validate({ action });
      assert.equal(result.valid, true);
    }
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should reject non-object params', () => {
    const result = validate('string');
    assert.equal(result.valid, false);
  });

  it('should reject invalid action', () => {
    const result = validate({ action: 'nope' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('nope'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 20. meta export
// ---------------------------------------------------------------------------
describe('notion-api: meta', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'notion-api');
  });

  it('should be layer L1', () => {
    assert.equal(meta.layer, 'L1');
  });

  it('should have all 7 actions', () => {
    assert.equal(meta.actions.length, 7);
    for (const action of VALID_ACTIONS) {
      assert.ok(meta.actions.includes(action));
    }
  });

  it('should have version', () => {
    assert.ok(meta.version);
  });
});

// ---------------------------------------------------------------------------
// 21. providerNotConfiguredError
// ---------------------------------------------------------------------------
describe('notion-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 22. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('notion-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (_method, path) => {
          calledPath = path;
          return samplePage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_page', pageId: VALID_UUID }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes(`/pages/${VALID_UUID}`));
  });
});

// ---------------------------------------------------------------------------
// 23. Endpoint / method routing
// ---------------------------------------------------------------------------
describe('notion-api: endpoint routing', () => {
  beforeEach(() => {});

  it('should call GET /pages/{id} for get_page', async () => {
    let capturedMethod = null;
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedMethod = method; capturedPath = path; return samplePage; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_page', pageId: VALID_UUID }, ctx);
    assert.equal(capturedMethod, 'GET');
    assert.equal(capturedPath, `/pages/${VALID_UUID}`);
  });

  it('should call POST /pages for create_page', async () => {
    let capturedMethod = null;
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedMethod = method; capturedPath = path; return samplePage; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'create_page', parentId: VALID_UUID, title: 'Test' }, ctx);
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedPath, '/pages');
  });

  it('should call PATCH /pages/{id} for update_page', async () => {
    let capturedMethod = null;
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedMethod = method; capturedPath = path; return samplePage; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'update_page', pageId: VALID_UUID, properties: { x: 1 } }, ctx);
    assert.equal(capturedMethod, 'PATCH');
    assert.equal(capturedPath, `/pages/${VALID_UUID}`);
  });

  it('should call POST /search for search', async () => {
    let capturedMethod = null;
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedMethod = method; capturedPath = path; return sampleSearchResults; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedPath, '/search');
  });

  it('should call GET /databases/{id} for get_database', async () => {
    let capturedMethod = null;
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedMethod = method; capturedPath = path; return sampleDatabase; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_database', databaseId: VALID_UUID }, ctx);
    assert.equal(capturedMethod, 'GET');
    assert.equal(capturedPath, `/databases/${VALID_UUID}`);
  });

  it('should call POST /databases/{id}/query for query_database', async () => {
    let capturedMethod = null;
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedMethod = method; capturedPath = path; return sampleQueryResults; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'query_database', databaseId: VALID_UUID }, ctx);
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedPath, `/databases/${VALID_UUID}/query`);
  });

  it('should call GET /blocks/{id}/children for get_block_children', async () => {
    let capturedMethod = null;
    let capturedPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => { capturedMethod = method; capturedPath = path; return sampleBlockChildren; },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_block_children', blockId: VALID_UUID }, ctx);
    assert.equal(capturedMethod, 'GET');
    assert.ok(capturedPath.startsWith(`/blocks/${VALID_UUID}/children`));
  });
});

// ---------------------------------------------------------------------------
// 24. requestWithTimeout direct tests
// ---------------------------------------------------------------------------
describe('notion-api: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return data on success', async () => {
    const client = { request: async () => ({ ok: true }) };
    const data = await requestWithTimeout(client, 'GET', '/test', null, 5000);
    assert.deepEqual(data, { ok: true });
  });

  it('should throw TIMEOUT on abort', async () => {
    const client = {
      request: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'TIMEOUT');
    }
  });

  it('should throw UPSTREAM_ERROR on other errors', async () => {
    const client = { request: async () => { throw new Error('fail'); } };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('fail'));
    }
  });

  it('should throw UPSTREAM_ERROR with unknown message when err.message is empty', async () => {
    const client = { request: async () => { throw new Error(); } };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
    }
  });
});

// ---------------------------------------------------------------------------
// 25. Constants are exported correctly
// ---------------------------------------------------------------------------
describe('notion-api: exported constants', () => {
  beforeEach(() => {});

  it('should export DEFAULT_TIMEOUT_MS as 15000', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 15000);
  });

  it('should export MAX_TIMEOUT_MS as 30000', () => {
    assert.equal(MAX_TIMEOUT_MS, 30000);
  });

  it('should export MAX_TITLE_LENGTH as 2000', () => {
    assert.equal(MAX_TITLE_LENGTH, 2000);
  });

  it('should export MAX_QUERY_LENGTH as 500', () => {
    assert.equal(MAX_QUERY_LENGTH, 500);
  });

  it('should export correct default limits', () => {
    assert.equal(DEFAULT_SEARCH_LIMIT, 25);
    assert.equal(DEFAULT_QUERY_LIMIT, 25);
    assert.equal(DEFAULT_BLOCK_CHILDREN_LIMIT, 50);
  });

  it('should export correct limit boundaries', () => {
    assert.equal(MIN_LIMIT, 1);
    assert.equal(MAX_LIMIT, 100);
  });

  it('should export 7 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 7);
  });

  it('should export valid parent types', () => {
    assert.deepEqual(VALID_PARENT_TYPES, ['database', 'page']);
  });

  it('should export valid search filters', () => {
    assert.deepEqual(VALID_SEARCH_FILTERS, ['page', 'database']);
  });

  it('should export valid sort values', () => {
    assert.deepEqual(VALID_SORT_VALUES, ['last_edited_time', 'created_time']);
  });
});
