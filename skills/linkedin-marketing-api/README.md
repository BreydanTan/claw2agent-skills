# LinkedIn Marketing API [L1]

Manage LinkedIn posts, company pages, and ad campaigns via Marketing API.

## Actions

### `create_post`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| content | ✅ | string | — | — |
| visibility | ❌ | string | PUBLIC | — |

### `get_profile`

_No required parameters._

### `list_posts`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| count | ❌ | number | 10 | — |

### `get_analytics`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| postId | ✅ | string | — | — |

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
node --test skills/linkedin-marketing-api/__tests__/handler.test.js
```
