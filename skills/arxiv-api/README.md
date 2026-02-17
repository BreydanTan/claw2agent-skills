# arXiv API [L1]

Search and retrieve academic papers from arXiv.

## Actions

### `search_papers`
Search for papers by keyword.

| Parameter  | Required | Type   | Default    | Description               |
|------------|----------|--------|------------|---------------------------|
| query      | ✅       | string | —          | Search query              |
| maxResults | ❌       | number | 10         | Max results (up to 100)   |
| sortBy     | ❌       | string | relevance  | Sort order                |

### `get_paper`
Get details for a specific paper.

| Parameter | Required | Type   | Description           |
|-----------|----------|--------|-----------------------|
| paperId   | ✅       | string | arXiv ID (e.g. 2301.12345) |

### `list_recent`
List recent papers in a category.

| Parameter  | Required | Type   | Default | Description            |
|------------|----------|--------|---------|------------------------|
| category   | ✅       | string | —       | arXiv category (e.g. cs.AI) |
| maxResults | ❌       | number | 10      | Max results             |

### `get_categories`
List all arXiv categories.

_No required parameters._

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
  "result": "arXiv Search Results\nQuery: deep learning\nFound: 10 paper(s)\n...",
  "metadata": {
    "success": true,
    "action": "search_papers",
    "query": "deep learning",
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
node --test skills/arxiv-api/__tests__/handler.test.js
```
