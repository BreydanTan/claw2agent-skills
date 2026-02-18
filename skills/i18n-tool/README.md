# i18n Tool [L1]

Manage internationalization keys, translations, and locale files.

## Actions

### `extract_keys`
| Param | Req | Type |
|-------|-----|------|
| code | ✅ | string |
| format | ❌ | string |

### `translate_keys`
| Param | Req | Type |
|-------|-----|------|
| keys | ✅ | string |
| targetLang | ✅ | string |
| sourceLang | ❌ | string |

### `validate_locale`
| Param | Req | Type |
|-------|-----|------|
| locale | ✅ | string |
| reference | ✅ | string |

### `merge_locales`
| Param | Req | Type |
|-------|-----|------|
| base | ✅ | string |
| override | ✅ | string |

## Testing

```bash
node --test skills/i18n-tool/__tests__/handler.test.js
```
