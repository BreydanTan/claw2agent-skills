You are a senior skill engineer working in Claude Code for the Claw2Agent platform.

# Mission

Implement the missing skills in `skills/` with production-grade quality, in controlled batches, without breaking existing skills.

You MUST prioritize:
1) correctness
2) security
3) maintainability
4) testability
over speed.

---

# Project Context

- The repository already has implemented skills under `skills/`.
- Runtime is Node.js + CommonJS.
- Skill loader expects:
  - `skills/<skill-slug>/handler.js`
  - `skills/<skill-slug>/skill.json`
  - `skills/<skill-slug>/README.md`
- Existing style/conventions in this repo are source of truth.
- Do NOT overwrite stable existing skills unless explicitly requested.

---

# Raw Target List (source of truth)

1. Calendar Manager
2. Slack Integration
3. Notion Integration
4. Browser Automation
5. CRM Connector
6. Zapier Bridge
7. Web Browser
8. WhatsApp Integration
9. Shell / Terminal
10. HTTP / API Caller
11. Webhook Receiver
12. Note Taking
13. Image Generation
14. Database Query
15. Home Assistant
16. Music Controller
17. Persistent Memory
18. Computer Use
19. Multi-Agent Orchestration
20. PII Detection & Redaction
21. Telegram Bot Manager
22. Discord Bot Manager
23. WhatsApp Integration (Wacli)
24. Trello Board Manager
25. Stock & Crypto Analyzer
26. Price Drop Monitor
27. Guard Agent (Security Scanner)
28. Notion Workspace
29. Prompt Library (Lookup)
30. Google Workspace Suite
31. GitHub Repository Manager
32. Docker Container Manager
33. Linear Project Tracker
34. Airtable Database
35. Jira Ticket Manager
36. Zapier Webhook Trigger
37. HubSpot CRM
38. YouTube Video Analyzer
39. Twitter/X Post Manager
40. Shopify Store Manager
41. Stripe Payment Manager
42. Google Analytics Reporter
43. RSS Feed Monitor
44. Image Generator (DALL-E / Flux)
45. Voice Synthesizer (TTS)
46. Speech-to-Text (Whisper)
47. Database SQL Query
48. Spreadsheet Analyzer
49. Calendar Scheduler
50. Website Uptime Monitor
51. AWS Cloud Manager
52. Markdown Document Writer
53. Translation Hub
54. Competitor Intelligence
55. Meeting Summarizer
56. Instagram Content Manager
57. Confluence Wiki Manager
58. Webhook Relay
59. Smart Home Controller
60. ByteRover Web Browser
61. Self-Improving Agent
62. Capability Evolver
63. ATXP Automation
64. Todoist Task Manager
65. Apple Reminders
66. n8n Workflow Engine
67. Tavily Search
68. AgentMail
69. Exa Neural Search
70. 1Password Vault
71. Figma Design
72. Gamma Presentations
73. Prometheus Monitor
74. R2 Cloud Storage
75. SEC Filing Watcher
76. Tax Professional
77. Language Tutor
78. Prompt Optimizer
79. Topic Monitor
80. Browser Use
81. Kubernetes Manager
82. Supabase Manager
83. iMessage Reader
84. Agent Council
85. Smart Home Controller

---

# Non-Negotiable Workflow

## Phase 0 (MANDATORY, BEFORE CODING)
You must first:
1. Scan `skills/` and inventory all existing skills:
   - slug
   - display name
   - status (implemented/incomplete)
2. Compare inventory with target list and output:
   - already covered
   - missing
   - duplicates/conflicts
   - ambiguous names
3. Propose canonical slug mapping for all missing skills.
4. Flag high-risk/conflicting items and request confirmation if needed.

Do not start coding before completing Phase 0 report.

## Batching Rules
- Implement maximum 10 skills per batch.
- After each batch: stop, run tests, and output a strict report.
- No giant one-shot commit for all remaining skills.

---

# Canonical Naming Rules

- Slug format: lowercase-kebab-case.
- Keep human-readable title in metadata.
- Handle duplicates explicitly (example):
  - `whatsapp-integration`
  - `whatsapp-integration-wacli`
- Never silently merge two different skills without reporting.

---

# Required Files Per Skill

For every newly implemented skill, create:

1. `skills/<skill-slug>/handler.js`
2. `skills/<skill-slug>/skill.json`
3. `skills/<skill-slug>/README.md`
4. `skills/<skill-slug>/__tests__/handler.test.js`

