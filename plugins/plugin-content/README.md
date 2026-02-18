# Content Plugin

Skills for content creation, document handling, email validation, SEO, and CRM integrations.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-content
```

## Included Skills (13)

- [`crm-api-salesforce-hubspot`](../../skills/crm-api-salesforce-hubspot/SKILL.md) — Unified CRM access for Salesforce and HubSpot — manage contacts, deals, and pipelines.
- [`crm-connector`](../../skills/crm-connector/SKILL.md) — Manage CRM contacts, leads, and activity logs via provider client. Supports Salesforce/HubSpot-style operations through injected client.
- [`email-validator`](../../skills/email-validator/SKILL.md) — Validate email addresses and check deliverability.
- [`i18n-tool`](../../skills/i18n-tool/SKILL.md) — Manage internationalization keys, translations, and locale files.
- [`outlook-microsoft-graph-api`](../../skills/outlook-microsoft-graph-api/SKILL.md) — Send emails, manage inbox, and handle calendar events via Microsoft Graph API.
- [`pdf-compare`](../../skills/pdf-compare/SKILL.md) — Compare two PDF documents and highlight differences.
- [`pdf-ocr-parser`](../../skills/pdf-ocr-parser/SKILL.md) — Parse PDFs and images via OCR provider client for text extraction, table extraction, and metadata retrieval. Layer 1 skill using provider client for API access.
- [`pdf-reader`](../../skills/pdf-reader/SKILL.md) — Read and extract text content from PDF files. Uses raw buffer parsing to find text between BT/ET markers and decode stream objects without external dependencies.
- [`podcast-index-api`](../../skills/podcast-index-api/SKILL.md) — Search podcasts, get episode data, and trending feeds via Podcast Index.
- [`seo-optimizer`](../../skills/seo-optimizer/SKILL.md) — Analyze and optimize web pages for search engine rankings.
- [`wordpress-rest-api`](../../skills/wordpress-rest-api/SKILL.md) — Manage WordPress posts, pages, and media via REST API.
- [`youtube-analyzer`](../../skills/youtube-analyzer/SKILL.md) — Analyze YouTube videos, channels, and playlists. Get video details, search content, list comments, retrieve transcripts, browse playlists, and calculate engagement metrics. Uses injected provider client for API access (BYOK).
- [`zapier-bridge`](../../skills/zapier-bridge/SKILL.md) — Manage and trigger Zapier Zaps, list executions, and check Zap status via provider client. Layer 1 skill using provider client for API access.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
