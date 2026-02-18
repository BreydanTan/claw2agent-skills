# Log Monitor [L1]

Monitor, search, and analyze application logs.

## Actions

### `search_logs`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |
| timeRange | ❌ | string |
| limit | ❌ | number |

### `get_stats`
| Param | Req | Type |
|-------|-----|------|
| timeRange | ❌ | string |

### `create_alert`
| Param | Req | Type |
|-------|-----|------|
| pattern | ✅ | string |
| threshold | ❌ | number |

### `list_alerts`
_No required parameters._

## Testing

```bash
node --test skills/log-monitor/__tests__/handler.test.js
```
