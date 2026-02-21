---
name: deep-research
description: Conduct multi-step research on any topic using DuckDuckGo. Generates search queries, fetches results, and compiles structured reports with summaries, key findings, and sources.
user-invocable: true
metadata: {"openclaw.category":"data-research","openclaw.risk":"L0","openclaw.layer":"L0","openclaw.tags":"research, search, analysis, web, report","openclaw.requires":{}}
---

# Deep Research

## Capabilities

**What it does:**
Conduct multi-step research on any topic using DuckDuckGo. Generates search queries, fetches results, and compiles structured reports with summaries, key findings, and sources.

Supported actions:
- _(see handler.js for available operations)_

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
- "deep" related requests
- User explicitly mentions "Deep" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (context not available)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  // no fixed action enum — see handler.js
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "execute" },
  context  // contains L0 context (store, etc.)
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "execute" },  // missing required params
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
- Category: data-research
- Layer: L0
