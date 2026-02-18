# Permissions Report: Utilities & Knowledge Plugin

**Plugin ID:** `@claw2agent/plugin-utilities-knowledge`
**Category:** `utilities-knowledge`
**Skills included:** 11
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `binance-api` | External API | — | L1 | L1 |
| `coinbase-api` | External API | — | L1 | L1 |
| `etherscan-api` | External API | — | L1 | L1 |
| `file-manager` | None / Local | — | L0 | L0 |
| `knowledge-base` | None / Local | — | L0 | L0 |
| `memory-manager` | None / Local | — | L0 | L0 |
| `note-taking` | None / Local | — | L0 | L0 |
| `price-drop-monitor` | External API | — | L1 | L1 |
| `speech-to-text` | External API | — | L1 | L1 |
| `spreadsheet-analyzer` | None / Local | — | L0 | L0 |
| `voice-synthesizer` | External API | — | L1 | L1 |

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
    - binance-api
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
