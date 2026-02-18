# SEO Optimizer [L1]

Analyze and optimize web pages for search engine rankings.

## Actions

### `analyze_page`
| Param | Req | Type |
|-------|-----|------|
| url | ✅ | string |

### `check_keywords`
| Param | Req | Type |
|-------|-----|------|
| url | ✅ | string |
| keywords | ✅ | string |

### `get_backlinks`
| Param | Req | Type |
|-------|-----|------|
| url | ✅ | string |

### `check_speed`
| Param | Req | Type |
|-------|-----|------|
| url | ✅ | string |

## Testing

```bash
node --test skills/seo-optimizer/__tests__/handler.test.js
```
