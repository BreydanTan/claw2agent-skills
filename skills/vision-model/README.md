# Vision Model API [L1]

Analyze images using vision AI models.

## Actions

### `analyze_image`
| Param | Req | Type |
|-------|-----|------|
| imageUrl | ✅ | string |
| prompt | ❌ | string |

### `detect_objects`
| Param | Req | Type |
|-------|-----|------|
| imageUrl | ✅ | string |

### `extract_text`
| Param | Req | Type |
|-------|-----|------|
| imageUrl | ✅ | string |
| language | ❌ | string |

### `compare_images`
| Param | Req | Type |
|-------|-----|------|
| imageUrl1 | ✅ | string |
| imageUrl2 | ✅ | string |

## Testing

```bash
node --test skills/vision-model/__tests__/handler.test.js
```
