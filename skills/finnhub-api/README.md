# Finnhub API [L1]

Access stock quotes, company profiles, and market news via Finnhub API.

## Actions

### `get_quote`
Get a real-time stock quote.

| Parameter | Required | Type   | Description           |
|-----------|----------|--------|-----------------------|
| symbol    | ✅       | string | Stock ticker symbol   |

### `get_profile`
Get company profile information.

| Parameter | Required | Type   | Description           |
|-----------|----------|--------|-----------------------|
| symbol    | ✅       | string | Stock ticker symbol   |

### `search_symbol`
Search for stock symbols by keyword.

| Parameter | Required | Type   | Description    |
|-----------|----------|--------|----------------|
| query     | ✅       | string | Search query   |

### `get_news`
Get market news articles.

| Parameter | Required | Type   | Default   | Description         |
|-----------|----------|--------|-----------|---------------------|
| category  | ❌       | string | general   | News category       |
| minId     | ❌       | number | —         | Minimum article ID  |

## Architecture

- **No hardcoded endpoints** — all API access goes through the injected `providerClient`
- **BYOK** (Bring Your Own Key) — keys are managed externally  
- **Timeout enforcement** — default 30s, max 120s
- **Input validation** — symbols uppercase-normalized, max 10 chars
- **Sensitive data redaction** — tokens redacted from all outputs

## Return Format

### Success
```json
{
  "result": "Stock Quote: AAPL\nCurrent: $150.25\nChange: 2.5 (1.69%)",
  "metadata": {
    "success": true,
    "action": "get_quote",
    "symbol": "AAPL",
    "currentPrice": 150.25,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Error
```json
{
  "result": "Error: Provider client required...",
  "metadata": {
    "success": false,
    "error": {
      "code": "PROVIDER_NOT_CONFIGURED",
      "message": "...",
      "retriable": false
    }
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

## Security Notes

- No API keys are stored in skill code
- All sensitive data is redacted from output
- Input is validated and sanitized before processing

## Testing

```bash
node --test skills/finnhub-api/__tests__/handler.test.js
```
