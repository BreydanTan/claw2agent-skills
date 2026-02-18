---
name: x-twitter-api
description: Interact with the X/Twitter API: fetch tweets, search, get user profiles, timelines, post tweets, trending topics, and tweet likes. Layer 1 skill using provider client for API access.
user-invocable: true
metadata: {"openclaw.category":"social","openclaw.risk":"L1","openclaw.layer":"L1","openclaw.tags":"twitter, x, social, api, tweets, timeline","openclaw.requires":{"env":["X_TWITTER_API_API_KEY"]}}
---

# X/Twitter API

## Capabilities

**What it does:**
Interact with the X/Twitter API: fetch tweets, search, get user profiles, timelines, post tweets, trending topics, and tweet likes. Layer 1 skill using provider client for API access.

Supported actions:
- **`get_tweet`**
- **`search_tweets`**
- **`get_user`**
- **`get_timeline`**
- **`post_tweet`**
- **`get_trending`**
- **`get_likes`**

**What it does NOT do:**
- Does not store or cache user data to disk (no side effects beyond the API call)
- Does not bypass API rate limits or authentication mechanisms
- Does not perform operations outside the listed actions

## Trigger Semantics

**Trigger keywords (invoke this skill when the user says):**
- "get tweet" related requests
- "search tweets" related requests
- "get user" related requests
- User explicitly mentions "X/Twitter" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (API key not configured)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  "action": "<one of: get_tweet | search_tweets | get_user | get_timeline | post_tweet | get_trending | get_likes>",
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "get_tweet" },
  context  // contains providerClient / gatewayClient
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "get_tweet" },  // missing required params
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
- Category: social
- Layer: L1
