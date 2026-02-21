---
name: telegram-bot
description: Interact with the Telegram Bot API to send messages, get updates, and retrieve bot information.
user-invocable: true
metadata: {"openclaw.category":"communication","openclaw.risk":"L1","openclaw.layer":"L0","openclaw.tags":"telegram, bot, messaging, chat","openclaw.requires":{"env":["TELEGRAM_BOT_API_KEY"]}}
---

# Telegram Bot

## Capabilities

**What it does:**
Interact with the Telegram Bot API to send messages, get updates, and retrieve bot information.

Supported actions:
- **`sendMessage`**
- **`getUpdates`**
- **`getMe`**

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
- "sendMessage" related requests
- "getUpdates" related requests
- "getMe" related requests
- User explicitly mentions "Telegram" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (API key not configured)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  "action": "<one of: sendMessage | getUpdates | getMe>",
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "sendMessage" },
  context  // contains L0 context (store, etc.)
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "sendMessage" },  // missing required params
  context
);
// result.metadata.success === false  (or error thrown for older handlers)
```

## Error Handling & Fallback

| Error Code | Meaning | Fallback Strategy |
|------------|---------|-------------------|
| `INVALID_ACTION` | Action not in supported list | Inform user of available actions |
| `INVALID_INPUT` | Missing or wrong-type parameter | Ask user for the missing parameter |
| `NOT_FOUND` | Resource not found | Ask user to verify ID or criteria |

## Security Boundary

- **Risk level: L1**
- Requires API key (injected via providerClient, never hardcoded)
- All output is sanitized via SENSITIVE_PATTERNS regex (redacts keys/tokens)
- Input parameters are type- and length-validated; malicious payloads are rejected
- Does not access the network or write to persistent storage (unless by design)

## Version Info

- Handler version: 1.0.0
- Category: communication
- Layer: L0
