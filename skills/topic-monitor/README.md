# Topic Monitor

Monitor topics and keywords across web sources. Set up keyword watches, track mentions, and get alerts when new content matches your topics.

## Overview

The Topic Monitor skill provides an in-memory topic and keyword monitoring system. You define topics with associated keywords, then scan incoming content to detect matches. All matches are stored with contextual snippets and source labels, allowing you to track mentions over time.

## Actions

### watch

Create a new topic watch with one or more keywords.

**Parameters:**
- `topic` (string, required) - A unique name for the topic.
- `keywords` (string[], required) - At least one keyword to monitor.
- `caseSensitive` (boolean, optional) - Enable case-sensitive matching. Default: `false`.

**Example:**
```json
{
  "action": "watch",
  "topic": "AI safety",
  "keywords": ["alignment", "safety", "interpretability"],
  "caseSensitive": false
}
```

### unwatch

Remove an existing topic watch and all its stored matches.

**Parameters:**
- `topic` (string, required) - The name of the topic to remove.

**Example:**
```json
{
  "action": "unwatch",
  "topic": "AI safety"
}
```

### list

List all currently watched topics with their keyword counts and match counts.

**Parameters:** None required.

**Example:**
```json
{
  "action": "list"
}
```

### check

Scan provided content against all watched topics. Returns which topics matched and which keywords triggered. Matches are stored automatically.

**Parameters:**
- `content` (string, required) - The text content to scan.
- `source` (string, optional) - A label for the content source (e.g., URL, article title). Default: `"unknown"`.

**Example:**
```json
{
  "action": "check",
  "content": "Recent advances in AI alignment research have shown promising results for interpretability methods.",
  "source": "arxiv-daily"
}
```

### matches

View stored matches for a specific topic.

**Parameters:**
- `topic` (string, required) - The topic to view matches for.
- `limit` (number, optional) - Maximum number of recent matches to return.

**Example:**
```json
{
  "action": "matches",
  "topic": "AI safety",
  "limit": 10
}
```

### stats

Return aggregate statistics across all watched topics.

**Parameters:** None required.

**Example:**
```json
{
  "action": "stats"
}
```

## Matching Behavior

- **Word boundary matching**: Keywords are matched using word boundaries to prevent partial matches. For example, the keyword "cat" will not match inside the word "category".
- **Case-insensitive by default**: Matching ignores case unless `caseSensitive` is set to `true` for a topic.
- **Contextual snippets**: When a match is found, a snippet is extracted with up to 50 characters of context before and after the matched keyword.

## Limits

| Resource               | Limit |
|------------------------|-------|
| Maximum topics         | 50    |
| Keywords per topic     | 20    |
| Matches per topic      | 500 (ring buffer - oldest are removed first) |

## Error Codes

| Code                | Description                                  |
|---------------------|----------------------------------------------|
| `INVALID_ACTION`    | Action is missing or not recognized.         |
| `MISSING_TOPIC`     | Topic name is required but not provided.     |
| `MISSING_KEYWORDS`  | Keywords array is required but not provided. |
| `TOPIC_NOT_FOUND`   | The specified topic does not exist.          |
| `DUPLICATE_TOPIC`   | A topic with that name already exists.       |
| `TOO_MANY_TOPICS`   | Maximum topic limit (50) reached.            |
| `TOO_MANY_KEYWORDS` | Maximum keywords per topic (20) exceeded.    |
| `MISSING_CONTENT`   | Content is required for the check action.    |

## Data Model

Each watched topic stores:
- `keywords` - Array of keyword strings to match.
- `caseSensitive` - Whether matching is case-sensitive.
- `createdAt` - ISO timestamp of when the topic was created.
- `matchCount` - Total number of matches recorded.
- `matches` - Array of match records (ring buffer, max 500).

Each match record contains:
- `source` - Label identifying where the content came from.
- `snippet` - Contextual text surrounding the match.
- `matchedKeywords` - Which keywords triggered the match.
- `timestamp` - ISO timestamp of when the match was recorded.