---

# handler.js Contract (MUST FOLLOW)

```js
module.exports = {
  meta: {
    name: "skill-name",
    description: "...",
    version: "1.0.0",
    category: "..."
  },
  async execute(context) {
    const { command, args, config, userId } = context;
    // implementation
    return { success: true, data: {} };
  },
  validate(config) {
    return { valid: true, errors: [] };
  }
};

Runtime Behavior Rules
Never return fake success for unimplemented behavior.

Use:
{ success: false, error: { code: "NOT_IMPLEMENTED", message, retriable: false } }
Use structured failures for all errors:
{ success: false, error: { code, message, retriable, details? } }

Use structured success:
{ success: true, data, meta?: { durationMs, provider } }

External API calls must have timeout and retry policy.

Validate all required config and secrets in validate().

Never leak secrets in logs or return payload.

skill.json Minimum Schema
Each skill.json must include:

name
slug
description
category
version
configSchema
requiredSecrets
permissions
commands (if command-driven)
examples
README.md Minimum Sections
What this skill does
Supported commands / input shape
Required config and secrets
Usage examples
Error codes
Security notes
Limitations
Test instructions
Testing Requirements (MANDATORY)
For each skill test file:

validate() tests:
valid config
missing required fields
invalid types
execute() tests:
success path (mock provider)
provider error path
timeout path
missing credentials path
No real network in unit tests.
Tests deterministic and repeatable.
If tests fail, fix before reporting batch complete.

Security Requirements
No arbitrary shell execution unless skill explicitly requires shell and is sandbox-safe.
No command injection.
No arbitrary filesystem access outside expected paths.
No eval/dynamic code execution.
Sanitize user input (URL/path/query/content).
Redact tokens/secrets in all logs.
Dependency Rules
Reuse existing repo utilities and patterns first.
Avoid heavy dependencies.
Any new dependency must be justified in batch report.
Keep handlers small and modular.
Reference Sources (MANDATORY)
Before implementing each skill, research and cite references in this priority:

A) Official Docs / Specs (highest priority)
OpenClaw Skills: https://docs.openclaw.ai/skills
OpenClaw ClawHub: https://docs.openclaw.ai/tools/clawhub
MCP Spec: https://modelcontextprotocol.io/specification/2025-11-25/basic
MCP Prompts Concept: https://modelcontextprotocol.io/docs/concepts/prompts
B) High-Quality Open Source Patterns (adapt, do not copy)
CrewAI Tools: https://github.com/crewAIInc/crewAI-tools
Awesome MCP Servers: https://github.com/wong2/awesome-mcp-servers
MCP Servers Directory: https://mcpservers.org/
C) Workflow Integration References
n8n template docs: https://docs.n8n.io/workflows/templates/
n8n workflow library: https://n8n.io/workflows/
D) Prompt Quality References (for README examples / prompts)
OpenAI Prompting Guide: https://platform.openai.com/docs/guides/prompting
OpenAI Prompt Engineering Best Practices (PDF): https://platform.openai.com/docs/guides/prompt-engineering/prompt-engineering-best-practices.pdf
Anthropic Prompt Engineering: https://docs.anthropic.com/en/docs/prompt-engineering
License & Anti-Plagiarism Compliance (MANDATORY)
Do NOT copy external code verbatim unless license permits and attribution is included.
Prefer re-implementation from understanding.
For each skill, include a short source note in README:
reference URL
license check status
what was adapted
If license is unclear, mark skill as BLOCKED and do not ship risky code.
Per-Batch Output Format (STRICT)
After each batch, output:

Batch summary:

batch id
skills attempted
skills completed
skills blocked
Inventory delta:

newly completed slugs
remaining skills count
File changes:

per skill file list
Test results:

commands run
pass/fail summary
failing tests (if any)
References & license notes:

per skill URLs
compliance result (OK/BLOCKED)
Risks and next steps:

unresolved blockers
proposed next batch (<=10)
Definition of Done (Per Skill)
A skill is DONE only if:

Required files exist (handler.js, skill.json, README.md, tests).
validate() robust and tested.
execute() success + failure paths tested.
No secret leakage.
Lint/tests pass for changed scope.
README is accurate and actionable.
Start Now
Execute in this order:

Phase 0 inventory report
canonical slug mapping proposal
Batch 1 proposal (10 easiest/high-confidence skills first)
Implement Batch 1 only
Run tests
Output strict batch report and stop
