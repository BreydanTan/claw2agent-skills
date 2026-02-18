# Permissions Report: Productivity Plugin

**Plugin ID:** `@claw2agent/plugin-productivity`
**Category:** `productivity`
**Skills included:** 14
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `calendar-manager` | None / Local | — | L0 | L0 |
| `excel-api` | None / Local | — | L0 | L0 |
| `google-calendar-api` | External API | `GOOGLE_CALENDAR_API_API_KEY` | L1 | L1 |
| `jira-manager` | External API | — | L1 | L1 |
| `language-tutor` | None / Local | — | L0 | L0 |
| `linear-tracker` | External API | — | L1 | L1 |
| `markdown-writer` | None / Local | — | L0 | L0 |
| `meeting-summarizer` | None / Local | — | L0 | L0 |
| `notion-api` | External API | `NOTION_API_API_KEY` | L1 | L1 |
| `notion-integration` | External API | — | L1 | L1 |
| `pptx-generator` | None / Local | — | L0 | L0 |
| `remind-me` | None / Local | — | L0 | L0 |
| `todoist-manager` | External API | — | L1 | L1 |
| `trello-manager` | External API | — | L1 | L1 |

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
    - calendar-manager
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
