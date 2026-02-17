# DeFi Llama API [L1]

Query DeFi protocol TVL, yields, and chain data via DeFiLlama API.

## Actions

### `get_protocol_tvl`
Get the total value locked (TVL) for a specific DeFi protocol.

| Parameter | Required | Type   | Description    |
|-----------|----------|--------|----------------|
| protocol  | ✅       | string | Protocol name  |

### `list_protocols`
List all DeFi protocols with their TVL data.

_No required parameters._

### `get_chain_tvl`
Get historical TVL data for a specific blockchain.

| Parameter | Required | Type   | Description  |
|-----------|----------|--------|--------------|
| chain     | ✅       | string | Chain name   |

### `get_yields`
Get yield/APY data for DeFi pools.

| Parameter | Required | Type   | Description            |
|-----------|----------|--------|------------------------|
| pool      | ❌       | string | Filter by pool address |

## Architecture

- **No hardcoded endpoints** — all API access goes through the injected `providerClient`
- **BYOK** (Bring Your Own Key) — keys are managed externally  
- **Timeout enforcement** — default 30s, max 120s
- **Input validation** — all parameters are validated before processing
- **Sensitive data redaction** — API keys/tokens are redacted from all outputs

## Return Format

### Success
```json
{
  "result": "Protocol TVL\nName: Aave\nTVL: $12,345,678,900\nChains: Ethereum, Polygon",
  "metadata": {
    "success": true,
    "action": "get_protocol_tvl",
    "protocol": "aave",
    "tvl": 12345678900,
    "chainCount": 2,
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
- All sensitive data is redacted from output using pattern matching
- Input is validated and sanitized before processing

## Testing

```bash
node --test skills/defi-llama-api/__tests__/handler.test.js
```
