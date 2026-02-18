# PDF Reader [L0]

Read and extract text content from PDF files. Uses raw buffer parsing to find text between BT/ET markers and decode stream objects without external dependencies.

## Actions

_See handler.js for available actions._

## Testing

```bash
node --test skills/pdf-reader/__tests__/handler.test.js
```
