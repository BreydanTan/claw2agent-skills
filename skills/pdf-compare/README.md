# PDF Compare [L1]

Compare two PDF documents and highlight differences.

## Actions

### `compare_pdfs`
| Param | Req | Type |
|-------|-----|------|
| file1 | ✅ | string |
| file2 | ✅ | string |

### `get_text_diff`
| Param | Req | Type |
|-------|-----|------|
| file1 | ✅ | string |
| file2 | ✅ | string |

### `get_visual_diff`
| Param | Req | Type |
|-------|-----|------|
| file1 | ✅ | string |
| file2 | ✅ | string |
| page | ❌ | number |

### `get_metadata_diff`
| Param | Req | Type |
|-------|-----|------|
| file1 | ✅ | string |
| file2 | ✅ | string |

## Testing

```bash
node --test skills/pdf-compare/__tests__/handler.test.js
```
