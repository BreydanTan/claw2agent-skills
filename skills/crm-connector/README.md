# CRM Connector Skill

**Layer 1 (L1)** -- External API via injected client, BYOK possible.

Manage CRM contacts, leads, and activity logs via provider client. Supports Salesforce/HubSpot-style operations.

## Actions

### `find_contact`

Search CRM contacts by query string.

| Parameter | Type   | Required | Default | Description                  |
| --------- | ------ | -------- | ------- | ---------------------------- |
| query     | string | Yes      | --      | Search query for contacts    |

**Endpoint:** `POST /contacts/search` body: `{ query }`

### `create_lead`

Create a new lead in the CRM.

| Parameter | Type          | Required | Default | Description                                    |
| --------- | ------------- | -------- | ------- | ---------------------------------------------- |
| leadData  | string/object | Yes      | --      | JSON lead data with name, email, company fields |

**Endpoint:** `POST /leads` body: `leadData`

### `add_log`

Add an activity log entry to a contact.

| Parameter  | Type   | Required | Default | Description              |
| ---------- | ------ | -------- | ------- | ------------------------ |
| contactId  | string | Yes      | --      | Contact ID               |
| logContent | string | Yes      | --      | Activity log content     |

**Endpoint:** `POST /contacts/{contactId}/logs` body: `{ content }`

### `list_deals`

List deals with optional status filter.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| status    | string | No       | `all`   | Filter by status: all, open, won, lost   |

**Endpoint:** `GET /deals?status=xxx`

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 30 seconds, maximum 120 seconds.
- **Input validation.** All parameters are validated and sanitized before use. Query must be a non-empty string, leadData must be valid JSON or an object, contactId and logContent are required strings for add_log.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Contact Search Results\nQuery: john\nFound: 2 contact(s)\n\n1. John Doe (john@example.com)\n2. John Smith (jsmith@example.com)",
  "metadata": {
    "success": true,
    "action": "find_contact",
    "query": "john",
    "contactCount": 2,
    "contacts": [...],
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
| UPSTREAM_ERROR           | The upstream CRM API returned an error           |

## Security Notes

- All string parameters are validated as non-empty before processing.
- Lead data strings are parsed and validated as proper JSON before forwarding.
- Contact IDs are validated as non-empty strings to prevent injection.
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- No API keys or secrets are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- Request timeouts are enforced and capped at 120 seconds maximum.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/crm-connector/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 4 actions (happy and error paths), input validation, timeout handling, network errors, helper functions, and the validate export.
