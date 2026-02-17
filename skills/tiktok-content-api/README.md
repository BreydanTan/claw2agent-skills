# TikTok Content API [L1]

Manage TikTok content publishing and analytics via Content Posting API.

## Actions

### `create_post`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| videoUrl | ✅ | string | — | — |
| title | ❌ | string | — | — |
| privacyLevel | ❌ | string | PUBLIC_TO_EVERYONE | — |

### `get_post_status`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| publishId | ✅ | string | — | — |

### `list_videos`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| cursor | ❌ | number | 0 | — |
| maxCount | ❌ | number | 20 | — |

### `get_analytics`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| videoId | ✅ | string | — | — |

## Architecture

- **No hardcoded endpoints** — all API access through injected `providerClient`
- **BYOK** — keys managed externally
- **Timeout enforcement** — default 30s, max 120s
- **Input validation** — all parameters validated
- **Redaction** — sensitive data redacted from outputs

## Error Codes

| Code | Description | Retriable |
|------|-------------|-----------|
| INVALID_ACTION | Unknown/missing action | No |
| INVALID_INPUT | Bad/missing parameters | No |
| PROVIDER_NOT_CONFIGURED | No API client | No |
| TIMEOUT | Request timeout | Yes |
| UPSTREAM_ERROR | API error | Maybe |

## Testing

```bash
node --test skills/tiktok-content-api/__tests__/handler.test.js
```
