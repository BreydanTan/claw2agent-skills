# RSS Feed Monitor Skill

## What this skill does

The RSS Feed Monitor skill subscribes to, fetches, and monitors RSS and Atom feeds. It parses feed XML into structured entries, tracks new items across checks, and filters results by keywords. This is useful for monitoring news sources, blog updates, release feeds, and any other RSS/Atom-compatible content streams. All subscription state is held in memory with no external dependencies.

## Supported commands / input shape

All requests require an `action` parameter. Additional parameters depend on the action.

### `subscribe` -- Add a feed subscription

| Parameter | Type   | Required | Description                                      |
| --------- | ------ | -------- | ------------------------------------------------ |
| action    | string | yes      | `"subscribe"`                                    |
| url       | string | yes      | HTTPS URL of the RSS/Atom feed                   |
| name      | string | no       | Friendly name for the subscription (defaults to URL) |

### `unsubscribe` -- Remove a feed subscription

| Parameter | Type   | Required | Description                                      |
| --------- | ------ | -------- | ------------------------------------------------ |
| action    | string | yes      | `"unsubscribe"`                                  |
| name      | string | no       | Friendly name of the subscription to remove      |
| url       | string | no       | URL of the subscription to remove (if name not provided) |

### `fetch` -- Fetch and parse a feed URL directly

| Parameter | Type     | Required | Description                                      |
| --------- | -------- | -------- | ------------------------------------------------ |
| action    | string   | yes      | `"fetch"`                                        |
| url       | string   | yes      | HTTPS URL of the RSS/Atom feed                   |
| maxItems  | number   | no       | Maximum entries to return (default: 10, max: 100) |
| keywords  | string[] | no       | Filter entries containing any of these keywords  |

### `list` -- List all subscribed feeds

| Parameter | Type   | Required | Description                                      |
| --------- | ------ | -------- | ------------------------------------------------ |
| action    | string | yes      | `"list"`                                         |

### `check` -- Check all feeds for new items

| Parameter | Type     | Required | Description                                      |
| --------- | -------- | -------- | ------------------------------------------------ |
| action    | string   | yes      | `"check"`                                        |
| maxItems  | number   | no       | Maximum new entries to return (default: 10, max: 100) |
| keywords  | string[] | no       | Filter new entries containing any of these keywords |

## Required config and secrets

This skill does not require any API keys, secrets, or external configuration. It runs with no external dependencies beyond the Node.js runtime and the built-in `fetch` API.

## Usage examples

### Subscribe to a feed

```json
{
  "action": "subscribe",
  "url": "https://blog.example.com/feed.xml",
  "name": "Example Blog"
}
```

### Unsubscribe from a feed

```json
{
  "action": "unsubscribe",
  "name": "Example Blog"
}
```

### Fetch a feed directly

```json
{
  "action": "fetch",
  "url": "https://news.example.com/rss",
  "maxItems": 5,
  "keywords": ["security", "vulnerability"]
}
```

### List subscriptions

```json
{
  "action": "list"
}
```

### Check all feeds for new items

```json
{
  "action": "check",
  "maxItems": 20,
  "keywords": ["release", "update"]
}
```

## Error codes

| Code           | Description                                              |
| -------------- | -------------------------------------------------------- |
| INVALID_ACTION | The `action` parameter is missing or unrecognized        |
| INVALID_URL    | The URL is missing, malformed, not HTTPS, or points to a private IP range |
| FEED_NOT_FOUND | No subscription found matching the given name or URL     |
| PARSE_ERROR    | The fetched content could not be parsed as RSS or Atom   |
| FETCH_ERROR    | A network error occurred while fetching the feed         |
| DUPLICATE_FEED | A subscription already exists for the given name or URL  |
| TIMEOUT        | The feed request timed out after 15 seconds              |

## Security notes

- Only HTTPS URLs are accepted. HTTP URLs are rejected.
- URLs pointing to private or reserved IP ranges (localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, link-local) are blocked to prevent SSRF attacks.
- All feed requests have a 15-second timeout to prevent hanging connections.
- No user data is persisted to disk. All state is in-memory and lost on process restart.
- No API keys or credentials are required or handled.
- XML parsing uses simple regex extraction, avoiding potential vulnerabilities in full XML parsers.

## Limitations

- Subscription state is in-memory only. All subscriptions are lost when the process restarts.
- The XML parser is regex-based and may not handle all edge cases of complex or malformed XML. It works correctly with standard RSS 2.0 and Atom 1.0 feeds.
- Namespace-prefixed tags (e.g., `dc:creator`, `dc:date`) are supported for common cases but not exhaustively.
- The `check` action fetches all subscribed feeds sequentially, not in parallel. For many subscriptions this may be slow.
- Feed entries are identified by their `guid` (RSS) or `id` (Atom) element. If a feed does not provide these, the link or title is used as a fallback, which may be less reliable for detecting duplicates.
- HTML content in descriptions is stripped to plain text. Embedded images and formatting are lost.

## Test instructions

Run the test suite using Node.js (no external dependencies required):

```bash
node skills/rss-monitor/__tests__/handler.test.js
```

All tests use the built-in `assert` module. The test runner prints a summary at the end. A non-zero exit code indicates failures.
