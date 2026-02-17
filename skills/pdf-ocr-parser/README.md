# PDF OCR Parser Skill

**Layer 1 (L1)** -- Standard model API, BYOK possible.

Parse PDFs and images via OCR provider client for text extraction, table extraction, and metadata retrieval.

## Actions

### `parse_pdf`

Parse a PDF file and extract text via OCR.

| Parameter | Type   | Required | Default | Description                                      |
| --------- | ------ | -------- | ------- | ------------------------------------------------ |
| file      | string | Yes      | --      | File URL or path                                 |
| pages     | string | No       | `all`   | Pages to process: "all", single number, or range |
| language  | string | No       | `eng`   | OCR language (ISO 639-1 code)                    |

**Endpoint:** `POST /ocr/pdf` body: `{ file, pages, language }`

### `parse_image`

OCR an image file to extract text.

| Parameter | Type   | Required | Default | Description                   |
| --------- | ------ | -------- | ------- | ----------------------------- |
| file      | string | Yes      | --      | File URL or path              |
| language  | string | No       | `eng`   | OCR language (ISO 639-1 code) |

**Endpoint:** `POST /ocr/image` body: `{ file, language }`

### `extract_tables`

Extract tables from a PDF file.

| Parameter | Type   | Required | Default | Description                                      |
| --------- | ------ | -------- | ------- | ------------------------------------------------ |
| file      | string | Yes      | --      | File URL or path                                 |
| pages     | string | No       | `all`   | Pages to process: "all", single number, or range |

**Endpoint:** `POST /ocr/tables` body: `{ file, pages }`

### `get_metadata`

Get PDF metadata (title, author, pages, etc).

| Parameter | Type   | Required | Default | Description      |
| --------- | ------ | -------- | ------- | ---------------- |
| file      | string | Yes      | --      | File URL or path |

**Endpoint:** `POST /ocr/metadata` body: `{ file }`

### `list_languages`

List supported OCR languages. Returns local data, no API call required.

No parameters required.

**Supported languages:** eng, fra, deu, spa, ita, por, nld, pol, rus, jpn, kor, zho, ara, hin, tha, vie

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Timeout enforcement.** Default 30 seconds, maximum 120 seconds.
- **Input validation.** All parameters are validated and sanitized before use. Files must be non-empty strings, pages must follow valid format, languages must be from the supported list.
- **Secret redaction.** Tokens and API keys are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "PDF OCR Result\nFile: document.pdf\nPages: all\nLanguage: eng\n\nExtracted text...",
  "metadata": {
    "success": true,
    "action": "parse_pdf",
    "layer": "L1",
    "file": "document.pdf",
    "pages": "all",
    "language": "eng",
    "pageCount": 5,
    "text": "Extracted text...",
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
| UPSTREAM_ERROR           | The upstream OCR API returned an error            |

## Security Notes

- All file parameters are validated as non-empty strings before processing.
- Pages parameters are validated to prevent injection (only "all", digits, or digit-digit ranges accepted).
- Language codes are restricted to the supported list of 2-3 letter ISO codes.
- All output strings are scanned for sensitive patterns (API keys, tokens, passwords) and redacted before returning.
- No API keys or secrets are stored or accessed directly by this skill; all credentials are managed by the platform adapter.
- Request timeouts are enforced and capped at 120 seconds maximum.

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/pdf-ocr-parser/__tests__/handler.test.js
```

The test suite contains 80+ assertions covering action validation, provider configuration, all 5 actions (happy and error paths), input validation, timeout handling, network errors, helper functions, and the validate export.
