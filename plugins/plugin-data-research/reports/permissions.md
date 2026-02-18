# Permissions Report: Data & Research Plugin

**Plugin ID:** `@claw2agent/plugin-data-research`
**Category:** `data-research`
**Skills included:** 18
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `airtable-database` | External API | — | L1 | L1 |
| `apple-health-parser` | External API | `APPLE_HEALTH_PARSER_API_KEY` | L1 | L1 |
| `arxiv-api` | External API | `ARXIV_API_API_KEY` | L1 | L1 |
| `chart-generator` | None / Local | — | L0 | L0 |
| `citation-generator` | None / Local | — | L0 | L0 |
| `data-analyzer` | None / Local | — | L0 | L0 |
| `database-query` | None / Local | — | L2 | L0 |
| `deep-research` | None / Local | — | L0 | L0 |
| `excel-handler` | None / Local | — | L0 | L0 |
| `google-maps-api` | External API | `GOOGLE_MAPS_API_API_KEY` | L1 | L1 |
| `google-trends-api` | External API | `GOOGLE_TRENDS_API_API_KEY` | L1 | L1 |
| `rss-monitor` | None / Local | — | L0 | L0 |
| `semantic-scholar-api` | External API | `SEMANTIC_SCHOLAR_API_API_KEY` | L1 | L1 |
| `tavily-search` | External API | `TAVILY_SEARCH_API_KEY` | L1 | L1 |
| `topic-monitor` | None / Local | — | L0 | L0 |
| `translator-deepl-google` | External API | `TRANSLATOR_DEEPL_GOOGLE_API_KEY` | L1 | L1 |
| `web-scraper` | External API | `WEB_SCRAPER_API_KEY` | L1 | L1 |
| `web-search` | None / Local | — | L0 | L0 |

## Default Policy

- All skills are **disabled by default** until explicitly enabled via `tools.allow`.
- API keys are injected via `providerClient` — never hardcoded.
- Network access is limited to the specific upstream API for each skill.
- No skill in this plugin writes to the local filesystem unless explicitly designed to do so.

## Enabling Skills

```yaml
# openclaw config
tools:
  allow:
    - airtable-database
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
