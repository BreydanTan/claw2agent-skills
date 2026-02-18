# Communication Plugin

Skills for Discord, Slack, Telegram, SMS, and email communication.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-communication
```

## Included Skills (5)

- [`discord-bot`](../../skills/discord-bot/SKILL.md) — Interact with the Discord API to send messages, get channel info, and list available channels in a guild.
- [`email-sender`](../../skills/email-sender/SKILL.md) — Send emails using the Resend API. Supports sending plain text emails with customizable sender, recipient, subject, and body. Requires a Resend API key.
- [`slack-integration`](../../skills/slack-integration/SKILL.md) — Interact with Slack workspaces via the Slack API. Send messages, manage channels, list messages, add reactions, and invite users. Uses injected provider client for API access (BYOK).
- [`sms-sender-twilio`](../../skills/sms-sender-twilio/SKILL.md) — Send SMS/MMS messages, retrieve message details, list messages, get account info, and look up phone numbers via Twilio API. Layer 1 skill using provider client for API access.
- [`telegram-bot`](../../skills/telegram-bot/SKILL.md) — Interact with the Telegram Bot API to send messages, get updates, and retrieve bot information.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
