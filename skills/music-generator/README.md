# Music Generator [L1]

Generate music, melodies, and audio compositions via AI music APIs.

## Actions

### `generate_track`
| Param | Req | Type |
|-------|-----|------|
| prompt | ✅ | string |
| duration | ❌ | number |
| genre | ❌ | string |

### `get_track`
| Param | Req | Type |
|-------|-----|------|
| trackId | ✅ | string |

### `list_tracks`
| Param | Req | Type |
|-------|-----|------|
| limit | ❌ | number |

### `get_genres`
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
node --test skills/music-generator/__tests__/handler.test.js
```
