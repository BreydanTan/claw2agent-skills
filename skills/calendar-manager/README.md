# Calendar Manager

Manage calendar events with full CRUD operations, keyword search, and upcoming-event queries using an in-memory store.

## What it does

This skill provides a complete calendar event management system with six actions:

- **create** - Create a new event with title, times, location, attendees, reminders, and recurrence.
- **list** - List all events, optionally filtered by a date range.
- **update** - Update an existing event by ID with partial update support.
- **delete** - Delete an event by ID.
- **search** - Search events by keyword in title or description.
- **upcoming** - Get events occurring within the next N hours.

### Event fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | auto | Auto-generated UUID |
| `title` | string | create | Event title |
| `startTime` | string | create | ISO 8601 start time |
| `endTime` | string | no | ISO 8601 end time |
| `description` | string | no | Event description |
| `location` | string | no | Event location |
| `attendees` | string[] | no | List of attendee names or emails |
| `reminders` | number[] | no | Reminder offsets in minutes before the event |
| `recurring` | string | no | Recurrence pattern: `daily`, `weekly`, `monthly`, `yearly` |

## Commands

### create

Create a new calendar event.

```json
{
  "action": "create",
  "title": "Team Standup",
  "startTime": "2025-06-01T09:00:00Z",
  "endTime": "2025-06-01T09:30:00Z",
  "description": "Daily standup meeting",
  "location": "Conference Room A",
  "attendees": ["alice@example.com", "bob@example.com"],
  "reminders": [15, 5],
  "recurring": "daily"
}
```

### list

List all events or filter by date range.

```json
{
  "action": "list",
  "startRange": "2025-06-01T00:00:00Z",
  "endRange": "2025-06-30T23:59:59Z"
}
```

### update

Update an event by ID. Only the provided fields are changed (partial update).

```json
{
  "action": "update",
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "title": "Updated Title",
  "location": "New Room"
}
```

### delete

Delete an event by ID.

```json
{
  "action": "delete",
  "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
}
```

### search

Search events by keyword in title or description.

```json
{
  "action": "search",
  "query": "standup"
}
```

### upcoming

Get events occurring within the next N hours (default: 24).

```json
{
  "action": "upcoming",
  "hours": 48
}
```

## Config / Secrets

This skill does not require any API keys or external configuration. All events are stored in memory and will not persist across process restarts.

## Usage examples

### Create a recurring weekly meeting

```json
{
  "action": "create",
  "title": "Sprint Planning",
  "startTime": "2025-06-02T10:00:00Z",
  "endTime": "2025-06-02T11:00:00Z",
  "description": "Bi-weekly sprint planning session",
  "attendees": ["team@example.com"],
  "recurring": "weekly"
}
```

### List events for a specific week

```json
{
  "action": "list",
  "startRange": "2025-06-01T00:00:00Z",
  "endRange": "2025-06-07T23:59:59Z"
}
```

### Search for all meetings about a topic

```json
{
  "action": "search",
  "query": "planning"
}
```

### Check upcoming events in the next 2 hours

```json
{
  "action": "upcoming",
  "hours": 2
}
```

## Error codes

| Code | Description |
|------|-------------|
| `INVALID_ACTION` | The provided action is not one of: `create`, `list`, `update`, `delete`, `search`, `upcoming`. |
| `MISSING_TITLE` | The `title` parameter is missing or empty (required for create). |
| `MISSING_START_TIME` | The `startTime` parameter is missing (required for create). |
| `INVALID_DATE` | A date parameter is not a valid ISO 8601 string. |
| `INVALID_DATE_RANGE` | The `endTime` is not after `startTime`. |
| `INVALID_RECURRING` | The `recurring` value is not one of: `daily`, `weekly`, `monthly`, `yearly`. |
| `MISSING_ID` | The `id` parameter is missing (required for update and delete). |
| `EVENT_NOT_FOUND` | No event exists with the provided ID. |
| `MISSING_QUERY` | The `query` parameter is missing or empty (required for search). |
| `INVALID_TITLE` | The `title` value is not a valid non-empty string (update). |
| `OPERATION_FAILED` | An unexpected error occurred during processing. |

## Security notes

- All string inputs (title, description, location, attendees) are sanitized to prevent XSS by escaping HTML-significant characters (`<`, `>`, `&`, `"`, `'`).
- Date strings are validated before use to prevent injection through date parsing.
- No arbitrary code execution paths exist; the skill only performs Map-based CRUD operations.
- All processing happens locally -- no data is sent to external services.
- The in-memory store means data does not persist across restarts, reducing data leak risk.

## Limitations

- **In-memory only.** Events are stored in a JavaScript Map and will be lost when the process exits.
- **No timezone handling.** All dates are treated as-is. Clients should provide UTC or consistently formatted dates.
- **Recurring events are metadata only.** The `recurring` field is stored but the skill does not automatically generate future occurrences.
- **No conflict detection.** The skill does not check for overlapping events.
- **No authentication.** Any caller can create, modify, or delete any event.
- **No pagination.** The list action returns all matching events. For very large stores this could be slow.

## Test instructions

Run the tests using Node.js built-in test runner:

```bash
node --test skills/calendar-manager/__tests__/handler.test.js
```

The test suite covers:

- Creation of events with all field combinations
- Listing with and without date range filters
- Partial updates and full updates
- Deletion of existing and non-existent events
- Keyword search across title and description
- Upcoming event queries with custom time windows
- Input validation (missing fields, invalid dates, XSS prevention)
- Edge cases (empty store, duplicate operations, invalid actions)
