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
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (_method, _path, _body) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .request() tracks calls and returns data.
 */
function mockContextWithSpy(requestResponse) {
  const calls = [];
  return {
    context: {
      providerClient: {
        request: async (method, path, body) => {
          calls.push({ method, path, body });
          return requestResponse;
        },
      },
      config: { timeoutMs: 5000 },
    },
    calls,
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
 * Build a mock context where .request() times out (AbortError).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      request: async () => {
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

const sampleBases = {
  bases: [
    { id: 'appABC123', name: 'Project Tracker', permissionLevel: 'create' },
    { id: 'appDEF456', name: 'CRM Database', permissionLevel: 'edit' },
  ],
};

const sampleTables = {
  tables: [
    { id: 'tblTasks', name: 'Tasks', description: 'Task tracking', primaryFieldId: 'fldName' },
    { id: 'tblPeople', name: 'People', description: 'Contact list', primaryFieldId: 'fldFullName' },
  ],
};

const sampleRecords = {
  records: [
    { id: 'rec001', fields: { Name: 'Task A', Status: 'Active', Priority: 'High' }, createdTime: '2025-01-01T00:00:00.000Z' },
    { id: 'rec002', fields: { Name: 'Task B', Status: 'Done', Priority: 'Low' }, createdTime: '2025-01-02T00:00:00.000Z' },
  ],
};

const sampleRecord = {
  id: 'rec001',
  fields: { Name: 'Task A', Status: 'Active', Priority: 'High' },
  createdTime: '2025-01-01T00:00:00.000Z',
};

const sampleCreatedRecord = {
  id: 'rec099',
  fields: { Name: 'New Task', Status: 'New' },
  createdTime: '2025-02-01T00:00:00.000Z',
};

const sampleUpdatedRecord = {
  id: 'rec001',
  fields: { Name: 'Task A', Status: 'Completed', Priority: 'High' },
};

const sampleDeletedRecord = {
  id: 'rec001',
  deleted: true,
};

const sampleBulkCreated = {
  records: [
    { id: 'rec100', fields: { Name: 'Bulk 1' }, createdTime: '2025-02-01T00:00:00.000Z' },
    { id: 'rec101', fields: { Name: 'Bulk 2' }, createdTime: '2025-02-01T00:00:00.000Z' },
    { id: 'rec102', fields: { Name: 'Bulk 3' }, createdTime: '2025-02-01T00:00:00.000Z' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('airtable-database: action validation', () => {
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

  it('should list all valid actions in error message', async () => {
    const result = await execute({ action: 'bad' }, {});
    assert.ok(result.result.includes('list_records'));
    assert.ok(result.result.includes('get_record'));
    assert.ok(result.result.includes('create_record'));
    assert.ok(result.result.includes('update_record'));
    assert.ok(result.result.includes('delete_record'));
    assert.ok(result.result.includes('search_records'));
    assert.ok(result.result.includes('list_bases'));
    assert.ok(result.result.includes('list_tables'));
    assert.ok(result.result.includes('bulk_create'));
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all 9 actions
// ---------------------------------------------------------------------------
describe('airtable-database: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail list_bases without client', async () => {
    const result = await execute({ action: 'list_bases' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_tables without client', async () => {
    const result = await execute({ action: 'list_tables', baseId: 'app1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_records without client', async () => {
    const result = await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_record without client', async () => {
    const result = await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_record without client', async () => {
    const result = await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: { Name: 'X' } }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_record without client', async () => {
    const result = await execute({ action: 'update_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1', fields: { Name: 'X' } }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail delete_record without client', async () => {
    const result = await execute({ action: 'delete_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_records without client', async () => {
    const result = await execute({ action: 'search_records', baseId: 'app1', tableId: 'tbl1', formula: '{Status}="Active"' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail bulk_create without client', async () => {
    const result = await execute({ action: 'bulk_create', baseId: 'app1', tableId: 'tbl1', records: [{ fields: { Name: 'X' } }] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. list_bases action
// ---------------------------------------------------------------------------
describe('airtable-database: list_bases', () => {
  beforeEach(() => {});

  it('should list bases successfully', async () => {
    const ctx = mockContext(sampleBases);
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_bases');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Project Tracker'));
    assert.ok(result.result.includes('CRM Database'));
  });

  it('should handle empty bases list', async () => {
    const ctx = mockContext({ bases: [] });
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No bases'));
  });

  it('should handle missing bases array in response', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should call the correct path', async () => {
    const { context, calls } = mockContextWithSpy(sampleBases);
    await execute({ action: 'list_bases' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].path, '/v0/meta/bases');
    assert.equal(calls[0].body, null);
  });

  it('should include permissionLevel in metadata', async () => {
    const ctx = mockContext(sampleBases);
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.equal(result.metadata.bases[0].permissionLevel, 'create');
    assert.equal(result.metadata.bases[1].permissionLevel, 'edit');
  });
});

// ---------------------------------------------------------------------------
// 4. list_tables action
// ---------------------------------------------------------------------------
describe('airtable-database: list_tables', () => {
  beforeEach(() => {});

  it('should list tables successfully', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'list_tables', baseId: 'appABC123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_tables');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.baseId, 'appABC123');
    assert.ok(result.result.includes('Tasks'));
    assert.ok(result.result.includes('People'));
  });

  it('should reject missing baseId', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'list_tables' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE_ID');
  });

  it('should handle empty tables list', async () => {
    const ctx = mockContext({ tables: [] });
    const result = await execute({ action: 'list_tables', baseId: 'appABC123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No tables'));
  });

  it('should call the correct path', async () => {
    const { context, calls } = mockContextWithSpy(sampleTables);
    await execute({ action: 'list_tables', baseId: 'appABC123' }, context);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].path, '/v0/meta/bases/appABC123/tables');
  });

  it('should include table metadata in response', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'list_tables', baseId: 'appABC123' }, ctx);
    assert.equal(result.metadata.tables[0].name, 'Tasks');
    assert.equal(result.metadata.tables[0].primaryFieldId, 'fldName');
    assert.equal(result.metadata.tables[1].description, 'Contact list');
  });
});

// ---------------------------------------------------------------------------
// 5. list_records action
// ---------------------------------------------------------------------------
describe('airtable-database: list_records', () => {
  beforeEach(() => {});

  it('should list records successfully', async () => {
    const ctx = mockContext(sampleRecords);
    const result = await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_records');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.baseId, 'app1');
    assert.equal(result.metadata.tableId, 'tbl1');
    assert.ok(result.result.includes('rec001'));
    assert.ok(result.result.includes('rec002'));
  });

  it('should reject missing baseId', async () => {
    const ctx = mockContext(sampleRecords);
    const result = await execute({ action: 'list_records', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE_ID');
  });

  it('should reject missing tableId', async () => {
    const ctx = mockContext(sampleRecords);
    const result = await execute({ action: 'list_records', baseId: 'app1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TABLE_ID');
  });

  it('should handle empty records list', async () => {
    const ctx = mockContext({ records: [] });
    const result = await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No records'));
  });

  it('should call the correct path with defaults', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, context);
    assert.equal(calls[0].method, 'GET');
    assert.ok(calls[0].path.startsWith('/v0/app1/tbl1'));
    assert.ok(calls[0].path.includes('maxRecords=100'));
  });

  it('should include filterByFormula in path', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1', filterByFormula: '{Status}="Active"' }, context);
    assert.ok(calls[0].path.includes('filterByFormula'));
  });

  it('should include view in path', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1', view: 'Grid view' }, context);
    assert.ok(calls[0].path.includes('view'));
  });

  it('should respect custom maxRecords', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1', maxRecords: 25 }, context);
    assert.ok(calls[0].path.includes('maxRecords=25'));
  });

  it('should include records with fields in metadata', async () => {
    const ctx = mockContext(sampleRecords);
    const result = await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.records[0].id, 'rec001');
    assert.equal(result.metadata.records[0].fields.Name, 'Task A');
    assert.equal(result.metadata.records[1].fields.Status, 'Done');
  });
});

// ---------------------------------------------------------------------------
// 6. get_record action
// ---------------------------------------------------------------------------
describe('airtable-database: get_record', () => {
  beforeEach(() => {});

  it('should get a record successfully', async () => {
    const ctx = mockContext(sampleRecord);
    const result = await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_record');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.recordId, 'rec001');
    assert.ok(result.result.includes('rec001'));
    assert.ok(result.result.includes('Task A'));
  });

  it('should reject missing baseId', async () => {
    const ctx = mockContext(sampleRecord);
    const result = await execute({ action: 'get_record', tableId: 'tbl1', recordId: 'rec1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE_ID');
  });

  it('should reject missing tableId', async () => {
    const ctx = mockContext(sampleRecord);
    const result = await execute({ action: 'get_record', baseId: 'app1', recordId: 'rec1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TABLE_ID');
  });

  it('should reject missing recordId', async () => {
    const ctx = mockContext(sampleRecord);
    const result = await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_RECORD_ID');
  });

  it('should call the correct path', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecord);
    await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001' }, context);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].path, '/v0/app1/tbl1/rec001');
    assert.equal(calls[0].body, null);
  });

  it('should include fields in metadata', async () => {
    const ctx = mockContext(sampleRecord);
    const result = await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001' }, ctx);
    assert.deepEqual(result.metadata.fields, { Name: 'Task A', Status: 'Active', Priority: 'High' });
  });

  it('should include createdTime in metadata', async () => {
    const ctx = mockContext(sampleRecord);
    const result = await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001' }, ctx);
    assert.equal(result.metadata.createdTime, '2025-01-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// 7. create_record action
// ---------------------------------------------------------------------------
describe('airtable-database: create_record', () => {
  beforeEach(() => {});

  it('should create a record successfully', async () => {
    const ctx = mockContext(sampleCreatedRecord);
    const result = await execute({
      action: 'create_record', baseId: 'app1', tableId: 'tbl1',
      fields: { Name: 'New Task', Status: 'New' },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_record');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.recordId, 'rec099');
    assert.ok(result.result.includes('rec099'));
  });

  it('should reject missing baseId', async () => {
    const ctx = mockContext(sampleCreatedRecord);
    const result = await execute({ action: 'create_record', tableId: 'tbl1', fields: { Name: 'X' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE_ID');
  });

  it('should reject missing tableId', async () => {
    const ctx = mockContext(sampleCreatedRecord);
    const result = await execute({ action: 'create_record', baseId: 'app1', fields: { Name: 'X' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TABLE_ID');
  });

  it('should reject missing fields', async () => {
    const ctx = mockContext(sampleCreatedRecord);
    const result = await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_FIELDS');
  });

  it('should reject fields as array', async () => {
    const ctx = mockContext(sampleCreatedRecord);
    const result = await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: ['bad'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_FIELDS');
  });

  it('should reject fields as string', async () => {
    const ctx = mockContext(sampleCreatedRecord);
    const result = await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: 'bad' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_FIELDS');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedRecord);
    await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: { Name: 'X' } }, context);
    assert.equal(calls[0].method, 'POST');
  });

  it('should call the correct path', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedRecord);
    await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: { Name: 'X' } }, context);
    assert.equal(calls[0].path, '/v0/app1/tbl1');
  });

  it('should pass fields in body', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedRecord);
    await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: { Name: 'Test' } }, context);
    assert.deepEqual(calls[0].body, { fields: { Name: 'Test' } });
  });
});

// ---------------------------------------------------------------------------
// 8. update_record action
// ---------------------------------------------------------------------------
describe('airtable-database: update_record', () => {
  beforeEach(() => {});

  it('should update a record successfully', async () => {
    const ctx = mockContext(sampleUpdatedRecord);
    const result = await execute({
      action: 'update_record', baseId: 'app1', tableId: 'tbl1',
      recordId: 'rec001', fields: { Status: 'Completed' },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update_record');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.recordId, 'rec001');
    assert.ok(result.result.includes('rec001'));
  });

  it('should reject missing baseId', async () => {
    const ctx = mockContext(sampleUpdatedRecord);
    const result = await execute({ action: 'update_record', tableId: 'tbl1', recordId: 'rec1', fields: { X: 1 } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE_ID');
  });

  it('should reject missing tableId', async () => {
    const ctx = mockContext(sampleUpdatedRecord);
    const result = await execute({ action: 'update_record', baseId: 'app1', recordId: 'rec1', fields: { X: 1 } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TABLE_ID');
  });

  it('should reject missing recordId', async () => {
    const ctx = mockContext(sampleUpdatedRecord);
    const result = await execute({ action: 'update_record', baseId: 'app1', tableId: 'tbl1', fields: { X: 1 } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_RECORD_ID');
  });

  it('should reject missing fields', async () => {
    const ctx = mockContext(sampleUpdatedRecord);
    const result = await execute({ action: 'update_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_FIELDS');
  });

  it('should use PATCH method', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedRecord);
    await execute({ action: 'update_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001', fields: { Status: 'Done' } }, context);
    assert.equal(calls[0].method, 'PATCH');
  });

  it('should call the correct path', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedRecord);
    await execute({ action: 'update_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001', fields: { Status: 'Done' } }, context);
    assert.equal(calls[0].path, '/v0/app1/tbl1/rec001');
  });

  it('should pass fields in body', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedRecord);
    await execute({ action: 'update_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001', fields: { Status: 'Done' } }, context);
    assert.deepEqual(calls[0].body, { fields: { Status: 'Done' } });
  });
});

// ---------------------------------------------------------------------------
// 9. delete_record action
// ---------------------------------------------------------------------------
describe('airtable-database: delete_record', () => {
  beforeEach(() => {});

  it('should delete a record successfully', async () => {
    const ctx = mockContext(sampleDeletedRecord);
    const result = await execute({
      action: 'delete_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'delete_record');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.recordId, 'rec001');
    assert.equal(result.metadata.deleted, true);
    assert.ok(result.result.includes('deleted'));
  });

  it('should reject missing baseId', async () => {
    const ctx = mockContext(sampleDeletedRecord);
    const result = await execute({ action: 'delete_record', tableId: 'tbl1', recordId: 'rec1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE_ID');
  });

  it('should reject missing tableId', async () => {
    const ctx = mockContext(sampleDeletedRecord);
    const result = await execute({ action: 'delete_record', baseId: 'app1', recordId: 'rec1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TABLE_ID');
  });

  it('should reject missing recordId', async () => {
    const ctx = mockContext(sampleDeletedRecord);
    const result = await execute({ action: 'delete_record', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_RECORD_ID');
  });

  it('should use DELETE method', async () => {
    const { context, calls } = mockContextWithSpy(sampleDeletedRecord);
    await execute({ action: 'delete_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001' }, context);
    assert.equal(calls[0].method, 'DELETE');
  });

  it('should call the correct path', async () => {
    const { context, calls } = mockContextWithSpy(sampleDeletedRecord);
    await execute({ action: 'delete_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001' }, context);
    assert.equal(calls[0].path, '/v0/app1/tbl1/rec001');
    assert.equal(calls[0].body, null);
  });
});

// ---------------------------------------------------------------------------
// 10. search_records action
// ---------------------------------------------------------------------------
describe('airtable-database: search_records', () => {
  beforeEach(() => {});

  it('should search records successfully', async () => {
    const ctx = mockContext(sampleRecords);
    const result = await execute({
      action: 'search_records', baseId: 'app1', tableId: 'tbl1',
      formula: '{Status}="Active"',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_records');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.formula, '{Status}="Active"');
    assert.ok(result.result.includes('rec001'));
  });

  it('should reject missing baseId', async () => {
    const ctx = mockContext(sampleRecords);
    const result = await execute({ action: 'search_records', tableId: 'tbl1', formula: 'X' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE_ID');
  });

  it('should reject missing tableId', async () => {
    const ctx = mockContext(sampleRecords);
    const result = await execute({ action: 'search_records', baseId: 'app1', formula: 'X' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TABLE_ID');
  });

  it('should reject missing formula', async () => {
    const ctx = mockContext(sampleRecords);
    const result = await execute({ action: 'search_records', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_FORMULA');
  });

  it('should handle empty search results', async () => {
    const ctx = mockContext({ records: [] });
    const result = await execute({
      action: 'search_records', baseId: 'app1', tableId: 'tbl1', formula: 'X',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No records'));
  });

  it('should include formula in request path', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'search_records', baseId: 'app1', tableId: 'tbl1', formula: '{Status}="Active"' }, context);
    assert.ok(calls[0].path.includes('filterByFormula'));
  });

  it('should respect custom maxRecords for search', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'search_records', baseId: 'app1', tableId: 'tbl1', formula: 'X', maxRecords: 10 }, context);
    assert.ok(calls[0].path.includes('maxRecords=10'));
  });
});

// ---------------------------------------------------------------------------
// 11. bulk_create action
// ---------------------------------------------------------------------------
describe('airtable-database: bulk_create', () => {
  beforeEach(() => {});

  it('should bulk create records successfully', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({
      action: 'bulk_create', baseId: 'app1', tableId: 'tbl1',
      records: [
        { fields: { Name: 'Bulk 1' } },
        { fields: { Name: 'Bulk 2' } },
        { fields: { Name: 'Bulk 3' } },
      ],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'bulk_create');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 3);
    assert.ok(result.result.includes('3 record(s) created'));
  });

  it('should reject missing baseId', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({ action: 'bulk_create', tableId: 'tbl1', records: [{ fields: { Name: 'X' } }] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BASE_ID');
  });

  it('should reject missing tableId', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({ action: 'bulk_create', baseId: 'app1', records: [{ fields: { Name: 'X' } }] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TABLE_ID');
  });

  it('should reject missing records', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({ action: 'bulk_create', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_RECORDS');
  });

  it('should reject empty records array', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({ action: 'bulk_create', baseId: 'app1', tableId: 'tbl1', records: [] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_RECORDS');
  });

  it('should reject records as non-array', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({ action: 'bulk_create', baseId: 'app1', tableId: 'tbl1', records: 'bad' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_RECORDS');
  });

  it('should reject more than 10 records', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const records = Array.from({ length: 11 }, (_, i) => ({ fields: { Name: `Item ${i}` } }));
    const result = await execute({ action: 'bulk_create', baseId: 'app1', tableId: 'tbl1', records }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TOO_MANY_RECORDS');
    assert.ok(result.result.includes('10'));
    assert.ok(result.result.includes('11'));
  });

  it('should reject record without fields object', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({
      action: 'bulk_create', baseId: 'app1', tableId: 'tbl1',
      records: [{ fields: { Name: 'OK' } }, { notFields: true }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_RECORD_FORMAT');
    assert.ok(result.result.includes('index 1'));
  });

  it('should reject record with fields as array', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({
      action: 'bulk_create', baseId: 'app1', tableId: 'tbl1',
      records: [{ fields: ['bad'] }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_RECORD_FORMAT');
  });

  it('should use POST method', async () => {
    const { context, calls } = mockContextWithSpy(sampleBulkCreated);
    await execute({
      action: 'bulk_create', baseId: 'app1', tableId: 'tbl1',
      records: [{ fields: { Name: 'X' } }],
    }, context);
    assert.equal(calls[0].method, 'POST');
  });

  it('should call the correct path', async () => {
    const { context, calls } = mockContextWithSpy(sampleBulkCreated);
    await execute({
      action: 'bulk_create', baseId: 'app1', tableId: 'tbl1',
      records: [{ fields: { Name: 'X' } }],
    }, context);
    assert.equal(calls[0].path, '/v0/app1/tbl1');
  });

  it('should pass records array in body', async () => {
    const { context, calls } = mockContextWithSpy(sampleBulkCreated);
    await execute({
      action: 'bulk_create', baseId: 'app1', tableId: 'tbl1',
      records: [{ fields: { Name: 'A' } }, { fields: { Name: 'B' } }],
    }, context);
    assert.deepEqual(calls[0].body, {
      records: [{ fields: { Name: 'A' } }, { fields: { Name: 'B' } }],
    });
  });

  it('should accept exactly 10 records', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const records = Array.from({ length: 10 }, (_, i) => ({ fields: { Name: `Item ${i}` } }));
    const result = await execute({ action: 'bulk_create', baseId: 'app1', tableId: 'tbl1', records }, ctx);
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 12. Timeout handling
// ---------------------------------------------------------------------------
describe('airtable-database: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for list_bases', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for list_tables', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_tables', baseId: 'app1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for list_records', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for get_record', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for create_record', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: { N: 'X' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for delete_record', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'delete_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 13. Network error handling
// ---------------------------------------------------------------------------
describe('airtable-database: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for list_bases', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for list_records', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for create_record', async () => {
    const ctx = mockContextError(new Error('Network unreachable'));
    const result = await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: { N: 'X' } }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for delete_record', async () => {
    const ctx = mockContextError(new Error('Socket timeout'));
    const result = await execute({ action: 'delete_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for search_records', async () => {
    const ctx = mockContextError(new Error('ECONNREFUSED'));
    const result = await execute({ action: 'search_records', baseId: 'app1', tableId: 'tbl1', formula: 'X' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for bulk_create', async () => {
    const ctx = mockContextError(new Error('Connection reset'));
    const result = await execute({
      action: 'bulk_create', baseId: 'app1', tableId: 'tbl1',
      records: [{ fields: { N: 'X' } }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Specific error message'));
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.ok(result.result.includes('Specific error message'));
  });
});

// ---------------------------------------------------------------------------
// 14. getClient helper
// ---------------------------------------------------------------------------
describe('airtable-database: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient', () => {
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
// 15. redactSensitive
// ---------------------------------------------------------------------------
describe('airtable-database: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: pat123456789abcdef data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('pat123456789abcdef'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact token patterns', () => {
    const input = 'token=mySecretToken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('mySecretToken123'));
  });

  it('should not alter clean strings', () => {
    const input = 'My Table has 5 records';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should redact bearer patterns', () => {
    const input = 'bearer: some_token_value';
    const output = redactSensitive(input);
    assert.ok(output.includes('[REDACTED]'));
  });
});

// ---------------------------------------------------------------------------
// 16. sanitizeString
// ---------------------------------------------------------------------------
describe('airtable-database: sanitizeString', () => {
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

  it('should handle empty string', () => {
    assert.equal(sanitizeString(''), '');
  });
});

// ---------------------------------------------------------------------------
// 17. L1 compliance - no hardcoded URLs
// ---------------------------------------------------------------------------
describe('airtable-database: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded airtable.com URLs in request paths', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecord);
    await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, context);
    for (const call of calls) {
      assert.ok(!call.path.includes('https://'), 'Path must not contain https://');
      assert.ok(!call.path.includes('api.airtable.com'), 'Path must not contain api.airtable.com');
      assert.ok(call.path.startsWith('/v0/'), 'Path must start with /v0/');
    }
  });

  it('should use /v0/ prefix for record API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);

    await execute({ action: 'list_records', baseId: 'a', tableId: 't' }, context);
    await execute({ action: 'get_record', baseId: 'a', tableId: 't', recordId: 'r' }, context);
    await execute({ action: 'create_record', baseId: 'a', tableId: 't', fields: { X: 1 } }, context);
    await execute({ action: 'update_record', baseId: 'a', tableId: 't', recordId: 'r', fields: { X: 1 } }, context);
    await execute({ action: 'delete_record', baseId: 'a', tableId: 't', recordId: 'r' }, context);
    await execute({ action: 'search_records', baseId: 'a', tableId: 't', formula: 'F' }, context);
    await execute({ action: 'bulk_create', baseId: 'a', tableId: 't', records: [{ fields: { X: 1 } }] }, context);

    assert.ok(calls.length >= 7, `Expected at least 7 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.path.startsWith('/v0/'), `Path "${call.path}" must start with /v0/`);
    }
  });

  it('should use /v0/meta/ prefix for meta API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleBases);

    await execute({ action: 'list_bases' }, context);
    await execute({ action: 'list_tables', baseId: 'app1' }, context);

    assert.equal(calls.length, 2);
    assert.ok(calls[0].path.startsWith('/v0/meta/'), `Path "${calls[0].path}" must start with /v0/meta/`);
    assert.ok(calls[1].path.startsWith('/v0/meta/'), `Path "${calls[1].path}" must start with /v0/meta/`);
  });
});

// ---------------------------------------------------------------------------
// 18. HTTP method correctness
// ---------------------------------------------------------------------------
describe('airtable-database: HTTP methods', () => {
  beforeEach(() => {});

  it('should use GET for list_bases', async () => {
    const { context, calls } = mockContextWithSpy(sampleBases);
    await execute({ action: 'list_bases' }, context);
    assert.equal(calls[0].method, 'GET');
  });

  it('should use GET for list_tables', async () => {
    const { context, calls } = mockContextWithSpy(sampleTables);
    await execute({ action: 'list_tables', baseId: 'app1' }, context);
    assert.equal(calls[0].method, 'GET');
  });

  it('should use GET for list_records', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, context);
    assert.equal(calls[0].method, 'GET');
  });

  it('should use GET for get_record', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecord);
    await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, context);
    assert.equal(calls[0].method, 'GET');
  });

  it('should use GET for search_records', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'search_records', baseId: 'app1', tableId: 'tbl1', formula: 'X' }, context);
    assert.equal(calls[0].method, 'GET');
  });

  it('should use POST for create_record', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedRecord);
    await execute({ action: 'create_record', baseId: 'app1', tableId: 'tbl1', fields: { X: 1 } }, context);
    assert.equal(calls[0].method, 'POST');
  });

  it('should use PATCH for update_record', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedRecord);
    await execute({ action: 'update_record', baseId: 'app1', tableId: 'tbl1', recordId: 'r1', fields: { X: 1 } }, context);
    assert.equal(calls[0].method, 'PATCH');
  });

  it('should use DELETE for delete_record', async () => {
    const { context, calls } = mockContextWithSpy(sampleDeletedRecord);
    await execute({ action: 'delete_record', baseId: 'app1', tableId: 'tbl1', recordId: 'r1' }, context);
    assert.equal(calls[0].method, 'DELETE');
  });

  it('should use POST for bulk_create', async () => {
    const { context, calls } = mockContextWithSpy(sampleBulkCreated);
    await execute({ action: 'bulk_create', baseId: 'app1', tableId: 'tbl1', records: [{ fields: { X: 1 } }] }, context);
    assert.equal(calls[0].method, 'POST');
  });
});

// ---------------------------------------------------------------------------
// 19. Gateway client fallback
// ---------------------------------------------------------------------------
describe('airtable-database: gateway client fallback', () => {
  beforeEach(() => {});

  it('should work with gatewayClient when providerClient is absent', async () => {
    const ctx = {
      gatewayClient: {
        request: async () => sampleBases,
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 2);
  });

  it('should track calls through gatewayClient', async () => {
    const calls = [];
    const ctx = {
      gatewayClient: {
        request: async (method, path, body) => {
          calls.push({ method, path, body });
          return sampleRecord;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' }, ctx);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
  });
});

// ---------------------------------------------------------------------------
// 20. Edge cases
// ---------------------------------------------------------------------------
describe('airtable-database: edge cases', () => {
  beforeEach(() => {});

  it('should handle response with missing fields in record', async () => {
    const ctx = mockContext({ id: 'rec001', createdTime: '2025-01-01T00:00:00.000Z' });
    const result = await execute({ action: 'get_record', baseId: 'app1', tableId: 'tbl1', recordId: 'rec001' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('No fields'));
  });

  it('should handle response with null data for list_bases', async () => {
    const ctx = mockContext(null);
    const result = await execute({ action: 'list_bases' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should handle response with null data for list_tables', async () => {
    const ctx = mockContext(null);
    const result = await execute({ action: 'list_tables', baseId: 'app1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should handle response with null data for list_records', async () => {
    const ctx = mockContext(null);
    const result = await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
  });

  it('should clamp maxRecords below 1 to 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1', maxRecords: 0 }, context);
    assert.ok(calls[0].path.includes('maxRecords=1'));
  });

  it('should clamp maxRecords above 1000 to 1000', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1', maxRecords: 5000 }, context);
    assert.ok(calls[0].path.includes('maxRecords=1000'));
  });

  it('should floor non-integer maxRecords', async () => {
    const { context, calls } = mockContextWithSpy(sampleRecords);
    await execute({ action: 'list_records', baseId: 'app1', tableId: 'tbl1', maxRecords: 7.9 }, context);
    assert.ok(calls[0].path.includes('maxRecords=7'));
  });

  it('should sanitize baseId with control characters', async () => {
    const { context, calls } = mockContextWithSpy(sampleTables);
    await execute({ action: 'list_tables', baseId: '  app\x00ABC  ' }, context);
    assert.ok(calls[0].path.includes('appABC'));
    assert.ok(!calls[0].path.includes('\x00'));
  });

  it('should handle bulk_create with null record in array', async () => {
    const ctx = mockContext(sampleBulkCreated);
    const result = await execute({
      action: 'bulk_create', baseId: 'app1', tableId: 'tbl1',
      records: [null],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_RECORD_FORMAT');
  });
});
