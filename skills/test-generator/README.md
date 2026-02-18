# Test Generator [L1]

Automatically generate unit and integration tests for code.

## Actions

### `generate_tests`
| Param | Req | Type |
|-------|-----|------|
| code | ✅ | string |
| framework | ❌ | string |
| language | ❌ | string |

### `analyze_coverage`
| Param | Req | Type |
|-------|-----|------|
| code | ✅ | string |
| tests | ✅ | string |

### `suggest_cases`
| Param | Req | Type |
|-------|-----|------|
| code | ✅ | string |

### `validate_tests`
| Param | Req | Type |
|-------|-----|------|
| tests | ✅ | string |

## Testing

```bash
node --test skills/test-generator/__tests__/handler.test.js
```
