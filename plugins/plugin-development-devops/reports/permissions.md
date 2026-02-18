# Permissions Report: Development & DevOps Plugin

**Plugin ID:** `@claw2agent/plugin-development-devops`
**Category:** `development-devops`
**Skills included:** 14
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `code-interpreter` | None / Local | — | L0 | L0 |
| `code-sandbox-e2b` | External API | `CODE_SANDBOX_E2B_API_KEY` | L1 | L2 |
| `coding-agent` | None / Local | — | L0 | L0 |
| `docker-api` | External API | `DOCKER_API_API_KEY` | L1 | L2 |
| `github-api` | External API | `GITHUB_API_API_KEY` | L1 | L2 |
| `github-repo-manager` | External API | — | L1 | L2 |
| `http-api-caller` | None / Local | — | L0 | L0 |
| `log-monitor` | External API | `LOG_MONITOR_API_KEY` | L1 | L2 |
| `npm-audit-snyk` | External API | `NPM_AUDIT_SNYK_API_KEY` | L1 | L2 |
| `sql-analyzer` | External API | `SQL_ANALYZER_API_KEY` | L1 | L2 |
| `ssh-client` | External API | `SSH_CLIENT_API_KEY` | L1 | L2 |
| `swagger-openapi-generator` | External API | `SWAGGER_OPENAPI_GENERATOR_API_KEY` | L1 | L2 |
| `test-generator` | External API | `TEST_GENERATOR_API_KEY` | L1 | L2 |
| `uptime-monitor` | None / Local | — | L0 | L0 |

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
    - code-interpreter
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
