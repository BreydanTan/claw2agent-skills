# Swagger/OpenAPI Generator [L1]

Generate API clients, documentation, and specs from OpenAPI definitions.

## Actions

### `generate_client`
| Param | Req | Type |
|-------|-----|------|
| specUrl | ✅ | string |
| language | ❌ | string |

### `validate_spec`
| Param | Req | Type |
|-------|-----|------|
| specUrl | ✅ | string |

### `generate_docs`
| Param | Req | Type |
|-------|-----|------|
| specUrl | ✅ | string |
| format | ❌ | string |

### `convert_spec`
| Param | Req | Type |
|-------|-----|------|
| specUrl | ✅ | string |
| targetFormat | ❌ | string |

## Testing

```bash
node --test skills/swagger-openapi-generator/__tests__/handler.test.js
```
