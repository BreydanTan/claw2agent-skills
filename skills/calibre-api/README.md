# Calibre Content Server API [L1]

Browse and manage ebook libraries via Calibre Content Server.

## Actions

### `list_books`
| Param | Req | Type |
|-------|-----|------|
| query | ❌ | string |
| num | ❌ | number |

### `get_book`
| Param | Req | Type |
|-------|-----|------|
| bookId | ✅ | string |

### `get_categories`
_No required parameters._

### `search_books`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |

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
node --test skills/calibre-api/__tests__/handler.test.js
```
