# Linear Tracker

**Layer 1 (L1)** skill for managing Linear issues, projects, and cycles via the Linear GraphQL API.

## Overview

Manage Linear issues, projects, and cycles through a unified interface. Supports creating/updating/listing/getting issues, creating/listing projects, adding comments, searching issues, and managing cycles. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `create_issue`

Create a new issue in a team.

| Parameter   | Type     | Required | Description                                    |
|-------------|----------|----------|------------------------------------------------|
| title       | string   | Yes      | Issue title                                    |
| teamId      | string   | Yes      | Linear team ID                                 |
| description | string   | No       | Issue description (markdown)                   |
| priority    | number   | No       | Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low) |
| assigneeId  | string   | No       | User ID for assignment                         |
| labelIds    | string[] | No       | Label IDs to apply                             |
| stateId     | string   | No       | Workflow state ID                              |

### `update_issue`

Update an existing issue.

| Parameter   | Type   | Required | Description                                    |
|-------------|--------|----------|------------------------------------------------|
| issueId     | string | Yes      | Linear issue ID                                |
| title       | string | No       | Updated title                                  |
| description | string | No       | Updated description                            |
| priority    | number | No       | Updated priority                               |
| stateId     | string | No       | Updated workflow state ID                      |
| assigneeId  | string | No       | Updated assignee ID                            |

### `list_issues`

List issues with optional filters.

| Parameter  | Type   | Required | Default | Description                      |
|------------|--------|----------|---------|----------------------------------|
| teamId     | string | No       |         | Filter by team ID                |
| stateId    | string | No       |         | Filter by state ID               |
| assigneeId | string | No       |         | Filter by assignee ID            |
| limit      | number | No       | 25      | Maximum results (max 100)        |

### `get_issue`

Get detailed information about a single issue.

| Parameter | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| issueId   | string | Yes      | Linear issue ID    |

**Returns:** identifier, title, description, state, priority, assignee, creator, team, labels, timestamps, URL

### `create_project`

Create a new project.

| Parameter   | Type     | Required | Description                        |
|-------------|----------|----------|------------------------------------|
| name        | string   | Yes      | Project name                       |
| teamIds     | string[] | Yes      | Team IDs associated with project   |
| description | string   | No       | Project description                |
| targetDate  | string   | No       | Target date (ISO 8601)             |

### `list_projects`

List all projects.

| Parameter | Type   | Required | Default | Description               |
|-----------|--------|----------|---------|---------------------------|
| limit     | number | No       | 25      | Maximum results (max 100) |

### `add_comment`

Add a comment to an issue.

| Parameter | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| issueId   | string | Yes      | Linear issue ID    |
| body      | string | Yes      | Comment body text  |

### `search_issues`

Search issues by text query.

| Parameter | Type   | Required | Default | Description               |
|-----------|--------|----------|---------|---------------------------|
| query     | string | Yes      |         | Search query string        |
| limit     | number | No       | 25      | Maximum results (max 100) |

### `manage_cycle`

Manage Linear cycles with sub-actions.

| Parameter | Type   | Required | Description                                        |
|-----------|--------|----------|----------------------------------------------------|
| subAction | string | Yes      | One of: `create`, `list`, `get`, `add_issue`       |

#### Sub-action: `create`

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| teamId    | string | Yes      | Team ID for the cycle          |
| startsAt  | string | Yes      | Start date (ISO 8601)          |
| endsAt    | string | Yes      | End date (ISO 8601)            |
| name      | string | No       | Cycle name                     |

#### Sub-action: `list`

| Parameter | Type   | Required | Default | Description               |
|-----------|--------|----------|---------|---------------------------|
| limit     | number | No       | 25      | Maximum results (max 100) |

#### Sub-action: `get`

| Parameter | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| cycleId   | string | Yes      | Cycle ID           |

#### Sub-action: `add_issue`

| Parameter | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| cycleId   | string | Yes      | Cycle ID           |
| issueId   | string | Yes      | Issue ID to add    |

## Return Format

### Success

