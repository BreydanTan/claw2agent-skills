# Google Trends API [L1]

Access Google Trends data for keyword research and trend analysis.

## Actions

### `get_interest`
| Param | Req | Type |
|-------|-----|------|
| keyword | ✅ | string |
| geo | ❌ | string |
| timeRange | ❌ | string |

### `get_related`
| Param | Req | Type |
|-------|-----|------|
| keyword | ✅ | string |

### `compare_keywords`
| Param | Req | Type |
|-------|-----|------|
| keywords | ✅ | string |

### `get_trending`
| Param | Req | Type |
|-------|-----|------|
| geo | ❌ | string |

## Testing

```bash
node --test skills/google-trends-api/__tests__/handler.test.js
```
