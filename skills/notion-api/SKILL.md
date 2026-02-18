---
name: notion-api
description: Interact with the Notion API to manage pages, databases, blocks, and search across workspaces. Layer 1 skill using provider client for API access.
user-invocable: true
metadata: {"openclaw.category":"productivity","openclaw.risk":"L0","openclaw.layer":"L1","openclaw.tags":"notion, api, pages, databases, workspace, notes","openclaw.requires":{"env":["NOTION_API_API_KEY"]}}
---

# Notion API

## Capabilities

**What it does:**
Interact with the Notion API to manage pages, databases, blocks, and search across workspaces. Layer 1 skill using provider client for API access.

Supported actions:
- **`get_page`**
- **`create_page`**
- **`update_page`**
- **`search`**
- **`get_database`**
- **`query_database`**
- **`get_block_children`**

**What it does NOT do:**
- Does not store or cache user data to disk (no side effects beyond the API call)
- Does not bypass API rate limits or authentication mechanisms
- Does not perform operations outside the listed actions

## Trigger Semantics

**Trigger keywords (invoke this skill when the user says):**
- "get page" related requests
- "create page" related requests
- "update page" related requests
- User explicitly mentions "Notion" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (API key not configured)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  "action": "<one of: get_page | create_page | update_page | search | get_database | query_database | get_block_children>",
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "get_page" },
  context  // contains providerClient / gatewayClient
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "get_page" },  // missing required params
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
- Requires API key (injected via providerClient, never hardcoded)
- All output is sanitized via SENSITIVE_PATTERNS regex (redacts keys/tokens)
- Input parameters are type- and length-validated; malicious payloads are rejected
- Request timeout enforced: default 30s, max 120s
- Raw API error stacks are never exposed to the user

## Version Info

- Handler version: 1.0.0
- Category: productivity
- Layer: L1
