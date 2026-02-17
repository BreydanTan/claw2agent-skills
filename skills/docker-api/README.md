# Docker Engine API Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible. HIGH RISK: includes container ID sanitization to prevent injection.

Interact with the Docker Engine API to list/inspect/start/stop containers, list images, fetch container logs, and retrieve container resource stats.

## Actions

### `list_containers`

List Docker containers.

| Parameter | Type    | Required | Default | Description                          |
| --------- | ------- | -------- | ------- | ------------------------------------ |
| all       | boolean | No       | `false` | Include stopped containers           |
| limit     | number  | No       | `25`    | Number of containers to return (1-100) |

**Endpoint:** `GET /containers?all={all}&limit={limit}`

### `get_container`

Inspect a specific container.

| Parameter   | Type   | Required | Default | Description                  |
| ----------- | ------ | -------- | ------- | ---------------------------- |
| containerId | string | Yes      | --      | Container ID or name         |

**Endpoint:** `GET /containers/{containerId}`

### `start_container`

Start a stopped container.

| Parameter   | Type   | Required | Default | Description                  |
| ----------- | ------ | -------- | ------- | ---------------------------- |
| containerId | string | Yes      | --      | Container ID or name         |

**Endpoint:** `POST /containers/{containerId}/start`

### `stop_container`

Stop a running container.

| Parameter   | Type   | Required | Default | Description                          |
| ----------- | ------ | -------- | ------- | ------------------------------------ |
| containerId | string | Yes      | --      | Container ID or name                 |
| timeout     | number | No       | `10`    | Seconds to wait before killing (0-300) |

**Endpoint:** `POST /containers/{containerId}/stop?timeout={timeout}`

### `list_images`

List Docker images.

| Parameter | Type   | Required | Default | Description                      |
| --------- | ------ | -------- | ------- | -------------------------------- |
| limit     | number | No       | `25`    | Number of images to return (1-100) |

**Endpoint:** `GET /images?limit={limit}`

### `get_logs`

Get container logs.

| Parameter   | Type    | Required | Default | Description                          |
| ----------- | ------- | -------- | ------- | ------------------------------------ |
| containerId | string  | Yes      | --      | Container ID or name                 |
| tail        | number  | No       | `100`   | Number of log lines (1-1000)         |
| timestamps  | boolean | No       | `true`  | Include timestamps in output         |

**Endpoint:** `GET /containers/{containerId}/logs?tail={tail}&timestamps={timestamps}`

### `container_stats`

Get container resource usage statistics.

| Parameter   | Type   | Required | Default | Description                  |
| ----------- | ------ | -------- | ------- | ---------------------------- |
| containerId | string | Yes      | --      | Container ID or name         |

**Endpoint:** `GET /containers/{containerId}/stats`

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 15 seconds, maximum 30 seconds.
- **Input validation.** All parameters are validated and sanitized before use. Container IDs are restricted to alphanumeric characters, hyphens, underscores, and dots (max 128 chars) to prevent injection.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Containers (3 results, all=false)\n\n1. my-app [running]",
  "metadata": {
    "success": true,
    "action": "list_containers",
    "layer": "L1",
    "all": false,
    "limit": 25,
    "containerCount": 3,
    "containers": [...],
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

## Error Codes

| Code                     | Description                                      |
| ------------------------ | ------------------------------------------------ |
| INVALID_ACTION           | The action parameter is missing or not recognized|
| INVALID_INPUT            | A required parameter is missing or malformed     |
| PROVIDER_NOT_CONFIGURED  | No provider or gateway client available          |
| TIMEOUT                  | The request exceeded the configured timeout      |
| UPSTREAM_ERROR           | The upstream Docker API returned an error        |

## Security Notes

- Container IDs are sanitized to alphanumeric characters, hyphens, underscores, and dots only (max 128 characters), preventing path traversal, shell injection, or command injection attacks.
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- No API keys or secrets are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- Request timeouts are enforced and capped at 30 seconds maximum.
- HIGH RISK skill: container operations can affect running workloads. Container ID whitelisting prevents exec injection vectors.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/docker-api/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 7 actions (happy and error paths), container ID security (injection prevention), input validation, timeout handling, network errors, helper functions, and the validate export.
