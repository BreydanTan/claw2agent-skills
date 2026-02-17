# Google Business API [L1]

Manage Google Business Profile listings, reviews, and posts.

## Actions

### `get_listing`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| locationId | ✅ | string | — | — |

### `list_reviews`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| locationId | ✅ | string | — | — |
| pageSize | ❌ | number | 10 | — |

### `reply_review`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| locationId | ✅ | string | — | — |
| reviewId | ✅ | string | — | — |
| comment | ✅ | string | — | — |

### `create_post`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| locationId | ✅ | string | — | — |
| content | ✅ | string | — | — |
| callToAction | ❌ | string | — | — |

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
node --test skills/google-business-api/__tests__/handler.test.js
```
