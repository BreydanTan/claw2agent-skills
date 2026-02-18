# SQL Analyzer [L1]

Analyze, optimize, and explain SQL queries.

## Actions

### `analyze_query`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |
| dialect | ❌ | string |

### `explain_query`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |

### `format_query`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |

### `validate_query`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |

## Testing

```bash
node --test skills/sql-analyzer/__tests__/handler.test.js
```
