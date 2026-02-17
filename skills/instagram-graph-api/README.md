# Instagram Graph API Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Interact with the Instagram Graph API to retrieve user profiles, media posts, hashtags, insights/analytics, comments, and stories.

## Actions

### `get_profile`

Get user profile information.

| Parameter | Type   | Required | Default | Description          |
| --------- | ------ | -------- | ------- | -------------------- |
| userId    | string | Yes      | --      | Instagram user ID    |

### `get_media`

Get a specific media post by ID.

| Parameter | Type   | Required | Default | Description          |
| --------- | ------ | -------- | ------- | -------------------- |
| mediaId   | string | Yes      | --      | Instagram media ID   |

### `list_media`

List a user's media posts with pagination.

| Parameter | Type   | Required | Default | Description                       |
| --------- | ------ | -------- | ------- | --------------------------------- |
| userId    | string | Yes      | --      | Instagram user ID                 |
| limit     | number | No       | `25`    | Number of results (1--100)        |

### `search_hashtag`

Search for hashtags by query string.

| Parameter | Type   | Required | Default | Description                             |
| --------- | ------ | -------- | ------- | --------------------------------------- |
| query     | string | Yes      | --      | Search query (max 100 characters)       |
| limit     | number | No       | `25`    | Number of results (1--50)               |

### `get_insights`

Get account insights and analytics for a user.

| Parameter | Type     | Required | Default                                                | Description                                        |
| --------- | -------- | -------- | ------------------------------------------------------ | -------------------------------------------------- |
| userId    | string   | Yes      | --                                                     | Instagram user ID                                  |
| metrics   | string[] | No       | `["impressions","reach","profile_views","follower_count"]` | Metrics to retrieve                                |
| period    | string   | No       | `"day"`                                                | Time period: `day`, `week`, or `month`             |

### `get_comments`

Get comments on a media post.

| Parameter | Type   | Required | Default | Description                       |
| --------- | ------ | -------- | ------- | --------------------------------- |
| mediaId   | string | Yes      | --      | Instagram media ID                |
| limit     | number | No       | `25`    | Number of comments (1--100)       |

### `get_stories`

Get a user's currently active stories.

| Parameter | Type   | Required | Default | Description          |
| --------- | ------ | -------- | ------- | -------------------- |
| userId    | string | Yes      | --      | Instagram user ID    |

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 15 seconds, maximum 30 seconds.
- **Input validation.** All parameters are validated and sanitized before use.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Profile: johndoe\nUsername: @johndoe\nFollowers: 1500\n...",
  "metadata": {
    "success": true,
    "action": "get_profile",
    "layer": "L1",
    "userId": "12345",
    "profile": { ... },
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

| Code                     | Description                                      | Retriable |
| ------------------------ | ------------------------------------------------ | --------- |
| `INVALID_ACTION`         | Unrecognized action name                         | No        |
| `INVALID_INPUT`          | Missing or invalid parameter                     | No        |
| `PROVIDER_NOT_CONFIGURED`| No providerClient or gatewayClient in context    | No        |
| `TIMEOUT`                | Request exceeded timeout limit                   | Yes       |
| `UPSTREAM_ERROR`         | Error from the Instagram Graph API               | Maybe     |

## Security Notes

- API tokens are never stored, logged, or embedded in skill code.
- All output strings are scanned for sensitive patterns (API keys, tokens, bearer strings) and redacted.
- The skill relies entirely on the platform adapter for authentication.
- Input IDs and queries are validated to prevent injection.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/instagram-graph-api/__tests__/handler.test.js
```

The test suite contains 80+ tests across multiple describe blocks covering action validation, provider configuration, all 7 actions (happy + error paths), input validation, timeout handling, network errors, helper functions, validate(), and meta export.
