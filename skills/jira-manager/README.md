# Jira Manager

**Layer 1 (L1)** skill for managing Jira projects and issues via the Jira REST API.

## Overview

Manage Jira projects and issues through a unified interface. Supports listing projects, creating/getting/updating issues, transitioning statuses, JQL search, commenting, listing transitions, and assigning issues. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `list_projects`

List all Jira projects.

No parameters required.

**Returns:** project key, name, id, projectTypeKey

### `get_issue`

Get detailed information about an issue.

| Parameter | Type   | Required | Description                     |
|-----------|--------|----------|---------------------------------|
| issueKey  | string | Yes      | Jira issue key (e.g. "PROJ-123") |

**Returns:** key, summary, status, issueType, priority, assignee, reporter, labels, created, updated, description

### `create_issue`

Create a new issue in a project.

| Parameter   | Type     | Required | Default  | Description                     |
|-------------|----------|----------|----------|---------------------------------|
| projectKey  | string   | Yes      |          | Project key (e.g. "PROJ")       |
| summary     | string   | Yes      |          | Issue summary/title             |
| issueType   | string   | No       | `"Task"` | Issue type name                 |
| description | string   | No       |          | Issue description               |
| priority    | string   | No       |          | Priority name (e.g. "High")     |
| assignee    | string   | No       |          | Assignee account ID             |
| labels      | string[] | No       |          | Labels to apply                 |

### `update_issue`

Update fields on an existing issue.

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| issueKey  | string | Yes      | Jira issue key (e.g. "PROJ-123")     |
| fields    | object | Yes      | Object of fields to update           |

### `transition_issue`

Change an issue's status via a workflow transition.

| Parameter    | Type   | Required | Description                      |
|--------------|--------|----------|----------------------------------|
| issueKey     | string | Yes      | Jira issue key (e.g. "PROJ-123") |
| transitionId | string | Yes      | Transition ID to execute         |

### `search_issues`

Search for issues using JQL (Jira Query Language).

| Parameter  | Type   | Required | Default | Description                     |
|------------|--------|----------|---------|---------------------------------|
| jql        | string | Yes      |         | JQL query string                |
| maxResults | number | No       | 50      | Maximum results (max 100)       |

### `add_comment`

Add a comment to an issue.

| Parameter | Type   | Required | Description                      |
|-----------|--------|----------|----------------------------------|
| issueKey  | string | Yes      | Jira issue key (e.g. "PROJ-123") |
| body      | string | Yes      | Comment body text                |

### `list_transitions`

List available workflow transitions for an issue.

| Parameter | Type   | Required | Description                      |
|-----------|--------|----------|----------------------------------|
| issueKey  | string | Yes      | Jira issue key (e.g. "PROJ-123") |

**Returns:** transition id, name, target status name

### `assign_issue`

Assign an issue to a user.

| Parameter | Type   | Required | Description                      |
|-----------|--------|----------|----------------------------------|
| issueKey  | string | Yes      | Jira issue key (e.g. "PROJ-123") |
| accountId | string | Yes      | Atlassian account ID             |

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

| Code                     | Description                                    |
|--------------------------|------------------------------------------------|
| INVALID_ACTION           | Unknown or missing action                      |
| MISSING_ISSUE_KEY        | Required `issueKey` parameter not provided     |
| MISSING_PROJECT_KEY      | Required `projectKey` parameter not provided   |
| MISSING_SUMMARY          | Required `summary` parameter not provided      |
| MISSING_FIELDS           | Required `fields` parameter not provided       |
| MISSING_TRANSITION_ID    | Required `transitionId` parameter not provided |
| MISSING_JQL              | Required `jql` parameter not provided          |
| MISSING_BODY             | Required `body` parameter not provided         |
| MISSING_ACCOUNT_ID       | Required `accountId` parameter not provided    |
| PROVIDER_NOT_CONFIGURED  | No provider/gateway client in context          |
| TIMEOUT                  | Request exceeded timeout limit                 |
| FETCH_ERROR              | Network or API error                           |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.fetch('jira/<endpoint>', { ... })`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Tokens, API keys, and Atlassian API tokens are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed

## Configuration

```json
{
  "provider": "jira",
  "timeoutMs": 15000,
  "rateLimitProfile": "jira-api"
}
```

## Examples

```js
// List all projects
await execute({ action: 'list_projects' }, context);

// Get issue details
await execute({ action: 'get_issue', issueKey: 'PROJ-123' }, context);

// Create an issue
await execute({
  action: 'create_issue',
  projectKey: 'PROJ',
  summary: 'Bug: login page broken',
  issueType: 'Bug',
  description: 'Login page returns 500 error',
  priority: 'High',
  labels: ['bug', 'urgent']
}, context);

// Update issue fields
await execute({
  action: 'update_issue',
  issueKey: 'PROJ-123',
  fields: { summary: 'Updated summary', priority: { name: 'Low' } }
}, context);

// Search with JQL
await execute({
  action: 'search_issues',
  jql: 'project = PROJ AND status = "In Progress"',
  maxResults: 10
}, context);

// Transition issue status
await execute({
  action: 'transition_issue',
  issueKey: 'PROJ-123',
  transitionId: '31'
}, context);

// Add comment
await execute({
  action: 'add_comment',
  issueKey: 'PROJ-123',
  body: 'This has been fixed in the latest release.'
}, context);

// List available transitions
await execute({ action: 'list_transitions', issueKey: 'PROJ-123' }, context);

// Assign issue
await execute({
  action: 'assign_issue',
  issueKey: 'PROJ-123',
  accountId: '5b10ac8d82e05b22cc7d4ef5'
}, context);
```
