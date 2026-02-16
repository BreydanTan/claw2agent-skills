# Prompt Optimizer

Analyze and optimize prompts for AI models using rule-based quality checks. This skill scores, analyzes, restructures, and compares prompts without making any external API calls.

> **Note:** This is a rule-based analyzer, not AI-powered. It uses pattern matching and heuristics to evaluate prompt quality against established best practices.

## Features

- **Analyze** - Detailed quality analysis across 8 dimensions with issues and suggestions
- **Optimize** - Automatic restructuring with added role, context, format, constraints, and examples
- **Score** - Numerical quality score (0-100) with tier classification
- **Compare** - Side-by-side comparison of two prompts with per-dimension breakdown

## Quality Dimensions

| Dimension     | Weight | Description                                               |
|---------------|--------|-----------------------------------------------------------|
| Clarity       | 20     | Clear instruction/task with imperative verbs              |
| Specificity   | 15     | Sufficient detail, constraints, and format requirements   |
| Structure     | 15     | Organized with sections, headings, steps, or bullet points|
| Output Format | 15     | Desired output format is specified                        |
| Context       | 10     | Background or context provided for the task               |
| Examples      | 10     | Includes examples to illustrate expectations              |
| Constraints   | 10     | Sets boundaries and limitations                           |
| Role          | 5      | Assigns a persona or role to the AI                       |

## Usage

### Analyze a prompt

```json
{
  "action": "analyze",
  "prompt": "Write a Python function that sorts a list",
  "targetModel": "claude"
}
```

### Optimize a prompt

```json
{
  "action": "optimize",
  "prompt": "Write a Python function that sorts a list"
}
```

### Score a prompt

```json
{
  "action": "score",
  "prompt": "You are a senior software engineer. Write a Python function that takes a list of integers and returns them sorted in ascending order. Use the merge sort algorithm. Return only the code with docstrings. Do not include test cases."
}
```

### Compare two prompts

```json
{
  "action": "compare",
  "promptA": "Sort a list",
  "promptB": "You are a Python expert. Write a function that sorts a list of integers using merge sort. Return the code as a markdown code block with type annotations."
}
```

## Parameters

| Parameter     | Type   | Required | Description                                           |
|---------------|--------|----------|-------------------------------------------------------|
| `action`      | string | Yes      | One of: `analyze`, `optimize`, `score`, `compare`     |
| `prompt`      | string | *        | Prompt text (required for analyze, optimize, score)    |
| `promptA`     | string | *        | First prompt (required for compare)                   |
| `promptB`     | string | *        | Second prompt (required for compare)                  |
| `targetModel` | string | No       | Target model: `claude`, `gpt`, or `general` (default) |

## Response Format

All actions return an object with:

- `result` - Human-readable formatted analysis text
- `metadata` - Structured data including `success`, `action`, `score`, and dimension breakdowns

## How It Works

The analyzer checks prompts against pattern libraries for each quality dimension:

1. **Clarity** - Looks for imperative verbs (write, create, explain, etc.) and question marks
2. **Specificity** - Evaluates word count, presence of numbers, technical terms, and qualifiers
3. **Structure** - Detects markdown headings, numbered lists, bullet points, and code blocks
4. **Context** - Matches patterns like "you are", "given", "context:", "background:"
5. **Output Format** - Matches "format", "json", "markdown", "table", "list", etc.
6. **Examples** - Detects "example", "e.g.", "for instance", "such as", "sample"
7. **Constraints** - Finds "do not", "avoid", "must", "limit", "only", "never"
8. **Role** - Matches "you are a", "act as", "as a", "persona:"

Each dimension produces a score from 0 to 1, which is then multiplied by its weight to produce the final 0-100 score.

## Score Tiers

| Score Range | Tier              |
|-------------|-------------------|
| 80-100      | Excellent         |
| 60-79       | Good              |
| 40-59       | Fair              |
| 20-39       | Needs Improvement |
| 0-19        | Poor              |

## Requirements

- No API key required
- No external dependencies
- Works entirely offline with rule-based analysis
