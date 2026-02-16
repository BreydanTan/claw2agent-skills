import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  redactSensitive,
  sanitizeString,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .fetch() method.
 */
function mockContext(fetchResponse, config) {
  return {
    providerClient: {
      fetch: async (_endpoint, _opts) => fetchResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .fetch() tracks calls and returns data.
 */
function mockContextWithSpy(fetchResponse) {
  const calls = [];
  return {
    context: {
      providerClient: {
        fetch: async (endpoint, opts) => {
          calls.push({ endpoint, opts });
          return fetchResponse;
        },
      },
      config: { timeoutMs: 5000 },
    },
    calls,
  };
}

/**
 * Build a mock context where .fetch() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      fetch: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .fetch() times out (AbortError).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      fetch: async (_endpoint, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

// ---------------------------------------------------------------------------
// Sample response data
// ---------------------------------------------------------------------------

const sampleSearchResults = {
  results: [
    {
      id: 'page-1',
      object: 'page',
      url: 'https://www.notion.so/page-1',
      last_edited_time: '2025-06-01T10:00:00Z',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Meeting Notes' }] },
      },
    },
    {
      id: 'db-1',
      object: 'database',
      url: 'https://www.notion.so/db-1',
      last_edited_time: '2025-05-28T08:00:00Z',
      title: [{ plain_text: 'Task Tracker' }],
    },
  ],
};

const samplePage = {
  id: 'page-abc123',
  object: 'page',
  created_time: '2025-01-15T10:00:00Z',
  last_edited_time: '2025-06-01T12:00:00Z',
  url: 'https://www.notion.so/page-abc123',
  archived: false,
  icon: { emoji: '📋' },
  properties: {
    Name: { type: 'title', title: [{ plain_text: 'Project Plan' }] },
  },
};

const sampleCreatedPage = {
  id: 'page-new-123',
  url: 'https://www.notion.so/page-new-123',
};

const sampleUpdatedPage = {
  id: 'page-abc123',
  url: 'https://www.notion.so/page-abc123',
  properties: {
    Name: { type: 'title', title: [{ plain_text: 'Updated Title' }] },
  },
};

const sampleDatabase = {
  id: 'db-abc123',
  object: 'database',
  title: [{ plain_text: 'Sprint Board' }],
  created_time: '2025-02-01T08:00:00Z',
  last_edited_time: '2025-06-10T14:00:00Z',
  url: 'https://www.notion.so/db-abc123',
  archived: false,
  properties: {
    Name: { id: 'title', type: 'title', title: {} },
    Status: { id: 'status', type: 'select', select: {} },
    Priority: { id: 'priority', type: 'select', select: {} },
  },
};

const sampleQueryResults = {
  results: [
    {
      id: 'entry-1',
      object: 'page',
      created_time: '2025-03-01T10:00:00Z',
      last_edited_time: '2025-06-01T12:00:00Z',
      url: 'https://www.notion.so/entry-1',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Task Alpha' }] },
      },
    },
    {
      id: 'entry-2',
      object: 'page',
      created_time: '2025-03-02T10:00:00Z',
      last_edited_time: '2025-06-02T12:00:00Z',
      url: 'https://www.notion.so/entry-2',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Task Beta' }] },
      },
    },
  ],
  has_more: false,
};

const sampleCreatedEntry = {
  id: 'entry-new-456',
  url: 'https://www.notion.so/entry-new-456',
  properties: {
    Name: { type: 'title', title: [{ plain_text: 'New Task' }] },
  },
};

const sampleBlocks = {
  results: [
    {
      id: 'block-1',
      type: 'paragraph',
      has_children: false,
      paragraph: {
        rich_text: [{ plain_text: 'Hello, world!' }],
      },
    },
    {
      id: 'block-2',
      type: 'heading_2',
      has_children: false,
      heading_2: {
        rich_text: [{ plain_text: 'Section Title' }],
      },
    },
    {
      id: 'block-3',
      type: 'bulleted_list_item',
      has_children: true,
      bulleted_list_item: {
        rich_text: [{ plain_text: 'List item' }],
      },
    },
  ],
  has_more: false,
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('notion-integration: action validation', () => {
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
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all actions
// ---------------------------------------------------------------------------
describe('notion-integration: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail search without client', async () => {
    const result = await execute({ action: 'search', query: 'meeting' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_page without client', async () => {
    const result = await execute({ action: 'get_page', pageId: 'page-1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_page without client', async () => {
    const result = await execute({ action: 'create_page', parentId: 'p-1', title: 'Test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_page without client', async () => {
    const result = await execute({ action: 'update_page', pageId: 'p-1', properties: { Name: 'x' } }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_database without client', async () => {
    const result = await execute({ action: 'get_database', databaseId: 'db-1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail query_database without client', async () => {
    const result = await execute({ action: 'query_database', databaseId: 'db-1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_database_entry without client', async () => {
    const result = await execute({ action: 'create_database_entry', databaseId: 'db-1', properties: { Name: 'x' } }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_blocks without client', async () => {
    const result = await execute({ action: 'list_blocks', blockId: 'block-1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. search action
// ---------------------------------------------------------------------------
describe('notion-integration: search', () => {
  beforeEach(() => {});

  it('should search workspace successfully', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search', query: 'meeting' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'meeting');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Meeting Notes'));
    assert.ok(result.result.includes('Task Tracker'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResults);
    const result = await execute({ action: 'search' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_QUERY');
  });

  it('should handle empty search results', async () => {
    const ctx = mockContext({ results: [] });
    const result = await execute({ action: 'search', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No results'));
  });

  it('should pass filter and sort params to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', filter: 'page', sort: 'created', pageSize: 5 }, context);
    assert.equal(calls[0].opts.params.filter, 'page');
    assert.equal(calls[0].opts.params.sort, 'created');
    assert.equal(calls[0].opts.params.page_size, 5);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].endpoint, 'notion/search');
  });

  it('should use default page size of 10 for search', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].opts.params.page_size, 10);
  });
});

// ---------------------------------------------------------------------------
// 4. get_page action
// ---------------------------------------------------------------------------
describe('notion-integration: get_page', () => {
  beforeEach(() => {});

  it('should get page info successfully', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page', pageId: 'page-abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_page');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.pageId, 'page-abc123');
    assert.equal(result.metadata.title, 'Project Plan');
    assert.ok(result.result.includes('Project Plan'));
    assert.ok(result.result.includes('page-abc123'));
  });

  it('should reject missing pageId', async () => {
    const ctx = mockContext(samplePage);
    const result = await execute({ action: 'get_page' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PAGE_ID');
  });

  it('should call the correct endpoint with page ID', async () => {
    const { context, calls } = mockContextWithSpy(samplePage);
    await execute({ action: 'get_page', pageId: 'page-abc123' }, context);
    assert.equal(calls[0].endpoint, 'notion/pages/page-abc123');
  });
});

// ---------------------------------------------------------------------------
// 5. create_page action
// ---------------------------------------------------------------------------
describe('notion-integration: create_page', () => {
  beforeEach(() => {});

  it('should create a page successfully', async () => {
    const ctx = mockContext(sampleCreatedPage);
    const result = await execute({
      action: 'create_page', parentId: 'parent-1', title: 'New Page',
      content: 'Some content', icon: '📝', cover: 'https://example.com/cover.jpg',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_page');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.pageId, 'page-new-123');
    assert.equal(result.metadata.title, 'New Page');
    assert.equal(result.metadata.parentId, 'parent-1');
    assert.ok(result.result.includes('page-new-123'));
  });

  it('should reject missing parentId', async () => {
    const ctx = mockContext(sampleCreatedPage);
    const result = await execute({ action: 'create_page', title: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PARENT_ID');
  });

  it('should reject missing title', async () => {
    const ctx = mockContext(sampleCreatedPage);
    const result = await execute({ action: 'create_page', parentId: 'p-1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TITLE');
  });

  it('should use POST method for creating pages', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedPage);
    await execute({ action: 'create_page', parentId: 'p-1', title: 'Test' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedPage);
    await execute({ action: 'create_page', parentId: 'p-1', title: 'Test' }, context);
    assert.equal(calls[0].endpoint, 'notion/pages');
  });

  it('should include icon and cover when provided', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedPage);
    await execute({ action: 'create_page', parentId: 'p-1', title: 'T', icon: '🚀', cover: 'https://img.url' }, context);
    assert.equal(calls[0].opts.params.icon, '🚀');
    assert.equal(calls[0].opts.params.cover, 'https://img.url');
  });
});

// ---------------------------------------------------------------------------
// 6. update_page action
// ---------------------------------------------------------------------------
describe('notion-integration: update_page', () => {
  beforeEach(() => {});

  it('should update a page successfully', async () => {
    const ctx = mockContext(sampleUpdatedPage);
    const result = await execute({
      action: 'update_page', pageId: 'page-abc123',
      properties: { Name: { title: [{ text: { content: 'Updated Title' } }] } },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update_page');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.pageId, 'page-abc123');
    assert.ok(result.result.includes('page-abc123'));
  });

  it('should reject missing pageId', async () => {
    const ctx = mockContext(sampleUpdatedPage);
    const result = await execute({ action: 'update_page', properties: { Name: 'x' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PAGE_ID');
  });

  it('should reject missing properties', async () => {
    const ctx = mockContext(sampleUpdatedPage);
    const result = await execute({ action: 'update_page', pageId: 'page-1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PROPERTIES');
  });

  it('should reject array as properties', async () => {
    const ctx = mockContext(sampleUpdatedPage);
    const result = await execute({ action: 'update_page', pageId: 'page-1', properties: ['a'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PROPERTIES');
  });

  it('should use PATCH method for updating pages', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedPage);
    await execute({ action: 'update_page', pageId: 'page-1', properties: { Status: 'Done' } }, context);
    assert.equal(calls[0].opts.method, 'PATCH');
  });

  it('should include updatedProperties in metadata', async () => {
    const ctx = mockContext(sampleUpdatedPage);
    const result = await execute({
      action: 'update_page', pageId: 'page-1',
      properties: { Status: 'Done', Priority: 'High' },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.deepEqual(result.metadata.updatedProperties, ['Status', 'Priority']);
  });
});

// ---------------------------------------------------------------------------
// 7. get_database action
// ---------------------------------------------------------------------------
describe('notion-integration: get_database', () => {
  beforeEach(() => {});

  it('should get database info successfully', async () => {
    const ctx = mockContext(sampleDatabase);
    const result = await execute({ action: 'get_database', databaseId: 'db-abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_database');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.databaseId, 'db-abc123');
    assert.equal(result.metadata.title, 'Sprint Board');
    assert.ok(result.result.includes('Sprint Board'));
    assert.ok(result.result.includes('Name'));
    assert.ok(result.result.includes('Status'));
  });

  it('should reject missing databaseId', async () => {
    const ctx = mockContext(sampleDatabase);
    const result = await execute({ action: 'get_database' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_DATABASE_ID');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleDatabase);
    await execute({ action: 'get_database', databaseId: 'db-abc123' }, context);
    assert.equal(calls[0].endpoint, 'notion/databases/db-abc123');
  });

  it('should list property names in result', async () => {
    const ctx = mockContext(sampleDatabase);
    const result = await execute({ action: 'get_database', databaseId: 'db-abc123' }, ctx);
    assert.ok(result.result.includes('Priority'));
    assert.deepEqual(result.metadata.properties, ['Name', 'Status', 'Priority']);
  });
});

// ---------------------------------------------------------------------------
// 8. query_database action
// ---------------------------------------------------------------------------
describe('notion-integration: query_database', () => {
  beforeEach(() => {});

  it('should query database successfully', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({ action: 'query_database', databaseId: 'db-abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'query_database');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.databaseId, 'db-abc123');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Task Alpha'));
    assert.ok(result.result.includes('Task Beta'));
  });

  it('should reject missing databaseId', async () => {
    const ctx = mockContext(sampleQueryResults);
    const result = await execute({ action: 'query_database' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_DATABASE_ID');
  });

  it('should handle empty query results', async () => {
    const ctx = mockContext({ results: [], has_more: false });
    const result = await execute({ action: 'query_database', databaseId: 'db-1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No entries'));
  });

  it('should pass filter and sorts to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleQueryResults);
    const filter = { property: 'Status', select: { equals: 'Done' } };
    const sorts = [{ property: 'Created', direction: 'descending' }];
    await execute({ action: 'query_database', databaseId: 'db-1', filter, sorts, pageSize: 25 }, context);
    assert.deepEqual(calls[0].opts.params.filter, filter);
    assert.deepEqual(calls[0].opts.params.sorts, sorts);
    assert.equal(calls[0].opts.params.page_size, 25);
  });

  it('should use POST method for querying databases', async () => {
    const { context, calls } = mockContextWithSpy(sampleQueryResults);
    await execute({ action: 'query_database', databaseId: 'db-1' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should use default page size of 50 for query_database', async () => {
    const { context, calls } = mockContextWithSpy(sampleQueryResults);
    await execute({ action: 'query_database', databaseId: 'db-1' }, context);
    assert.equal(calls[0].opts.params.page_size, 50);
  });

  it('should report has_more from response', async () => {
    const ctx = mockContext({ results: sampleQueryResults.results, has_more: true });
    const result = await execute({ action: 'query_database', databaseId: 'db-1' }, ctx);
    assert.equal(result.metadata.hasMore, true);
  });
});

// ---------------------------------------------------------------------------
// 9. create_database_entry action
// ---------------------------------------------------------------------------
describe('notion-integration: create_database_entry', () => {
  beforeEach(() => {});

  it('should create a database entry successfully', async () => {
    const ctx = mockContext(sampleCreatedEntry);
    const result = await execute({
      action: 'create_database_entry', databaseId: 'db-abc123',
      properties: { Name: { title: [{ text: { content: 'New Task' } }] } },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_database_entry');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.databaseId, 'db-abc123');
    assert.equal(result.metadata.entryId, 'entry-new-456');
    assert.ok(result.result.includes('entry-new-456'));
  });

  it('should reject missing databaseId', async () => {
    const ctx = mockContext(sampleCreatedEntry);
    const result = await execute({ action: 'create_database_entry', properties: { Name: 'x' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_DATABASE_ID');
  });

  it('should reject missing properties', async () => {
    const ctx = mockContext(sampleCreatedEntry);
    const result = await execute({ action: 'create_database_entry', databaseId: 'db-1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PROPERTIES');
  });

  it('should reject array as properties', async () => {
    const ctx = mockContext(sampleCreatedEntry);
    const result = await execute({ action: 'create_database_entry', databaseId: 'db-1', properties: ['a'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_PROPERTIES');
  });

  it('should use POST method for creating entries', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedEntry);
    await execute({ action: 'create_database_entry', databaseId: 'db-1', properties: { Name: 'x' } }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });
});

// ---------------------------------------------------------------------------
// 10. list_blocks action
// ---------------------------------------------------------------------------
describe('notion-integration: list_blocks', () => {
  beforeEach(() => {});

  it('should list blocks successfully', async () => {
    const ctx = mockContext(sampleBlocks);
    const result = await execute({ action: 'list_blocks', blockId: 'page-abc123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_blocks');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.blockId, 'page-abc123');
    assert.equal(result.metadata.count, 3);
    assert.ok(result.result.includes('Hello, world!'));
    assert.ok(result.result.includes('Section Title'));
    assert.ok(result.result.includes('List item'));
  });

  it('should reject missing blockId', async () => {
    const ctx = mockContext(sampleBlocks);
    const result = await execute({ action: 'list_blocks' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BLOCK_ID');
  });

  it('should handle empty blocks list', async () => {
    const ctx = mockContext({ results: [], has_more: false });
    const result = await execute({ action: 'list_blocks', blockId: 'block-empty' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No child blocks'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleBlocks);
    await execute({ action: 'list_blocks', blockId: 'page-abc123' }, context);
    assert.equal(calls[0].endpoint, 'notion/blocks/page-abc123/children');
  });

  it('should use default page size of 50 for list_blocks', async () => {
    const { context, calls } = mockContextWithSpy(sampleBlocks);
    await execute({ action: 'list_blocks', blockId: 'b-1' }, context);
    assert.equal(calls[0].opts.params.page_size, 50);
  });

  it('should include block type and has_children in metadata', async () => {
    const ctx = mockContext(sampleBlocks);
    const result = await execute({ action: 'list_blocks', blockId: 'page-1' }, ctx);
    assert.equal(result.metadata.blocks[0].type, 'paragraph');
    assert.equal(result.metadata.blocks[0].has_children, false);
    assert.equal(result.metadata.blocks[2].type, 'bulleted_list_item');
    assert.equal(result.metadata.blocks[2].has_children, true);
  });

  it('should report has_more from response', async () => {
    const ctx = mockContext({ results: sampleBlocks.results, has_more: true });
    const result = await execute({ action: 'list_blocks', blockId: 'b-1' }, ctx);
    assert.equal(result.metadata.hasMore, true);
  });
});

// ---------------------------------------------------------------------------
// 11. Timeout handling
// ---------------------------------------------------------------------------
describe('notion-integration: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for search', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for get_page', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_page', pageId: 'p-1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for query_database', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'query_database', databaseId: 'db-1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 12. Network error handling
// ---------------------------------------------------------------------------
describe('notion-integration: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for search', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for create_page', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'create_page', parentId: 'p-1', title: 'Test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for query_database', async () => {
    const ctx = mockContextError(new Error('ECONNRESET'));
    const result = await execute({ action: 'query_database', databaseId: 'db-1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 13. getClient helper
// ---------------------------------------------------------------------------
describe('notion-integration: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient', () => {
    const result = getClient({ providerClient: { fetch: () => {} }, gatewayClient: { fetch: () => {} } });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { fetch: () => {} } });
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
// 14. redactSensitive
// ---------------------------------------------------------------------------
describe('notion-integration: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact token patterns', () => {
    const input = 'token=mySecretToken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('mySecretToken123'));
  });

  it('should redact Notion integration tokens', () => {
    const input = 'Using ntn_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop for auth';
    const output = redactSensitive(input);
    assert.ok(!output.includes('ntn_ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact secret_ tokens', () => {
    const input = 'secret_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop in request';
    const output = redactSensitive(input);
    assert.ok(!output.includes('secret_ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Notion workspace has 42 pages';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 15. sanitizeString
// ---------------------------------------------------------------------------
describe('notion-integration: sanitizeString', () => {
  beforeEach(() => {});

  it('should trim whitespace', () => {
    assert.equal(sanitizeString('  hello  '), 'hello');
  });

  it('should remove control characters', () => {
    const input = 'hello\x00world\x07test';
    const output = sanitizeString(input);
    assert.ok(!output.includes('\x00'));
    assert.ok(!output.includes('\x07'));
    assert.ok(output.includes('hello'));
  });

  it('should return undefined for null', () => {
    assert.equal(sanitizeString(null), undefined);
  });

  it('should return undefined for undefined', () => {
    assert.equal(sanitizeString(undefined), undefined);
  });

  it('should convert numbers to strings', () => {
    assert.equal(sanitizeString(123), '123');
  });
});

// ---------------------------------------------------------------------------
// 16. L1 compliance - no hardcoded URLs
// ---------------------------------------------------------------------------
describe('notion-integration: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded notion.com URLs in fetch endpoints', async () => {
    const { context, calls } = mockContextWithSpy(samplePage);
    await execute({ action: 'get_page', pageId: 'p-1' }, context);
    for (const call of calls) {
      assert.ok(!call.endpoint.includes('https://'), 'Endpoint must not contain https://');
      assert.ok(!call.endpoint.includes('api.notion.com'), 'Endpoint must not contain api.notion.com');
      assert.ok(call.endpoint.startsWith('notion/'), 'Endpoint must start with notion/');
    }
  });

  it('should use notion/ prefix for all API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);

    await execute({ action: 'search', query: 'test' }, context);
    await execute({ action: 'get_page', pageId: 'p-1' }, context);
    await execute({ action: 'get_database', databaseId: 'db-1' }, context);
    await execute({ action: 'list_blocks', blockId: 'b-1' }, context);

    assert.ok(calls.length >= 4, `Expected at least 4 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.endpoint.startsWith('notion/'), `Endpoint "${call.endpoint}" must start with notion/`);
    }
  });
});

// ---------------------------------------------------------------------------
// 17. pageSize clamping
// ---------------------------------------------------------------------------
describe('notion-integration: pageSize clamping', () => {
  beforeEach(() => {});

  it('should clamp pageSize to max 100', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', pageSize: 500 }, context);
    assert.equal(calls[0].opts.params.page_size, 100);
  });

  it('should clamp pageSize to minimum 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResults);
    await execute({ action: 'search', query: 'test', pageSize: -5 }, context);
    assert.equal(calls[0].opts.params.page_size, 1);
  });

  it('should use custom pageSize for list_blocks', async () => {
    const { context, calls } = mockContextWithSpy(sampleBlocks);
    await execute({ action: 'list_blocks', blockId: 'b-1', pageSize: 20 }, context);
    assert.equal(calls[0].opts.params.page_size, 20);
  });
});
