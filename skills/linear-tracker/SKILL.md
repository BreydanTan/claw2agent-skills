---
name: linear-tracker
description: Manage Linear issues, projects, and cycles via the Linear GraphQL API. Create/update/list/get issues, create/list projects, add comments, search issues, and manage cycles. Uses injected provider client for API access (BYOK).
user-invocable: true
metadata: {"openclaw.category":"productivity","openclaw.risk":"L0","openclaw.layer":"L1","openclaw.tags":"project-management, linear, issue-tracking, cycles, graphql","openclaw.requires":{"config":["providerClient"]}}
---

# Linear Tracker

## Capabilities

**What it does:**
Manage Linear issues, projects, and cycles via the Linear GraphQL API. Create/update/list/get issues, create/list projects, add comments, search issues, and manage cycles. Uses injected provider client for API access (BYOK).

Supported actions:
- **`create_issue`**
- **`update_issue`**
- **`list_issues`**
- **`get_issue`**
- **`create_project`**
- **`list_projects`**
- **`add_comment`**
- **`search_issues`**
- **`manage_cycle`**

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
- "create issue" related requests
- "update issue" related requests
- "list issues" related requests
- User explicitly mentions "Linear" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (providerClient not injected)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  "action": "<one of: create_issue | update_issue | list_issues | get_issue | create_project | list_projects | add_comment | search_issues | manage_cycle>",
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "create_issue" },
  context  // contains providerClient / gatewayClient
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "create_issue" },  // missing required params
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

- **Risk level: L0**
- No external API key required (L1 local execution)
- All output is sanitized via SENSITIVE_PATTERNS regex (redacts keys/tokens)
- Input parameters are type- and length-validated; malicious payloads are rejected
- Request timeout enforced: default 30s, max 120s
- Raw API error stacks are never exposed to the user

## Version Info

- Handler version: 1.0.0
- Category: productivity
- Layer: L1
