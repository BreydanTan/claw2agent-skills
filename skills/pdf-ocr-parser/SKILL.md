---
name: pdf-ocr-parser
description: Parse PDFs and images via OCR provider client for text extraction, table extraction, and metadata retrieval. Layer 1 skill using provider client for API access.
user-invocable: true
metadata: {"openclaw.category":"content","openclaw.risk":"L0","openclaw.layer":"L1","openclaw.tags":"pdf, ocr, parser, text-extraction, tables, document","openclaw.requires":{"env":["PDF_OCR_PARSER_API_KEY"]}}
---

# PDF OCR Parser

## Capabilities

**What it does:**
Parse PDFs and images via OCR provider client for text extraction, table extraction, and metadata retrieval. Layer 1 skill using provider client for API access.

Supported actions:
- **`parse_pdf`**
- **`parse_image`**
- **`extract_tables`**
- **`get_metadata`**
- **`list_languages`**

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
- "parse pdf" related requests
- "parse image" related requests
- "extract tables" related requests
- User explicitly mentions "PDF" or the related platform/service

**Anti-triggers (do NOT invoke this skill when):**
- User is only asking about concepts, no actual operation needed
- Requested operation is not in the supported actions list
- Required authentication is missing (API key not configured)

## Parameter Mapping

Map user natural language requests to the following structure:

```json
{
  "action": "<one of: parse_pdf | parse_image | extract_tables | get_metadata | list_languages>",
  // action-specific parameters (see handler.js for full schema)
}
```

## Invocation Convention

Trigger `handler.js` `execute(params, context)` via tool call:

```js
// Success example
const result = await execute(
  { "action": "parse_pdf" },
  context  // contains providerClient / gatewayClient
);
// result.metadata.success === true  (or result.result for older handlers)

// Failure example (missing required param)
const result = await execute(
  { action: "parse_pdf" },  // missing required params
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
- Category: content
- Layer: L1
