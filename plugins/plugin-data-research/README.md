# Data & Research Plugin

Skills for web search, data analysis, academic research, charts, databases, and translation.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-data-research
```

## Included Skills (18)

- [`airtable-database`](../../skills/airtable-database/SKILL.md) — Manage Airtable bases, tables, and records via the Airtable REST API. List bases, list tables, create/read/update/delete records, search with formulas, and bulk-create records. Uses injected provider client for API access (BYOK).
- [`apple-health-parser`](../../skills/apple-health-parser/SKILL.md) — Parse and analyze Apple Health export data.
- [`arxiv-api`](../../skills/arxiv-api/SKILL.md) — Search and retrieve academic papers from arXiv.
- [`chart-generator`](../../skills/chart-generator/SKILL.md) — Create and manage chart configurations for data visualization
- [`citation-generator`](../../skills/citation-generator/SKILL.md) — Generate and manage academic citations in multiple formats (APA, MLA, Chicago, BibTeX).
- [`data-analyzer`](../../skills/data-analyzer/SKILL.md) — Analyze JSON data arrays with operations like summary, average, count, filter, sort, and groupBy. Parses JSON input and performs statistical and structural analysis on datasets.
- [`database-query`](../../skills/database-query/SKILL.md) — Execute database queries through the platform gateway. Supports read-only queries, write operations with confirmation, table inspection, and query plan analysis. All queries are routed through the gateway client - no direct database connections.
- [`deep-research`](../../skills/deep-research/SKILL.md) — Conduct multi-step research on any topic using DuckDuckGo. Generates search queries, fetches results, and compiles structured reports with summaries, key findings, and sources.
- [`excel-handler`](../../skills/excel-handler/SKILL.md) — Read, write, and analyze CSV files. Supports parsing CSV to JSON, converting JSON data to CSV format, and computing basic statistics on CSV datasets.
- [`google-maps-api`](../../skills/google-maps-api/SKILL.md) — Geocode addresses, search places, and calculate routes via Google Maps.
- [`google-trends-api`](../../skills/google-trends-api/SKILL.md) — Access Google Trends data for keyword research and trend analysis.
- [`rss-monitor`](../../skills/rss-monitor/SKILL.md) — Subscribe to, fetch, and monitor RSS/Atom feeds. Parse feed entries, track new items, and filter by keywords.
- [`semantic-scholar-api`](../../skills/semantic-scholar-api/SKILL.md) — Search academic papers, get citations, and find related work via Semantic Scholar.
- [`tavily-search`](../../skills/tavily-search/SKILL.md) — Web search and content extraction powered by Tavily API. Supports general search, news, images, academic papers, code repositories, direct answers, content extraction, and batch search.
- [`topic-monitor`](../../skills/topic-monitor/SKILL.md) — Monitor topics and keywords across web sources. Set up keyword watches, track mentions, and get alerts when new content matches your topics.
- [`translator-deepl-google`](../../skills/translator-deepl-google/SKILL.md) — Text translation and language detection via provider client
- [`web-scraper`](../../skills/web-scraper/SKILL.md) — Web scraping and content extraction via provider client. Fetch pages, extract text, links, metadata, structured data, and HTML tables using cheerio-based approach. Layer 1 skill using provider client for web access.
- [`web-search`](../../skills/web-search/SKILL.md) — Search the web using DuckDuckGo. Returns relevant search results with titles, URLs, and snippets. No API key required.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
