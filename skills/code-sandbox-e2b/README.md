# Code Sandbox (E2B) [L1]

Run code in isolated sandboxes via E2B platform.

## Actions

### `create_sandbox`
| Param | Req | Type |
|-------|-----|------|
| template | ❌ | string |

### `exec_code`
| Param | Req | Type |
|-------|-----|------|
| sandboxId | ✅ | string |
| code | ✅ | string |
| language | ❌ | string |

### `upload_file`
| Param | Req | Type |
|-------|-----|------|
| sandboxId | ✅ | string |
| path | ✅ | string |
| content | ✅ | string |

### `close_sandbox`
| Param | Req | Type |
|-------|-----|------|
| sandboxId | ✅ | string |

## Testing

```bash
node --test skills/code-sandbox-e2b/__tests__/handler.test.js
```
