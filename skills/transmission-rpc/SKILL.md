---
name: transmission-rpc
description: Manage torrent downloads via Transmission RPC interface.
user-invocable: true
metadata: {"openclaw.category":"iot-media","openclaw.risk":"L1","openclaw.layer":"L1","openclaw.tags":"transmission, torrent, download, rpc","openclaw.requires":{"env":["TRANSMISSION_RPC_API_KEY"]}}
---

# Transmission RPC API

## Capabilities

**What it does:**
Manage torrent downloads via Transmission RPC interface.

Supported actions:
- **`list_torrents`**
- **`add_torrent`**
- **`remove_torrent`**
- **`get_session`**

**What it does NOT do:**
- Does not store or cache user data to disk (no side effects beyond the API call)
- Does not bypass API rate limits or authentication mechanisms
- Does not perform operations outside the listed actions

## Execution Model

- This `SKILL.md` is the invocation contract and usage guide.
- Real execution is implemented in `handler.js` via `execute(params, context)`.
- Integrations (including OpenClaw wrappers) should route calls to the handler, not re-implement business logic in markdown.

## Trigger Semantics

**Trigger keywords (invoke this skill when the user says):**
- "list torrents" related requests
- "add torrent" related requests
- "remove torrent" related requests
- User explicitly mentions "Transmission" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (API key not configured)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  "action": "<one of: list_torrents | add_torrent | remove_torrent | get_session>",
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "list_torrents" },
  context  // contains providerClient / gatewayClient
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "list_torrents" },  // missing required params
  context
);
// result.metadata.success === false  (or error thrown for older handlers)
```

## Error Handling & Fallback

| Error Code | Meaning | Fallback Strategy |
|------------|---------|-------------------|
| `INVALID_ACTION` | Action not in supported list | Inform user of available actions |
| `INVALID_INPUT` | Missing or wrong-type parameter | Ask user for the missing parameter |
| `PROVIDER_NOT_CONFIGURED` | API client not configured | Guide user to configure API key |
| `TIMEOUT` | Request timed out (default 30s) | Suggest retry or reduce data |
| `UPSTREAM_ERROR` | Upstream API error | Show error details, suggest retry |

## Security Boundary

- **Risk level: L1**
- Requires API key (injected via providerClient, never hardcoded)
- All output is sanitized via SENSITIVE_PATTERNS regex (redacts keys/tokens)
- Input parameters are type- and length-validated; malicious payloads are rejected
- Request timeout enforced: default 30s, max 120s
- Raw API error stacks are never exposed to the user

## Version Info

- Handler version: 1.0.0
- Category: iot-media
- Layer: L1
