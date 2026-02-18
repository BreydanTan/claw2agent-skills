# Minecraft Bot Controller [L1]

Control Minecraft bots for building, mining, and exploring.

## Actions

### `send_command`
| Param | Req | Type |
|-------|-----|------|
| command | ✅ | string |

### `get_status`
_No required parameters._

### `navigate_to`
| Param | Req | Type |
|-------|-----|------|
| x | ✅ | string |
| y | ✅ | string |
| z | ✅ | string |

### `get_inventory`
_No required parameters._

## Testing

```bash
node --test skills/minecraft-bot-controller/__tests__/handler.test.js
```
