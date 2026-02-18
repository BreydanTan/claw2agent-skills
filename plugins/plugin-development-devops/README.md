# Development & DevOps Plugin

Skills for code execution, Docker, SSH, GitHub, SQL analysis, log monitoring, and API tooling.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-development-devops
```

## Included Skills (14)

- [`code-interpreter`](../../skills/code-interpreter/SKILL.md) — Execute JavaScript code in a sandboxed environment using Node.js vm module. Supports capturing console output and enforces a 10-second timeout for safe execution.
- [`code-sandbox-e2b`](../../skills/code-sandbox-e2b/SKILL.md) — Run code in isolated sandboxes via E2B platform.
- [`coding-agent`](../../skills/coding-agent/SKILL.md) — A meta-skill that formats structured prompts for the LLM to generate code. Accepts a task description, target language, and optional existing code context to produce a well-structured code generation request.
- [`docker-api`](../../skills/docker-api/SKILL.md) — Interact with the Docker Engine API to list/inspect/start/stop containers, list images, fetch container logs, and retrieve container resource stats. Layer 1 skill using provider client for API access. HIGH RISK: includes command whitelisting for container exec.
- [`github-api`](../../skills/github-api/SKILL.md) — Interact with the GitHub API to manage repositories, issues, pull requests, and search code. Layer 1 skill using provider client for API access.
- [`github-repo-manager`](../../skills/github-repo-manager/SKILL.md) — Manage GitHub repositories via the GitHub API. Get repo info, list repos, create and list issues, create and list pull requests, and search code. Uses injected provider client for API access (BYOK).
- [`http-api-caller`](../../skills/http-api-caller/SKILL.md) — Make HTTP requests to external APIs. Supports GET, POST, PUT, PATCH, DELETE with headers, body, query params, authentication, timeout, and retry.
- [`log-monitor`](../../skills/log-monitor/SKILL.md) — Monitor, search, and analyze application logs.
- [`npm-audit-snyk`](../../skills/npm-audit-snyk/SKILL.md) — Scan dependencies for security vulnerabilities via npm audit or Snyk.
- [`sql-analyzer`](../../skills/sql-analyzer/SKILL.md) — Analyze, optimize, and explain SQL queries.
- [`ssh-client`](../../skills/ssh-client/SKILL.md) — Execute remote commands and manage files via SSH.
- [`swagger-openapi-generator`](../../skills/swagger-openapi-generator/SKILL.md) — Generate API clients, documentation, and specs from OpenAPI definitions.
- [`test-generator`](../../skills/test-generator/SKILL.md) — Automatically generate unit and integration tests for code.
- [`uptime-monitor`](../../skills/uptime-monitor/SKILL.md) — Monitor website uptime by registering URLs, performing HTTP health checks, and tracking availability history. Supports configurable intervals, timeouts, and expected status codes.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
