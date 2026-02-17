# Whisper Transcribe Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

OpenAI Whisper speech-to-text transcription skill. Transcribe audio, translate to English, detect language, and list supported models and response formats.

## Actions

### `transcribe`

Transcribe audio to text.

| Parameter      | Type   | Required | Default     | Description                                              |
| -------------- | ------ | -------- | ----------- | -------------------------------------------------------- |
| file           | string | Yes      | --          | Audio file URL or path                                   |
| model          | string | No       | `whisper-1` | Model identifier                                         |
| language       | string | No       | --          | ISO 639-1 two-letter language code (e.g. `en`, `fr`)    |
| responseFormat | string | No       | `json`      | One of: json, text, srt, vtt, verbose_json               |
| prompt         | string | No       | --          | Optional context hint for transcription (max 500 chars)  |

### `translate`

Translate audio to English text.

| Parameter | Type   | Required | Default     | Description              |
| --------- | ------ | -------- | ----------- | ------------------------ |
| file      | string | Yes      | --          | Audio file URL or path   |
| model     | string | No       | `whisper-1` | Model identifier         |

### `detect_language`

Detect the language of audio using verbose_json transcription.

| Parameter | Type   | Required | Default     | Description              |
| --------- | ------ | -------- | ----------- | ------------------------ |
| file      | string | Yes      | --          | Audio file URL or path   |
| model     | string | No       | `whisper-1` | Model identifier         |

### `list_models`

List available Whisper models with their capabilities. This action is local and does not require an API client.

### `list_formats`

List supported response formats with descriptions. This action is local and does not require an API client.

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 60 seconds, maximum 120 seconds.
- **Input validation.** All parameters are validated and sanitized before use.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Transcription Result\nLanguage: en\n...",
  "metadata": {
    "success": true,
    "action": "transcribe",
    "layer": "L1",
    "model": "whisper-1",
    "language": "en",
    "duration": 5.2,
    "responseFormat": "json",
    "textLength": 42,
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
node --test skills/whisper-transcribe/__tests__/handler.test.js
```

The test suite contains 80+ assertions across 20 describe blocks covering action validation, provider configuration, input validation, timeout handling, network errors, helper functions, endpoint routing, and request body verification.
