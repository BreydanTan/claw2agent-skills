# Notion Integration Skill

**Layer 1 (L1)** skill for interacting with Notion workspaces via the Notion API.

## Overview

Search pages and databases, get/create/update pages, query databases, create database entries, and list blocks. All API calls go through the injected provider client (BYOK - Bring Your Own Key).

## Actions

| Action | Description | Required Params |
|---|---|---|
| `search` | Search the Notion workspace | `query` |
| `get_page` | Get a Notion page by ID | `pageId` |
| `create_page` | Create a new page | `parentId`, `title` |
| `update_page` | Update page properties | `pageId`, `properties` |
| `get_database` | Get database info | `databaseId` |
| `query_database` | Query a Notion database | `databaseId` |
| `create_database_entry` | Add an entry to a database | `databaseId`, `properties` |
| `list_blocks` | List child blocks of a page/block | `blockId` |

## Parameters

### search

- `query` (string, required) - Search query string
- `filter` (string, optional) - `"page"` or `"database"`
- `sort` (string, optional) - `"last_edited"` (default) or `"created"`
- `pageSize` (number, optional) - Results per page (default: 10, max: 100)

### get_page

- `pageId` (string, required) - Notion page ID

### create_page

- `parentId` (string, required) - Parent page or database ID
- `title` (string, required) - Page title
- `content` (string, optional) - Page content
- `icon` (string, optional) - Page icon emoji
- `cover` (string, optional) - Page cover image URL

### update_page

- `pageId` (string, required) - Notion page ID
- `properties` (object, required) - Property updates

### get_database

- `databaseId` (string, required) - Notion database ID

### query_database

- `databaseId` (string, required) - Notion database ID
- `filter` (object, optional) - Notion filter object
- `sorts` (array, optional) - Notion sort conditions
- `pageSize` (number, optional) - Results per page (default: 50, max: 100)

### create_database_entry

- `databaseId` (string, required) - Notion database ID
- `properties` (object, required) - Entry properties

### list_blocks

- `blockId` (string, required) - Block or page ID
- `pageSize` (number, optional) - Results per page (default: 50, max: 100)

## L1 Compliance

- No hardcoded `https://api.notion.com/` URLs
- All API access through `context.providerClient` or `context.gatewayClient`
- Returns `PROVIDER_NOT_CONFIGURED` error if no client is available
- Timeout: default 15s, max 30s
- Token/secret redaction on all outputs
- Input sanitization (control character removal, trimming)

## Return Format

**Success:**
```json
{
  "result": "Human-readable summary",
  "metadata": {
    "success": true,
    "action": "search",
    "layer": "L1",
    ...
  }
}
```

**Error:**
```json
{
  "result": "Error: Description of what went wrong",
  "metadata": {
    "success": false,
    "error": "ERROR_CODE"
  }
}
```

## Running Tests

```bash
node --test skills/notion-integration/__tests__/handler.test.js
```
