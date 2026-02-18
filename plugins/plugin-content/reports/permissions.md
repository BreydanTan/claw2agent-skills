# Permissions Report: Content Plugin

**Plugin ID:** `@claw2agent/plugin-content`
**Category:** `content`
**Skills included:** 13
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `crm-api-salesforce-hubspot` | External API | `CRM_API_SALESFORCE_HUBSPOT_API_KEY` | L1 | L1 |
| `crm-connector` | External API | `CRM_CONNECTOR_API_KEY` | L1 | L1 |
| `email-validator` | External API | `EMAIL_VALIDATOR_API_KEY` | L1 | L1 |
| `i18n-tool` | External API | `I18N_TOOL_API_KEY` | L1 | L1 |
| `outlook-microsoft-graph-api` | External API | `OUTLOOK_MICROSOFT_GRAPH_API_API_KEY` | L1 | L1 |
| `pdf-compare` | External API | `PDF_COMPARE_API_KEY` | L1 | L1 |
| `pdf-ocr-parser` | External API | `PDF_OCR_PARSER_API_KEY` | L1 | L1 |
| `pdf-reader` | None / Local | — | L0 | L0 |
| `podcast-index-api` | External API | `PODCAST_INDEX_API_API_KEY` | L1 | L1 |
| `seo-optimizer` | External API | `SEO_OPTIMIZER_API_KEY` | L1 | L1 |
| `wordpress-rest-api` | External API | `WORDPRESS_REST_API_API_KEY` | L1 | L1 |
| `youtube-analyzer` | External API | — | L1 | L1 |
| `zapier-bridge` | External API | `ZAPIER_BRIDGE_API_KEY` | L1 | L1 |

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
    - crm-api-salesforce-hubspot
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
