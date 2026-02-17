# Speech to Text Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Transcribe audio to text with language detection, timestamps, and multiple format support. Compatible with Whisper-style APIs.

## Actions

### `transcribe`

Transcribe audio to text.

| Parameter      | Type   | Required | Default      | Description                                           |
| -------------- | ------ | -------- | ------------ | ----------------------------------------------------- |
| audioUrl       | string | *        | --           | HTTP(S) URL of the audio file                         |
| audioData      | string | *        | --           | Base64-encoded audio data                             |
| language       | string | No       | auto         | ISO 639-1 language code (e.g. `en`, `fr`, `de`)      |
| model          | string | No       | `whisper-1`  | Model identifier                                      |
| responseFormat | string | No       | `json`       | One of: json, text, srt, vtt                          |
| prompt         | string | No       | --           | Optional context prompt to guide transcription        |

\* Either `audioUrl` or `audioData` is required.

### `translate`

Translate audio to English text. Always translates to English regardless of source language.

| Parameter      | Type   | Required | Default      | Description                                           |
| -------------- | ------ | -------- | ------------ | ----------------------------------------------------- |
| audioUrl       | string | *        | --           | HTTP(S) URL of the audio file                         |
| audioData      | string | *        | --           | Base64-encoded audio data                             |
| model          | string | No       | `whisper-1`  | Model identifier                                      |
| responseFormat | string | No       | `json`       | One of: json, text, srt, vtt                          |

### `detect_language`

Detect the language of audio content.

| Parameter | Type   | Required | Default      | Description                                 |
| --------- | ------ | -------- | ------------ | ------------------------------------------- |
| audioUrl  | string | *        | --           | HTTP(S) URL of the audio file               |
| audioData | string | *        | --           | Base64-encoded audio data                   |
| model     | string | No       | `whisper-1`  | Model identifier                            |

### `transcribe_with_timestamps`

Transcribe audio with word-level or segment-level timestamps.

| Parameter   | Type   | Required | Default      | Description                                    |
| ----------- | ------ | -------- | ------------ | ---------------------------------------------- |
| audioUrl    | string | *        | --           | HTTP(S) URL of the audio file                  |
| audioData   | string | *        | --           | Base64-encoded audio data                      |
| language    | string | No       | auto         | ISO 639-1 language code                        |
| model       | string | No       | `whisper-1`  | Model identifier                               |
| granularity | string | No       | `segment`    | `word` or `segment`                            |

### `list_languages`

List all supported languages. This action is local and does not require an API client.

### `list_models`

List available speech-to-text models with their capabilities. This action is local and does not require an API client.

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
  "result": "Transcription Result\nLanguage: en\nDuration: 5.2s\n...",
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
node --test skills/speech-to-text/__tests__/handler.test.js
```

The test suite contains 80+ assertions across 21 describe blocks covering action validation, provider configuration, input validation, timeout handling, network errors, helper functions, endpoint routing, and request body verification.
