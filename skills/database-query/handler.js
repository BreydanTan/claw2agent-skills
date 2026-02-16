/**
 * Database Query Skill Handler
 *
 * L2 skill that executes database queries through the platform's gateway.
 * Supports multiple database types. NO direct database connections - everything
 * goes through context.gatewayClient.
 *
 * L2 Contract:
 * - Does NOT hardcode connection strings or vendor endpoints
 * - Does NOT directly read raw credentials
 * - Uses injected gatewayClient from context exclusively
 * - Fails with PROVIDER_NOT_CONFIGURED when gatewayClient is absent
 * - Enforces timeout (default 30s, max 60s)
 * - Enforces max result size (default 1000 rows)
 * - Validates read-only SQL for the query action
 * - Requires explicit confirmation for write operations
 * - Redacts connection details from all outputs
 * - Returns structured errors only
 */

const LAYER = 'L2';
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 60000;
const DEFAULT_MAX_ROWS = 1000;

// ---------------------------------------------------------------------------
// L2 Client Resolution
// ---------------------------------------------------------------------------

/**
 * Get the injected gateway client from context. Never instantiate or configure
 * a database client directly.
 *
 * @param {Object} context - Execution context from the runtime
 * @returns {Object|null} The gateway client or null
 */
function getGatewayClient(context) {
  if (context?.gatewayClient) return context.gatewayClient;
  return null;
}

/**
 * Return a standard PROVIDER_NOT_CONFIGURED error response.
 *
 * @param {string} action - The action that was attempted
 * @returns {{ result: string, metadata: Object }}
 */
