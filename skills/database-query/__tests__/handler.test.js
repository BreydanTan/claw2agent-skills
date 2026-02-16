import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock gateway client with a configurable fetch method.
 *
 * @param {Function|Object} fetchImpl - Fetch implementation or static response
 * @returns {{ fetch: Function }}
 */
function createMockGatewayClient(fetchImpl) {
  if (typeof fetchImpl === 'function') {
    return { fetch: fetchImpl };
  }
  return { fetch: async () => fetchImpl };
}

/**
 * Create a context with a mock gateway client.
 */
function createContext(fetchResponse, configOverrides = {}) {
  return {
    gatewayClient: createMockGatewayClient(fetchResponse),
    config: {
      provider: 'gateway',
      timeoutMs: 5000,
      maxCostUsd: 0.10,
      maxRows: 100,
      allowedDatabases: ['default', 'analytics', 'reporting'],
      ...configOverrides,
    },
  };
}

/**
 * Create a context without a gateway client.
 */
function createEmptyContext() {
  return {};
}

// ---------------------------------------------------------------------------
// 1. Validation & Edge Cases
// ---------------------------------------------------------------------------

describe('database-query: validation', () => {
  beforeEach(() => {
    // No shared state to reset for validation tests
  });

  it('should return INVALID_ACTION for missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_ACTION');
    assert.equal(result.metadata.layer, 'L2');
  });

  it('should return INVALID_ACTION for unknown action', async () => {
    const result = await execute({ action: 'drop_everything' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_ACTION');
    assert.ok(result.result.includes('drop_everything'));
  });

  it('should return INVALID_ACTION for null action', async () => {
    const result = await execute({ action: null }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_ACTION');
  });

  it('should list valid actions in INVALID_ACTION error', async () => {
    const result = await execute({ action: 'bad' }, {});
    assert.ok(result.result.includes('query'));
    assert.ok(result.result.includes('execute'));
    assert.ok(result.result.includes('describe_table'));
    assert.ok(result.result.includes('list_tables'));
    assert.ok(result.result.includes('explain'));
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all actions
// ---------------------------------------------------------------------------

describe('database-query: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {
    // Empty context for each test
  });

  it('should return PROVIDER_NOT_CONFIGURED for query without gateway', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      createEmptyContext()
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
    assert.equal(result.metadata.layer, 'L2');
  });

  it('should return PROVIDER_NOT_CONFIGURED for execute without gateway', async () => {
    const result = await execute(
      { action: 'execute', sql: 'INSERT INTO t VALUES(1)', database: 'default', confirm: true },
      createEmptyContext()
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should return PROVIDER_NOT_CONFIGURED for describe_table without gateway', async () => {
    const result = await execute(
      { action: 'describe_table', table: 'users', database: 'default' },
      createEmptyContext()
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should return PROVIDER_NOT_CONFIGURED for list_tables without gateway', async () => {
    const result = await execute(
      { action: 'list_tables', database: 'default' },
      createEmptyContext()
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should return PROVIDER_NOT_CONFIGURED for explain without gateway', async () => {
    const result = await execute(
      { action: 'explain', sql: 'SELECT 1', database: 'default' },
      createEmptyContext()
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should mention gateway client in PROVIDER_NOT_CONFIGURED message', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      createEmptyContext()
    );
    assert.ok(result.metadata.error.message.includes('gatewayClient'));
  });
});

// ---------------------------------------------------------------------------
// 3. query action: read-only validation
// ---------------------------------------------------------------------------

describe('database-query: query - read-only SQL validation', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext({
      rows: [{ id: 1, name: 'Alice' }],
      columns: ['id', 'name'],
      truncated: false,
    });
  });

  it('should allow a simple SELECT query', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT id, name FROM users', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'query');
    assert.equal(result.metadata.layer, 'L2');
    assert.equal(result.metadata.rowCount, 1);
  });

  it('should allow a WITH (CTE) query', async () => {
    const result = await execute(
      { action: 'query', sql: 'WITH cte AS (SELECT 1 AS n) SELECT * FROM cte', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, true);
  });

  it('should allow an EXPLAIN query', async () => {
    const result = await execute(
      { action: 'query', sql: 'EXPLAIN SELECT * FROM users', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, true);
  });

  it('should block INSERT in query action', async () => {
    const result = await execute(
      { action: 'query', sql: "INSERT INTO users (name) VALUES ('Alice')", database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
    assert.ok(result.metadata.error.message.includes('INSERT'));
  });

  it('should block UPDATE in query action', async () => {
    const result = await execute(
      { action: 'query', sql: "UPDATE users SET name = 'Bob' WHERE id = 1", database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
    assert.ok(result.metadata.error.message.includes('UPDATE'));
  });

  it('should block DELETE in query action', async () => {
    const result = await execute(
      { action: 'query', sql: 'DELETE FROM users WHERE id = 1', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
    assert.ok(result.metadata.error.message.includes('DELETE'));
  });

  it('should block DROP in query action', async () => {
    const result = await execute(
      { action: 'query', sql: 'DROP TABLE users', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
    assert.ok(result.metadata.error.message.includes('DROP'));
  });

  it('should block ALTER in query action', async () => {
    const result = await execute(
      { action: 'query', sql: 'ALTER TABLE users ADD COLUMN age INT', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
  });

  it('should block CREATE in query action', async () => {
    const result = await execute(
      { action: 'query', sql: 'CREATE TABLE evil (id INT)', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
  });

  it('should block TRUNCATE in query action', async () => {
    const result = await execute(
      { action: 'query', sql: 'TRUNCATE TABLE users', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
  });

  it('should block GRANT in query action', async () => {
    const result = await execute(
      { action: 'query', sql: 'GRANT ALL ON users TO public', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
  });

  it('should block REVOKE in query action', async () => {
    const result = await execute(
      { action: 'query', sql: 'REVOKE ALL ON users FROM public', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
  });

  it('should block chained DROP after SELECT via semicolon', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT 1; DROP TABLE users', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_NOT_ALLOWED');
  });

  it('should require sql parameter', async () => {
    const result = await execute(
      { action: 'query', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'MISSING_PARAMETER');
  });

  it('should require database parameter', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT 1' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'MISSING_PARAMETER');
  });
});

// ---------------------------------------------------------------------------
// 4. SQL injection prevention
// ---------------------------------------------------------------------------

describe('database-query: SQL injection prevention', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext({ rows: [], columns: [], truncated: false });
  });

  it('should detect OR tautology injection (number)', async () => {
    const result = await execute(
      { action: 'query', sql: "SELECT * FROM users WHERE id = '1' OR 1=1", database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_INJECTION_DETECTED');
  });

  it('should detect OR tautology injection (string)', async () => {
    const result = await execute(
      { action: 'query', sql: "SELECT * FROM users WHERE name = '' OR 'x'='x'", database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_INJECTION_DETECTED');
  });

  it('should detect UNION SELECT injection', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT name FROM users UNION SELECT password FROM admin', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_INJECTION_DETECTED');
  });

  it('should detect UNION ALL SELECT injection', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT name FROM users UNION ALL SELECT password FROM admin', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_INJECTION_DETECTED');
  });

  it('should detect statement chaining injection', async () => {
    const result = await execute(
      { action: 'query', sql: "SELECT 1; DROP TABLE users", database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    // Could be SQL_NOT_ALLOWED or SQL_INJECTION_DETECTED
    assert.ok(
      result.metadata.error.code === 'SQL_NOT_ALLOWED' || result.metadata.error.code === 'SQL_INJECTION_DETECTED',
      `Expected SQL_NOT_ALLOWED or SQL_INJECTION_DETECTED but got ${result.metadata.error.code}`
    );
  });

  it('should detect WAITFOR DELAY time-based injection', async () => {
    const result = await execute(
      { action: 'query', sql: "SELECT * FROM users WHERE id = 1; WAITFOR DELAY '00:00:10'", database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
  });

  it('should detect BENCHMARK time-based injection', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT BENCHMARK(1000000, SHA1("test")) FROM users', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_INJECTION_DETECTED');
  });

  it('should detect SLEEP time-based injection', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT SLEEP(10) FROM users', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_INJECTION_DETECTED');
  });

  it('should detect string concatenation in SQL', async () => {
    const result = await execute(
      { action: 'query', sql: "SELECT * FROM users WHERE name = '" + "' + userInput + '", database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_INJECTION_DETECTED');
  });

  it('should also detect injection in execute action', async () => {
    const result = await execute(
      { action: 'execute', sql: "INSERT INTO users VALUES (1); DROP TABLE users", database: 'default', confirm: true },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'SQL_INJECTION_DETECTED');
  });
});

// ---------------------------------------------------------------------------
// 5. Write confirmation requirement (execute action)
// ---------------------------------------------------------------------------

describe('database-query: execute - confirmation requirement', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext({ rowsAffected: 3 });
  });

  it('should reject write without confirm flag', async () => {
    const result = await execute(
      { action: 'execute', sql: "INSERT INTO users (name) VALUES ($1)", database: 'default', params: ['Alice'] },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'CONFIRMATION_REQUIRED');
  });

  it('should reject write with confirm=false', async () => {
    const result = await execute(
      { action: 'execute', sql: "INSERT INTO users (name) VALUES ($1)", database: 'default', params: ['Alice'], confirm: false },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'CONFIRMATION_REQUIRED');
  });

  it('should reject write with confirm as string "true"', async () => {
    const result = await execute(
      { action: 'execute', sql: "INSERT INTO users (name) VALUES ($1)", database: 'default', params: ['Alice'], confirm: 'true' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'CONFIRMATION_REQUIRED');
  });

  it('should accept write with confirm=true', async () => {
    const result = await execute(
      { action: 'execute', sql: "INSERT INTO users (name) VALUES ($1)", database: 'default', params: ['Alice'], confirm: true },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'execute');
    assert.equal(result.metadata.rowsAffected, 3);
  });

  it('should include safety message in CONFIRMATION_REQUIRED error', async () => {
    const result = await execute(
      { action: 'execute', sql: "DELETE FROM users WHERE id = 1", database: 'default' },
      ctx
    );
    assert.ok(result.result.includes('confirmation'));
    assert.ok(result.metadata.error.message.includes('confirm'));
  });
});

// ---------------------------------------------------------------------------
// 6. Timeout and cost limit enforcement
// ---------------------------------------------------------------------------

describe('database-query: timeout and cost limits', () => {
  let fetchCalls;

  beforeEach(() => {
    fetchCalls = [];
  });

  it('should pass default timeout to gateway client', async () => {
    const ctx = createContext(async (endpoint, params) => {
      fetchCalls.push(params);
      return { rows: [], columns: [], truncated: false };
    }, { timeoutMs: undefined });

    await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      { gatewayClient: ctx.gatewayClient, config: {} }
    );

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].timeoutMs, 30000);
  });

  it('should cap timeout at 60000ms', async () => {
    const ctx = createContext(async (endpoint, params) => {
      fetchCalls.push(params);
      return { rows: [], columns: [], truncated: false };
    });

    await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default', timeout: 120000 },
      ctx
    );

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].timeoutMs, 60000);
  });

  it('should use custom timeout within allowed range', async () => {
    const ctx = createContext(async (endpoint, params) => {
      fetchCalls.push(params);
      return { rows: [], columns: [], truncated: false };
    });

    await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default', timeout: 15000 },
      ctx
    );

    assert.equal(fetchCalls[0].timeoutMs, 15000);
  });

  it('should pass maxRows to gateway client', async () => {
    const ctx = createContext(async (endpoint, params) => {
      fetchCalls.push(params);
      return { rows: [], columns: [], truncated: false };
    });

    await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default', maxRows: 50 },
      ctx
    );

    assert.equal(fetchCalls[0].maxRows, 50);
  });

  it('should pass maxCostUsd to gateway client', async () => {
    const ctx = createContext(async (endpoint, params) => {
      fetchCalls.push(params);
      return { rows: [], columns: [], truncated: false };
    });

    await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      ctx
    );

    assert.equal(fetchCalls[0].maxCostUsd, 0.10);
  });
});

// ---------------------------------------------------------------------------
// 7. query action: successful responses
// ---------------------------------------------------------------------------

describe('database-query: query - success responses', () => {
  beforeEach(() => {
    // Fresh context per test in the it blocks
  });

  it('should format rows as table in result text', async () => {
    const ctx = createContext({
      rows: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
      columns: ['id', 'name'],
      truncated: false,
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT id, name FROM users', database: 'default' },
      ctx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.rowCount, 2);
    assert.ok(result.result.includes('Alice'));
    assert.ok(result.result.includes('Bob'));
    assert.ok(result.result.includes('2 row(s)'));
  });

  it('should handle empty result set', async () => {
    const ctx = createContext({
      rows: [],
      columns: ['id', 'name'],
      truncated: false,
    });

    const result = await execute(
      { action: 'query', sql: "SELECT id, name FROM users WHERE id = -1", database: 'default' },
      ctx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.rowCount, 0);
    assert.ok(result.result.includes('No rows'));
  });

  it('should indicate truncated results', async () => {
    const ctx = createContext({
      rows: [{ id: 1 }],
      columns: ['id'],
      truncated: true,
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT id FROM big_table', database: 'default' },
      ctx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.truncated, true);
    assert.ok(result.result.includes('truncated'));
  });

  it('should handle NULL values in results', async () => {
    const ctx = createContext({
      rows: [{ id: 1, name: null }],
      columns: ['id', 'name'],
      truncated: false,
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT id, name FROM users', database: 'default' },
      ctx
    );

    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('NULL'));
  });

  it('should handle array-style rows', async () => {
    const ctx = createContext({
      rows: [[1, 'Alice'], [2, 'Bob']],
      columns: ['id', 'name'],
      truncated: false,
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT id, name FROM users', database: 'default' },
      ctx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.rowCount, 2);
  });

  it('should pass parameterized values to gateway', async () => {
    let capturedParams;
    const ctx = createContext(async (endpoint, params) => {
      capturedParams = params;
      return { rows: [], columns: [], truncated: false };
    });

    await execute(
      { action: 'query', sql: 'SELECT * FROM users WHERE id = $1', database: 'default', params: [42] },
      ctx
    );

    assert.deepEqual(capturedParams.params, [42]);
  });
});

// ---------------------------------------------------------------------------
// 8. describe_table action
// ---------------------------------------------------------------------------

describe('database-query: describe_table', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext({
      columns: [
        { name: 'id', type: 'integer', nullable: false, primaryKey: true, defaultValue: null },
        { name: 'name', type: 'varchar(255)', nullable: true, primaryKey: false, defaultValue: null },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, defaultValue: 'NOW()' },
      ],
    });
  });

  it('should return table schema', async () => {
    const result = await execute(
      { action: 'describe_table', table: 'users', database: 'default' },
      ctx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'describe_table');
    assert.equal(result.metadata.columnCount, 3);
    assert.ok(result.result.includes('id'));
    assert.ok(result.result.includes('integer'));
    assert.ok(result.result.includes('[PK]'));
  });

  it('should require table parameter', async () => {
    const result = await execute(
      { action: 'describe_table', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'MISSING_PARAMETER');
  });

  it('should require database parameter', async () => {
    const result = await execute(
      { action: 'describe_table', table: 'users' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'MISSING_PARAMETER');
  });

  it('should show default values in schema', async () => {
    const result = await execute(
      { action: 'describe_table', table: 'users', database: 'default' },
      ctx
    );

    assert.ok(result.result.includes('DEFAULT NOW()'));
  });

  it('should show NOT NULL constraint', async () => {
    const result = await execute(
      { action: 'describe_table', table: 'users', database: 'default' },
      ctx
    );

    assert.ok(result.result.includes('NOT NULL'));
  });
});

// ---------------------------------------------------------------------------
// 9. list_tables action
// ---------------------------------------------------------------------------

describe('database-query: list_tables', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext({
      tables: ['users', 'orders', 'products'],
    });
  });

  it('should list tables', async () => {
    const result = await execute(
      { action: 'list_tables', database: 'default' },
      ctx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_tables');
    assert.equal(result.metadata.tableCount, 3);
    assert.ok(result.result.includes('users'));
    assert.ok(result.result.includes('orders'));
    assert.ok(result.result.includes('products'));
  });

  it('should handle empty table list', async () => {
    const emptyCtx = createContext({ tables: [] });

    const result = await execute(
      { action: 'list_tables', database: 'default' },
      emptyCtx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.tableCount, 0);
    assert.ok(result.result.includes('No tables found'));
  });

  it('should pass schema filter to gateway', async () => {
    let capturedParams;
    const schemaCtx = createContext(async (endpoint, params) => {
      capturedParams = params;
      return { tables: ['users'] };
    });

    const result = await execute(
      { action: 'list_tables', database: 'default', schema: 'public' },
      schemaCtx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(capturedParams.schema, 'public');
  });

  it('should require database parameter', async () => {
    const result = await execute(
      { action: 'list_tables' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'MISSING_PARAMETER');
  });

  it('should handle table objects with name property', async () => {
    const objCtx = createContext({
      tables: [{ name: 'users', schema: 'public' }, { name: 'orders', schema: 'public' }],
    });

    const result = await execute(
      { action: 'list_tables', database: 'default' },
      objCtx
    );

    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('users'));
    assert.ok(result.result.includes('orders'));
  });
});

// ---------------------------------------------------------------------------
// 10. explain action
// ---------------------------------------------------------------------------

describe('database-query: explain', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext({
      plan: 'Seq Scan on users  (cost=0.00..35.50 rows=1000 width=72)',
    });
  });

  it('should return query execution plan', async () => {
    const result = await execute(
      { action: 'explain', sql: 'SELECT * FROM users', database: 'default' },
      ctx
    );

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'explain');
    assert.ok(result.result.includes('Seq Scan'));
    assert.ok(result.result.includes('execution plan'));
  });

  it('should require sql parameter', async () => {
    const result = await execute(
      { action: 'explain', database: 'default' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'MISSING_PARAMETER');
  });

  it('should require database parameter', async () => {
    const result = await execute(
      { action: 'explain', sql: 'SELECT 1' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'MISSING_PARAMETER');
  });

  it('should handle object plan response', async () => {
    const objCtx = createContext({
      plan: { type: 'Seq Scan', table: 'users', cost: '0.00..35.50' },
    });

    const result = await execute(
      { action: 'explain', sql: 'SELECT * FROM users', database: 'default' },
      objCtx
    );

    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Seq Scan'));
  });

  it('should handle explanation field instead of plan', async () => {
    const explCtx = createContext({
      explanation: 'Index Scan using users_pkey on users',
    });

    const result = await execute(
      { action: 'explain', sql: 'SELECT * FROM users WHERE id = 1', database: 'default' },
      explCtx
    );

    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Index Scan'));
  });
});

// ---------------------------------------------------------------------------
// 11. Database allow-list
// ---------------------------------------------------------------------------

describe('database-query: database allow-list', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext(
      { rows: [], columns: [], truncated: false },
      { allowedDatabases: ['production', 'staging'] }
    );
  });

  it('should allow queries to databases in the allowed list', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'production' },
      ctx
    );
    assert.equal(result.metadata.success, true);
  });

  it('should block queries to databases not in the allowed list', async () => {
    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'secret_db' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'DATABASE_NOT_ALLOWED');
    assert.ok(result.metadata.error.message.includes('secret_db'));
  });

  it('should allow any database when allowedDatabases contains wildcard', async () => {
    const wildcardCtx = createContext(
      { rows: [], columns: [], truncated: false },
      { allowedDatabases: ['*'] }
    );

    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'any_db' },
      wildcardCtx
    );
    assert.equal(result.metadata.success, true);
  });

  it('should enforce database allow-list on execute action', async () => {
    const result = await execute(
      { action: 'execute', sql: "INSERT INTO t VALUES (1)", database: 'forbidden_db', confirm: true },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'DATABASE_NOT_ALLOWED');
  });

  it('should enforce database allow-list on describe_table action', async () => {
    const result = await execute(
      { action: 'describe_table', table: 'users', database: 'forbidden_db' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'DATABASE_NOT_ALLOWED');
  });

  it('should enforce database allow-list on list_tables action', async () => {
    const result = await execute(
      { action: 'list_tables', database: 'forbidden_db' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'DATABASE_NOT_ALLOWED');
  });

  it('should enforce database allow-list on explain action', async () => {
    const result = await execute(
      { action: 'explain', sql: 'SELECT 1', database: 'forbidden_db' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'DATABASE_NOT_ALLOWED');
  });
});

// ---------------------------------------------------------------------------
// 12. Gateway error handling
// ---------------------------------------------------------------------------

describe('database-query: gateway error handling', () => {
  beforeEach(() => {
    // Tests create their own contexts
  });

  it('should handle gateway fetch error gracefully for query', async () => {
    const errorCtx = createContext(async () => {
      throw new Error('Connection timeout');
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      errorCtx
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'QUERY_FAILED');
    assert.equal(result.metadata.error.retriable, true);
    assert.ok(result.result.includes('Connection timeout'));
  });

  it('should handle gateway fetch error gracefully for execute', async () => {
    const errorCtx = createContext(async () => {
      throw new Error('Permission denied');
    });

    const result = await execute(
      { action: 'execute', sql: "INSERT INTO t VALUES (1)", database: 'default', confirm: true },
      errorCtx
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'EXECUTE_FAILED');
  });

  it('should handle gateway fetch error gracefully for describe_table', async () => {
    const errorCtx = createContext(async () => {
      throw new Error('Table not found');
    });

    const result = await execute(
      { action: 'describe_table', table: 'nonexistent', database: 'default' },
      errorCtx
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'DESCRIBE_FAILED');
  });

  it('should handle gateway fetch error gracefully for list_tables', async () => {
    const errorCtx = createContext(async () => {
      throw new Error('Database offline');
    });

    const result = await execute(
      { action: 'list_tables', database: 'default' },
      errorCtx
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'LIST_TABLES_FAILED');
  });

  it('should handle gateway fetch error gracefully for explain', async () => {
    const errorCtx = createContext(async () => {
      throw new Error('Syntax error');
    });

    const result = await execute(
      { action: 'explain', sql: 'INVALID SQL', database: 'default' },
      errorCtx
    );

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'EXPLAIN_FAILED');
  });

  it('should redact connection details from error messages', async () => {
    const errorCtx = createContext(async () => {
      throw new Error('Connection to host=db.secret.internal port=5432 password=s3cret failed');
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      errorCtx
    );

    assert.equal(result.metadata.success, false);
    assert.ok(!result.result.includes('db.secret.internal'), 'Host should be redacted');
    assert.ok(!result.result.includes('s3cret'), 'Password should be redacted');
  });
});

// ---------------------------------------------------------------------------
// 13. Connection detail redaction
// ---------------------------------------------------------------------------

describe('database-query: connection detail redaction', () => {
  beforeEach(() => {
    // Tests create their own contexts
  });

  it('should redact host from error message', async () => {
    const ctx = createContext(async () => {
      throw new Error('host=192.168.1.100 connection refused');
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      ctx
    );

    assert.ok(!result.result.includes('192.168.1.100'));
  });

  it('should redact connection URI from error message', async () => {
    const ctx = createContext(async () => {
      throw new Error('Failed connecting to postgres://admin:secret@db.internal:5432/mydb');
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      ctx
    );

    assert.ok(!result.result.includes('postgres://admin:secret@db.internal:5432/mydb'));
  });

  it('should redact password from error message', async () => {
    const ctx = createContext(async () => {
      throw new Error('password=mysecretpassword authentication failed');
    });

    const result = await execute(
      { action: 'query', sql: 'SELECT 1', database: 'default' },
      ctx
    );

    assert.ok(!result.result.includes('mysecretpassword'));
  });
});

// ---------------------------------------------------------------------------
// 14. Gateway client fetch endpoint verification
// ---------------------------------------------------------------------------

describe('database-query: gateway fetch endpoints', () => {
  let capturedEndpoint;

  beforeEach(() => {
    capturedEndpoint = null;
  });

  it('should call database/query endpoint for query action', async () => {
    const ctx = createContext(async (endpoint) => {
      capturedEndpoint = endpoint;
      return { rows: [], columns: [], truncated: false };
    });

    await execute({ action: 'query', sql: 'SELECT 1', database: 'default' }, ctx);
    assert.equal(capturedEndpoint, 'database/query');
  });

  it('should call database/execute endpoint for execute action', async () => {
    const ctx = createContext(async (endpoint) => {
      capturedEndpoint = endpoint;
      return { rowsAffected: 0 };
    });

    await execute({ action: 'execute', sql: "INSERT INTO t VALUES (1)", database: 'default', confirm: true }, ctx);
    assert.equal(capturedEndpoint, 'database/execute');
  });

  it('should call database/describe_table endpoint', async () => {
    const ctx = createContext(async (endpoint) => {
      capturedEndpoint = endpoint;
      return { columns: [] };
    });

    await execute({ action: 'describe_table', table: 'users', database: 'default' }, ctx);
    assert.equal(capturedEndpoint, 'database/describe_table');
  });

  it('should call database/list_tables endpoint', async () => {
    const ctx = createContext(async (endpoint) => {
      capturedEndpoint = endpoint;
      return { tables: [] };
    });

    await execute({ action: 'list_tables', database: 'default' }, ctx);
    assert.equal(capturedEndpoint, 'database/list_tables');
  });

  it('should call database/explain endpoint', async () => {
    const ctx = createContext(async (endpoint) => {
      capturedEndpoint = endpoint;
      return { plan: '' };
    });

    await execute({ action: 'explain', sql: 'SELECT 1', database: 'default' }, ctx);
    assert.equal(capturedEndpoint, 'database/explain');
  });
});
