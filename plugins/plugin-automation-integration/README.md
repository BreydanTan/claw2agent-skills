# Automation & Integration Plugin

Skills for Zapier, webhooks, Playwright browser automation, and workflow scheduling.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-automation-integration
```

## Included Skills (3)

- [`playwright`](../../skills/playwright/SKILL.md) — Browser automation via provider client. Navigate pages, take screenshots, extract text and links, fill forms, and evaluate JavaScript snippets. Layer 1 skill using provider client for browser access. HIGH RISK: URL allowlist enforced, no arbitrary code execution.
- [`scheduler`](../../skills/scheduler/SKILL.md) — Schedule, list, and manage recurring or one-off tasks using cron-like expressions. Tasks are stored in-memory and executed via setTimeout intervals.
- [`webhook-receiver`](../../skills/webhook-receiver/SKILL.md) — Register, manage, and inspect incoming webhook endpoints. Store received webhook payloads for later inspection and processing.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
