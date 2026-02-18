# Video Downloader [L1]

Download videos from supported platforms for processing.

## Actions

### `get_info`
| Param | Req | Type |
|-------|-----|------|
| url | ✅ | string |

### `download`
| Param | Req | Type |
|-------|-----|------|
| url | ✅ | string |
| quality | ❌ | string |

### `get_status`
| Param | Req | Type |
|-------|-----|------|
| taskId | ✅ | string |

### `extract_audio`
| Param | Req | Type |
|-------|-----|------|
| url | ✅ | string |
| format | ❌ | string |

## Testing

```bash
node --test skills/video-downloader/__tests__/handler.test.js
```
