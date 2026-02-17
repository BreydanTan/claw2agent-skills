# GitHub API Skill

Layer 1 (L1) skill for interacting with the GitHub API. Manages repositories, issues, pull requests, and code search through an injected provider client.

## Layer

**L1** - Uses provider client for all API access. No hardcoded URLs, no direct API keys.

## Category

Development

## Actions

| Action | Method | Endpoint | Description |
|--------|--------|----------|-------------|
| `get_repo` | GET | `/repos/{owner}/{repo}` | Get repository details |
| `list_repos` | GET | `/users/{username}/repos` | List user repositories |
| `get_issue` | GET | `/repos/{owner}/{repo}/issues/{issueNumber}` | Get issue details |
| `list_issues` | GET | `/repos/{owner}/{repo}/issues` | List issues in a repository |
| `create_issue` | POST | `/repos/{owner}/{repo}/issues` | Create a new issue |
| `get_pull_request` | GET | `/repos/{owner}/{repo}/pulls/{prNumber}` | Get pull request details |
| `list_pull_requests` | GET | `/repos/{owner}/{repo}/pulls` | List pull requests in a repository |
| `search_code` | GET | `/search/code` | Search code across repositories |

## Parameters

### Common Parameters

- **owner** (string, required for repo/issue/PR actions) - Repository owner (username or org). Alphanumeric, hyphens, and dots allowed.
- **repo** (string, required for repo/issue/PR actions) - Repository name. Alphanumeric, hyphens, and dots allowed.
- **limit** (number, 1-100, default 30) - Maximum results to return.

### Action-Specific Parameters

#### get_repo
- `owner` (required)
- `repo` (required)

#### list_repos
- `username` (required) - GitHub username
- `sort` (optional) - One of: `updated`, `created`, `pushed`, `full_name` (default: `updated`)
- `limit` (optional)

#### get_issue
- `owner` (required)
- `repo` (required)
- `issueNumber` (required) - Positive integer

#### list_issues
- `owner` (required)
- `repo` (required)
- `state` (optional) - One of: `open`, `closed`, `all` (default: `open`)
- `sort` (optional) - One of: `created`, `updated`, `comments` (default: `created`)
- `limit` (optional)

#### create_issue
- `owner` (required)
- `repo` (required)
- `title` (required) - Max 256 characters
- `body` (optional) - Max 65536 characters
- `labels` (optional) - Array of strings

#### get_pull_request
- `owner` (required)
- `repo` (required)
- `prNumber` (required) - Positive integer

#### list_pull_requests
- `owner` (required)
- `repo` (required)
- `state` (optional) - One of: `open`, `closed`, `all` (default: `open`)
- `sort` (optional) - One of: `created`, `updated`, `popularity` (default: `created`)
- `limit` (optional)

#### search_code
- `query` (required) - Max 256 characters
- `limit` (optional)

## Usage Examples

```javascript
// Get repository details
await execute({ action: 'get_repo', owner: 'facebook', repo: 'react' }, context);

// List user repositories
await execute({ action: 'list_repos', username: 'octocat', sort: 'updated', limit: 10 }, context);

// Get issue details
await execute({ action: 'get_issue', owner: 'facebook', repo: 'react', issueNumber: 1 }, context);

// List issues
await execute({ action: 'list_issues', owner: 'facebook', repo: 'react', state: 'open', sort: 'created' }, context);

// Create an issue
await execute({
  action: 'create_issue',
  owner: 'myorg',
  repo: 'myrepo',
  title: 'Bug: Something is broken',
  body: 'Detailed description of the bug...',
  labels: ['bug', 'priority-high']
}, context);

// Get pull request details
await execute({ action: 'get_pull_request', owner: 'facebook', repo: 'react', prNumber: 42 }, context);

// List pull requests
await execute({ action: 'list_pull_requests', owner: 'facebook', repo: 'react', state: 'open' }, context);

// Search code
await execute({ action: 'search_code', query: 'useState hook', limit: 20 }, context);
```

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_ACTION` | Action not recognized |
| `INVALID_INPUT` | Input validation failed |
| `PROVIDER_NOT_CONFIGURED` | No provider or gateway client available |
| `TIMEOUT` | Request timed out |
| `UPSTREAM_ERROR` | GitHub API returned an error |

## Configuration

- Default timeout: 15000ms (15 seconds)
- Maximum timeout: 30000ms (30 seconds)
- Default result limit: 30
- Maximum result limit: 100

## Testing

```bash
node --test skills/github-api/__tests__/handler.test.js
```

The test suite contains 80+ tests covering action validation, provider configuration, input validation, all 8 actions (happy and error paths), timeout handling, network errors, helper functions, validate() export, and meta export.
