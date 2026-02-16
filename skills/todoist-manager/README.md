# Todoist Manager

**Layer 1 (L1) Skill** - Manage Todoist projects and tasks via the Todoist API.

## Overview

The Todoist Manager skill provides a comprehensive interface to interact with the Todoist task management platform. It supports full CRUD operations for both projects and tasks, all routed through the injected provider client (BYOK - Bring Your Own Key).

## Actions

| Action | Description | Required Params |
|---|---|---|
| `list_projects` | List all projects | - |
| `get_project` | Get project details | `projectId` |
| `create_project` | Create a new project | `name` |
| `list_tasks` | List tasks with optional filters | - |
| `get_task` | Get task details | `taskId` |
| `create_task` | Create a new task | `content` |
| `update_task` | Update an existing task | `taskId` |
| `complete_task` | Mark a task as complete | `taskId` |
| `delete_task` | Delete a task | `taskId` |

## Parameters

### Project Parameters

- **projectId** (string) - Project ID. Required for `get_project`, optional for `list_tasks` and `create_task`.
- **name** (string) - Project name. Required for `create_project`.
- **color** (string) - Project color. Optional for `create_project`.
- **isFavorite** (boolean) - Whether the project is a favorite. Optional for `create_project`.

### Task Parameters

- **taskId** (string) - Task ID. Required for `get_task`, `update_task`, `complete_task`, `delete_task`.
- **content** (string) - Task content/title. Required for `create_task`, optional for `update_task`.
- **description** (string) - Task description. Optional.
- **priority** (number, 1-4) - Task priority where 4 is urgent. Optional.
- **dueString** (string) - Natural language due date (e.g., "tomorrow", "next Monday"). Optional.
- **labels** (string[]) - Labels to apply. Optional.
- **filter** (string) - Todoist filter string for `list_tasks`. Optional.
- **label** (string) - Filter tasks by label name for `list_tasks`. Optional.

## L1 Compliance

- No hardcoded Todoist API URLs
- All API access goes through `context.providerClient` or `context.gatewayClient`
- Returns `PROVIDER_NOT_CONFIGURED` if no client is available
- Enforces timeout (default 15s, max 30s)
- Redacts sensitive tokens from outputs
- Sanitizes all string inputs
- All endpoints prefixed with `todoist/`

## Usage Examples

```javascript
// List all projects
await execute({ action: 'list_projects' }, context);

// Create a task
await execute({
  action: 'create_task',
  content: 'Review pull request',
  projectId: '12345',
  priority: 3,
  dueString: 'tomorrow',
  labels: ['work', 'review'],
}, context);

// Complete a task
await execute({ action: 'complete_task', taskId: '67890' }, context);
```

## Testing

```bash
node --test __tests__/handler.test.js
```
