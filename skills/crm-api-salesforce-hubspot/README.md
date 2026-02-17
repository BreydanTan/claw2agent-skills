# CRM API (Salesforce/HubSpot) [L1]

Unified CRM access for Salesforce and HubSpot — manage contacts, deals, and pipelines.

## Actions

### `find_contact`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| query | ✅ | string | — | — |

### `create_contact`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| email | ✅ | string | — | — |
| firstName | ✅ | string | — | — |
| lastName | ✅ | string | — | — |
| company | ❌ | string | — | — |

### `list_deals`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| stage | ❌ | string | — | — |
| limit | ❌ | number | 10 | — |

### `update_deal`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| dealId | ✅ | string | — | — |
| stage | ❌ | string | — | — |
| amount | ❌ | number | — | — |

### `get_pipeline`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| pipelineId | ❌ | string | — | — |

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
node --test skills/crm-api-salesforce-hubspot/__tests__/handler.test.js
```
