# Airtable Database

**Layer 1 (L1)** skill for managing Airtable bases, tables, and records via the Airtable REST API.

## Overview

Manage Airtable bases, tables, and records through a unified interface. Supports listing bases and tables, full record CRUD operations, formula-based search, and bulk record creation. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `list_bases`

List all accessible Airtable bases.

No additional parameters required.

**Returns:** count, bases (id, name, permissionLevel)

### `list_tables`

List tables in a base.

| Parameter | Type   | Required | Description       |
|-----------|--------|----------|-------------------|
| baseId    | string | Yes      | Airtable base ID  |

**Returns:** count, tables (id, name, description, primaryFieldId)

### `list_records`

List records from a table.

| Parameter       | Type     | Required | Description                         |
|-----------------|----------|----------|-------------------------------------|
| baseId          | string   | Yes      | Airtable base ID                    |
| tableId         | string   | Yes      | Airtable table ID or name           |
| maxRecords      | number   | No       | Maximum records to return (default 100) |
| filterByFormula | string   | No       | Airtable formula to filter records  |
| sort            | array    | No       | Sort configuration                  |
| view            | string   | No       | View name or ID                     |

**Returns:** count, records (id, fields, createdTime)

### `get_record`

Get a single record by ID.

| Parameter | Type   | Required | Description       |
|-----------|--------|----------|-------------------|
| baseId    | string | Yes      | Airtable base ID  |
| tableId   | string | Yes      | Table ID or name  |
| recordId  | string | Yes      | Record ID         |

**Returns:** recordId, fields, createdTime

### `create_record`

Create a new record in a table.

| Parameter | Type   | Required | Description                |
|-----------|--------|----------|----------------------------|
| baseId    | string | Yes      | Airtable base ID           |
| tableId   | string | Yes      | Table ID or name           |
| fields    | object | Yes      | Fields for the new record  |

**Returns:** recordId, fields, createdTime

### `update_record`

Update an existing record.

| Parameter | Type   | Required | Description                     |
|-----------|--------|----------|---------------------------------|
| baseId    | string | Yes      | Airtable base ID                |
| tableId   | string | Yes      | Table ID or name                |
| recordId  | string | Yes      | Record ID                       |
| fields    | object | Yes      | Fields to update                |

**Returns:** recordId, fields

### `delete_record`

Delete a record from a table.

| Parameter | Type   | Required | Description       |
|-----------|--------|----------|-------------------|
| baseId    | string | Yes      | Airtable base ID  |
| tableId   | string | Yes      | Table ID or name  |
| recordId  | string | Yes      | Record ID         |

**Returns:** recordId, deleted

### `search_records`

Search records using an Airtable formula.

| Parameter  | Type   | Required | Description                            |
|------------|--------|----------|----------------------------------------|
| baseId     | string | Yes      | Airtable base ID                       |
| tableId    | string | Yes      | Table ID or name                       |
| formula    | string | Yes      | Airtable formula to search by          |
| maxRecords | number | No       | Maximum records to return (default 100)|

**Returns:** count, records (id, fields, createdTime)

### `bulk_create`

Create multiple records at once (maximum 10 per request).

| Parameter | Type   | Required | Description                                  |
|-----------|--------|----------|----------------------------------------------|
| baseId    | string | Yes      | Airtable base ID                             |
| tableId   | string | Yes      | Table ID or name                             |
| records   | array  | Yes      | Array of `{fields}` objects (max 10)         |

**Returns:** count, records (id, fields, createdTime)

## Return Format

### Success

```json
{
  "result": "Human-readable summary string",
  "metadata": {
    "success": true,
    "action": "list_records",
    "layer": "L1",
    ...
  }
}
```

### Error

```json
{
  "result": "Error: description of what went wrong",
  "metadata": {
    "success": false,
    "error": "ERROR_CODE"
  }
}
```

## Error Codes

| Code                     | Description                                    |
|--------------------------|------------------------------------------------|
| INVALID_ACTION           | Unknown or missing action                      |
| MISSING_BASE_ID          | Required `baseId` parameter not provided       |
| MISSING_TABLE_ID         | Required `tableId` parameter not provided      |
| MISSING_RECORD_ID        | Required `recordId` parameter not provided     |
| MISSING_FIELDS           | Required `fields` parameter not provided       |
| MISSING_FORMULA          | Required `formula` parameter not provided      |
| MISSING_RECORDS          | Required `records` parameter not provided      |
| TOO_MANY_RECORDS         | bulk_create exceeded 10 record limit           |
| INVALID_RECORD_FORMAT    | Record in bulk_create missing fields object    |
| PROVIDER_NOT_CONFIGURED  | No provider/gateway client in context          |
| TIMEOUT                  | Request exceeded timeout limit                 |
| FETCH_ERROR              | Network or API error                           |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.request(method, path, body)`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Tokens, API keys, and secrets are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed

## Configuration

```json
{
  "provider": "airtable",
  "timeoutMs": 15000,
  "rateLimitProfile": "airtable-api"
}
```

## Examples

```js
// List all bases
await execute({ action: 'list_bases' }, context);

// List tables in a base
await execute({ action: 'list_tables', baseId: 'appXYZ123' }, context);

// List records from a table
await execute({
  action: 'list_records',
  baseId: 'appXYZ123',
  tableId: 'tblABC456',
  maxRecords: 50,
  filterByFormula: '{Status} = "Active"',
  view: 'Grid view'
}, context);

// Get a single record
await execute({
  action: 'get_record',
  baseId: 'appXYZ123',
  tableId: 'tblABC456',
  recordId: 'recDEF789'
}, context);

// Create a record
await execute({
  action: 'create_record',
  baseId: 'appXYZ123',
  tableId: 'tblABC456',
  fields: { Name: 'New Item', Status: 'Active', Priority: 'High' }
}, context);

// Update a record
await execute({
  action: 'update_record',
  baseId: 'appXYZ123',
  tableId: 'tblABC456',
  recordId: 'recDEF789',
  fields: { Status: 'Completed' }
}, context);

// Delete a record
await execute({
  action: 'delete_record',
  baseId: 'appXYZ123',
  tableId: 'tblABC456',
  recordId: 'recDEF789'
}, context);

// Search records by formula
await execute({
  action: 'search_records',
  baseId: 'appXYZ123',
  tableId: 'tblABC456',
  formula: 'FIND("urgent", {Tags})',
  maxRecords: 20
}, context);

// Bulk create records
await execute({
  action: 'bulk_create',
  baseId: 'appXYZ123',
  tableId: 'tblABC456',
  records: [
    { fields: { Name: 'Item 1', Status: 'New' } },
    { fields: { Name: 'Item 2', Status: 'New' } },
    { fields: { Name: 'Item 3', Status: 'New' } }
  ]
}, context);
```
