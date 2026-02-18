# Transmission RPC API [L1]

Manage torrent downloads via Transmission RPC interface.

## Actions

### `list_torrents`
_No required parameters._

### `add_torrent`
| Param | Req | Type |
|-------|-----|------|
| url | ✅ | string |

### `remove_torrent`
| Param | Req | Type |
|-------|-----|------|
| torrentId | ✅ | string |
| deleteData | ❌ | boolean |

### `get_session`
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
node --test skills/transmission-rpc/__tests__/handler.test.js
```
