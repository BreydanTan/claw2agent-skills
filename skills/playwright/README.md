# Playwright Browser Automation Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

**HIGH RISK:** URL allowlist enforced, no arbitrary code execution.

Browser automation via provider client. Navigate pages, take screenshots, extract text and links, fill forms, and evaluate JavaScript snippets.

## Actions

### `navigate`

Navigate to a URL.

| Parameter | Type   | Required | Default | Description                        |
| --------- | ------ | -------- | ------- | ---------------------------------- |
| url       | string | Yes      | --      | Target URL (http:// or https://)   |

**Endpoint:** `POST /browser/navigate` body: `{ url }`

### `screenshot`

Take a screenshot of a page.

| Parameter | Type    | Required | Default | Description                        |
| --------- | ------- | -------- | ------- | ---------------------------------- |
| url       | string  | Yes      | --      | Target URL (http:// or https://)   |
| fullPage  | boolean | No       | `false` | Capture full page                  |
| format    | string  | No       | `png`   | Image format: png or jpeg          |

**Endpoint:** `POST /browser/screenshot` body: `{ url, fullPage, format }`

### `get_text`

Extract text content from a page or element.

| Parameter | Type   | Required | Default | Description                        |
| --------- | ------ | -------- | ------- | ---------------------------------- |
| url       | string | Yes      | --      | Target URL (http:// or https://)   |
| selector  | string | No       | --      | CSS selector (max 200 chars)       |

**Endpoint:** `POST /browser/text` body: `{ url, selector }`

### `get_links`

Extract links from a page.

| Parameter | Type   | Required | Default | Description                        |
| --------- | ------ | -------- | ------- | ---------------------------------- |
| url       | string | Yes      | --      | Target URL (http:// or https://)   |
| limit     | number | No       | `100`   | Max links to return (1--500)       |

**Endpoint:** `POST /browser/links` body: `{ url, limit }`

### `fill_form`

Fill form fields on a page.

| Parameter | Type   | Required | Default | Description                                  |
| --------- | ------ | -------- | ------- | -------------------------------------------- |
| url       | string | Yes      | --      | Target URL (http:// or https://)             |
| fields    | array  | Yes      | --      | Array of `{ selector, value }` (max 50)      |

**Endpoint:** `POST /browser/fill` body: `{ url, fields }`

### `evaluate`

Run a JavaScript snippet on a page. Script is passed to the provider, not executed locally.

| Parameter | Type   | Required | Default | Description                        |
| --------- | ------ | -------- | ------- | ---------------------------------- |
| url       | string | Yes      | --      | Target URL (http:// or https://)   |
| script    | string | Yes      | --      | JavaScript code (max 2000 chars)   |

**Endpoint:** `POST /browser/evaluate` body: `{ url, script }`

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 30 seconds, maximum 60 seconds.
- **Input validation.** All parameters are validated and sanitized before use.
- **URL allowlist.** Only `http://` and `https://` protocols are permitted. `file://`, `javascript:`, and `data:` protocols are blocked.
- **Selector validation.** CSS selectors are limited to 200 characters and must not contain script tags.
- **Script validation.** JavaScript snippets are limited to 2000 characters and are passed to the provider (never executed locally).
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Navigated to: https://example.com\nTitle: Example Domain\nStatus: 200",
  "metadata": {
    "success": true,
    "action": "navigate",
    "layer": "L1",
    "url": "https://example.com",
    "page": { "title": "Example Domain", "status": 200 },
    "timestamp": "2025-01-15T12:00:00Z"
  }
}
```

**Error:**

```json
{
  "result": "Error: Provider client required ...",
  "metadata": {
    "success": false,
    "error": {
      "code": "PROVIDER_NOT_CONFIGURED",
      "message": "...",
      "retriable": false
    }
  }
}
```

## Error Codes

| Code                     | Description                                      |
| ------------------------ | ------------------------------------------------ |
| INVALID_ACTION           | The action parameter is missing or not recognized|
| INVALID_INPUT            | A required parameter is missing or malformed     |
| PROVIDER_NOT_CONFIGURED  | No provider or gateway client available          |
| TIMEOUT                  | The request exceeded the configured timeout      |
| UPSTREAM_ERROR           | The upstream browser provider returned an error  |

## Security Notes

- **URL allowlist:** Only `http://` and `https://` protocols are allowed. `file://`, `javascript:`, and `data:` protocols are explicitly blocked.
- **No local code execution:** JavaScript snippets in the `evaluate` action are passed to the provider for execution, never executed locally.
- **Selector sanitization:** CSS selectors are limited to 200 characters and reject script tags to prevent injection.
- **Field limits:** Form fill operations are limited to 50 fields maximum.
- **Secret redaction:** All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- **No API keys or secrets** are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- **Request timeouts** are enforced and capped at 60 seconds maximum.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/playwright/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering URL validation (protocol blocking), all 6 actions (happy and error paths), security tests, input validation, timeout handling, network errors, helper functions, and the validate export.
