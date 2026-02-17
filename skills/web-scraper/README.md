# Web Scraper Skill

**Layer:** L1 (API-dependent)
**Category:** Data
**Version:** 1.0.0

## Description

Web scraping and content extraction via provider client. Fetch HTML pages, extract text content, links, page metadata (title, description, Open Graph tags), structured data using CSS selectors, and HTML tables using a cheerio-based approach through the provider adapter.

## Actions

| Action | Description | Required Params | Optional Params |
|--------|-------------|-----------------|-----------------|
| `fetch_page` | Fetch raw HTML content of a URL | `url` | `headers` |
| `extract_text` | Extract text content from a page | `url` | `selector` |
| `extract_links` | Extract all links from a page | `url` | `limit` |
| `extract_metadata` | Extract page metadata (title, description, OG tags) | `url` | - |
| `extract_structured` | Extract structured data using CSS selectors | `url`, `selectors` | - |
| `extract_tables` | Extract HTML tables from a page | `url` | `tableIndex` |

## Security

- **URL validation:** Only `http://` and `https://` protocols are permitted
- **Blocked protocols:** `file://`, `javascript:`, `data:`, `ftp://` (case-insensitive)
- **Selector validation:** Maximum 500 characters, no `<script>` tags allowed
- **Content length:** Maximum 10MB response size
- **Input sanitization:** All inputs are validated and sanitized
- **Token redaction:** Sensitive patterns (API keys, tokens, passwords) are redacted from output

## Configuration

| Setting | Default | Maximum | Description |
|---------|---------|---------|-------------|
| `timeoutMs` | 30000 | 120000 | Request timeout in milliseconds |

## Usage Examples

### Fetch a page
```json
{
  "action": "fetch_page",
  "url": "https://example.com"
}
```

### Extract text with CSS selector
```json
{
  "action": "extract_text",
  "url": "https://example.com",
  "selector": ".main-content"
}
```

### Extract links with limit
```json
{
  "action": "extract_links",
  "url": "https://example.com",
  "limit": 50
}
```

### Extract page metadata
```json
{
  "action": "extract_metadata",
  "url": "https://example.com"
}
```

### Extract structured data
```json
{
  "action": "extract_structured",
  "url": "https://example.com/products",
  "selectors": [
    { "name": "title", "selector": "h1.product-title" },
    { "name": "price", "selector": ".price", "attribute": "data-value" },
    { "name": "image", "selector": "img.product-image", "attribute": "src" }
  ]
}
```

### Extract a table
```json
{
  "action": "extract_tables",
  "url": "https://example.com/data",
  "tableIndex": 0
}
```

## Provider Client

This skill requires a configured provider client or gateway client. It does not make direct API calls or use hardcoded endpoints. All web requests are routed through the injected client adapter.
