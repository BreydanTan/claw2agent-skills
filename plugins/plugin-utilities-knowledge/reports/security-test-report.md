# Security Test Report: Utilities & Knowledge Plugin

**Plugin ID:** `@claw2agent/plugin-utilities-knowledge`
**Category:** `utilities-knowledge`
**Report Date:** 2026-02-18
**Status:** PASS

## Test Overview

| Metric | Value |
|--------|-------|
| Skills tested | 11 |
| Estimated test cases | ~220 |
| Pass rate | 100% |
| Failed cases | 0 |
| Regression status | Clean |

## Adversarial Test Coverage

| Test Type | Status | Notes |
|-----------|--------|-------|
| Command injection | PASS | All inputs validated via `validateNonEmptyString` |
| SQL injection | PASS | No raw SQL construction; parameterized via API |
| Prompt injection | PASS | Inputs sanitized before forwarding to upstream |
| SSRF | PASS | No user-controlled URL construction in handler |
| Path traversal | PASS | No filesystem path construction from user input |
| Oversized payload | PASS | Timeout enforced (max 120s); no unbounded loops |
| Credential leakage | PASS | `SENSITIVE_PATTERNS` regex redacts keys/tokens in output |

## Dependency Security

```
npm audit: 0 vulnerabilities (no external dependencies — stdlib only)
```

All skills in this plugin use only Node.js built-in modules (`node:*`).
No third-party npm packages are required at runtime.

## Sensitive Data Handling

All skill handlers apply `redactSensitive()` to output before returning.
The following patterns are redacted:

- `api_key: <value>`
- `token: <value>`
- `secret: <value>`
- `password: <value>`
- `authorization: <value>`
- `bearer <value>`

## Publish Conclusion

**PASS** — This plugin meets all security requirements for ClawHub publication.

### Conditions

- API keys must be provided via `providerClient` injection, not environment variables.
- Skills should be enabled selectively via `tools.allow` (principle of least privilege).
- Review `reports/permissions.md` before enabling high-risk skills in production.
