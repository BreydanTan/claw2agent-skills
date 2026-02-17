# Notion API Skill

**Layer 1 (L1)** -- Standard API access, BYOK possible.

Interact with the Notion API to manage pages, databases, blocks, and search across workspaces.

## Actions

### `get_page`

Retrieve a Notion page by ID.

| Parameter | Type   | Required | Default | Description           |
| --------- | ------ | -------- | ------- | --------------------- |
| pageId    | string | Yes      | --      | UUID of the page      |

### `create_page`

Create a new Notion page.

| Parameter  | Type   | Required | Default  | Description                             |
| ---------- | ------ | -------- | -------- | --------------------------------------- |
| parentId   | string | Yes      | --       | UUID of the parent page or database     |
| title      | string | Yes      | --       | Page title (max 2000 chars)             |
| content    | string | No       | --       | Optional text content for the page body |
| parentType | string | No       | `page`   | `database` or `page`                    |

### `update_page`

Update properties of an existing page.

| Parameter  | Type   | Required | Default | Description                     |
| ---------- | ------ | -------- | ------- | ------------------------------- |
| pageId     | string | Yes      | --      | UUID of the page to update      |
| properties | object | Yes      | --      | Properties object to set/update |

### `search`

Search across a Notion workspace.

| Parameter | Type   | Required | Default              | Description                              |
| --------- | ------ | -------- | -------------------- | ---------------------------------------- |
| query     | string | Yes      | --                   | Search query string (max 500 chars)      |
| filter    | string | No       | --                   | `page` or `database`                     |
| sort      | string | No       | `last_edited_time`   | `last_edited_time` or `created_time`     |
| limit     | number | No       | `25`                 | Number of results (1--100)               |

### `get_database`

Retrieve a Notion database by ID.

| Parameter  | Type   | Required | Default | Description              |
| ---------- | ------ | -------- | ------- | ------------------------ |
| databaseId | string | Yes      | --      | UUID of the database     |

### `query_database`

Query entries from a Notion database.

| Parameter  | Type   | Required | Default | Description                         |
| ---------- | ------ | -------- | ------- | ----------------------------------- |
| databaseId | string | Yes      | --      | UUID of the database to query       |
| filter     | object | No       | --      | Notion filter object                |
| sorts      | array  | No       | --      | Array of Notion sort objects        |
| limit      | number | No       | `25`    | Number of results (1--100)          |

### `get_block_children`

Get child blocks of a parent block or page.

| Parameter | Type   | Required | Default | Description              |
| --------- | ------ | -------- | ------- | ------------------------ |
| blockId   | string | Yes      | --      | UUID of the parent block |
| limit     | number | No       | `50`    | Number of blocks (1--100)|

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 15 seconds, maximum 30 seconds.
- **Input validation.** All parameters are validated and sanitized (UUID format, string lengths, limit clamping).
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Page: My Page\nID: abc-123\n...",
  "metadata": {
    "success": true,
    "action": "get_page",
    "layer": "L1",
    "pageId": "abc-123",
    "timestamp": "2025-01-15T12:00:00Z"
  }
}
```

**Error:**

```json
{
  "result": "Error: Provider client required ...",
  "metadata": {
    "success": false,
    "error": {
      "code": "PROVIDER_NOT_CONFIGURED",
      "message": "...",
      "retriable": false
    }
  }
}
```

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/notion-api/__tests__/handler.test.js
```

The test suite contains 80+ assertions across multiple describe blocks covering action validation, provider configuration, input validation, timeout handling, upstream errors, helper functions, and endpoint routing for all 7 actions.
