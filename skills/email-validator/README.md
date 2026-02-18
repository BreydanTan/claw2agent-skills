# Email Validator [L1]

Validate email addresses and check deliverability.

## Actions

### `validate_email`
| Param | Req | Type |
|-------|-----|------|
| email | ✅ | string |

### `bulk_validate`
| Param | Req | Type |
|-------|-----|------|
| emails | ✅ | string |

### `check_domain`
| Param | Req | Type |
|-------|-----|------|
| domain | ✅ | string |

### `get_suggestions`
| Param | Req | Type |
|-------|-----|------|
| email | ✅ | string |

## Testing

```bash
node --test skills/email-validator/__tests__/handler.test.js
```
