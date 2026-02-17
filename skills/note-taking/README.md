# Note Taking Skill

**Layer:** L0 (pure local processing, no external API calls)

## Description

Create, manage, search, and organize notes with tags and folders. All data is stored in an in-memory Map-based store.

## Actions

| Action           | Description                                | Required Params       | Optional Params          |
| ---------------- | ------------------------------------------ | --------------------- | ------------------------ |
| `create_note`    | Create a new note                          | `title`               | `content`, `tags`, `folder` |
| `get_note`       | Retrieve a note by ID                      | `noteId`              |                          |
| `update_note`    | Update a note's title and/or content       | `noteId`              | `title`, `content`       |
| `delete_note`    | Delete a note by ID                        | `noteId`              |                          |
| `list_notes`     | List all notes with optional filters       |                       | `folder`, `tag`, `limit` |
| `search_notes`   | Full-text search across title and content  | `query`               | `limit`                  |
| `add_tag`        | Add tag(s) to a note                       | `noteId`, `tags`      |                          |
| `remove_tag`     | Remove tag(s) from a note                  | `noteId`, `tags`      |                          |
| `move_to_folder` | Move a note to a different folder          | `noteId`, `folder`    |                          |
| `list_folders`   | List all unique folders with notes in them |                       |                          |

## Usage Examples

### Create a note

```json
{
  "action": "create_note",
  "title": "Meeting Notes",
  "content": "Discussed Q3 roadmap and sprint goals.",
  "tags": ["meeting", "q3"],
  "folder": "work"
}
```

### Search notes

```json
{
  "action": "search_notes",
  "query": "roadmap",
  "limit": 10
}
```

### Add tags

```json
{
  "action": "add_tag",
  "noteId": "<note-id>",
  "tags": ["important", "follow-up"]
}
```

### Move to folder

```json
{
  "action": "move_to_folder",
  "noteId": "<note-id>",
  "folder": "archive"
}
```

## Response Format

### Success

```json
{
  "result": "Note \"Meeting Notes\" created successfully.",
  "metadata": {
    "success": true,
    "action": "create_note",
    "noteId": "abc-123",
    "note": { ... }
  }
}
```

### Error

```json
{
  "result": "Error: title is required and must be a non-empty string.",
  "metadata": {
    "success": false,
    "error": "MISSING_TITLE"
  }
}
```

## Running Tests

```bash
node --test skills/note-taking/__tests__/handler.test.js
```
