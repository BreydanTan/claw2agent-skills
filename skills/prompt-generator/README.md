# Prompt Generator [L1]

Generate and optimize prompts for AI models.

## Actions

### `generate_prompt`
| Param | Req | Type |
|-------|-----|------|
| task | ✅ | string |
| model | ❌ | string |
| style | ❌ | string |

### `optimize_prompt`
| Param | Req | Type |
|-------|-----|------|
| prompt | ✅ | string |
| goal | ❌ | string |

### `list_templates`
_No required parameters._

### `evaluate_prompt`
| Param | Req | Type |
|-------|-----|------|
| prompt | ✅ | string |

## Testing

```bash
node --test skills/prompt-generator/__tests__/handler.test.js
```
