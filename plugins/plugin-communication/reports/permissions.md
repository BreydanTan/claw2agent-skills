# Permissions Report: Communication Plugin

**Plugin ID:** `@claw2agent/plugin-communication`
**Category:** `communication`
**Skills included:** 5
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `discord-bot` | None / Local | `DISCORD_BOT_API_KEY` | L0 | L0 |
| `email-sender` | None / Local | `EMAIL_SENDER_API_KEY` | L0 | L0 |
| `slack-integration` | External API | — | L1 | L1 |
| `sms-sender-twilio` | External API | `SMS_SENDER_TWILIO_API_KEY` | L1 | L1 |
| `telegram-bot` | None / Local | `TELEGRAM_BOT_API_KEY` | L0 | L0 |

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
    - discord-bot
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
