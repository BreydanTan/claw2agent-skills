# Webhook Receiver

Register, manage, and inspect incoming webhook endpoints. Store received webhook payloads for later inspection and processing.

## Overview

The Webhook Receiver skill provides in-memory webhook endpoint management. You can register endpoints with optional HMAC-SHA256 signature validation, simulate receiving webhook deliveries, inspect stored payloads, and manage endpoint lifecycle -- all without requiring any external services or API keys.

## Actions

| Action       | Description                                      | Required Params         |
|--------------|--------------------------------------------------|-------------------------|
| `register`   | Create a new webhook endpoint                    | (none, ID auto-generated if omitted) |
| `unregister` | Remove an endpoint and its stored payloads       | `endpointId`            |
| `list`       | List all registered endpoints                    | (none)                  |
| `inspect`    | View stored payloads for an endpoint             | `endpointId`            |
| `receive`    | Simulate receiving a webhook delivery            | `endpointId`, `payload` |
| `clear`      | Clear all stored payloads for an endpoint        | `endpointId`            |

## Parameters

| Parameter     | Type   | Description                                                  |
|---------------|--------|--------------------------------------------------------------|
| `action`      | string | **Required.** One of: register, unregister, list, inspect, receive, clear |
| `endpointId`  | string | Unique endpoint identifier (alphanumeric and hyphens only)   |
| `name`        | string | Human-friendly endpoint name                                 |
| `secret`      | string | Shared secret for HMAC-SHA256 signature validation           |
| `payload`     | any    | Webhook payload data (required for `receive`)                |
| `headers`     | object | Webhook request headers (for `receive`)                      |
| `maxPayloads` | number | Max payloads to store per endpoint (default: 100)            |
| `limit`       | number | Number of payloads to return when inspecting                 |
| `offset`      | number | Pagination offset when inspecting payloads                   |

## Usage Examples

### Register an endpoint

```json
{
  "action": "register",
  "endpointId": "github-push",
  "name": "GitHub Push Events",
  "secret": "my-shared-secret"
}
```

### Receive a webhook

```json
{
  "action": "receive",
  "endpointId": "github-push",
  "payload": { "ref": "refs/heads/main", "commits": [] },
  "headers": {
    "x-signature-256": "sha256=<computed-hmac>",
    "content-type": "application/json"
  }
}
```

### Inspect stored payloads

```json
{
  "action": "inspect",
  "endpointId": "github-push",
  "limit": 10,
  "offset": 0
}
```

### List all endpoints

```json
{
  "action": "list"
}
```

### Clear payloads

```json
{
  "action": "clear",
  "endpointId": "github-push"
}
```

### Unregister an endpoint

```json
{
  "action": "unregister",
  "endpointId": "github-push"
}
```

## Security

- **HMAC-SHA256 validation**: When an endpoint is registered with a `secret`, all incoming webhooks must include a valid `x-signature-256` header. The signature is computed as `sha256=<hex-digest>` using the shared secret and the JSON-serialized payload body.
- **Secrets are never exposed**: The `list` and `inspect` actions never include endpoint secrets in their responses. Only a `hasSecret` boolean flag is returned.
- **Payload limits**: Each endpoint enforces a configurable maximum number of stored payloads (default: 100). When the limit is exceeded, the oldest payloads are discarded.
- **Endpoint ID sanitization**: Endpoint IDs are restricted to alphanumeric characters and hyphens to prevent injection issues.

## Error Codes

| Code                  | Description                                          |
|-----------------------|------------------------------------------------------|
| `INVALID_ACTION`      | The provided action is not recognized                |
| `MISSING_ENDPOINT_ID` | An endpoint ID was required but not provided         |
| `ENDPOINT_NOT_FOUND`  | No endpoint exists with the given ID                 |
| `DUPLICATE_ENDPOINT`  | An endpoint with the given ID already exists         |
| `INVALID_SIGNATURE`   | HMAC-SHA256 signature validation failed              |
| `MISSING_PAYLOAD`     | A payload was required but not provided              |
| `INVALID_ENDPOINT_ID` | The endpoint ID contains invalid characters          |

## Configuration

This skill requires no API keys or external configuration. All data is stored in memory and will be lost when the process terminates.
