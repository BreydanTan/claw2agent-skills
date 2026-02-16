# PII Detection & Redaction

Detect and redact personally identifiable information (PII) from text using regex-based pattern matching.

## What it does

This skill scans text for common PII patterns and provides three actions:

- **detect** - Identifies PII in text and returns a list of findings with type, value, and position.
- **redact** - Replaces detected PII with placeholder strings (e.g., `[REDACTED_EMAIL]`).
- **report** - Produces a detailed analysis including counts per type, risk level assessment, and actionable recommendations.

### Supported PII types

| Type | Description | Example |
|------|-------------|---------|
| `EMAIL` | Email addresses | `user@example.com` |
| `PHONE` | US phone numbers | `(555) 123-4567`, `+1-555-123-4567` |
| `SSN` | Social Security Numbers | `123-45-6789` |
| `CREDIT_CARD` | Credit card numbers (Luhn validated) | `4111 1111 1111 1111` |
| `IP_ADDRESS` | IPv4 addresses | `192.168.1.1` |
| `DATE_OF_BIRTH` | Common date formats | `01/15/1990`, `1990-01-15` |

## Commands

### detect

Find PII in text without modifying it.

```json
{
  "action": "detect",
  "text": "Contact john@example.com or call 555-123-4567"
}
```

### redact

Replace PII with placeholder strings.

```json
{
  "action": "redact",
  "text": "My email is john@example.com",
  "replacement": "[REMOVED]"
}
```

### report

Generate a full PII analysis report.

```json
{
  "action": "report",
  "text": "SSN: 123-45-6789, Card: 4111 1111 1111 1111"
}
```

## Config / Secrets

This skill does not require any API keys or external configuration. All processing is performed locally using regex pattern matching.

## Usage examples

### Detect all PII types

```json
{
  "action": "detect",
  "text": "John Doe, email: john@example.com, SSN: 123-45-6789, IP: 192.168.1.100"
}
```

### Detect only specific types

```json
{
  "action": "detect",
  "text": "Email: john@example.com, Phone: 555-123-4567",
  "types": ["EMAIL"]
}
```

### Redact with default placeholders

```json
{
  "action": "redact",
  "text": "Contact us at support@company.com or call (800) 555-1234"
}
```

Result: `"Contact us at [REDACTED_EMAIL] or call [REDACTED_PHONE]"`

### Redact with custom replacement

```json
{
  "action": "redact",
  "text": "Email: user@test.com",
  "replacement": "***"
}
```

Result: `"Email: ***"`

### Generate a risk report

```json
{
  "action": "report",
  "text": "Customer SSN: 123-45-6789, Card: 4111 1111 1111 1111, Email: user@corp.com"
}
```

## Error codes

| Code | Description |
|------|-------------|
| `INVALID_ACTION` | The provided action is not one of: `detect`, `redact`, `report`. |
| `EMPTY_TEXT` | The `text` parameter is missing, empty, or not a string. |
| `NO_PII_FOUND` | No PII was detected (informational, not a failure). |
| `OPERATION_FAILED` | An unexpected error occurred during processing. |

## Security notes

- **This skill processes sensitive data.** Never log detected PII values in production environments.
- All processing happens locally -- no data is sent to external services.
- The `detect` and `report` actions include raw PII values in their output. Handle the response with the same care as the original text.
- Consider redacting text before persisting it to logs, databases, or external systems.
- Credit card detection includes Luhn algorithm validation to reduce false positives.

## Limitations

- **Regex-based detection only.** This skill uses pattern matching, not machine learning. It may miss PII that does not match the predefined patterns (e.g., uncommon formats, names without context).
- **No name detection.** Detecting human names reliably requires NLP/NER models, which are beyond the scope of regex-based matching.
- **US-centric phone and SSN patterns.** Phone number detection is optimized for US formats. International phone numbers and national ID formats from other countries are not supported.
- **False positives possible.** Some numeric sequences may match PII patterns (e.g., a 9-digit number matching SSN format). Validators reduce but do not eliminate false positives.
- **No context awareness.** The skill cannot distinguish between "SSN: 123-45-6789" and a random sequence that happens to look like an SSN.
- **Date of birth detection is broad.** Any date-like pattern will be flagged; the skill cannot determine whether a date is actually a date of birth.

## Test instructions

Run the tests using Node.js built-in test runner:

```bash
node --test skills/pii-redaction/__tests__/handler.test.js
```

Or run with the standard assertion-based approach:

```bash
node skills/pii-redaction/__tests__/handler.test.js
```

The test suite covers:

- Detection of each PII type individually
- Mixed content with multiple PII types
- Redaction with default and custom replacement strings
- Report generation with risk level assessment
- Edge cases (empty text, invalid action, type filtering, no PII found)
- Luhn validation for credit card numbers
