# Reddit API Manager Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Interact with the Reddit API to fetch posts, comments, subreddit info, user profiles, search content, and list trending topics.

## Actions

### `get_post`

Fetch a Reddit post by ID.

| Parameter | Type   | Required | Default | Description              |
| --------- | ------ | -------- | ------- | ------------------------ |
| postId    | string | Yes      | --      | The Reddit post ID       |

**Endpoint:** `GET /posts/{postId}`

### `list_posts`

List posts from a subreddit.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| subreddit | string | Yes      | --      | Subreddit name (alphanumeric/underscores)|
| sort      | string | No       | `hot`   | One of: hot, new, top, rising            |
| limit     | number | No       | `25`    | Number of posts (1--100)                 |

**Endpoint:** `GET /subreddits/{subreddit}/posts?sort={sort}&limit={limit}`

### `search`

Search Reddit for posts.

| Parameter | Type   | Required | Default      | Description                              |
| --------- | ------ | -------- | ------------ | ---------------------------------------- |
| query     | string | Yes      | --           | Search query text                        |
| subreddit | string | No       | --           | Restrict search to a specific subreddit  |
| sort      | string | No       | `relevance`  | One of: relevance, hot, top, new         |
| limit     | number | No       | `25`         | Number of results (1--100)               |

**Endpoint:** `GET /search?q={query}&subreddit={subreddit}&sort={sort}&limit={limit}`

### `get_subreddit_info`

Get details about a subreddit.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| subreddit | string | Yes      | --      | Subreddit name (alphanumeric/underscores)|

**Endpoint:** `GET /subreddits/{subreddit}`

### `get_comments`

Get comments on a post.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| postId    | string | Yes      | --      | The Reddit post ID                       |
| sort      | string | No       | `best`  | One of: best, top, new, controversial    |
| limit     | number | No       | `25`    | Number of comments (1--100)              |

**Endpoint:** `GET /posts/{postId}/comments?sort={sort}&limit={limit}`

### `get_user_info`

Get a Reddit user's profile.

| Parameter | Type   | Required | Default | Description         |
| --------- | ------ | -------- | ------- | ------------------- |
| username  | string | Yes      | --      | The Reddit username |

**Endpoint:** `GET /users/{username}`

### `list_trending`

List trending subreddits and topics. No required parameters.

**Endpoint:** `GET /trending`

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 15 seconds, maximum 30 seconds.
- **Input validation.** All parameters are validated and sanitized before use. Subreddit names are restricted to alphanumeric characters and underscores.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "r/programming - hot posts (25 results)\n\n1. Post title (score: 42)",
  "metadata": {
    "success": true,
    "action": "list_posts",
    "layer": "L1",
    "subreddit": "programming",
    "sort": "hot",
    "limit": 25,
    "postCount": 25,
    "posts": [...],
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
| UPSTREAM_ERROR           | The upstream Reddit API returned an error        |

## Security Notes

- Subreddit names are sanitized to alphanumeric characters and underscores only, preventing path traversal or injection.
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- No API keys or secrets are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- Request timeouts are enforced and capped at 30 seconds maximum.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/reddit-api-manager/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 7 actions (happy and error paths), input validation, timeout handling, network errors, helper functions, and the validate export.
