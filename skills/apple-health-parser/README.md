# Apple Health Parser [L1]

Parse and analyze Apple Health export data.

## Actions

### `parse_export`
| Param | Req | Type |
|-------|-----|------|
| filePath | ✅ | string |

### `get_summary`
| Param | Req | Type |
|-------|-----|------|
| filePath | ✅ | string |
| metric | ❌ | string |

### `get_workouts`
| Param | Req | Type |
|-------|-----|------|
| filePath | ✅ | string |
| type | ❌ | string |

### `export_csv`
| Param | Req | Type |
|-------|-----|------|
| filePath | ✅ | string |
| metric | ✅ | string |

## Testing

```bash
node --test skills/apple-health-parser/__tests__/handler.test.js
```
