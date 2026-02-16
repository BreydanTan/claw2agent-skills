# Meeting Summarizer

Analyze meeting transcripts to extract summaries, action items, decisions, participation statistics, and generate formatted meeting minutes. Pure local text processing with no external API calls.

> **Note:** This is a rule-based analyzer, not AI-powered. It uses pattern matching and heuristics to parse meeting transcripts.

## Features

- **Summarize** - Structured summary with key topics, tone, duration estimate, and participant count
- **Extract Actions** - Parse action items with assignee, task, deadline, and priority
- **Extract Decisions** - Identify decisions made during the meeting with context
- **Generate Minutes** - Full markdown-formatted meeting minutes document
- **Analyze Participation** - Speaking distribution analysis per participant

## Usage

### Summarize a meeting

```json
{
  "action": "summarize",
  "transcript": "Alice: Welcome everyone. Let's discuss the Q3 roadmap.\nBob: I think we should focus on the mobile app.\nAlice: Agreed. Let's also review the budget."
}
```

### Extract action items

```json
{
  "action": "extract_actions",
  "transcript": "Alice: Bob, can you follow up on the vendor contract?\nBob: Sure, I will send the proposal by Friday.\nAlice: Action item: Carol needs to review the design specs."
}
```

### Extract decisions

```json
{
  "action": "extract_decisions",
  "transcript": "Alice: Should we use React or Vue?\nBob: I think React is better for our use case.\nAlice: Agreed, we'll go with React for the frontend."
}
```

### Generate full meeting minutes

```json
{
  "action": "generate_minutes",
  "transcript": "[10:00] Alice: Let's get started.\n[10:05] Bob: Here's the status update...\n[10:15] Alice: We decided to move forward with option B.\n[10:20] Bob: I will prepare the implementation plan by Monday."
}
```

### Analyze participation

```json
{
  "action": "analyze_participation",
  "transcript": "Alice: I think we should redesign the landing page.\nBob: Sounds good.\nAlice: We also need to update the navigation.\nAlice: And fix the footer links.\nBob: Agreed."
}
```

## Transcript Format

The skill works best with labeled transcripts in the format:

```
Speaker Name: Their message text
```

Timestamps are also supported:

```
[10:00] Speaker Name: Their message text
[10:05 AM] Speaker Name: Another message
```

## Parameters

| Parameter    | Type   | Required | Description                                                                                  |
|--------------|--------|----------|----------------------------------------------------------------------------------------------|
| `action`     | string | Yes      | One of: `summarize`, `extract_actions`, `extract_decisions`, `generate_minutes`, `analyze_participation` |
| `transcript` | string | Yes      | The meeting transcript text to analyze                                                       |

## Response Format

All actions return an object with:

- `result` - Human-readable formatted text output
- `metadata` - Structured data including `success`, `action`, and action-specific fields

### Metadata Fields by Action

| Action                 | Key Fields                                                        |
|------------------------|-------------------------------------------------------------------|
| `summarize`            | `participantCount`, `duration`, `tone`, `topicCount`, `wordCount` |
| `extract_actions`      | `actionCount`, `actions` (array of action items)                  |
| `extract_decisions`    | `decisionCount`, `decisions` (array of decisions)                 |
| `generate_minutes`     | `participantCount`, `topicCount`, `decisionCount`, `actionCount`  |
| `analyze_participation`| `speakerCount`, `totalWords`, `speakers`, `dominant`, `quiet`     |

## Action Item Detection Patterns

The skill matches these patterns when extracting action items:

- "will do/take/handle/send/create..."
- "action item:"
- "TODO:"
- "assigned to"
- "take care of"
- "follow up"
- "responsible for"
- "needs to"
- "should do/take/handle..."
- "I'll do/take/handle..."

## Decision Detection Patterns

- "decided"
- "agreed"
- "conclusion"
- "resolved"
- "we'll go with"
- "final decision"
- "let's go with/ahead"
- "approved"
- "confirmed"
- "consensus"

## Requirements

- No API key required
- No external dependencies
- Works entirely offline with rule-based analysis
