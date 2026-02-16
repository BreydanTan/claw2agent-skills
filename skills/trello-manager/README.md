# Trello Manager

**Layer 1 (L1)** skill for managing Trello boards, lists, and cards via the Trello API.

## Overview

Manage Trello boards, lists, and cards through a unified interface. Supports listing boards, getting board info, managing lists, and full card lifecycle operations including create, update, move, and commenting. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `list_boards`

List all boards for the authenticated user.

No additional parameters required.

**Returns:** count, boards (id, name, desc, closed, url)

### `get_board`

Get detailed information about a board.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| boardId   | string | Yes      | Board ID    |

**Returns:** boardId, name, desc, closed, url

### `list_lists`

List all lists in a board.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| boardId   | string | Yes      | Board ID    |

**Returns:** count, lists (id, name, closed)

### `list_cards`

List all cards in a list.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| listId    | string | Yes      | List ID     |

**Returns:** count, cards (id, name, desc, due, closed, url)

### `get_card`

Get detailed information about a card.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| cardId    | string | Yes      | Card ID     |

**Returns:** cardId, name, desc, idList, idBoard, due, labels, closed, url

### `create_card`

Create a new card in a list.

| Parameter | Type     | Required | Description                |
|-----------|----------|----------|----------------------------|
| listId    | string   | Yes      | List ID to create card in  |
| name      | string   | Yes      | Card name/title            |
| desc      | string   | No       | Card description           |
| due       | string   | No       | Due date (ISO 8601)        |
| labels    | string[] | No       | Label IDs to apply         |

### `update_card`

Update an existing card.

| Parameter | Type     | Required | Description                      |
|-----------|----------|----------|----------------------------------|
| cardId    | string   | Yes      | Card ID                          |
| name      | string   | No       | New card name                    |
| desc      | string   | No       | New description                  |
| due       | string   | No       | New due date (ISO 8601)          |
| labels    | string[] | No       | New label IDs                    |
| closed    | boolean  | No       | Whether the card is archived     |

### `move_card`

Move a card to another list.

| Parameter | Type   | Required | Description              |
|-----------|--------|----------|--------------------------|
| cardId    | string | Yes      | Card ID                  |
| listId    | string | Yes      | Destination list ID      |

### `add_comment`

Add a comment to a card.

| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| cardId    | string | Yes      | Card ID       |
| text      | string | Yes      | Comment text  |

## Return Format

### Success

```json
{
  "result": "Human-readable summary string",
  "metadata": {
    "success": true,
    "action": "list_boards",
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
| MISSING_BOARD_ID         | Required `boardId` parameter not provided      |
| MISSING_LIST_ID          | Required `listId` parameter not provided       |
| MISSING_CARD_ID          | Required `cardId` parameter not provided       |
| MISSING_NAME             | Required `name` parameter not provided         |
| MISSING_TEXT             | Required `text` parameter not provided         |
| PROVIDER_NOT_CONFIGURED  | No provider/gateway client in context          |
| TIMEOUT                  | Request exceeded timeout limit                 |
| FETCH_ERROR              | Network or API error                           |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.fetch('trello/<endpoint>', { params })`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Tokens, API keys, and secrets are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed

## Configuration

```json
{
  "provider": "trello",
  "timeoutMs": 15000,
  "rateLimitProfile": "trello-api"
}
```

## Examples

```js
// List all boards
await execute({ action: 'list_boards' }, context);

// Get board info
await execute({ action: 'get_board', boardId: 'abc123' }, context);

// List lists in a board
await execute({ action: 'list_lists', boardId: 'abc123' }, context);

// List cards in a list
await execute({ action: 'list_cards', listId: 'list456' }, context);

// Create a card
await execute({
  action: 'create_card',
  listId: 'list456',
  name: 'Fix login bug',
  desc: 'Users cannot log in with SSO',
  due: '2025-03-01T00:00:00.000Z',
  labels: ['label1', 'label2']
}, context);

// Move a card to another list
await execute({
  action: 'move_card',
  cardId: 'card789',
  listId: 'listDone'
}, context);

// Add a comment to a card
await execute({
  action: 'add_comment',
  cardId: 'card789',
  text: 'This is now resolved.'
}, context);
```
