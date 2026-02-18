---
name: calendar-manager
description: Manage calendar events with full CRUD operations, search, and upcoming event queries. Supports recurring events, attendees, reminders, and date range filtering.
user-invocable: true
metadata: {"openclaw.category":"productivity","openclaw.risk":"L0","openclaw.layer":"L0","openclaw.tags":"calendar, events, scheduling, productivity, reminders, recurring","openclaw.requires":{}}
---

# Calendar Manager

## Capabilities

**What it does:**
Manage calendar events with full CRUD operations, search, and upcoming event queries. Supports recurring events, attendees, reminders, and date range filtering.

Supported actions:
- **`create`**
- **`list`**
- **`update`**
- **`delete`**
- **`search`**
- **`upcoming`**

**What it does NOT do:**
- Does not store or cache user data to disk (no side effects beyond the API call)
- Does not bypass API rate limits or authentication mechanisms
- Does not perform operations outside the listed actions

## Trigger Semantics

**Trigger keywords (invoke this skill when the user says):**
- "create" related requests
- "list" related requests
- "update" related requests
- User explicitly mentions "Calendar" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (context not available)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  "action": "<one of: create | list | update | delete | search | upcoming>",
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "create" },
  context  // contains L0 context (store, etc.)
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "create" },  // missing required params
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

- **Risk level: L0**
- No external API key required (L0 local execution)
- All output is sanitized via SENSITIVE_PATTERNS regex (redacts keys/tokens)
- Input parameters are type- and length-validated; malicious payloads are rejected
- Does not access the network or write to persistent storage (unless by design)

## Version Info

- Handler version: 1.0.0
- Category: productivity
- Layer: L0
