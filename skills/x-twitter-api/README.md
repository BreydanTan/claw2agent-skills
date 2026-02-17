# X/Twitter API Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Interact with the X/Twitter API: fetch tweets, search, get user profiles, timelines, post tweets, trending topics, and tweet likes.

## Actions

### `get_tweet`

Fetch a tweet by its ID.

| Parameter | Type   | Required | Default | Description          |
| --------- | ------ | -------- | ------- | -------------------- |
| tweetId   | string | Yes      | --      | The ID of the tweet  |

### `search_tweets`

Search tweets by query string.

| Parameter | Type   | Required | Default     | Description                                 |
| --------- | ------ | -------- | ----------- | ------------------------------------------- |
| query     | string | Yes      | --          | Search query (max 512 characters)           |
| sort      | string | No       | `recency`   | Sort order: `recency` or `relevancy`        |
| limit     | number | No       | `25`        | Number of results (1--100)                  |

### `get_user`

Get a user profile by username.

| Parameter | Type   | Required | Default | Description                                          |
| --------- | ------ | -------- | ------- | ---------------------------------------------------- |
| username  | string | Yes      | --      | Twitter/X username (alphanumeric + underscores, max 15 chars) |

### `get_timeline`

Get a user's recent tweets.

| Parameter | Type   | Required | Default | Description                                          |
| --------- | ------ | -------- | ------- | ---------------------------------------------------- |
| username  | string | Yes      | --      | Twitter/X username (alphanumeric + underscores, max 15 chars) |
| limit     | number | No       | `25`    | Number of tweets to return (1--100)                  |

### `post_tweet`

Post a new tweet.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| text      | string | Yes      | --      | Tweet text (max 280 characters)          |
| replyTo   | string | No       | --      | Tweet ID to reply to                     |

### `get_trending`

Get trending topics.

| Parameter | Type   | Required | Default       | Description                    |
| --------- | ------ | -------- | ------------- | ------------------------------ |
| location  | string | No       | `worldwide`   | Location for trending topics   |

### `get_likes`

Get users who liked a tweet.

| Parameter | Type   | Required | Default | Description                      |
| --------- | ------ | -------- | ------- | -------------------------------- |
| tweetId   | string | Yes      | --      | The ID of the tweet              |
| limit     | number | No       | `25`    | Number of users to return (1--50)|

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
  "result": "Tweet 123456\nAuthor: @example\nText: Hello world\n...",
  "metadata": {
    "success": true,
    "action": "get_tweet",
    "layer": "L1",
    "tweetId": "123456",
    "tweet": { ... },
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
| INVALID_ACTION           | Unknown or missing action                        | No        |
| INVALID_INPUT            | Invalid or missing required parameter            | No        |
| PROVIDER_NOT_CONFIGURED  | No provider or gateway client available           | No        |
| TIMEOUT                  | Request timed out                                | Yes       |
| UPSTREAM_ERROR           | Error from the upstream API or network failure   | Yes       |

## Security Notes

- API keys and tokens are never accessed directly by skill code.
- All output strings are scanned for sensitive patterns (API keys, tokens, bearer tokens) and redacted before returning.
- Usernames are sanitized to prevent injection (alphanumeric + underscores only).
- Tweet text and search queries are trimmed and length-validated.
- The provider client abstraction ensures credentials are managed by the platform, not the skill.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/x-twitter-api/__tests__/handler.test.js
```

The test suite contains 80+ tests across multiple describe blocks covering action validation, provider configuration, input validation, all 7 actions (happy and error paths), timeout handling, network errors, helper functions, validate() export, and meta export.
