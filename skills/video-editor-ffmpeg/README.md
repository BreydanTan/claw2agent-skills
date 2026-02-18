# Video Editor (FFmpeg) [L1]

Process and transform video/audio files using FFmpeg commands.

## Actions

### `get_info`
| Param | Req | Type |
|-------|-----|------|
| filePath | ✅ | string |

### `convert`
| Param | Req | Type |
|-------|-----|------|
| input | ✅ | string |
| output | ✅ | string |
| format | ❌ | string |

### `extract_audio`
| Param | Req | Type |
|-------|-----|------|
| input | ✅ | string |
| output | ✅ | string |

### `thumbnail`
| Param | Req | Type |
|-------|-----|------|
| input | ✅ | string |
| timestamp | ❌ | string |

## Error Codes

| Code | Retriable |
|------|-----------|
| INVALID_ACTION | No |
| INVALID_INPUT | No |
| PROVIDER_NOT_CONFIGURED | No |
| TIMEOUT | Yes |
| UPSTREAM_ERROR | Maybe |

## Testing

```bash
node --test skills/video-editor-ffmpeg/__tests__/handler.test.js
```
