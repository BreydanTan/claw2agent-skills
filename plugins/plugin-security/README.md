# Security Plugin

Skills for PII redaction, guard agents, and security-focused automation.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-security
```

## Included Skills (2)

- [`guard-agent`](../../skills/guard-agent/SKILL.md) — Scan text, prompts, URLs, and configurations for security threats. Detects injection attacks, prompt injection, sensitive data exposure, malicious URLs, and insecure configurations.
- [`pii-redaction`](../../skills/pii-redaction/SKILL.md) — Detect and redact personally identifiable information (PII) from text. Supports emails, phone numbers, SSNs, credit cards, IP addresses, and more.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
