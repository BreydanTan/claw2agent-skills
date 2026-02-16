# Image Generation Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Generate images from text prompts, create variations of existing images, edit images with text instructions, and list available image generation models.

## Actions

### `generate`

Generate one or more images from a text prompt.

| Parameter | Type   | Required | Default      | Description                                             |
| --------- | ------ | -------- | ------------ | ------------------------------------------------------- |
| prompt    | string | Yes      | --           | Text description of the desired image                   |
| model     | string | No       | `dall-e-3`   | Model identifier                                        |
| size      | string | No       | `1024x1024`  | One of: 256x256, 512x512, 1024x1024, 1024x1792, 1792x1024 |
| quality   | string | No       | `standard`   | `standard` or `hd`                                      |
| style     | string | No       | `vivid`      | `vivid` or `natural`                                    |
| n         | number | No       | `1`          | Number of images to generate (1--4)                     |

### `variations`

Generate variations of an existing image.

| Parameter | Type   | Required | Default      | Description                         |
| --------- | ------ | -------- | ------------ | ----------------------------------- |
| imageUrl  | string | Yes      | --           | HTTP(S) URL of the source image     |
| model     | string | No       | `dall-e-3`   | Model identifier                    |
| size      | string | No       | `1024x1024`  | Image size                          |
| n         | number | No       | `1`          | Number of variations (1--4)         |

### `edit`

Edit an existing image using a text prompt and optional mask.

| Parameter | Type   | Required | Default      | Description                                           |
| --------- | ------ | -------- | ------------ | ----------------------------------------------------- |
| imageUrl  | string | Yes      | --           | HTTP(S) URL of the source image                       |
| prompt    | string | Yes      | --           | Text describing the edit to apply                     |
| mask      | string | No       | --           | HTTP(S) URL of a mask image (transparent = edit area) |
| model     | string | No       | `dall-e-3`   | Model identifier                                      |
| size      | string | No       | `1024x1024`  | Image size                                            |

### `list_models`

List available image generation models with their capabilities. This action is local and does not require an API client.

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.fetch()` (preferred) or `context.gatewayClient.fetch()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 60 seconds, maximum 120 seconds.
- **Input validation.** All parameters are validated and sanitized before use.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Generated 1 image(s)\nModel: dall-e-3\n...",
  "metadata": {
    "success": true,
    "action": "generate",
    "layer": "L1",
    "model": "dall-e-3",
    "images": ["https://..."],
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

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/image-generation/__tests__/handler.test.js
```

The test suite contains 60+ assertions across 15 describe blocks covering action validation, provider configuration, input validation, timeout handling, network errors, helper functions, and endpoint routing.
