# Zapier Bridge Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Manage and trigger Zapier Zaps, list executions, and check Zap status via provider client.

## Actions

### `list_zaps`

List all Zaps, optionally filtered by status.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| status    | string | No       | `all`   | Filter by status: enabled, disabled, all |

**Endpoint:** `GET /zaps?status=xxx`

**Response:**
```json
{
  "zaps": [
    { "id": "zap_001", "title": "New Lead Alert", "enabled": true, "steps": [...] }
  ]
}
```

### `run_zap`

Trigger a Zap with an optional JSON payload.

| Parameter | Type          | Required | Default | Description                     |
| --------- | ------------- | -------- | ------- | ------------------------------- |
| zapId     | string        | Yes      | --      | The Zap identifier              |
| payload   | string/object | No       | null    | JSON payload to send to the Zap |

**Endpoint:** `POST /zaps/{zapId}/execute` body: `payload`

**Response:**
```json
{
  "status": "success",
  "attempt_id": "exec_xxx"
}
```

### `get_zap_status`

Check whether a Zap is enabled or disabled.

| Parameter | Type   | Required | Default | Description        |
| --------- | ------ | -------- | ------- | ------------------ |
| zapId     | string | Yes      | --      | The Zap identifier |

**Endpoint:** `GET /zaps/{zapId}`

**Response:**
```json
{
  "id": "zap_001",
  "title": "New Lead Alert",
  "enabled": true,
  "status": "on"
}
```

### `list_executions`

List recent executions for a Zap.

| Parameter | Type   | Required | Default | Description                         |
| --------- | ------ | -------- | ------- | ----------------------------------- |
| zapId     | string | Yes      | --      | The Zap identifier                  |
| limit     | number | No       | `10`    | Maximum number of results to return |

**Endpoint:** `GET /zaps/{zapId}/executions?limit=xxx`

**Response:**
```json
{
  "executions": [
    { "id": "exec_001", "status": "success", "started_at": "2025-01-15T12:00:00Z", "ended_at": "2025-01-15T12:00:05Z" }
  ]
}
```

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 30 seconds, maximum 120 seconds.
- **Input validation.** All parameters are validated and sanitized before use. Zap IDs must be non-empty strings, payloads must be valid JSON when provided as strings.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Zap Executed\nZap ID: zap_001\nStatus: success\nExecution ID: exec_xxx",
  "metadata": {
    "success": true,
    "action": "run_zap",
    "timestamp": "2025-01-15T12:00:00Z",
    "zapId": "zap_001",
    "attemptId": "exec_xxx",
    "status": "success"
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

## Error Codes

| Code                     | Description                                      |
| ------------------------ | ------------------------------------------------ |
| INVALID_ACTION           | The action parameter is missing or not recognized|
| INVALID_INPUT            | A required parameter is missing or malformed     |
| PROVIDER_NOT_CONFIGURED  | No provider or gateway client available          |
| TIMEOUT                  | The request exceeded the configured timeout      |
| UPSTREAM_ERROR           | The upstream Zapier API returned an error        |

## Security Notes

- All zapId parameters are validated as non-empty strings before processing.
- Payload strings are validated as parseable JSON before sending.
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- No API keys or secrets are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- Request timeouts are enforced and capped at 120 seconds maximum.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/zapier-bridge/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 4 actions (happy and error paths), input validation, timeout handling, network errors, helper functions, and the validate export.
