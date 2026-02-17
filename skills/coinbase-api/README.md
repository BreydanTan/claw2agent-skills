# Coinbase API Skill

**Layer**: L1 (External API via injected client)
**Category**: Finance / Crypto

## Description

Access Coinbase cryptocurrency data including spot prices, exchange rates, buy/sell prices, and supported currencies. All external calls go through an injected provider client — no hardcoded endpoints.

## Actions

| Action | Description | Requires Client |
|--------|-------------|-----------------|
| `get_spot_price` | Get current spot price for a currency pair | Yes |
| `get_exchange_rates` | Get exchange rates for a base currency | Yes |
| `list_currencies` | List supported currencies | Yes |
| `get_buy_price` | Get buy price for a currency pair | Yes |
| `get_sell_price` | Get sell price for a currency pair | Yes |

## Usage Examples

### Get Spot Price
```json
{ "action": "get_spot_price", "currencyPair": "BTC-USD" }
```

### Get Exchange Rates
```json
{ "action": "get_exchange_rates", "currency": "USD" }
```

### List Currencies
```json
{ "action": "list_currencies" }
```

## Running Tests

```bash
node --test skills/coinbase-api/__tests__/handler.test.js
```
