# Color Palette Extractor [L1]

Extract dominant colors and generate palettes from images.

## Actions

### `extract_palette`
| Param | Req | Type |
|-------|-----|------|
| imageUrl | ✅ | string |
| count | ❌ | number |

### `get_complementary`
| Param | Req | Type |
|-------|-----|------|
| color | ✅ | string |

### `analyze_image`
| Param | Req | Type |
|-------|-----|------|
| imageUrl | ✅ | string |

### `generate_palette`
| Param | Req | Type |
|-------|-----|------|
| baseColor | ✅ | string |
| scheme | ❌ | string |

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
node --test skills/color-palette-extractor/__tests__/handler.test.js
```
