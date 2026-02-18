---
name: slack-integration
description: Interact with Slack workspaces via the Slack API. Send messages, manage channels, list messages, add reactions, and invite users. Uses injected provider client for API access (BYOK).
user-invocable: true
metadata: {"openclaw.category":"communication","openclaw.risk":"L1","openclaw.layer":"L1","openclaw.tags":"slack, messaging, channels, communication, workspace, chat, reactions, notifications","openclaw.requires":{"config":["providerClient"]}}
---

# Slack Integration

## Capabilities

**What it does:**
Interact with Slack workspaces via the Slack API. Send messages, manage channels, list messages, add reactions, and invite users. Uses injected provider client for API access (BYOK).

Supported actions:
- **`send_message`**
- **`list_channels`**
- **`get_channel`**
- **`list_messages`**
- **`react`**
- **`create_channel`**
- **`invite_user`**
- **`set_topic`**

**What it does NOT do:**
- Does not store or cache user data to disk (no side effects beyond the API call)
- Does not bypass API rate limits or authentication mechanisms
- Does not perform operations outside the listed actions

## Trigger Semantics

**Trigger keywords (invoke this skill when the user says):**
- "send message" related requests
- "list channels" related requests
- "get channel" related requests
- User explicitly mentions "Slack" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (providerClient not injected)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  "action": "<one of: send_message | list_channels | get_channel | list_messages | react | create_channel | invite_user | set_topic>",
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "send_message" },
  context  // contains providerClient / gatewayClient
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "send_message" },  // missing required params
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
- No external API key required (L1 local execution)
- All output is sanitized via SENSITIVE_PATTERNS regex (redacts keys/tokens)
- Input parameters are type- and length-validated; malicious payloads are rejected
- Request timeout enforced: default 30s, max 120s
- Raw API error stacks are never exposed to the user

## Version Info

- Handler version: 1.0.0
- Category: communication
- Layer: L1
