# Semantic Scholar API [L1]

Search academic papers, get citations, and find related work via Semantic Scholar.

## Actions

### `search_papers`
Search for papers by keyword.

| Parameter | Required | Type   | Default | Description             |
|-----------|----------|--------|---------|-------------------------|
| query     | ✅       | string | —       | Search query            |
| limit     | ❌       | number | 10      | Max results (up to 100) |

### `get_paper`
Get details for a specific paper.

| Parameter | Required | Type   | Description                     |
|-----------|----------|--------|---------------------------------|
| paperId   | ✅       | string | Semantic Scholar paper ID or DOI |

### `get_citations`
Get papers that cite a given paper.

| Parameter | Required | Type   | Default | Description  |
|-----------|----------|--------|---------|--------------|
| paperId   | ✅       | string | —       | Paper ID     |
| limit     | ❌       | number | 10      | Max results  |

### `get_references`
Get papers referenced by a given paper.

| Parameter | Required | Type   | Default | Description  |
|-----------|----------|--------|---------|--------------|
| paperId   | ✅       | string | —       | Paper ID     |
| limit     | ❌       | number | 10      | Max results  |

## Architecture

- **No hardcoded endpoints** — all API access goes through the injected `providerClient`
- **BYOK** — keys are managed externally  
- **Timeout enforcement** — default 30s, max 120s
- **Input validation** — all parameters validated and sanitized
- **Sensitive data redaction** — tokens redacted from all outputs

## Return Format

### Success
```json
{
  "result": "Semantic Scholar Search Results\nQuery: transformers\nFound: 10 paper(s)\n...",
  "metadata": {
    "success": true,
    "action": "search_papers",
    "query": "transformers",
    "paperCount": 10,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Error Codes

| Code                      | Description                              | Retriable |
|---------------------------|------------------------------------------|-----------|
| INVALID_ACTION            | Unknown or missing action                | No        |
| INVALID_INPUT             | Bad or missing parameters                | No        |
| PROVIDER_NOT_CONFIGURED   | No API client available                  | No        |
| TIMEOUT                   | Request exceeded timeout                 | Yes       |
| UPSTREAM_ERROR             | API returned an error                    | Maybe     |

## Testing

```bash
node --test skills/semantic-scholar-api/__tests__/handler.test.js
```
