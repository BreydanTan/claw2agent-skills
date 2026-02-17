# Price Drop Monitor

**Layer 1 (L1)** skill for tracking product prices, setting price alerts, and analyzing price history.

## Overview

Monitor product prices through a unified interface. Supports checking current prices, managing price alerts, viewing price history, comparing prices across stores, finding deals, and analyzing price trends. All API access goes through an injected provider client (BYOK - Bring Your Own Key).

## Actions

### `check_price`

Check the current price of a product.

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| productId | string | Yes*     | Product identifier                   |
| url       | string | Yes*     | Product URL (alternative to productId) |
| store     | string | No       | Store name filter                    |

*One of `productId` or `url` is required.

**Returns:** price, currency, name, store, inStock, lastUpdated

### `set_alert`

Set a price drop alert for a product. Alerts are stored in memory.

| Parameter    | Type   | Required | Default   | Description                                    |
|--------------|--------|----------|-----------|------------------------------------------------|
| productId    | string | Yes      |           | Product identifier                             |
| targetPrice  | number | Yes      |           | Target price to alert on (must be >= 0)        |
| notifyMethod | string | No       | `"email"` | `"email"`, `"sms"`, `"push"`, `"webhook"`     |

**Returns:** alertId, productId, targetPrice, notifyMethod, active

### `list_alerts`

List all configured price alerts.

No parameters required.

**Returns:** count, alerts array

### `remove_alert`

Remove a price alert by ID.

| Parameter | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| alertId   | string | Yes      | Alert ID      |

**Returns:** alertId, productId, removed

### `price_history`

Get price history for a product.

| Parameter | Type   | Required | Default | Description                    |
|-----------|--------|----------|---------|--------------------------------|
| productId | string | Yes      |         | Product identifier             |
| days      | number | No       | 30      | Number of days of history      |

**Returns:** currentPrice, highPrice, lowPrice, avgPrice, history array

### `compare_prices`

Compare prices for a product across multiple stores.

| Parameter | Type     | Required | Description                              |
|-----------|----------|----------|------------------------------------------|
| productId | string   | Yes*     | Product identifier                       |
| query     | string   | Yes*     | Search query (alternative to productId)  |
| stores    | string[] | Yes      | Array of store names to compare          |

*One of `productId` or `query` is required.

**Returns:** lowestPrice, highestPrice, bestStore, results array

### `find_deals`

Find current deals and discounts in a category.

| Parameter   | Type   | Required | Default | Description                  |
|-------------|--------|----------|---------|------------------------------|
| category    | string | Yes      |         | Product category             |
| maxPrice    | number | No       |         | Maximum price filter         |
| minDiscount | number | No       | 0       | Minimum discount percentage  |

**Returns:** count, deals array

### `analyze_trend`

Analyze price trend for a product. Returns trend direction, average price, and price volatility.

| Parameter | Type   | Required | Default | Description                    |
|-----------|--------|----------|---------|--------------------------------|
| productId | string | Yes      |         | Product identifier             |
| days      | number | No       | 30      | Number of days to analyze      |

**Returns:** trendDirection (up/down/stable), changePercent, avgPrice, highPrice, lowPrice, volatility, volatilityLevel (low/moderate/high), dataPoints

**Trend Analysis:**
- **Trend Direction**: Based on percentage change from start to current price (>5% up, <-5% down, otherwise stable)
- **Volatility**: Coefficient of variation (stdDev / avgPrice * 100). >20% high, >10% moderate, otherwise low.

## Return Format

### Success

```json
{
  "result": "Human-readable summary string",
  "metadata": {
    "success": true,
    "action": "check_price",
    "layer": "L1",
    ...
  }
}
```

### Error

```json
{
  "result": "Error: description of what went wrong",
  "metadata": {
    "success": false,
    "error": "ERROR_CODE"
  }
}
```

## Error Codes

| Code                     | Description                                    |
|--------------------------|------------------------------------------------|
| INVALID_ACTION           | Unknown or missing action                      |
| MISSING_PRODUCT_ID       | Required `productId`/`url` parameter missing   |
| MISSING_ALERT_ID         | Required `alertId` parameter missing           |
| MISSING_STORES           | Required `stores` array missing or empty       |
| MISSING_CATEGORY         | Required `category` parameter missing          |
| INVALID_TARGET_PRICE     | `targetPrice` is missing or not valid          |
| INVALID_NOTIFY_METHOD    | `notifyMethod` is not a valid option           |
| ALERT_NOT_FOUND          | Alert with given ID does not exist             |
| PROVIDER_NOT_CONFIGURED  | No provider/gateway client in context          |
| TIMEOUT                  | Request exceeded timeout limit                 |
| REQUEST_ERROR            | Network or API error                           |

## L1 Rules

1. **No hardcoded vendor endpoints** - All API access goes through `context.providerClient.request(method, path, body)`
2. **Injected client required** - Uses `context.providerClient` or `context.gatewayClient`
3. **Provider check** - Returns `PROVIDER_NOT_CONFIGURED` if no client available (for external actions)
4. **Timeout enforcement** - Default 15s, maximum 30s
5. **Secret redaction** - Tokens, API keys, and secrets are redacted from outputs
6. **Input sanitization** - All string inputs are trimmed and control characters are removed

## Configuration

```json
{
  "timeout": 30000
}
```

## Examples

```js
// Check current price
await execute({ action: 'check_price', productId: 'mouse-001' }, context);

// Set a price alert
await execute({ action: 'set_alert', productId: 'mouse-001', targetPrice: 19.99, notifyMethod: 'email' }, context);

// List all alerts
await execute({ action: 'list_alerts' }, context);

// Remove an alert
await execute({ action: 'remove_alert', alertId: 'alert_1' }, context);

// Get price history
await execute({ action: 'price_history', productId: 'mouse-001', days: 30 }, context);

// Compare prices across stores
await execute({ action: 'compare_prices', productId: 'mouse-001', stores: ['Amazon', 'BestBuy', 'Walmart'] }, context);

// Find deals
await execute({ action: 'find_deals', category: 'electronics', maxPrice: 50, minDiscount: 20 }, context);

// Analyze price trend
await execute({ action: 'analyze_trend', productId: 'mouse-001', days: 60 }, context);
```
