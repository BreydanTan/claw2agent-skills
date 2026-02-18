# Plex Media Server API [L1]

Browse and manage media libraries on Plex Media Server.

## Actions

### `get_libraries`
_No required parameters._

### `search_media`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |
| type | ❌ | string |

### `get_recently_added`
| Param | Req | Type |
|-------|-----|------|
| count | ❌ | number |

### `get_sessions`
_No required parameters._

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
node --test skills/plex-api/__tests__/handler.test.js
```
