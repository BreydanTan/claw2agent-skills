# Podcast Index API [L1]

Search podcasts, get episode data, and trending feeds via Podcast Index.

## Actions

### `search_podcasts`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| query | ✅ | string | — | — |
| max | ❌ | number | 10 | — |

### `get_podcast`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| feedId | ✅ | string | — | — |

### `get_episodes`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| feedId | ✅ | string | — | — |
| max | ❌ | number | 10 | — |

### `get_trending`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| max | ❌ | number | 10 | — |
| lang | ❌ | string | — | — |

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
node --test skills/podcast-index-api/__tests__/handler.test.js
```