```json
{
  "result": "Human-readable summary string",
  "metadata": {
    "success": true,
    "action": "get_issue",
    "layer": "L1",
    ...
  }
}
```

### Error

```json
{
  "result": "Error: description of what went wrong",
  "metadata": {
    "success": false,
    "error": "ERROR_CODE"
  }
}
```

## Error Codes

| Code                     | Description                                      |
|--------------------------|--------------------------------------------------|
| INVALID_ACTION           | Unknown or missing action                        |
| INVALID_SUB_ACTION       | Unknown or missing cycle sub-action              |
| MISSING_TITLE            | Required `title` parameter not provided          |
| MISSING_TEAM_ID          | Required `teamId` parameter not provided         |
| MISSING_ISSUE_ID         | Required `issueId` parameter not provided        |
| MISSING_NAME             | Required `name` parameter not provided           |
| MISSING_TEAM_IDS         | Required `teamIds` parameter not provided        |
| MISSING_BODY             | Required `body` parameter not provided           |
| MISSING_QUERY            | Required `query` parameter not provided          |
| MISSING_CYCLE_ID         | Required `cycleId` parameter not provided        |
| MISSING_STARTS_AT        | Required `startsAt` parameter not provided       |
| MISSING_ENDS_AT          | Required `endsAt` parameter not provided         |
| NO_UPDATE_FIELDS         | No update fields provided for update_issue       |
| NOT_FOUND                | Requested resource not found                     |
| CREATE_FAILED            | Mutation returned success: false                 |
| UPDATE_FAILED            | Update mutation returned success: false          |
| PROVIDER_NOT_CONFIGURED  | No provider/gateway client in context            |
| TIMEOUT                  | Request exceeded timeout limit                   |
| GRAPHQL_ERROR            | GraphQL or network error                         |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.graphql(query, variables)`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Tokens, API keys, and Linear API tokens are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed

## Configuration

```json
{
  "provider": "linear",
  "timeoutMs": 15000,
  "rateLimitProfile": "linear-api"
}
```

## Examples

```js
// Create an issue
await execute({
  action: 'create_issue',
  title: 'Bug: login page broken',
  teamId: 'team-uuid-123',
  description: 'Login page returns 500 error',
  priority: 1,
  labelIds: ['label-uuid-1']
}, context);

// Get issue details
await execute({ action: 'get_issue', issueId: 'issue-uuid-123' }, context);

// List issues for a team
await execute({
  action: 'list_issues',
  teamId: 'team-uuid-123',
  limit: 10
}, context);

// Update an issue
await execute({
  action: 'update_issue',
  issueId: 'issue-uuid-123',
  title: 'Updated title',
  priority: 2,
  stateId: 'state-uuid-done'
}, context);

// Search issues
await execute({
  action: 'search_issues',
  query: 'login bug',
  limit: 10
}, context);

// Create a project
await execute({
  action: 'create_project',
  name: 'Q1 Sprint',
  teamIds: ['team-uuid-123'],
  description: 'Q1 deliverables',
  targetDate: '2025-03-31'
}, context);

// List projects
await execute({ action: 'list_projects', limit: 10 }, context);

// Add a comment
await execute({
  action: 'add_comment',
  issueId: 'issue-uuid-123',
  body: 'This has been fixed in the latest release.'
}, context);

// Create a cycle
await execute({
  action: 'manage_cycle',
  subAction: 'create',
  teamId: 'team-uuid-123',
  name: 'Sprint 1',
  startsAt: '2025-01-06',
  endsAt: '2025-01-20'
}, context);

// List cycles
await execute({ action: 'manage_cycle', subAction: 'list' }, context);

// Get cycle details
await execute({
  action: 'manage_cycle',
  subAction: 'get',
  cycleId: 'cycle-uuid-123'
}, context);

// Add issue to cycle
await execute({
  action: 'manage_cycle',
  subAction: 'add_issue',
  cycleId: 'cycle-uuid-123',
  issueId: 'issue-uuid-456'
}, context);
```
