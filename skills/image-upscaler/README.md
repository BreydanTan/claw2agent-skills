# Image Upscaler Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

AI-powered image upscaling and enhancement via provider client. Supports upscaling, quality enhancement (denoise + sharpen), image info retrieval, model listing, and job status checking.

## Actions

### `upscale`

Upscale an image to a higher resolution using AI super-resolution.

| Parameter | Type    | Required | Default | Description                        |
| --------- | ------- | -------- | ------- | ---------------------------------- |
| image     | string  | Yes      | --      | Image file path or URL             |
| scale     | integer | No       | `2`     | Upscale factor (2, 3, or 4)       |
| format    | string  | No       | `png`   | Output format: png, jpeg, or webp  |

**Endpoint:** `POST /images/upscale` body: `{ image, scale, format }`

### `enhance`

Enhance image quality with denoising and sharpening.

| Parameter     | Type    | Required | Default | Description                    |
| ------------- | ------- | -------- | ------- | ------------------------------ |
| image         | string  | Yes      | --      | Image file path or URL         |
| denoise_level | integer | No       | `1`     | Denoise intensity level (0-3)  |
| sharpen       | boolean | No       | `true`  | Whether to apply sharpening    |

**Endpoint:** `POST /images/enhance` body: `{ image, denoise_level, sharpen }`

### `get_info`

Get information about an image (dimensions, format, file size, color space).

| Parameter | Type   | Required | Default | Description            |
| --------- | ------ | -------- | ------- | ---------------------- |
| image     | string | Yes      | --      | Image file path or URL |

**Endpoint:** `POST /images/info` body: `{ image }`

### `list_models`

List available upscaling models. Returns local data, no API call required.

No parameters required.

**Available models:** real-esrgan-x4, real-esrgan-x2, swinir-large, edsr-baseline, waifu2x-cunet

### `check_status`

Check the processing status of an upscaling or enhancement job.

| Parameter | Type   | Required | Default | Description                      |
| --------- | ------ | -------- | ------- | -------------------------------- |
| jobId     | string | Yes      | --      | Job ID (non-empty, max 100 chars)|

**Endpoint:** `GET /images/status/:jobId`

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 30 seconds, maximum 120 seconds.
- **Input validation.** All parameters are validated and sanitized before use. Images must be non-empty strings, scale must be 2-4, format must be png/jpeg/webp, denoise_level must be 0-3, sharpen must be boolean, jobId must be non-empty string (max 100 chars).
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Image Upscale Result\nSource: photo.png\nScale: 2x\nFormat: png\nOutput dimensions: 1920x1080\nOutput URL: https://...",
  "metadata": {
    "success": true,
    "action": "upscale",
    "layer": "L1",
    "image": "photo.png",
    "scale": 2,
    "format": "png",
    "outputUrl": "https://...",
    "width": 1920,
    "height": 1080,
    "jobId": null,
    "timestamp": "2025-01-15T12:00:00Z"
  }
}
```

**Error:**

```json
{
  "result": "Error: Provider client required ...",
  "metadata": {
    "success": false,
    "error": {
      "code": "PROVIDER_NOT_CONFIGURED",
      "message": "...",
      "retriable": false
    }
  }
}
```

## Error Codes

| Code                     | Description                                      |
| ------------------------ | ------------------------------------------------ |
| INVALID_ACTION           | The action parameter is missing or not recognized|
| INVALID_INPUT            | A required parameter is missing or malformed     |
| PROVIDER_NOT_CONFIGURED  | No provider or gateway client available          |
| TIMEOUT                  | The request exceeded the configured timeout      |
| UPSTREAM_ERROR           | The upstream image API returned an error         |

## Security Notes

- All image parameters are validated as non-empty strings before processing.
- Scale values are restricted to integers 2-4.
- Format values are restricted to the supported list (png, jpeg, webp).
- Denoise level values are restricted to integers 0-3.
- Job IDs are limited to 100 characters maximum.
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- No API keys or secrets are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- Request timeouts are enforced and capped at 120 seconds maximum.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/image-upscaler/__tests__/handler.test.js
```

The test suite contains 120+ assertions covering action validation, provider configuration, all 5 actions (happy and error paths), input validation, timeout handling, network errors, helper functions, and the validate export.
