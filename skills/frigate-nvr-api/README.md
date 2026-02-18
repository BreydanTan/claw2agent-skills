# Frigate NVR API [L1]

Monitor cameras, view events, and manage recordings via Frigate NVR.

## Actions

### `get_events`
| Param | Req | Type |
|-------|-----|------|
| limit | ❌ | number |
| label | ❌ | string |

### `get_config`
_No required parameters._

### `get_stats`
_No required parameters._

### `get_recordings`
| Param | Req | Type |
|-------|-----|------|
| camera | ✅ | string |

## Error Codes

| Code | Retriable |
|------|-----------|
| INVALID_ACTION | No |
| INVALID_INPUT | No |
| PROVIDER_NOT_CONFIGURED | No |
| TIMEOUT | Yes |
| UPSTREAM_ERROR | Maybe |

## Testing

```bash
node --test skills/frigate-nvr-api/__tests__/handler.test.js
```
