# Binance API Skill

**Layer**: L1 (External API via injected client)
**Category**: Finance / Crypto

## Description

Access Binance cryptocurrency market data including real-time prices, order books, 24h tickers, trading symbols, and candlestick (kline) data. All external calls go through an injected provider client — no hardcoded endpoints.

## Actions

| Action | Description | Requires Client |
|--------|-------------|-----------------|
| `get_price` | Get current price for a trading pair | Yes |
| `get_order_book` | Get order book (bids/asks) | Yes |
| `get_ticker` | Get 24h ticker statistics | Yes |
| `list_symbols` | List available trading pairs | Yes |
| `get_klines` | Get candlestick/kline data | Yes |

## Usage Examples

### Get Price
```json
{ "action": "get_price", "symbol": "BTCUSDT" }
```

### Get Order Book
```json
{ "action": "get_order_book", "symbol": "ETHUSDT", "limit": 10 }
```

### Get 24h Ticker
```json
{ "action": "get_ticker", "symbol": "BTCUSDT" }
```

### List Trading Symbols
```json
{ "action": "list_symbols", "limit": 20 }
```

### Get Klines
```json
{ "action": "get_klines", "symbol": "BTCUSDT", "interval": "1h", "limit": 24 }
```

## Parameters

- `symbol` (string): Trading pair (e.g. `BTCUSDT`, `ETHUSDT`). Auto-uppercased.
- `limit` (number): Max results (default: 10, max: 100).
- `interval` (string): Kline interval — `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w`.

## Running Tests

```bash
node --test skills/binance-api/__tests__/handler.test.js
```
