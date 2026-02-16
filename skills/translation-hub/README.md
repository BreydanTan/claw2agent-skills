# Translation Hub

Translate text between languages using configurable translation providers. Supports language detection, batch translation, and listing supported languages.

## Overview

Translation Hub provides a unified interface for text translation powered by LibreTranslate. It supports single text translation, automatic language detection, batch translation of multiple texts, and querying the list of supported languages.

## Actions

### translate

Translate a single text from a source language to a target language.

**Parameters:**

| Parameter | Type   | Required | Default | Description                          |
|-----------|--------|----------|---------|--------------------------------------|
| action    | string | Yes      |         | Must be `"translate"`                |
| text      | string | Yes      |         | Text to translate (max 5000 chars)   |
| from      | string | No       | `"auto"`| Source language code (ISO 639-1)     |
| to        | string | Yes      |         | Target language code (ISO 639-1)     |

**Example:**

```json
{
  "action": "translate",
  "text": "Hello, world!",
  "from": "en",
  "to": "es"
}
```

### detect

Detect the language of the given text. Returns the top 3 candidates with confidence scores.

**Parameters:**

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| action    | string | Yes      | Must be `"detect"`                   |
| text      | string | Yes      | Text to detect language of           |

**Example:**

```json
{
  "action": "detect",
  "text": "Bonjour le monde"
}
```

### batch

Translate multiple texts to the same target language. Maximum 10 texts per batch.

**Parameters:**

| Parameter | Type     | Required | Default | Description                            |
|-----------|----------|----------|---------|----------------------------------------|
| action    | string   | Yes      |         | Must be `"batch"`                      |
| texts     | string[] | Yes      |         | Array of texts to translate (max 10)   |
| from      | string   | No       | `"auto"`| Source language code (ISO 639-1)       |
| to        | string   | Yes      |         | Target language code (ISO 639-1)       |

**Example:**

```json
{
  "action": "batch",
  "texts": ["Hello", "Goodbye", "Thank you"],
  "from": "en",
  "to": "fr"
}
```

### languages

List all languages supported by the translation provider.

**Parameters:**

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| action    | string | Yes      | Must be `"languages"`                |

**Example:**

```json
{
  "action": "languages"
}
```

## Configuration

| Key       | Default                       | Description                            |
|-----------|-------------------------------|----------------------------------------|
| provider  | `"libre"`                     | Translation provider backend           |
| baseUrl   | `"https://libretranslate.com"`| Base URL for the LibreTranslate API    |

An API key can be provided via `context.apiKey` or `context.config.apiKey`. The public LibreTranslate instance may work without a key for limited usage.

## Error Codes

| Code               | Description                                           |
|--------------------|-------------------------------------------------------|
| INVALID_ACTION     | The action parameter is missing or not recognized     |
| MISSING_TEXT       | Required text or texts parameter is missing or empty  |
| MISSING_TARGET_LANG| The target language code (to) is missing              |
| TEXT_TOO_LONG      | Input text exceeds the 5000 character limit            |
| BATCH_TOO_LARGE    | Batch contains more than 10 texts                     |
| PROVIDER_ERROR     | The translation provider returned an error            |
| TIMEOUT            | The request to the provider timed out (30s limit)     |

## Limits

- Maximum text length: 5000 characters per text
- Maximum batch size: 10 texts per batch request
- Request timeout: 30 seconds per API call

## Tags

`translation`, `language`, `i18n`, `localization`, `multilingual`
