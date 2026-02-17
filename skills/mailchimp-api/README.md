# Mailchimp Marketing API Skill

**Layer 1 (L1)** -- Standard API client, BYOK possible.

Interact with the Mailchimp Marketing API to manage campaigns, audiences, subscribers, and reporting.

## Actions

### `list_campaigns`

List email campaigns with optional status filter.

| Parameter | Type   | Required | Default | Description                                              |
| --------- | ------ | -------- | ------- | -------------------------------------------------------- |
| status    | string | No       | --      | Filter by status: save, paused, schedule, sending, sent  |
| limit     | number | No       | `25`    | Number of results (1--100)                               |

### `get_campaign`

Get details for a specific campaign.

| Parameter  | Type   | Required | Default | Description     |
| ---------- | ------ | -------- | ------- | --------------- |
| campaignId | string | Yes      | --      | The campaign ID |

### `create_campaign`

Create a new email campaign.

| Parameter   | Type   | Required | Default     | Description                           |
| ----------- | ------ | -------- | ----------- | ------------------------------------- |
| type        | string | No       | `regular`   | Campaign type: regular or plaintext   |
| subjectLine | string | Yes      | --          | Email subject line                    |
| fromName    | string | Yes      | --          | Sender display name                   |
| replyTo     | string | Yes      | --          | Reply-to email (must be valid format) |
| listId      | string | Yes      | --          | Target audience/list ID               |

### `list_audiences`

List audiences (mailing lists).

| Parameter | Type   | Required | Default | Description                |
| --------- | ------ | -------- | ------- | -------------------------- |
| limit     | number | No       | `25`    | Number of results (1--100) |

### `add_subscriber`

Add a subscriber to an audience list.

| Parameter | Type   | Required | Default     | Description                                        |
| --------- | ------ | -------- | ----------- | -------------------------------------------------- |
| listId    | string | Yes      | --          | Audience/list ID                                   |
| email     | string | Yes      | --          | Subscriber email address (must be valid format)    |
| status    | string | No       | `pending`   | subscribed, unsubscribed, or pending               |
| firstName | string | No       | --          | Subscriber first name (FNAME merge field)          |
| lastName  | string | No       | --          | Subscriber last name (LNAME merge field)           |

### `get_campaign_report`

Get a campaign's performance report.

| Parameter  | Type   | Required | Default | Description     |
| ---------- | ------ | -------- | ------- | --------------- |
| campaignId | string | Yes      | --      | The campaign ID |

### `search_members`

Search for members across lists.

| Parameter | Type   | Required | Default | Description                        |
| --------- | ------ | -------- | ------- | ---------------------------------- |
| query     | string | Yes      | --      | Search query (max 200 characters)  |
| listId    | string | No       | --      | Limit search to a specific list    |

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 15 seconds, maximum 30 seconds.
- **Input validation.** All parameters are validated and sanitized before use. Email addresses are validated with basic format checking.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Found 5 campaign(s)\nShowing: 5 (limit: 25)\n...",
  "metadata": {
    "success": true,
    "action": "list_campaigns",
    "layer": "L1",
    "totalItems": 5,
    "count": 5,
    "limit": 25,
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
| INVALID_ACTION           | The action parameter is missing or not recognized |
| INVALID_INPUT            | A required parameter is missing or invalid        |
| PROVIDER_NOT_CONFIGURED  | No provider or gateway client in context          |
| TIMEOUT                  | The request exceeded the configured timeout       |
| UPSTREAM_ERROR           | The upstream API returned an error                |

## Security Notes

- API keys are never accessed directly by skill code; they are managed by the platform adapter.
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted.
- Email addresses are validated before being sent to the API.
- Query parameters are URL-encoded to prevent injection.
- Input limits are enforced to prevent abuse (limit clamped 1--100, query max 200 chars).

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/mailchimp-api/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 7 actions (happy and error paths), input validation (email format, status values, campaign type, limits), timeout handling, network errors, helper functions, and the validate/meta exports.
