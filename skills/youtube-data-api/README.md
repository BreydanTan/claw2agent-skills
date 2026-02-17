# YouTube Data API Skill

**Layer 1 (L1)** -- Standard API access, BYOK possible.

Search YouTube videos, retrieve video and channel details, list comments, get trending videos, browse playlists, and list channel videos.

## Actions

### `search_videos`

Search for videos by query string.

| Parameter | Type   | Required | Default       | Description                                           |
| --------- | ------ | -------- | ------------- | ----------------------------------------------------- |
| query     | string | Yes      | --            | Search query (max 500 characters)                     |
| order     | string | No       | `relevance`   | One of: relevance, date, viewCount, rating            |
| limit     | number | No       | `25`          | Number of results (1--50)                             |

**Endpoint:** `GET /videos/search?query={query}&order={order}&limit={limit}`

### `get_video`

Get details for a single video.

| Parameter | Type   | Required | Default | Description      |
| --------- | ------ | -------- | ------- | ---------------- |
| videoId   | string | Yes      | --      | YouTube video ID |

**Endpoint:** `GET /videos/{videoId}`

### `get_channel`

Get details for a YouTube channel.

| Parameter | Type   | Required | Default | Description        |
| --------- | ------ | -------- | ------- | ------------------ |
| channelId | string | Yes      | --      | YouTube channel ID |

**Endpoint:** `GET /channels/{channelId}`

### `get_comments`

Get comments for a video.

| Parameter | Type   | Required | Default       | Description                   |
| --------- | ------ | -------- | ------------- | ----------------------------- |
| videoId   | string | Yes      | --            | YouTube video ID              |
| order     | string | No       | `relevance`   | One of: time, relevance       |
| limit     | number | No       | `25`          | Number of comments (1--100)   |

**Endpoint:** `GET /videos/{videoId}/comments?order={order}&limit={limit}`

### `get_trending`

Get trending videos for a region.

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| category  | string | No       | --      | Video category filter                    |
| region    | string | No       | `US`    | ISO 3166-1 alpha-2 region code           |

**Endpoint:** `GET /videos/trending?category={category}&region={region}`

### `get_playlist`

Get items in a playlist.

| Parameter  | Type   | Required | Default | Description            |
| ---------- | ------ | -------- | ------- | ---------------------- |
| playlistId | string | Yes      | --      | YouTube playlist ID    |
| limit      | number | No       | `25`    | Number of items (1--50)|

**Endpoint:** `GET /playlists/{playlistId}/items?limit={limit}`

### `get_channel_videos`

List videos from a channel.

| Parameter | Type   | Required | Default | Description                         |
| --------- | ------ | -------- | ------- | ----------------------------------- |
| channelId | string | Yes      | --      | YouTube channel ID                  |
| order     | string | No       | `date`  | One of: date, viewCount             |
| limit     | number | No       | `25`    | Number of videos (1--50)            |

**Endpoint:** `GET /channels/{channelId}/videos?order={order}&limit={limit}`

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
  "result": "Search results for \"cats\" (5 videos)\nOrder: relevance | Limit: 25\n...",
  "metadata": {
    "success": true,
    "action": "search_videos",
    "layer": "L1",
    "query": "cats",
    "order": "relevance",
    "limit": 25,
    "count": 5,
    "videos": [...],
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
    "error": "PROVIDER_NOT_CONFIGURED"
  }
}
```

## Error Codes

| Code                     | Description                                       |
| ------------------------ | ------------------------------------------------- |
| INVALID_ACTION           | The action parameter is missing or not recognized |
| INVALID_INPUT            | A required parameter is missing or invalid        |
| PROVIDER_NOT_CONFIGURED  | No provider or gateway client available            |
| TIMEOUT                  | The request timed out                             |
| UPSTREAM_ERROR           | The upstream API returned an error                |

## Security Notes

- No API keys or tokens are accessed directly by the skill code.
- All output strings are scanned for sensitive patterns (API keys, tokens, bearer credentials) and redacted before returning.
- Input parameters are validated and sanitized to prevent injection.
- Timeout enforcement prevents runaway requests.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/youtube-data-api/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 7 actions (happy and error paths), input validation, timeout handling, network errors, helper functions, validate() function, and meta export.
