# Twitter Manager

**Layer 1 (L1)** skill for managing Twitter/X interactions via the Twitter API.

## Overview

Manage Twitter/X through a unified interface. Supports posting tweets, retrieving tweet details, searching tweets, getting user profiles, viewing timelines, deleting tweets, liking tweets, and retweeting. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `post_tweet`

Post a new tweet.

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| text      | string | Yes      | Tweet text (max 280 characters)      |
| replyTo   | string | No       | Tweet ID to reply to                 |

**Returns:** tweetId, text, replyTo

### `get_tweet`

Get tweet details by ID.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| tweetId   | string | Yes      | Tweet ID    |

**Returns:** tweetId, text, authorId, createdAt, metrics (retweets, likes, replies)

### `search_tweets`

Search recent tweets.

| Parameter  | Type   | Required | Default     | Description                        |
|------------|--------|----------|-------------|------------------------------------|
| query      | string | Yes      |             | Search query                       |
| maxResults | number | No       | `10`        | Max results to return (max 100)    |
| sortOrder  | string | No       | `"recency"` | `"recency"` or `"relevancy"`       |

**Returns:** query, sortOrder, count, tweets (id, text, authorId)

### `get_user`

Get a user profile by username.

| Parameter | Type   | Required | Description      |
|-----------|--------|----------|------------------|
| username  | string | Yes      | Twitter username |

**Returns:** username, name, userId, description, metrics (followers, following, tweets), verified

### `get_timeline`

Get a user's tweet timeline.

| Parameter  | Type   | Required | Default | Description                    |
|------------|--------|----------|---------|--------------------------------|
| userId     | string | Yes      |         | Twitter user ID                |
| maxResults | number | No       | `10`    | Max results to return (max 100)|

**Returns:** userId, count, tweets (id, text, createdAt)

### `delete_tweet`

Delete a tweet by ID.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| tweetId   | string | Yes      | Tweet ID    |

**Returns:** tweetId, deleted

### `like_tweet`

Like a tweet by ID.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| tweetId   | string | Yes      | Tweet ID    |

**Returns:** tweetId, liked

### `retweet`

Retweet a tweet by ID.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| tweetId   | string | Yes      | Tweet ID    |

**Returns:** tweetId, retweeted

## Return Format

### Success

```json
{
  "result": "Human-readable summary string",
  "metadata": {
    "success": true,
    "action": "post_tweet",
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
| MISSING_TEXT             | Required `text` parameter not provided         |
| MISSING_TWEET_ID        | Required `tweetId` parameter not provided      |
| MISSING_QUERY           | Required `query` parameter not provided        |
| MISSING_USERNAME        | Required `username` parameter not provided     |
| MISSING_USER_ID         | Required `userId` parameter not provided       |
| TWEET_TOO_LONG          | Tweet text exceeds 280 characters              |
| PROVIDER_NOT_CONFIGURED | No provider/gateway client in context          |
| TIMEOUT                 | Request exceeded timeout limit                 |
| FETCH_ERROR             | Network or API error                           |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.fetch('twitter/<endpoint>', { params })`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Bearer tokens, API keys, and secrets are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed
7. **Tweet length validation** - Validates tweet text does not exceed 280 characters

## Configuration

```json
{
  "provider": "twitter",
  "timeoutMs": 15000,
  "rateLimitProfile": "twitter-api"
}
```

## Examples

```js
// Post a tweet
await execute({ action: 'post_tweet', text: 'Hello, world!' }, context);

// Post a reply
await execute({ action: 'post_tweet', text: 'Great thread!', replyTo: '1234567890' }, context);

// Get tweet details
await execute({ action: 'get_tweet', tweetId: '1234567890' }, context);

// Search tweets
await execute({ action: 'search_tweets', query: 'javascript', maxResults: 20, sortOrder: 'relevancy' }, context);

// Get user profile
await execute({ action: 'get_user', username: 'elonmusk' }, context);

// Get user timeline
await execute({ action: 'get_timeline', userId: '44196397', maxResults: 5 }, context);

// Delete a tweet
await execute({ action: 'delete_tweet', tweetId: '1234567890' }, context);

// Like a tweet
await execute({ action: 'like_tweet', tweetId: '1234567890' }, context);

// Retweet
await execute({ action: 'retweet', tweetId: '1234567890' }, context);
```
