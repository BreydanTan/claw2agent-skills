# Multi-Agent Orchestration Skill

A Layer 0 (L0) skill for managing multi-agent workflows. Define, configure, and simulate execution of workflows where multiple agents collaborate on tasks. Pure local orchestration logic with no external API dependencies.

## Features

- **Sequential workflows** -- Steps execute one after another, passing output forward
- **Parallel workflows** -- Independent steps execute simultaneously (simulated), respecting dependency levels
- **Conditional workflows** -- Steps execute or skip based on condition evaluation against input data
- **Dependency tracking** -- Steps can declare dependencies on other steps with validation
- **Execution simulation** -- Produces structured traces showing what each agent would do
- **Execution history** -- Tracks all past executions per workflow

## Actions

| Action | Description |
|---|---|
| `create_workflow` | Create a new workflow definition with a name, description, and mode |
| `add_step` | Add a step to a workflow with agent type, task, and optional dependencies |
| `remove_step` | Remove a step and clean up dependency references |
| `execute_workflow` | Simulate workflow execution and produce an execution trace |
| `get_status` | Get workflow definition, step count, mode, and execution history |
| `list_workflows` | List all defined workflows |
| `cancel_workflow` | Delete a workflow and its execution history |

## Workflow Modes

### Sequential

Steps execute in dependency order (topologically sorted). Each step receives the output of the previous step as input.

### Parallel

Steps are grouped into parallel levels based on dependencies. Steps with no dependencies run in level 1, steps depending on level 1 run in level 2, and so on.

### Conditional

Each step can have a `condition` property that is evaluated against the workflow input. Steps with unmet conditions are skipped.

Supported condition formats:
- `"always"` -- Always execute
- `"never"` -- Always skip
- `"input.field === value"` -- Equality check against input
- `"input.field !== value"` -- Inequality check against input
- `"input.field"` -- Truthy check

## Usage Examples

### Create a workflow

```json
{
  "action": "create_workflow",
  "name": "Content Pipeline",
  "description": "Research, write, and review content",
  "mode": "sequential"
}
```

### Add steps

```json
{
  "action": "add_step",
  "workflowId": "<workflow-id>",
  "step": {
    "name": "research",
    "agentType": "researcher",
    "task": "Research the topic and gather key facts"
  }
}
```

```json
{
  "action": "add_step",
  "workflowId": "<workflow-id>",
  "step": {
    "name": "write",
    "agentType": "writer",
    "task": "Write an article based on research",
    "dependsOn": ["research"]
  }
}
```

### Execute a workflow

```json
{
  "action": "execute_workflow",
  "workflowId": "<workflow-id>",
  "input": { "topic": "AI Safety" }
}
```

## Step Definition

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique step name within the workflow |
| `agentType` | string | No | Type of agent (defaults to "default") |
| `task` | string | No | Task description for the agent |
| `dependsOn` | string[] | No | Names of steps this step depends on |
| `condition` | string | No | Condition for conditional workflows |

## Return Format

**Success:**
```json
{
  "result": "Human-readable summary string",
  "metadata": { "success": true, "action": "...", "..." : "..." }
}
```

**Error:**
```json
{
  "result": "Error: Description of what went wrong",
  "metadata": { "success": false, "error": "ERROR_CODE" }
}
```

## Testing

```bash
node --test skills/multi-agent-orchestration/__tests__/handler.test.js
```
