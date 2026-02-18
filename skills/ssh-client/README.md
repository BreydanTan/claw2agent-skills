# SSH Client [L1]

Execute remote commands and manage files via SSH.

## Actions

### `exec_command`
| Param | Req | Type |
|-------|-----|------|
| host | ✅ | string |
| command | ✅ | string |
| username | ❌ | string |

### `upload_file`
| Param | Req | Type |
|-------|-----|------|
| host | ✅ | string |
| localPath | ✅ | string |
| remotePath | ✅ | string |

### `download_file`
| Param | Req | Type |
|-------|-----|------|
| host | ✅ | string |
| remotePath | ✅ | string |
| localPath | ✅ | string |

### `list_dir`
| Param | Req | Type |
|-------|-----|------|
| host | ✅ | string |
| path | ❌ | string |

## Testing

```bash
node --test skills/ssh-client/__tests__/handler.test.js
```
