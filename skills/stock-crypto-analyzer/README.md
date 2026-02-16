# Stock & Crypto Analyzer

**Layer 2 (L2)** skill for real-time market data analysis. Provides stock and cryptocurrency quotes, technical analysis with standard indicators, multi-symbol comparison, and price alert watchlists.

## Layer 2 Requirements

This skill requires a platform gateway adapter for market data access. It does **not** hardcode any vendor endpoints or API keys. All external data flows through the injected `context.gatewayClient` (or `context.providerClient` fallback).

If no client is injected, external-data actions will return a `PROVIDER_NOT_CONFIGURED` error.

## Actions

| Action | Description | Requires Client |
|---|---|---|
| `quote` | Get current price/quote for a symbol | Yes |
| `analyze` | Technical analysis with SMA, RSI, MACD, Bollinger Bands | Yes |
| `compare` | Compare performance of multiple symbols | Yes |
| `watchlist_add` | Add a symbol to the in-memory watchlist | No |
| `watchlist_remove` | Remove a symbol from the watchlist | No |
| `watchlist_list` | List all watchlist entries | No |
| `alert` | Check if watchlist symbols have hit their target prices | Yes |

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `action` | string | Yes | - | One of the actions listed above |
| `symbol` | string | Per action | - | Ticker symbol (e.g. AAPL, BTC) |
| `symbols` | string[] | compare | - | Array of symbols for comparison |
| `type` | string | No | `"stock"` | `"stock"` or `"crypto"` |
| `period` | string | No | `"1m"` | `"1w"`, `"1m"`, `"3m"`, `"6m"`, `"1y"` |
| `targetPrice` | number | No | - | Target price for watchlist alert |
| `alertType` | string | No | `"above"` | `"above"` or `"below"` |

## Technical Indicators

The `analyze` action computes the following indicators locally from historical price data:

- **SMA (Simple Moving Average)**: 20, 50, and 200 period averages
- **RSI (Relative Strength Index)**: 14-period default, values 0-100
- **MACD (Moving Average Convergence Divergence)**: 12/26/9 periods, includes MACD line, signal line, and histogram
- **Bollinger Bands**: 20-period SMA with 2 standard deviation bands
- **Support / Resistance**: Detected from recent price extremes

A recommendation is generated from the combined indicator signals: `strong_buy`, `buy`, `hold`, `sell`, or `strong_sell`.

## Configuration

```json
{
  "provider": "gateway",
  "timeoutMs": 15000,
  "maxCostUsd": 0.50,
  "rateLimitProfile": "market-data",
  "featureFlags": {}
}
```

- `timeoutMs`: Per-request timeout (default 15s, max 30s)
- `maxCostUsd`: Cost cap per invocation. Returns `COST_LIMIT_EXCEEDED` if exceeded.

## Security

- No hardcoded API endpoints or vendor URLs
- No raw API keys in skill code
- All tokens/keys are redacted from output strings
- Timeout enforcement with retry + exponential backoff + jitter
- Cost limit enforcement via `context.config.maxCostUsd`
- Structured error responses only (no stack traces)

## Error Codes

| Code | Description |
|---|---|
| `INVALID_ACTION` | Unrecognized action parameter |
| `MISSING_SYMBOL` | Required symbol parameter not provided |
| `INVALID_TYPE` | Type is not "stock" or "crypto" |
| `INVALID_PERIOD` | Period is not a valid option |
| `INVALID_SYMBOLS` | Symbols array missing or too small for compare |
| `PROVIDER_NOT_CONFIGURED` | No gateway/provider client injected |
| `COST_LIMIT_EXCEEDED` | Estimated cost exceeds maxCostUsd |
| `TIMEOUT` | Request timed out |
| `NETWORK_ERROR` | All retry attempts failed |
| `NO_DATA` | No historical data returned |
| `NOT_FOUND` | Watchlist entry not found for removal |

## Usage Examples

```js
// Get a stock quote
await execute({ action: 'quote', symbol: 'AAPL', type: 'stock' }, context);

// Technical analysis
await execute({ action: 'analyze', symbol: 'BTC', type: 'crypto', period: '3m' }, context);

// Compare symbols
await execute({ action: 'compare', symbols: ['AAPL', 'GOOG', 'MSFT'], type: 'stock' }, context);

// Manage watchlist
await execute({ action: 'watchlist_add', symbol: 'ETH', type: 'crypto', targetPrice: 5000, alertType: 'above' }, context);
await execute({ action: 'watchlist_list' }, context);
await execute({ action: 'alert' }, context);
await execute({ action: 'watchlist_remove', symbol: 'ETH' }, context);
```

## Testing

```bash
node --test skills/stock-crypto-analyzer/__tests__/handler.test.js
```

All tests use mocked gateway clients with no real network calls.
