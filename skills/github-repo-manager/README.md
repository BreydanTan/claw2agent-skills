# GitHub Repository Manager

**Layer 1 (L1)** skill for managing GitHub repositories via the GitHub API.

## Overview

Manage GitHub repositories through a unified interface. Supports repository info retrieval, listing, issue management, pull request management, and code search. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `get_repo`

Get detailed information about a repository.

| Parameter | Type   | Required | Description            |
|-----------|--------|----------|------------------------|
| owner     | string | Yes      | Repository owner       |
| repo      | string | Yes      | Repository name        |

**Returns:** name, description, stars, forks, language, topics, default_branch, url

### `list_repos`

List repositories for a user or organization.

| Parameter | Type   | Required | Default   | Description                              |
|-----------|--------|----------|-----------|------------------------------------------|
| owner     | string | Yes      |           | User or organization name                |
| type      | string | No       | `"all"`   | `"all"`, `"owner"`, `"public"`, `"private"` |
| sort      | string | No       | `"updated"` | `"created"`, `"updated"`, `"pushed"`, `"full_name"` |
| perPage   | number | No       | 30        | Results per page (max 100)               |

### `create_issue`

Create a new issue in a repository.

| Parameter | Type     | Required | Description              |
|-----------|----------|----------|--------------------------|
| owner     | string   | Yes      | Repository owner         |
| repo      | string   | Yes      | Repository name          |
| title     | string   | Yes      | Issue title              |
| body      | string   | No       | Issue body/description   |
| labels    | string[] | No       | Labels to apply          |
| assignees | string[] | No       | Users to assign          |

### `list_issues`

List issues for a repository.

| Parameter | Type     | Required | Default  | Description                     |
|-----------|----------|----------|----------|---------------------------------|
| owner     | string   | Yes      |          | Repository owner                |
| repo      | string   | Yes      |          | Repository name                 |
| state     | string   | No       | `"open"` | `"open"`, `"closed"`, `"all"`   |
| labels    | string[] | No       |          | Filter by labels                |
| perPage   | number   | No       | 30       | Results per page (max 100)      |

### `get_issue`

Get a specific issue by number.

| Parameter   | Type   | Required | Description       |
|-------------|--------|----------|-------------------|
| owner       | string | Yes      | Repository owner  |
| repo        | string | Yes      | Repository name   |
| issueNumber | number | Yes      | Issue number      |

### `create_pr`

Create a new pull request.

| Parameter | Type    | Required | Default | Description                  |
|-----------|---------|----------|---------|------------------------------|
| owner     | string  | Yes      |         | Repository owner             |
| repo      | string  | Yes      |         | Repository name              |
| title     | string  | Yes      |         | PR title                     |
| head      | string  | Yes      |         | Head branch                  |
| base      | string  | Yes      |         | Base branch                  |
| body      | string  | No       |         | PR body/description          |
| draft     | boolean | No       | false   | Create as draft PR           |

### `list_prs`

List pull requests for a repository.

| Parameter | Type   | Required | Default  | Description                    |
|-----------|--------|----------|----------|--------------------------------|
| owner     | string | Yes      |          | Repository owner               |
| repo      | string | Yes      |          | Repository name                |
| state     | string | No       | `"open"` | `"open"`, `"closed"`, `"all"`  |
| perPage   | number | No       | 30       | Results per page (max 100)     |

### `get_pr`

Get a specific pull request by number.

| Parameter | Type   | Required | Description       |
|-----------|--------|----------|-------------------|
| owner     | string | Yes      | Repository owner  |
| repo      | string | Yes      | Repository name   |
| prNumber  | number | Yes      | PR number         |

### `search_code`

Search for code within a repository.

| Parameter | Type   | Required | Default | Description              |
|-----------|--------|----------|---------|--------------------------|
| owner     | string | Yes      |         | Repository owner         |
| repo      | string | Yes      |         | Repository name          |
| query     | string | Yes      |         | Search query             |
| perPage   | number | No       | 30      | Results per page (max 100) |

## Return Format

### Success

```json
{
  "result": "Human-readable summary string",
  "metadata": {
    "success": true,
    "action": "get_repo",
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
| MISSING_OWNER            | Required `owner` parameter not provided        |
| MISSING_REPO             | Required `repo` parameter not provided         |
| MISSING_TITLE            | Required `title` parameter not provided        |
| MISSING_HEAD             | Required `head` parameter not provided         |
| MISSING_BASE             | Required `base` parameter not provided         |
| MISSING_ISSUE_NUMBER     | Required `issueNumber` parameter not provided  |
| MISSING_PR_NUMBER        | Required `prNumber` parameter not provided     |
| MISSING_QUERY            | Required `query` parameter not provided        |
| PROVIDER_NOT_CONFIGURED  | No provider/gateway client in context          |
| TIMEOUT                  | Request exceeded timeout limit                 |
| FETCH_ERROR              | Network or API error                           |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.fetch('github/<endpoint>', { params })`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Tokens, API keys, and GitHub PATs are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed

## Configuration

```json
{
  "provider": "github",
  "timeoutMs": 15000,
  "rateLimitProfile": "github-api"
}
```

## Examples

```js
// Get repository info
await execute({ action: 'get_repo', owner: 'facebook', repo: 'react' }, context);

// List repositories
await execute({ action: 'list_repos', owner: 'google', sort: 'updated', perPage: 10 }, context);

// Create an issue
await execute({
  action: 'create_issue',
  owner: 'myorg',
  repo: 'myrepo',
  title: 'Bug: login fails',
  body: 'Steps to reproduce...',
  labels: ['bug', 'high-priority'],
  assignees: ['developer1']
}, context);

// Search code
await execute({
  action: 'search_code',
  owner: 'facebook',
  repo: 'react',
  query: 'useState',
  perPage: 5
}, context);
```
