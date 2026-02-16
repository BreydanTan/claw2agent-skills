# Prompt Library Skill

Store, search, and manage reusable prompt templates with categorization, variable interpolation, and version tracking.

## What This Skill Does

The Prompt Library skill provides an in-memory store for prompt templates. Users can save templates with `{{variable}}` placeholders, organize them by category and tags, search across the library, and render templates by substituting variables with actual values. Each template is automatically versioned on every update.

## Supported Commands

| Action       | Description                                      | Required Params         |
|-------------|--------------------------------------------------|-------------------------|
| `add`       | Add or update a prompt template                   | `name`, `template`      |
| `get`       | Retrieve a prompt by exact name                   | `name`                  |
| `search`    | Search prompts by query (name, description, tags, content) | `query`          |
| `list`      | List all prompts, optionally filtered by category | (optional) `category`   |
| `delete`    | Delete a prompt by name                           | `name`                  |
| `render`    | Render a template with variable substitution      | `name`, `variables`     |
| `categories`| List all unique categories with counts            | (none)                  |

## Required Config / Secrets

This skill does not require any API keys, secrets, or external configuration. All data is stored in-memory.

## Usage Examples

### Add a prompt template

```json
{
  "action": "add",
  "name": "code-review",
  "template": "Review the following {{language}} code for {{focus_area}}:\n\n{{code}}",
  "category": "development",
  "description": "Code review prompt with language and focus area",
  "tags": ["code", "review", "development"]
}
```

### Get a prompt by name

```json
{
  "action": "get",
  "name": "code-review"
}
```

### Search prompts

```json
{
  "action": "search",
  "query": "code review"
}
```

### List all prompts

```json
{
  "action": "list"
}
```

### List prompts in a specific category

```json
{
  "action": "list",
  "category": "development"
}
```

### Delete a prompt

```json
{
  "action": "delete",
  "name": "code-review"
}
```

### Render a template with variables

```json
{
  "action": "render",
  "name": "code-review",
  "variables": {
    "language": "Python",
    "focus_area": "error handling",
    "code": "def divide(a, b):\n    return a / b"
  }
}
```

### List categories

```json
{
  "action": "categories"
}
```

## Error Codes

| Code                | Description                                         |
|---------------------|-----------------------------------------------------|
| `INVALID_ACTION`    | The provided action is not one of the supported actions. |
| `MISSING_NAME`      | The `name` parameter is missing or empty.           |
| `MISSING_TEMPLATE`  | The `template` parameter is missing or empty.       |
| `MISSING_QUERY`     | The `query` parameter is missing or empty.          |
| `NOT_FOUND`         | No prompt exists with the given name.               |
| `MISSING_VARIABLES` | Required template variables were not provided for rendering. |

## Security Notes

- All data is stored in-memory and does not persist between process restarts.
- No external network calls are made.
- Template rendering uses simple string replacement; no code execution is involved.
- Variable names are restricted to word characters (`\w+`) inside `{{...}}` delimiters.

## Limitations

- **In-memory only**: All prompts are lost when the process restarts. There is no file-based or database persistence.
- **No access control**: Any caller can read, modify, or delete any prompt.
- **No template nesting**: Templates cannot reference or include other templates.
- **Simple search**: Search uses substring matching with basic scoring, not full-text search or semantic similarity.
- **Variable validation**: Only checks for the presence of variables, not their type or format.

## Test Instructions

Run the test suite using Node.js built-in test runner:

```bash
node --test skills/prompt-library/__tests__/handler.test.js
```

Or run directly with Node.js:

```bash
node skills/prompt-library/__tests__/handler.test.js
```

The test file uses Node.js built-in `assert` module and covers all actions including edge cases for missing parameters, non-existing entries, and variable interpolation.