function providerNotConfigured(action) {
  return {
    result: `Error: No database gateway configured. The "${action}" action requires a gateway client to proxy database operations. Configure a gateway provider in the platform settings.`,
    metadata: {
      success: false,
      action,
      layer: LAYER,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'No gatewayClient found in context. Platform adapter must inject a gateway client for database access.',
        retriable: false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Connection Detail Redaction
// ---------------------------------------------------------------------------

const CONNECTION_PATTERNS = [
  { regex: /(?:host|hostname|server)\s*[:=]\s*['"]?([^\s'",:;]+)['"]?/gi, label: '[REDACTED_HOST]' },
  { regex: /(?:port)\s*[:=]\s*['"]?(\d+)['"]?/gi, label: '[REDACTED_PORT]' },
  { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{4,})['"]?/gi, label: '[REDACTED_PASSWORD]' },
  { regex: /(?:user|username)\s*[:=]\s*['"]?([^\s'",:;]+)['"]?/gi, label: '[REDACTED_USER]' },
  { regex: /(?:connection[_-]?string|dsn|jdbc|odbc)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi, label: '[REDACTED_CONNECTION_STRING]' },
  { regex: /(?:mysql|postgres|postgresql|mssql|mongodb|redis):\/\/[^\s'"]+/gi, label: '[REDACTED_CONNECTION_URI]' },
  { regex: /(?:api[_-]?key|apikey|secret|token)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{8,})['"]?/gi, label: '[REDACTED_SECRET]' },
];

/**
 * Redact known connection/credential patterns from a string to prevent
 * leakage in logs and error messages.
 *
 * @param {string} str - Input string
 * @returns {string} - String with connection details redacted
 */
function redactConnectionDetails(str) {
  if (typeof str !== 'string') return String(str);
  let result = str;
  for (const { regex, label } of CONNECTION_PATTERNS) {
    result = result.replace(new RegExp(regex.source, regex.flags), label);
  }
  return result;
}

// ---------------------------------------------------------------------------
// SQL Validation
// ---------------------------------------------------------------------------

/**
 * Dangerous SQL keywords that are NOT allowed in read-only queries.
 * These are matched as whole words (case-insensitive) at the start of
 * a statement or after a semicolon.
 */
const WRITE_SQL_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  'MERGE',
  'UPSERT',
  'REPLACE',
  'RENAME',
  'CALL',
  'EXEC',
  'EXECUTE',
  'SET',
];

/**
 * SQL comment patterns used to hide malicious payloads.
 */
const SQL_COMMENT_PATTERNS = [
  /--\s/,                // single-line comment
  /\/\*[\s\S]*?\*\//,   // block comment
  /#\s/,                 // MySQL-style comment
];

/**
 * Validate that a SQL statement is read-only (SELECT, WITH, EXPLAIN only).
 * Returns null if valid, or an error message if a write operation is detected.
 *
 * @param {string} sql - SQL string to validate
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateReadOnlySQL(sql) {
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    return 'SQL statement is required and must be a non-empty string.';
  }

  // Strip string literals to prevent false positives from values containing keywords
  const stripped = sql.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');

  // Remove SQL comments that could hide write operations
  let cleaned = stripped;
  cleaned = cleaned.replace(/--[^\n]*/g, ' ');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, ' ');
  cleaned = cleaned.replace(/#[^\n]*/g, ' ');

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Split on semicolons to check each statement
  const statements = cleaned.split(';').map((s) => s.trim()).filter((s) => s.length > 0);

  for (const stmt of statements) {
    // Extract the first keyword of the statement
    const firstWord = stmt.split(/\s+/)[0].toUpperCase();

    // Only SELECT, WITH, and EXPLAIN are allowed
    if (firstWord !== 'SELECT' && firstWord !== 'WITH' && firstWord !== 'EXPLAIN') {
      // Check if it matches a known write keyword
      if (WRITE_SQL_KEYWORDS.includes(firstWord)) {
        return `Write operation "${firstWord}" is not allowed in read-only query mode. Use the "execute" action for write operations.`;
      }
      return `SQL statement starting with "${firstWord}" is not allowed in read-only query mode. Only SELECT, WITH, and EXPLAIN are permitted.`;
    }
  }

  // Additionally scan the full cleaned string for write keywords embedded via subqueries or tricks
  for (const keyword of WRITE_SQL_KEYWORDS) {
    // Match keyword as the start of a statement (after semicolon or at beginning)
    const embedPattern = new RegExp(`(?:;\\s*)${keyword}\\b`, 'i');
    if (embedPattern.test(cleaned)) {
      return `Write operation "${keyword}" detected embedded in the query. This is not allowed in read-only mode.`;
    }
  }

  return null;
}

/**
 * Check for common SQL injection patterns in parameter values.
 * Returns an array of detected injection patterns.
 *
 * @param {string} sql - The SQL query
 * @param {Array} params - The query parameters
 * @returns {string[]} Array of detected injection patterns
 */
function detectSQLInjection(sql, params) {
  const issues = [];

  // Check for string interpolation patterns in the SQL itself
  // (parameters should use placeholders like $1, ?, :name)
  if (/'\s*\+\s*/.test(sql) || /`\$\{/.test(sql)) {
    issues.push('String concatenation detected in SQL. Use parameterized placeholders instead.');
  }

  // Check if the SQL contains unparameterized values that look like injections
  if (/'\s*OR\s+'[^']*'\s*=\s*'/i.test(sql)) {
    issues.push('Possible SQL injection tautology detected (OR string=string).');
  }
  if (/'\s*OR\s+\d+\s*=\s*\d+/i.test(sql)) {
    issues.push('Possible SQL injection tautology detected (OR number=number).');
  }
  if (/;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)\b/i.test(sql)) {
    issues.push('Possible SQL injection via statement chaining detected.');
  }
  if (/UNION\s+(?:ALL\s+)?SELECT\b/i.test(sql)) {
    issues.push('Possible UNION-based SQL injection detected.');
  }
  if (/WAITFOR\s+DELAY\b/i.test(sql)) {
    issues.push('Possible time-based SQL injection detected (WAITFOR DELAY).');
  }
  if (/BENCHMARK\s*\(/i.test(sql)) {
    issues.push('Possible time-based SQL injection detected (BENCHMARK).');
  }
  if (/SLEEP\s*\(/i.test(sql)) {
    issues.push('Possible time-based SQL injection detected (SLEEP).');
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Config / Limit Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve effective configuration by merging defaults, skill config, and
 * per-call overrides.
 *
 * @param {Object} context - Execution context
 * @param {Object} params - Call parameters
 * @returns {{ timeoutMs: number, maxRows: number, maxCostUsd: number, allowedDatabases: string[] }}
 */
function resolveConfig(context, params) {
  const config = context?.config || {};

  let timeoutMs = params.timeout || config.timeoutMs || DEFAULT_TIMEOUT_MS;
  if (timeoutMs > MAX_TIMEOUT_MS) timeoutMs = MAX_TIMEOUT_MS;
  if (timeoutMs < 1) timeoutMs = DEFAULT_TIMEOUT_MS;

  let maxRows = params.maxRows || config.maxRows || DEFAULT_MAX_ROWS;
  if (maxRows < 1) maxRows = DEFAULT_MAX_ROWS;

  const maxCostUsd = config.maxCostUsd || 0.10;
  const allowedDatabases = config.allowedDatabases || ['default'];

  return { timeoutMs, maxRows, maxCostUsd, allowedDatabases };
}

/**
 * Validate that the requested database is in the allowed list.
 *
 * @param {string} database - Requested database name
 * @param {string[]} allowedDatabases - Allowed database names
 * @returns {string|null} Error message if not allowed, null if allowed
 */
function validateDatabase(database, allowedDatabases) {
  if (!database || typeof database !== 'string' || database.trim().length === 0) {
    return 'The "database" parameter is required and must be a non-empty string.';
  }
  // If allowedDatabases contains '*', any database is allowed
  if (allowedDatabases.includes('*')) return null;
  if (!allowedDatabases.includes(database)) {
    return `Database "${database}" is not in the allowed list. Allowed: ${allowedDatabases.join(', ')}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

/**
 * Execute a read-only (SELECT) query.
 *
 * @param {Object} params - Action parameters
 * @param {Object} context - Execution context
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
async function handleQuery(params, context) {
  const client = getGatewayClient(context);
  if (!client) return providerNotConfigured('query');

  const { sql, database, params: queryParams } = params;

  if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
    return {
      result: 'Error: The "sql" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'query', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'sql is required.', retriable: false },
      },
    };
  }

  if (!database || typeof database !== 'string' || database.trim().length === 0) {
    return {
      result: 'Error: The "database" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'query', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'database is required.', retriable: false },
      },
    };
  }

  const resolved = resolveConfig(context, params);

  // Validate database is allowed
  const dbError = validateDatabase(database, resolved.allowedDatabases);
  if (dbError) {
    return {
      result: `Error: ${dbError}`,
      metadata: {
        success: false, action: 'query', layer: LAYER,
        error: { code: 'DATABASE_NOT_ALLOWED', message: dbError, retriable: false },
      },
    };
  }

  // Validate read-only SQL
  const readOnlyError = validateReadOnlySQL(sql);
  if (readOnlyError) {
    return {
      result: `Error: ${readOnlyError}`,
      metadata: {
        success: false, action: 'query', layer: LAYER,
        error: { code: 'SQL_NOT_ALLOWED', message: readOnlyError, retriable: false },
      },
    };
  }

  // Check for SQL injection patterns
  const injectionIssues = detectSQLInjection(sql, queryParams);
  if (injectionIssues.length > 0) {
    return {
      result: `Error: Potential SQL injection detected: ${injectionIssues[0]}`,
      metadata: {
        success: false, action: 'query', layer: LAYER,
        error: { code: 'SQL_INJECTION_DETECTED', message: injectionIssues.join(' '), retriable: false },
        injectionIssues,
      },
    };
  }

  try {
    const response = await client.fetch('database/query', {
      sql,
      database,
      params: queryParams || [],
      timeoutMs: resolved.timeoutMs,
      maxRows: resolved.maxRows,
      maxCostUsd: resolved.maxCostUsd,
    });

    const rows = response?.rows || [];
    const columns = response?.columns || [];
    const rowCount = rows.length;
    const truncated = response?.truncated || false;

    // Format result as readable text
    let resultText;
    if (rowCount === 0) {
      resultText = 'Query executed successfully. No rows returned.';
    } else {
      const header = columns.join(' | ');
      const separator = columns.map(() => '---').join(' | ');
      const dataRows = rows.map((row) => {
        if (Array.isArray(row)) {
          return row.map((v) => (v === null ? 'NULL' : String(v))).join(' | ');
        }
        return columns.map((col) => {
          const val = row[col];
          return val === null ? 'NULL' : String(val);
        }).join(' | ');
      });

      resultText = `Query returned ${rowCount} row(s)${truncated ? ' (truncated)' : ''}:\n\n${header}\n${separator}\n${dataRows.join('\n')}`;
    }

    return {
      result: resultText,
      metadata: {
        success: true,
        action: 'query',
        layer: LAYER,
        rowCount,
        columns,
        truncated,
        database: redactConnectionDetails(database),
      },
    };
  } catch (error) {
    return {
      result: `Error executing query: ${redactConnectionDetails(error.message || 'Unknown error')}`,
      metadata: {
        success: false, action: 'query', layer: LAYER,
        error: {
          code: 'QUERY_FAILED',
          message: redactConnectionDetails(error.message || 'Unknown error'),
          retriable: true,
        },
      },
    };
  }
}

/**
 * Execute a write query (INSERT/UPDATE/DELETE) with confirmation.
 *
 * @param {Object} params - Action parameters
 * @param {Object} context - Execution context
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
async function handleExecute(params, context) {
  const client = getGatewayClient(context);
  if (!client) return providerNotConfigured('execute');

  const { sql, database, params: queryParams, confirm } = params;

  if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
    return {
      result: 'Error: The "sql" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'execute', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'sql is required.', retriable: false },
      },
    };
  }

  if (!database || typeof database !== 'string' || database.trim().length === 0) {
    return {
      result: 'Error: The "database" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'execute', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'database is required.', retriable: false },
      },
    };
  }

  const resolved = resolveConfig(context, params);

  // Validate database is allowed
  const dbError = validateDatabase(database, resolved.allowedDatabases);
  if (dbError) {
    return {
      result: `Error: ${dbError}`,
      metadata: {
        success: false, action: 'execute', layer: LAYER,
        error: { code: 'DATABASE_NOT_ALLOWED', message: dbError, retriable: false },
      },
    };
  }

  // Check for SQL injection patterns
  const injectionIssues = detectSQLInjection(sql, queryParams);
  if (injectionIssues.length > 0) {
    return {
      result: `Error: Potential SQL injection detected: ${injectionIssues[0]}`,
      metadata: {
        success: false, action: 'execute', layer: LAYER,
        error: { code: 'SQL_INJECTION_DETECTED', message: injectionIssues.join(' '), retriable: false },
        injectionIssues,
      },
    };
  }

  // Require explicit confirmation for write operations
  if (confirm !== true) {
    return {
      result: 'Warning: Write operations require explicit confirmation. Set confirm: true to proceed with this operation.',
      metadata: {
        success: false, action: 'execute', layer: LAYER,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Write operations require confirm: true. This is a safety measure to prevent accidental data modification.',
          retriable: false,
        },
        sql: redactConnectionDetails(sql),
      },
    };
  }

  try {
    const response = await client.fetch('database/execute', {
      sql,
      database,
      params: queryParams || [],
      timeoutMs: resolved.timeoutMs,
      maxCostUsd: resolved.maxCostUsd,
    });

    const rowsAffected = response?.rowsAffected ?? 0;

    return {
      result: `Write operation executed successfully. Rows affected: ${rowsAffected}.`,
      metadata: {
        success: true,
        action: 'execute',
        layer: LAYER,
        rowsAffected,
        database: redactConnectionDetails(database),
      },
    };
  } catch (error) {
    return {
      result: `Error executing write operation: ${redactConnectionDetails(error.message || 'Unknown error')}`,
      metadata: {
        success: false, action: 'execute', layer: LAYER,
        error: {
          code: 'EXECUTE_FAILED',
          message: redactConnectionDetails(error.message || 'Unknown error'),
          retriable: true,
        },
      },
    };
  }
}

/**
 * Get table schema/description.
 *
 * @param {Object} params - Action parameters
 * @param {Object} context - Execution context
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
async function handleDescribeTable(params, context) {
  const client = getGatewayClient(context);
  if (!client) return providerNotConfigured('describe_table');

  const { table, database } = params;

  if (!table || typeof table !== 'string' || table.trim().length === 0) {
    return {
      result: 'Error: The "table" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'describe_table', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'table is required.', retriable: false },
      },
    };
  }

  if (!database || typeof database !== 'string' || database.trim().length === 0) {
    return {
      result: 'Error: The "database" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'describe_table', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'database is required.', retriable: false },
      },
    };
  }

  const resolved = resolveConfig(context, params);

  const dbError = validateDatabase(database, resolved.allowedDatabases);
  if (dbError) {
    return {
      result: `Error: ${dbError}`,
      metadata: {
        success: false, action: 'describe_table', layer: LAYER,
        error: { code: 'DATABASE_NOT_ALLOWED', message: dbError, retriable: false },
      },
    };
  }

  try {
    const response = await client.fetch('database/describe_table', {
      table,
      database,
      timeoutMs: resolved.timeoutMs,
    });

    const columns = response?.columns || [];

    const formatted = columns.map((col) => {
      const nullable = col.nullable ? 'NULL' : 'NOT NULL';
      const defaultVal = col.defaultValue != null ? ` DEFAULT ${col.defaultValue}` : '';
      const pk = col.primaryKey ? ' [PK]' : '';
      return `  ${col.name} ${col.type} ${nullable}${defaultVal}${pk}`;
    });

    const resultText = `Table "${table}" schema:\n\n${formatted.join('\n')}`;

    return {
      result: resultText,
      metadata: {
        success: true,
        action: 'describe_table',
        layer: LAYER,
        table,
        columnCount: columns.length,
        columns,
        database: redactConnectionDetails(database),
      },
    };
  } catch (error) {
    return {
      result: `Error describing table: ${redactConnectionDetails(error.message || 'Unknown error')}`,
      metadata: {
        success: false, action: 'describe_table', layer: LAYER,
        error: {
          code: 'DESCRIBE_FAILED',
          message: redactConnectionDetails(error.message || 'Unknown error'),
          retriable: true,
        },
      },
    };
  }
}

/**
 * List all tables in a database.
 *
 * @param {Object} params - Action parameters
 * @param {Object} context - Execution context
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
async function handleListTables(params, context) {
  const client = getGatewayClient(context);
  if (!client) return providerNotConfigured('list_tables');

  const { database, schema } = params;

  if (!database || typeof database !== 'string' || database.trim().length === 0) {
    return {
      result: 'Error: The "database" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'list_tables', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'database is required.', retriable: false },
      },
    };
  }

  const resolved = resolveConfig(context, params);

  const dbError = validateDatabase(database, resolved.allowedDatabases);
  if (dbError) {
    return {
      result: `Error: ${dbError}`,
      metadata: {
        success: false, action: 'list_tables', layer: LAYER,
        error: { code: 'DATABASE_NOT_ALLOWED', message: dbError, retriable: false },
      },
    };
  }

  try {
    const fetchParams = {
      database,
      timeoutMs: resolved.timeoutMs,
    };
    if (schema) fetchParams.schema = schema;

    const response = await client.fetch('database/list_tables', fetchParams);

    const tables = response?.tables || [];

    let resultText;
    if (tables.length === 0) {
      resultText = schema
        ? `No tables found in database "${database}" schema "${schema}".`
        : `No tables found in database "${database}".`;
    } else {
      const list = tables.map((t, i) => `  ${i + 1}. ${typeof t === 'string' ? t : t.name || t.table_name || JSON.stringify(t)}`);
      const prefix = schema ? `Tables in "${database}" (schema: "${schema}")` : `Tables in "${database}"`;
      resultText = `${prefix}:\n\n${list.join('\n')}`;
    }

    return {
      result: resultText,
      metadata: {
        success: true,
        action: 'list_tables',
        layer: LAYER,
        tableCount: tables.length,
        tables,
        database: redactConnectionDetails(database),
      },
    };
  } catch (error) {
    return {
      result: `Error listing tables: ${redactConnectionDetails(error.message || 'Unknown error')}`,
      metadata: {
        success: false, action: 'list_tables', layer: LAYER,
        error: {
          code: 'LIST_TABLES_FAILED',
          message: redactConnectionDetails(error.message || 'Unknown error'),
          retriable: true,
        },
      },
    };
  }
}

/**
 * Get query execution plan (EXPLAIN).
 *
 * @param {Object} params - Action parameters
 * @param {Object} context - Execution context
 * @returns {Promise<{ result: string, metadata: Object }>}
 */
async function handleExplain(params, context) {
  const client = getGatewayClient(context);
  if (!client) return providerNotConfigured('explain');

  const { sql, database } = params;

  if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
    return {
      result: 'Error: The "sql" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'explain', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'sql is required.', retriable: false },
      },
    };
  }

  if (!database || typeof database !== 'string' || database.trim().length === 0) {
    return {
      result: 'Error: The "database" parameter is required and must be a non-empty string.',
      metadata: {
        success: false, action: 'explain', layer: LAYER,
        error: { code: 'MISSING_PARAMETER', message: 'database is required.', retriable: false },
      },
    };
  }

  const resolved = resolveConfig(context, params);

  const dbError = validateDatabase(database, resolved.allowedDatabases);
  if (dbError) {
    return {
      result: `Error: ${dbError}`,
      metadata: {
        success: false, action: 'explain', layer: LAYER,
        error: { code: 'DATABASE_NOT_ALLOWED', message: dbError, retriable: false },
      },
    };
  }

  try {
    const response = await client.fetch('database/explain', {
      sql,
      database,
      timeoutMs: resolved.timeoutMs,
    });

    const plan = response?.plan || response?.explanation || '';
    const planText = typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2);

    return {
      result: `Query execution plan:\n\n${planText}`,
      metadata: {
        success: true,
        action: 'explain',
        layer: LAYER,
        plan: response?.plan || response?.explanation,
        database: redactConnectionDetails(database),
      },
    };
  } catch (error) {
    return {
      result: `Error getting execution plan: ${redactConnectionDetails(error.message || 'Unknown error')}`,
      metadata: {
        success: false, action: 'explain', layer: LAYER,
        error: {
          code: 'EXPLAIN_FAILED',
          message: redactConnectionDetails(error.message || 'Unknown error'),
          retriable: true,
        },
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute the Database Query skill.
 *
 * @param {Object} params
 * @param {string} params.action - One of: query, execute, describe_table, list_tables, explain
 * @param {string} [params.sql] - SQL statement (for query, execute, explain)
 * @param {string} [params.database] - Database connection name/alias
 * @param {string} [params.table] - Table name (for describe_table)
 * @param {Array} [params.params] - Parameterized query values
 * @param {string} [params.schema] - Schema filter (for list_tables)
 * @param {boolean} [params.confirm] - Confirmation flag (for execute)
 * @param {number} [params.timeout] - Query timeout override
 * @param {number} [params.maxRows] - Max rows override
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  // Validate action
  const validActions = ['query', 'execute', 'describe_table', 'list_tables', 'explain'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: {
        success: false,
        action: action || 'unknown',
        layer: LAYER,
        error: {
          code: 'INVALID_ACTION',
          message: `Action must be one of: ${validActions.join(', ')}`,
          retriable: false,
        },
      },
    };
  }

  try {
    switch (action) {
      case 'query':
        return await handleQuery(params, context);
      case 'execute':
        return await handleExecute(params, context);
      case 'describe_table':
        return await handleDescribeTable(params, context);
      case 'list_tables':
        return await handleListTables(params, context);
      case 'explain':
        return await handleExplain(params, context);
      default:
        return {
          result: `Error: Unknown action "${action}".`,
          metadata: {
            success: false, action, layer: LAYER,
            error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}`, retriable: false },
          },
        };
    }
  } catch (error) {
    return {
      result: `Error during ${action} operation: ${redactConnectionDetails(error.message || 'Unknown error')}`,
      metadata: {
        success: false,
        action,
        layer: LAYER,
        error: {
          code: 'OPERATION_FAILED',
          message: redactConnectionDetails(error.message || 'Unknown error'),
          retriable: true,
        },
      },
    };
  }
}
