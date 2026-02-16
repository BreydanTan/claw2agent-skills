# Agent Council

Manage a council of virtual agents that deliberate on decisions using structured debate patterns. Pure local multi-agent collaboration logic with role-based perspective generation and configurable voting methods.

## What it does

This skill provides a multi-agent deliberation system with seven actions:

- **create_council** - Create a new council with a name, topic, and voting method.
- **add_member** - Add a virtual agent member with a name, role, perspective, and optional weight.
- **remove_member** - Remove a member from a council by name.
- **deliberate** - Run a structured deliberation round where each member generates a position based on their role.
- **vote** - Council members vote on a proposal with results tallied by the configured voting method.
- **get_council** - Get full details of a specific council.
- **list_councils** - List all existing councils.

### Member roles

| Role | Behavior | Vote Tendency |
|------|----------|---------------|
| `analyst` | Data-driven pros/cons analysis | Abstain (wants more data) |
| `critic` | Identifies risks and weaknesses | Reject (sees risks) |
| `optimist` | Highlights opportunities and upside | Approve (sees opportunity) |
| `pessimist` | Warns about pitfalls and worst cases | Reject (sees pitfalls) |
| `domain_expert` | Technical feasibility assessment | Approve (technically sound) |
| `devil_advocate` | Contrarian arguments challenging consensus | Reject (challenges groupthink) |

### Voting methods

| Method | Description |
|--------|-------------|
| `majority` | Simple majority of non-abstaining votes wins (default) |
| `unanimous` | All non-abstaining votes must be approve |
| `weighted` | Votes are weighted by each member's weight value |

## Commands

### create_council

Create a new council.

```json
{
  "action": "create_council",
  "name": "Architecture Review Board",
  "topic": "System design decisions",
  "votingMethod": "majority"
}
```

### add_member

Add a virtual agent member to a council.

```json
{
  "action": "add_member",
  "councilId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "member": {
    "name": "Alice",
    "role": "analyst",
    "perspective": "data engineering",
    "weight": 1.5
  }
}
```

### remove_member

Remove a member from a council.

```json
{
  "action": "remove_member",
  "councilId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "memberName": "Alice"
}
```

### deliberate

Run a structured deliberation round on a question.

```json
{
  "action": "deliberate",
  "councilId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "question": "Should we migrate to a microservices architecture?"
}
```

### vote

Council votes on a proposal.

```json
{
  "action": "vote",
  "councilId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "proposal": "Adopt microservices architecture for the payment system"
}
```

### get_council

Get details of a specific council.

```json
{
  "action": "get_council",
  "councilId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
}
```

### list_councils

List all councils.

```json
{
  "action": "list_councils"
}
```

## Config / Secrets

This skill does not require any API keys or external configuration. All councils are stored in memory and will not persist across process restarts.

## Usage examples

### Create a balanced council for architecture decisions

```json
{
  "action": "create_council",
  "name": "Architecture Council",
  "topic": "System architecture decisions",
  "votingMethod": "weighted"
}
```

Then add diverse members:

```json
{
  "action": "add_member",
  "councilId": "<council-id>",
  "member": { "name": "DataDriven Dan", "role": "analyst", "perspective": "performance metrics", "weight": 1.0 }
}
```

```json
{
  "action": "add_member",
  "councilId": "<council-id>",
  "member": { "name": "Cautious Carol", "role": "critic", "perspective": "security vulnerabilities", "weight": 1.5 }
}
```

```json
{
  "action": "add_member",
  "councilId": "<council-id>",
  "member": { "name": "Visionary Vic", "role": "optimist", "perspective": "market opportunities", "weight": 1.0 }
}
```

### Run a deliberation then vote

```json
{ "action": "deliberate", "councilId": "<council-id>", "question": "Should we rewrite the monolith?" }
```

```json
{ "action": "vote", "councilId": "<council-id>", "proposal": "Rewrite the monolith as microservices" }
```

## Error codes

| Code | Description |
|------|-------------|
| `MISSING_ACTION` | The `action` parameter is missing. |
| `UNKNOWN_ACTION` | The provided action is not recognized. |
| `MISSING_NAME` | The `name` parameter is missing (create_council). |
| `MISSING_TOPIC` | The `topic` parameter is missing (create_council). |
| `INVALID_VOTING_METHOD` | The `votingMethod` is not one of: majority, unanimous, weighted. |
| `MISSING_COUNCIL_ID` | The `councilId` parameter is missing. |
| `COUNCIL_NOT_FOUND` | No council exists with the provided ID. |
| `MISSING_MEMBER` | The `member` parameter is missing or invalid. |
| `MISSING_MEMBER_NAME` | The member `name` field is missing. |
| `MISSING_MEMBER_ROLE` | The member `role` field is missing. |
| `INVALID_ROLE` | The member role is not one of the valid roles. |
| `MISSING_MEMBER_PERSPECTIVE` | The member `perspective` field is missing. |
| `DUPLICATE_MEMBER` | A member with the same name already exists in the council. |
| `MISSING_QUESTION` | The `question` parameter is missing (deliberate). |
| `MISSING_PROPOSAL` | The `proposal` parameter is missing (vote). |
| `NO_MEMBERS` | The council has no members (deliberate, vote). |
| `MEMBER_NOT_FOUND` | The named member was not found in the council. |

## Security notes

- All string inputs are sanitized to prevent XSS by escaping HTML-significant characters (`<`, `>`, `&`, `"`, `'`).
- No arbitrary code execution paths exist; the skill only performs Map-based operations.
- All processing happens locally -- no data is sent to external services.
- The in-memory store means data does not persist across restarts, reducing data leak risk.

## Limitations

- **In-memory only.** Councils are stored in a JavaScript Map and will be lost when the process exits.
- **Deterministic perspectives.** Role-based positions are generated from templates, not LLM inference. This provides consistency but limited nuance.
- **Deterministic voting.** Each role always votes the same way. This models role archetypes, not real agent reasoning.
- **No authentication.** Any caller can create, modify, or delete any council.
- **No pagination.** The list action returns all councils.

## Test instructions

Run the tests using Node.js built-in test runner:

```bash
node --test skills/agent-council/__tests__/handler.test.js
```

The test suite covers:

- Creation of councils with all voting methods
- Adding members with all valid roles
- Removing members by name
- Deliberation with role-based position generation
- Voting with majority, unanimous, and weighted methods
- Getting and listing councils
- Input validation (missing fields, invalid roles, duplicate members)
- Edge cases (empty council, unknown actions, XSS prevention)
