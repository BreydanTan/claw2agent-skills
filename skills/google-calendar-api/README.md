# Google Calendar API Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Interact with the Google Calendar API to list, create, update, delete, and search calendar events, as well as list available calendars.

## Actions

### `list_events`

List events from a calendar.

| Parameter  | Type   | Required | Default     | Description                          |
| ---------- | ------ | -------- | ----------- | ------------------------------------ |
| calendarId | string | No       | `primary`   | Calendar ID                          |
| timeMin    | string | No       | --          | Minimum time filter (ISO 8601)       |
| timeMax    | string | No       | --          | Maximum time filter (ISO 8601)       |
| limit      | number | No       | `25`        | Number of events (1--100)            |

**Endpoint:** `GET /calendars/{calendarId}/events?timeMin={timeMin}&timeMax={timeMax}&limit={limit}`

### `get_event`

Get details of a specific event.

| Parameter  | Type   | Required | Default     | Description         |
| ---------- | ------ | -------- | ----------- | ------------------- |
| calendarId | string | No       | `primary`   | Calendar ID         |
| eventId    | string | Yes      | --          | The event ID        |

**Endpoint:** `GET /calendars/{calendarId}/events/{eventId}`

### `create_event`

Create a new calendar event.

| Parameter   | Type     | Required | Default     | Description                          |
| ----------- | -------- | -------- | ----------- | ------------------------------------ |
| calendarId  | string   | No       | `primary`   | Calendar ID                          |
| summary     | string   | Yes      | --          | Event title (max 500 chars)          |
| start       | string   | Yes      | --          | Start time (ISO 8601)                |
| end         | string   | Yes      | --          | End time (ISO 8601)                  |
| description | string   | No       | --          | Event description (max 8000 chars)   |
| location    | string   | No       | --          | Event location (max 500 chars)       |
| attendees   | string[] | No       | --          | Array of attendee email strings      |

**Endpoint:** `POST /calendars/{calendarId}/events`

### `update_event`

Update an existing calendar event.

| Parameter   | Type   | Required | Default     | Description                          |
| ----------- | ------ | -------- | ----------- | ------------------------------------ |
| calendarId  | string | No       | `primary`   | Calendar ID                          |
| eventId     | string | Yes      | --          | The event ID                         |
| summary     | string | No       | --          | Updated title (max 500 chars)        |
| start       | string | No       | --          | Updated start time (ISO 8601)        |
| end         | string | No       | --          | Updated end time (ISO 8601)          |
| description | string | No       | --          | Updated description (max 8000 chars) |
| location    | string | No       | --          | Updated location (max 500 chars)     |

**Endpoint:** `PATCH /calendars/{calendarId}/events/{eventId}`

### `delete_event`

Delete a calendar event.

| Parameter  | Type   | Required | Default     | Description         |
| ---------- | ------ | -------- | ----------- | ------------------- |
| calendarId | string | No       | `primary`   | Calendar ID         |
| eventId    | string | Yes      | --          | The event ID        |

**Endpoint:** `DELETE /calendars/{calendarId}/events/{eventId}`

### `list_calendars`

List available calendars. No required parameters.

**Endpoint:** `GET /calendars`

### `search_events`

Search events by text query.

| Parameter  | Type   | Required | Default     | Description                          |
| ---------- | ------ | -------- | ----------- | ------------------------------------ |
| calendarId | string | No       | `primary`   | Calendar ID                          |
| query      | string | Yes      | --          | Search query (max 200 chars)         |
| limit      | number | No       | `25`        | Number of results (1--100)           |

**Endpoint:** `GET /calendars/{calendarId}/events?q={query}&limit={limit}`

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 15 seconds, maximum 30 seconds.
- **Input validation.** All parameters are validated and sanitized before use. ISO 8601 dates are checked, email formats are validated, and string lengths are enforced.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Calendar: primary (3 events)\n\n1. Team Meeting (2025-01-15T10:00:00Z)",
  "metadata": {
    "success": true,
    "action": "list_events",
    "layer": "L1",
    "calendarId": "primary",
    "limit": 25,
    "eventCount": 3,
    "events": [...],
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
| UPSTREAM_ERROR           | The upstream Google Calendar API returned an error|

## Security Notes

- All date/time inputs are validated against ISO 8601 format before use.
- Email addresses are validated against a basic format pattern.
- String lengths are enforced (summary: 500, description: 8000, location: 500, query: 200).
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- No API keys or secrets are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- Request timeouts are enforced and capped at 30 seconds maximum.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/google-calendar-api/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 7 actions (happy and error paths), input validation, timeout handling, network errors, helper functions, and the validate export.
