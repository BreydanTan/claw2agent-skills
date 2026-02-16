# Database Query

**Layer:** L2 (requires platform gateway for database access)

Execute database queries through the platform's gateway client. Supports read-only queries, write operations with confirmation, table schema inspection, table listing, and query execution plan analysis. All operations are proxied through `context.gatewayClient` - no direct database connections are ever made.

## Actions

### `query`

Execute a read-only (SELECT) query against a database.

**Security:** SQL is validated to ensure only SELECT, WITH, and EXPLAIN statements are permitted. INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, and other write operations are rejected.

**Parameters:**
- `sql` (string, required) - The SQL SELECT statement
- `database` (string, required) - Database connection name/alias
- `params` (array, optional) - Parameterized query values (positional placeholders)
- `timeout` (number, optional) - Query timeout in ms (default 30000, max 60000)
- `maxRows` (number, optional) - Maximum rows to return (default 1000)

**Example:**
```json
{
  "action": "query",
  "sql": "SELECT name, email FROM users WHERE active = $1",
  "database": "default",
  "params": [true]
}
```

### `execute`

Execute a write query (INSERT, UPDATE, DELETE). Requires explicit confirmation.

**Parameters:**
- `sql` (string, required) - The SQL write statement
- `database` (string, required) - Database connection name/alias
- `params` (array, optional) - Parameterized query values
- `confirm` (boolean, required) - Must be `true` to proceed

**Example:**
```json
{
  "action": "execute",
  "sql": "UPDATE users SET active = $1 WHERE id = $2",
  "database": "default",
  "params": [false, 42],
  "confirm": true
}
```

### `describe_table`

Get the schema (columns, types, constraints) for a specific table.

**Parameters:**
- `table` (string, required) - Table name
- `database` (string, required) - Database connection name/alias

**Example:**
```json
{
  "action": "describe_table",
  "table": "users",
  "database": "default"
}
```

### `list_tables`

List all tables in a database, optionally filtered by schema.

**Parameters:**
- `database` (string, required) - Database connection name/alias
- `schema` (string, optional) - Schema name to filter by

**Example:**
```json
{
  "action": "list_tables",
  "database": "default",
  "schema": "public"
}
```

### `explain`

Get the query execution plan for a SQL statement.

**Parameters:**
- `sql` (string, required) - The SQL statement to explain
- `database` (string, required) - Database connection name/alias

**Example:**
```json
{
  "action": "explain",
  "sql": "SELECT * FROM users WHERE email = $1",
  "database": "default"
}
```

## L2 Configuration Contract

```json
{
  "provider": "gateway",
  "timeoutMs": 30000,
  "maxCostUsd": 0.10,
  "maxRows": 1000,
  "allowedDatabases": ["default"]
}
```

## Return Format

**Success (query):**
```json
{
  "result": "Query returned 5 row(s):\n\nid | name | email\n--- | --- | ---\n1 | Alice | alice@example.com",
  "metadata": {
    "success": true,
    "action": "query",
    "layer": "L2",
    "rowCount": 5,
    "columns": ["id", "name", "email"],
    "truncated": false
  }
}
```

**Error:**
```json
{
  "result": "Error: ...",
  "metadata": {
    "success": false,
    "action": "query",
    "layer": "L2",
    "error": {
      "code": "SQL_NOT_ALLOWED",
      "message": "Write operation \"DROP\" is not allowed in read-only query mode.",
      "retriable": false
    }
  }
}
```

**Provider Not Configured:**
```json
{
  "result": "Error: No database gateway configured...",
  "metadata": {
    "success": false,
    "error": {
      "code": "PROVIDER_NOT_CONFIGURED",
      "message": "No gatewayClient found in context...",
      "retriable": false
    }
  }
}
```

**Write Without Confirmation:**
```json
{
  "result": "Warning: Write operations require explicit confirmation...",
  "metadata": {
    "success": false,
    "error": {
      "code": "CONFIRMATION_REQUIRED",
      "message": "Write operations require confirm: true...",
      "retriable": false
    }
  }
}
```

## L2 Security Guarantees

1. **No direct database connections** - All queries go through the platform gateway client
2. **No hardcoded connection strings** - Database references use aliases only
3. **No raw credentials** - Credentials are managed by the platform adapter
4. **Read-only validation** - The `query` action rejects all write operations (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE)
5. **SQL injection prevention** - Detects tautologies, UNION injections, statement chaining, time-based attacks, and string concatenation patterns
6. **Write confirmation** - The `execute` action requires explicit `confirm: true`
7. **Timeout enforcement** - All queries respect timeout configuration (default 30s, max 60s)
8. **Row limit enforcement** - Query results are capped at configured maxRows (default 1000)
9. **Connection detail redaction** - All logs and error messages have connection details redacted
10. **Structured errors** - All failures return machine-parseable error objects with codes
