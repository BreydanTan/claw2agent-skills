# Translator (DeepL/Google)

**Layer 1 Skill** - Text translation and language detection via provider client.

## Overview

This skill provides text translation, language detection, batch translation, usage tracking, and glossary management through an injected provider client. It follows the L1 pattern: no hardcoded API URLs or keys, all external access goes through `providerClient` or `gatewayClient`.

## Actions

| Action | Description | Required Params |
|--------|-------------|-----------------|
| `translate` | Translate text to a target language | `text`, `target_lang` |
| `detect_language` | Detect the language of text | `text` |
| `translate_batch` | Translate multiple texts at once | `texts`, `target_lang` |
| `get_usage` | Get translation API usage/quota | _(none)_ |
| `list_languages` | List supported languages (local, no API call) | _(none)_ |
| `get_glossaries` | List available glossaries | _(none)_ |

## Parameters

- **text** (string): Text to translate or detect. Max 10,000 chars for translate, 5,000 for detect.
- **texts** (array of strings): Array of texts for batch translation. Max 50 items, each max 5,000 chars.
- **source_lang** (string, optional): Source language code (2-5 letters). Auto-detected if omitted.
- **target_lang** (string): Target language code (2-5 letters). Required for translate and translate_batch.
- **formality** (string, optional): One of `default`, `more`, `less`. Controls formality of translation output.

## Supported Languages

en, de, fr, es, it, pt, nl, pl, ru, ja, ko, zh, ar, hi, sv, da, fi, nb, el, cs, ro, hu, tr, id, th, vi, uk

## Usage

```js
import { execute } from './handler.js';

// Translate text
const result = await execute(
  { action: 'translate', text: 'Hello world', target_lang: 'de' },
  { providerClient: myClient }
);

// Detect language
const detected = await execute(
  { action: 'detect_language', text: 'Bonjour le monde' },
  { providerClient: myClient }
);

// Batch translate
const batch = await execute(
  { action: 'translate_batch', texts: ['Hello', 'Goodbye'], target_lang: 'fr' },
  { providerClient: myClient }
);

// List supported languages (no client needed)
const langs = await execute({ action: 'list_languages' }, {});
```

## Testing

```bash
node --test skills/translator-deepl-google/__tests__/handler.test.js
```
