# Productivity Plugin

Skills for calendars, task management, note-taking, meeting summaries, and project management.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-productivity
```

## Included Skills (14)

- [`calendar-manager`](../../skills/calendar-manager/SKILL.md) — Manage calendar events with full CRUD operations, search, and upcoming event queries. Supports recurring events, attendees, reminders, and date range filtering.
- [`excel-api`](../../skills/excel-api/SKILL.md) — Excel/spreadsheet manipulation skill with JSON data structures representing spreadsheets
- [`google-calendar-api`](../../skills/google-calendar-api/SKILL.md) — Interact with the Google Calendar API to list, create, update, delete, and search calendar events, as well as list available calendars. Layer 1 skill using provider client for API access.
- [`jira-manager`](../../skills/jira-manager/SKILL.md) — Manage Jira projects and issues via the Jira REST API. List projects, create/get/update issues, transition statuses, search with JQL, add comments, and assign issues. Uses injected provider client for API access (BYOK).
- [`language-tutor`](../../skills/language-tutor/SKILL.md) — Interactive language learning assistant. Practice vocabulary, generate exercises, track progress, and get grammar explanations.
- [`linear-tracker`](../../skills/linear-tracker/SKILL.md) — Manage Linear issues, projects, and cycles via the Linear GraphQL API. Create/update/list/get issues, create/list projects, add comments, search issues, and manage cycles. Uses injected provider client for API access (BYOK).
- [`markdown-writer`](../../skills/markdown-writer/SKILL.md) — Create, format, and convert Markdown documents. Supports generating structured documents, tables, lists, code blocks, and converting between formats.
- [`meeting-summarizer`](../../skills/meeting-summarizer/SKILL.md) — Analyze meeting transcripts to extract summaries, action items, decisions, participation stats, and generate formatted minutes. Pure local text processing.
- [`notion-api`](../../skills/notion-api/SKILL.md) — Interact with the Notion API to manage pages, databases, blocks, and search across workspaces. Layer 1 skill using provider client for API access.
- [`notion-integration`](../../skills/notion-integration/SKILL.md) — Interact with Notion workspaces via the Notion API. Search pages and databases, get/create/update pages, query databases, create database entries, and list blocks. Uses injected provider client for API access (BYOK).
- [`pptx-generator`](../../skills/pptx-generator/SKILL.md) — Generate PowerPoint presentation data structures (JSON-based slide definitions)
- [`remind-me`](../../skills/remind-me/SKILL.md) — In-memory reminder system. Set timed reminders, list active reminders, or cancel pending ones.
- [`todoist-manager`](../../skills/todoist-manager/SKILL.md) — Manage Todoist projects and tasks via the Todoist API. List/create projects, list/create/update/complete/delete tasks. Uses injected provider client for API access (BYOK).
- [`trello-manager`](../../skills/trello-manager/SKILL.md) — Manage Trello boards, lists, and cards via the Trello API. List boards, get board info, manage lists and cards, move cards between lists, and add comments. Uses injected provider client for API access (BYOK).

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
