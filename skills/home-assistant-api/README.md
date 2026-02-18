# Home Assistant API [L1]

Control smart home devices and automations via Home Assistant API.

## Actions

### `get_states`
_No required parameters._

### `get_entity`
| Param | Req | Type |
|-------|-----|------|
| entityId | ✅ | string |

### `call_service`
| Param | Req | Type |
|-------|-----|------|
| domain | ✅ | string |
| service | ✅ | string |
| entityId | ❌ | string |

### `get_history`
| Param | Req | Type |
|-------|-----|------|
| entityId | ✅ | string |
| startTime | ❌ | string |

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
node --test skills/home-assistant-api/__tests__/handler.test.js
```
