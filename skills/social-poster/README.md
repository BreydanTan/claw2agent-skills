# Social Poster [L1]

Cross-post content to multiple social media platforms.

## Actions

### `create_post`
| Param | Req | Type |
|-------|-----|------|
| content | ✅ | string |
| platforms | ✅ | string |
| scheduleAt | ❌ | string |

### `get_post`
| Param | Req | Type |
|-------|-----|------|
| postId | ✅ | string |

### `list_posts`
| Param | Req | Type |
|-------|-----|------|
| limit | ❌ | number |

### `delete_post`
| Param | Req | Type |
|-------|-----|------|
| postId | ✅ | string |

## Testing

```bash
node --test skills/social-poster/__tests__/handler.test.js
```
