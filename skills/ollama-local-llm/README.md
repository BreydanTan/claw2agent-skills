# Ollama Local LLM [L1]

Run local LLM inference via Ollama API.

## Actions

### `generate`
| Param | Req | Type |
|-------|-----|------|
| model | ✅ | string |
| prompt | ✅ | string |
| temperature | ❌ | number |

### `chat`
| Param | Req | Type |
|-------|-----|------|
| model | ✅ | string |
| message | ✅ | string |

### `list_models`
_No required parameters._

### `pull_model`
| Param | Req | Type |
|-------|-----|------|
| model | ✅ | string |

## Testing

```bash
node --test skills/ollama-local-llm/__tests__/handler.test.js
```
