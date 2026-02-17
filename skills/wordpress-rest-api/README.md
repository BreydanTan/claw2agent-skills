# WordPress REST API [L1]

Manage WordPress posts, pages, and media via REST API.

## Actions

### `create_post`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| title | ✅ | string | — | — |
| content | ✅ | string | — | — |
| status | ❌ | string | draft | — |
| categories | ❌ | string | — | — |

### `list_posts`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| perPage | ❌ | number | 10 | — |
| page | ❌ | number | 1 | — |
| status | ❌ | string | — | — |

### `update_post`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| postId | ✅ | string | — | — |
| title | ❌ | string | — | — |
| content | ❌ | string | — | — |
| status | ❌ | string | — | — |

### `delete_post`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| postId | ✅ | string | — | — |
| force | ❌ | boolean | false | — |

### `upload_media`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| fileName | ✅ | string | — | — |
| mimeType | ✅ | string | — | — |
| data | ✅ | string | — | — |

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
node --test skills/wordpress-rest-api/__tests__/handler.test.js
```
