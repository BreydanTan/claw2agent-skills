# Website Uptime Monitor

Monitor website availability by registering URLs, performing HTTP health checks, and tracking uptime history with in-memory state tracking.

## What it does

This skill monitors website uptime using HTTP probes and provides six actions:

- **add** - Register a URL to monitor with optional name, interval, expected status, and timeout.
- **remove** - Unregister a monitor by its ID.
- **check** - Perform an immediate HTTP health check on a monitor or ad-hoc URL.
- **status** - View current status of all monitors or a specific one, including uptime percentage.
- **list** - List all registered monitors with their configurations.
- **history** - View past check results for a monitor.

## Commands

### add

Register a new URL to monitor.

```json
{
  "action": "add",
  "url": "https://example.com",
  "name": "Example Site",
  "interval": 5,
  "expectedStatus": 200,
  "timeout": 10000
}
```

### remove

Remove a monitor by ID.

```json
{
  "action": "remove",
  "id": "monitor-uuid-here"
}
```

### check

Perform an immediate health check. You can target a registered monitor by ID or check an ad-hoc URL.

```json
{
  "action": "check",
  "id": "monitor-uuid-here"
}
```

```json
{
  "action": "check",
  "url": "https://example.com"
}
```

### status

Get current status of all monitors or a specific one.

```json
{
  "action": "status"
}
```

```json
{
  "action": "status",
  "id": "monitor-uuid-here"
}
```

### list

List all registered monitors.

```json
{
  "action": "list"
}
```

### history

Get check history for a monitor.

```json
{
  "action": "history",
  "id": "monitor-uuid-here",
  "limit": 10
}
```

## Config / Secrets

This skill does not require any API keys or external configuration. All processing is performed locally using native `fetch()`.

## Usage examples

### Register and check a site

```json
{ "action": "add", "url": "https://api.github.com", "name": "GitHub API" }
```

Then check it:

```json
{ "action": "check", "id": "<returned-monitor-id>" }
```

### View all statuses

```json
{ "action": "status" }
```

### View check history

```json
{ "action": "history", "id": "<monitor-id>", "limit": 5 }
```

## Error codes

| Code | Description |
|------|-------------|
| `INVALID_ACTION` | The provided action is not one of: `add`, `remove`, `check`, `status`, `list`, `history`. |
| `INVALID_URL` | The URL is missing, malformed, or uses a non-http(s) scheme. |
| `BLOCKED_URL` | The URL targets a private/internal IP address (SSRF protection). |
| `MISSING_ID` | The `id` parameter is required but was not provided. |
| `MISSING_TARGET` | Neither `id` nor `url` was provided for a check. |
| `MONITOR_NOT_FOUND` | No monitor exists with the given ID. |
| `OPERATION_FAILED` | An unexpected error occurred during processing. |

## Security notes

- **SSRF protection.** Requests to private/internal IP ranges (127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, ::1, localhost) are blocked.
- **Scheme enforcement.** Only `http://` and `https://` URLs are allowed.
- **Timeout enforcement.** Maximum timeout is capped at 30 seconds.
- **No credentials.** This skill does not handle authentication or credentials.
- **In-memory only.** All state is stored in memory and lost on restart.
- **No shell commands.** No arbitrary code execution paths exist.

## Limitations

- **In-memory storage only.** Monitor registrations and history are lost when the process exits.
- **No scheduling.** The `interval` field is stored for informational purposes; actual scheduling must be handled externally.
- **HEAD request only.** Health checks use HTTP HEAD requests, which some servers may not support. Consider using GET as a fallback.
- **No DNS resolution validation.** SSRF protection blocks known private IP patterns but cannot prevent DNS rebinding attacks.
- **No alerting.** The skill tracks status but does not send notifications when a site goes down.
- **History is capped.** Each monitor retains a maximum of 100 check history entries.

## Test instructions

Run the tests using Node.js built-in test runner:

```bash
node --test skills/uptime-monitor/__tests__/handler.test.js
```

The test suite covers:

- All six actions (add, remove, check, status, list, history)
- SSRF protection (private IPs, localhost blocked)
- URL validation (invalid URLs, non-http schemes)
- Timeout enforcement
- Edge cases (empty store, non-existent monitor, missing parameters)
- Mocked fetch to prevent real network calls
