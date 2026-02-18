# Permissions Report: Automation & Integration Plugin

**Plugin ID:** `@claw2agent/plugin-automation-integration`
**Category:** `automation-integration`
**Skills included:** 3
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `playwright` | External API | `PLAYWRIGHT_API_KEY` | L1 | L1 |
| `scheduler` | None / Local | — | L0 | L0 |
| `webhook-receiver` | None / Local | — | L0 | L0 |

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
    - playwright
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
