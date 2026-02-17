# SMS Sender (Twilio) Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Send SMS/MMS messages, retrieve message details, list messages, get Twilio account info, and look up phone numbers via the Twilio API.

## Actions

### `send_sms`

Send an SMS message.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| to        | string | Yes      | --      | Destination phone number (E.164 format)  |
| from      | string | Yes      | --      | Sender phone number (E.164 format)       |
| body      | string | Yes      | --      | Message body text (max 1600 characters)  |

### `get_message`

Retrieve details for a specific message by SID.

| Parameter  | Type   | Required | Default | Description                                    |
| ---------- | ------ | -------- | ------- | ---------------------------------------------- |
| messageSid | string | Yes      | --      | Twilio message SID (starts with SM or MM, 34 chars) |

### `list_messages`

List messages with optional filters.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| to        | string | No       | --      | Filter by destination phone (E.164)      |
| from      | string | No       | --      | Filter by sender phone (E.164)           |
| limit     | number | No       | `25`    | Number of results to return (1--100)     |

### `send_mms`

Send an MMS message with media attachment.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| to        | string | Yes      | --      | Destination phone number (E.164 format)  |
| from      | string | Yes      | --      | Sender phone number (E.164 format)       |
| body      | string | No       | --      | Message body text (max 1600 characters)  |
| mediaUrl  | string | Yes      | --      | HTTP(S) URL of the media to attach       |

### `get_account`

Retrieve Twilio account information. No parameters required.

### `check_number`

Look up phone number information.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| number    | string | Yes      | --      | Phone number in E.164 format             |

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 15 seconds, maximum 30 seconds.
- **Input validation.** All parameters are validated and sanitized before use.
- **Secret redaction.** Tokens, API keys, and phone numbers are redacted from all output strings.

## Return Format

**Success:**

```json
{
  "result": "SMS sent successfully\nSID: SM1234...\n...",
  "metadata": {
    "success": true,
    "action": "send_sms",
    "layer": "L1",
    "sid": "SM1234...",
    "status": "queued",
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

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/sms-sender-twilio/__tests__/handler.test.js
```

The test suite contains 80+ tests across multiple describe blocks covering action validation, provider configuration, input validation, all 6 actions (happy and error paths), timeout handling, network errors, helper functions, validate() export, and meta export.
