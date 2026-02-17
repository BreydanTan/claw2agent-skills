# Outlook (Microsoft Graph) API [L1]

Send emails, manage inbox, and handle calendar events via Microsoft Graph API.

## Actions

### `send_email`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| to | ✅ | string | — | — |
| subject | ✅ | string | — | — |
| body | ✅ | string | — | — |
| cc | ❌ | string | — | — |

### `list_messages`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| folder | ❌ | string | inbox | — |
| top | ❌ | number | 10 | — |

### `get_message`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| messageId | ✅ | string | — | — |

### `search_messages`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| query | ✅ | string | — | — |
| top | ❌ | number | 10 | — |

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
node --test skills/outlook-microsoft-graph-api/__tests__/handler.test.js
```
