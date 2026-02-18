# Quora/Zhihu Manager [L1]

Manage Q&A content on Quora and Zhihu platforms.

## Actions

### `search_questions`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |
| platform | ❌ | string |

### `get_answers`
| Param | Req | Type |
|-------|-----|------|
| questionId | ✅ | string |

### `post_answer`
| Param | Req | Type |
|-------|-----|------|
| questionId | ✅ | string |
| content | ✅ | string |

### `get_trending`
| Param | Req | Type |
|-------|-----|------|
| platform | ❌ | string |

## Testing

```bash
node --test skills/quora-zhihu-manager/__tests__/handler.test.js
```
