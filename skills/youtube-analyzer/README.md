# YouTube Analyzer

**Layer 1 (L1)** skill for analyzing YouTube videos, channels, and playlists via the YouTube Data API.

## Overview

Analyze YouTube content through a unified interface. Supports video details retrieval, content search, channel info, comment listing, transcript retrieval, playlist browsing, and engagement metric calculation. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `get_video`

Get detailed information about a video.

| Parameter | Type   | Required | Description      |
|-----------|--------|----------|------------------|
| videoId   | string | Yes      | YouTube video ID |

**Returns:** title, description, channelTitle, publishedAt, viewCount, likeCount, commentCount, duration, tags

### `search`

Search for YouTube content.

| Parameter  | Type   | Required | Default       | Description                                          |
|------------|--------|----------|---------------|------------------------------------------------------|
| query      | string | Yes      |               | Search query string                                  |
| maxResults | number | No       | 10            | Maximum results to return (max 50)                   |
| order      | string | No       | `"relevance"` | `"relevance"`, `"date"`, `"viewCount"`, `"rating"`   |
| type       | string | No       | `"video"`     | `"video"`, `"channel"`, `"playlist"`                 |

### `get_channel`

Get channel information.

| Parameter | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| channelId | string | Yes      | YouTube channel ID |

**Returns:** title, description, subscriberCount, viewCount, videoCount, publishedAt, country

### `list_comments`

List comments on a video.

| Parameter  | Type   | Required | Default       | Description                        |
|------------|--------|----------|---------------|------------------------------------|
| videoId    | string | Yes      |               | YouTube video ID                   |
| maxResults | number | No       | 20            | Maximum comments to return (max 50)|
| order      | string | No       | `"relevance"` | `"relevance"`, `"time"`            |

### `get_transcript`

Get video transcript/captions.

| Parameter | Type   | Required | Default | Description                    |
|-----------|--------|----------|---------|--------------------------------|
| videoId   | string | Yes      |         | YouTube video ID               |
| language  | string | No       | `"en"`  | Language code for captions     |

### `get_playlist`

Get playlist items.

| Parameter  | Type   | Required | Default | Description                         |
|------------|--------|----------|---------|-------------------------------------|
| playlistId | string | Yes      |         | YouTube playlist ID                 |
| maxResults | number | No       | 50      | Maximum items to return (max 50)    |

### `analyze_engagement`

Calculate engagement metrics locally from video data. This is a two-step action: fetches video data from the API, then computes metrics locally.

| Parameter | Type   | Required | Description      |
|-----------|--------|----------|------------------|
| videoId   | string | Yes      | YouTube video ID |

**Returns:** engagementRate, likeRatio, commentRate, ctrTier (excellent/high/average/below_average/low)

**Engagement Metrics:**
- **Engagement Rate**: `((likes + comments) / views) * 100`
- **Like Ratio**: `(likes / views) * 100`
- **Comment Rate**: `(comments / views) * 100`
- **CTR Tier**: Based on engagement rate thresholds (>=10% excellent, >=5% high, >=2% average, >=0.5% below_average, <0.5% low)

## Return Format

### Success

```json
{
  "result": "Human-readable summary string",
  "metadata": {
    "success": true,
    "action": "get_video",
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
| MISSING_VIDEO_ID         | Required `videoId` parameter not provided      |
| MISSING_CHANNEL_ID       | Required `channelId` parameter not provided    |
| MISSING_PLAYLIST_ID      | Required `playlistId` parameter not provided   |
| MISSING_QUERY            | Required `query` parameter not provided        |
| PROVIDER_NOT_CONFIGURED  | No provider/gateway client in context          |
| TIMEOUT                  | Request exceeded timeout limit                 |
| FETCH_ERROR              | Network or API error                           |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.fetch('youtube/<endpoint>', { params })`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Tokens, API keys, and YouTube API keys are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed

## Configuration

```json
{
  "provider": "youtube",
  "timeoutMs": 15000,
  "rateLimitProfile": "youtube-api"
}
```

## Examples

```js
// Get video details
await execute({ action: 'get_video', videoId: 'dQw4w9WgXcQ' }, context);

// Search for videos
await execute({ action: 'search', query: 'javascript tutorial', maxResults: 5, order: 'viewCount' }, context);

// Get channel info
await execute({ action: 'get_channel', channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' }, context);

// List video comments
await execute({ action: 'list_comments', videoId: 'dQw4w9WgXcQ', maxResults: 10, order: 'time' }, context);

// Get video transcript
await execute({ action: 'get_transcript', videoId: 'dQw4w9WgXcQ', language: 'en' }, context);

// Get playlist items
await execute({ action: 'get_playlist', playlistId: 'PLRqwX-V7Uu6ZiZxtDDRCi6uhfTH4FilpH', maxResults: 20 }, context);

// Analyze engagement metrics
await execute({ action: 'analyze_engagement', videoId: 'dQw4w9WgXcQ' }, context);
```
