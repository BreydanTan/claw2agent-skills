# Slack Integration

**Layer 1 (L1)** skill for interacting with Slack workspaces via the Slack API.

## Overview

Interact with Slack workspaces through a unified interface. Supports sending messages, managing channels, listing messages, adding reactions, inviting users, and setting channel topics. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `send_message`

Send a message to a Slack channel.

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| channel   | string | Yes      | Channel ID or name                   |
| text      | string | Yes      | Message text to send                 |
| threadTs  | string | No       | Thread timestamp for threaded replies |

**Returns:** confirmation with message timestamp

### `list_channels`

List workspace channels.

| Parameter | Type   | Required | Default    | Description                                |
|-----------|--------|----------|------------|--------------------------------------------|
| type      | string | No       | `"public"` | `"public"`, `"private"`, `"all"`           |
| limit     | number | No       | 100        | Number of channels to return (max 1000)    |

### `get_channel`

Get detailed information about a channel.

| Parameter | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| channel   | string | Yes      | Channel ID or name |

**Returns:** name, topic, purpose, member count, privacy status, archive status

### `list_messages`

Get messages from a channel.

| Parameter | Type   | Required | Default | Description                            |
|-----------|--------|----------|---------|----------------------------------------|
| channel   | string | Yes      |         | Channel ID or name                     |
| limit     | number | No       | 20      | Number of messages to return (max 1000) |
| oldest    | string | No       |         | Start of time range (Unix timestamp)   |
| latest    | string | No       |         | End of time range (Unix timestamp)     |

### `react`

Add an emoji reaction to a message.

| Parameter | Type   | Required | Description                       |
|-----------|--------|----------|-----------------------------------|
| channel   | string | Yes      | Channel ID where the message is   |
| timestamp | string | Yes      | Message timestamp to react to     |
| emoji     | string | Yes      | Emoji name (without colons)       |

### `create_channel`

Create a new Slack channel.

| Parameter   | Type    | Required | Default | Description               |
|-------------|---------|----------|---------|---------------------------|
| name        | string  | Yes      |         | Channel name              |
| isPrivate   | boolean | No       | false   | Create as private channel |
| description | string  | No       |         | Channel description/purpose |

### `invite_user`

Invite a user to a channel.

| Parameter | Type   | Required | Description     |
|-----------|--------|----------|-----------------|
| channel   | string | Yes      | Channel ID      |
| user      | string | Yes      | User ID to invite |

### `set_topic`

Set the topic for a channel.

| Parameter | Type   | Required | Description     |
|-----------|--------|----------|-----------------|
| channel   | string | Yes      | Channel ID      |
| topic     | string | Yes      | Topic text      |

## Return Format

### Success

```json
{
  "result": "Human-readable summary string",
  "metadata": {
    "success": true,
    "action": "send_message",
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
| MISSING_CHANNEL          | Required `channel` parameter not provided      |
| MISSING_TEXT             | Required `text` parameter not provided         |
| MISSING_TIMESTAMP        | Required `timestamp` parameter not provided    |
| MISSING_EMOJI            | Required `emoji` parameter not provided        |
| MISSING_NAME             | Required `name` parameter not provided         |
| MISSING_USER             | Required `user` parameter not provided         |
| MISSING_TOPIC            | Required `topic` parameter not provided        |
| PROVIDER_NOT_CONFIGURED  | No provider/gateway client in context          |
| TIMEOUT                  | Request exceeded timeout limit                 |
| FETCH_ERROR              | Network or API error                           |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.fetch('slack/<endpoint>', { params })`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Slack tokens (xoxb, xoxp, xoxa, xoxr, xoxs), API keys, and secrets are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed

## Configuration

```json
{
  "provider": "slack",
  "timeoutMs": 15000,
  "rateLimitProfile": "slack-api"
}
```

## Examples

```js
// Send a message
await execute({ action: 'send_message', channel: 'C01ABCDEF', text: 'Hello team!' }, context);

// Reply in a thread
await execute({
  action: 'send_message',
  channel: 'C01ABCDEF',
  text: 'Great idea!',
  threadTs: '1234567890.123456'
}, context);

// List all channels
await execute({ action: 'list_channels', type: 'all', limit: 50 }, context);

// Get channel info
await execute({ action: 'get_channel', channel: 'C01ABCDEF' }, context);

// List recent messages
await execute({ action: 'list_messages', channel: 'C01ABCDEF', limit: 10 }, context);

// Add a reaction
await execute({
  action: 'react',
  channel: 'C01ABCDEF',
  timestamp: '1234567890.123456',
  emoji: 'thumbsup'
}, context);

// Create a channel
await execute({
  action: 'create_channel',
  name: 'project-alpha',
  isPrivate: false,
  description: 'Coordination for Project Alpha'
}, context);

// Invite a user
await execute({ action: 'invite_user', channel: 'C01ABCDEF', user: 'U01GHIJKL' }, context);

// Set channel topic
await execute({ action: 'set_topic', channel: 'C01ABCDEF', topic: 'Sprint 42 planning' }, context);
```
