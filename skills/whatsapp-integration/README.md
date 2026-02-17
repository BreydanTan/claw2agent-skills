# WhatsApp Integration Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Send messages, manage conversations, and handle read receipts via WhatsApp Cloud API.

## Actions

### `send_message`

Send a text message to a WhatsApp recipient.

| Parameter | Type   | Required | Default | Description              |
| --------- | ------ | -------- | ------- | ------------------------ |
| to        | string | Yes      | --      | Recipient phone number   |
| content   | string | Yes      | --      | Message text             |

**Endpoint:** `POST /messages` body: `{ messaging_product: "whatsapp", to, type: "text", text: { body: content } }`

**Response:** `{ messages: [{ id: "wamid_xxx" }] }`

### `mark_read`

Mark a message as read.

| Parameter | Type   | Required | Default | Description              |
| --------- | ------ | -------- | ------- | ------------------------ |
| messageId | string | Yes      | --      | Message ID to mark read  |

**Endpoint:** `POST /messages` body: `{ messaging_product: "whatsapp", status: "read", message_id: messageId }`

**Response:** `{ success: true }`

### `get_messages`

Retrieve messages from a conversation. **Not supported** -- WhatsApp Cloud API is webhook-based and does not provide message history retrieval. This action returns a `NOT_SUPPORTED` error immediately without making any API call.

| Parameter      | Type   | Required | Default | Description            |
| -------------- | ------ | -------- | ------- | ---------------------- |
| conversationId | string | No       | --      | Filter by conversation |

### `send_template`

Send a pre-approved template message.

| Parameter    | Type   | Required | Default | Description            |
| ------------ | ------ | -------- | ------- | ---------------------- |
| to           | string | Yes      | --      | Recipient phone number |
| templateName | string | Yes      | --      | Template name          |
| language     | string | No       | `en`    | Language code          |

**Endpoint:** `POST /messages` body: `{ messaging_product: "whatsapp", to, type: "template", template: { name: templateName, language: { code: language } } }`

**Response:** `{ messages: [{ id: "wamid_xxx" }] }`

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 30 seconds, maximum 120 seconds.
- **Input validation.** All parameters are validated and sanitized before use.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Message sent to +1234567890. Message ID: wamid_xxx",
  "metadata": {
    "success": true,
    "action": "send_message",
    "messageId": "wamid_xxx",
    "to": "+1234567890",
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

| Code                     | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| INVALID_ACTION           | The action parameter is missing or not recognized        |
| INVALID_INPUT            | A required parameter is missing or malformed             |
| PROVIDER_NOT_CONFIGURED  | No provider or gateway client available                  |
| NOT_SUPPORTED            | The action is not supported by the WhatsApp Cloud API    |
| TIMEOUT                  | The request exceeded the configured timeout              |
| UPSTREAM_ERROR           | The upstream WhatsApp API returned an error              |

## Security Notes

- All parameters are validated as non-empty strings before processing.
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- No API keys or secrets are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- Request timeouts are enforced and capped at 120 seconds maximum.
- The `get_messages` action does not make any external API call.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/whatsapp-integration/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 4 actions (happy and error paths), timeout handling, network errors, helper functions, and the validate export.
