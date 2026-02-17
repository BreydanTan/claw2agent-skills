# Meta Ad Library API [L1]

Search and analyze ads from Meta platforms (Facebook/Instagram) via Ad Library API.

## Actions

### `search_ads`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| query | ✅ | string | — | — |
| adType | ❌ | string | ALL | — |
| country | ❌ | string | US | — |
| limit | ❌ | number | 25 | — |

### `get_ad_details`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| adId | ✅ | string | — | — |

### `get_page_ads`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| pageId | ✅ | string | — | — |
| limit | ❌ | number | 25 | — |

### `get_ad_spend`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| pageId | ✅ | string | — | — |
| startDate | ❌ | string | — | — |
| endDate | ❌ | string | — | — |

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
node --test skills/meta-ad-library-api/__tests__/handler.test.js
```
