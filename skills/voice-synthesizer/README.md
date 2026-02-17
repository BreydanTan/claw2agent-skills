# Voice Synthesizer Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Convert text to speech with multiple voices, languages, speed control, and audio format selection.

## Actions

### `synthesize`

Convert text to speech audio.

| Parameter      | Type   | Required | Default   | Description                                          |
| -------------- | ------ | -------- | --------- | ---------------------------------------------------- |
| text           | string | Yes      | --        | Text to convert to speech (max 4096 characters)      |
| voice          | string | No       | `alloy`   | One of: alloy, echo, fable, onyx, nova, shimmer      |
| model          | string | No       | `tts-1`   | Model identifier                                     |
| speed          | number | No       | `1.0`     | Speed multiplier (0.25 -- 4.0)                       |
| responseFormat | string | No       | `mp3`     | One of: mp3, opus, aac, flac, wav                    |

### `list_voices`

List available voices with descriptions and gender information. This action is local and does not require an API client.

### `list_languages`

List supported languages for text-to-speech. This action is local and does not require an API client.

### `estimate_duration`

Estimate audio duration from text without making an API call.

| Parameter | Type   | Required | Default | Description                    |
| --------- | ------ | -------- | ------- | ------------------------------ |
| text      | string | Yes      | --      | Text to estimate duration for  |
| speed     | number | No       | `1.0`   | Speed multiplier (0.25 -- 4.0) |

### `synthesize_ssml`

Synthesize speech from SSML (Speech Synthesis Markup Language) input.

| Parameter      | Type   | Required | Default   | Description                                      |
| -------------- | ------ | -------- | --------- | ------------------------------------------------ |
| ssml           | string | Yes      | --        | SSML input (must contain `<speak>` tags)         |
| voice          | string | No       | `alloy`   | Voice identifier                                 |
| model          | string | No       | `tts-1`   | Model identifier                                 |
| responseFormat | string | No       | `mp3`     | Output audio format                              |

### `batch_synthesize`

Synthesize multiple texts in a single batch operation (max 5 items).

| Parameter      | Type   | Required | Default   | Description                                          |
| -------------- | ------ | -------- | --------- | ---------------------------------------------------- |
| items          | array  | Yes      | --        | Array of objects with {text, voice, speed}           |
| model          | string | No       | `tts-1`   | Model identifier                                     |
| responseFormat | string | No       | `mp3`     | Output audio format                                  |

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
  "result": "Speech synthesized successfully\nVoice: alloy | Model: tts-1\n...",
  "metadata": {
    "success": true,
    "action": "synthesize",
    "layer": "L1",
    "model": "tts-1",
    "voice": "alloy",
    "audioUrl": "https://...",
    "durationSeconds": 5.2,
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
node --test skills/voice-synthesizer/__tests__/handler.test.js
```

The test suite contains 80+ assertions across multiple describe blocks covering action validation, provider configuration, input validation, timeout handling, network errors, helper functions, and endpoint routing.
