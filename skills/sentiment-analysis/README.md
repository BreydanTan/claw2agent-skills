# Sentiment Analysis [L1]

Analyze text sentiment, emotion, and tone.

## Actions

### `analyze_text`
| Param | Req | Type |
|-------|-----|------|
| text | ✅ | string |
| language | ❌ | string |

### `analyze_batch`
| Param | Req | Type |
|-------|-----|------|
| texts | ✅ | string |

### `detect_language`
| Param | Req | Type |
|-------|-----|------|
| text | ✅ | string |

### `extract_entities`
| Param | Req | Type |
|-------|-----|------|
| text | ✅ | string |

## Testing

```bash
node --test skills/sentiment-analysis/__tests__/handler.test.js
```
