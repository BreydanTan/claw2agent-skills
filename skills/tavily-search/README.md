# Tavily Search Skill

**Layer 1 (L1)** -- Web search and content extraction powered by Tavily API.

Supports general web search, news, images, academic papers, code repositories, direct answers, content extraction from URLs, and batch search.

## Actions

### `search`

General web search with configurable depth and domain filters.

| Parameter      | Type     | Required | Default  | Description                                      |
| -------------- | -------- | -------- | -------- | ------------------------------------------------ |
| query          | string   | Yes      | --       | Search query string                              |
| maxResults     | number   | No       | `5`      | Maximum results to return (1--20)                |
| searchDepth    | string   | No       | `basic`  | `basic` or `advanced`                            |
| includeDomains | string[] | No       | --       | Only include results from these domains          |
| excludeDomains | string[] | No       | --       | Exclude results from these domains               |
| includeAnswer  | boolean  | No       | `false`  | Include a direct answer in search results        |

### `extract`

Extract content from one or more URLs.

| Parameter    | Type     | Required | Default | Description                                |
| ------------ | -------- | -------- | ------- | ------------------------------------------ |
| urls         | string[] | Yes      | --      | Array of URLs to extract (max 10)          |
| extractDepth | string   | No       | `basic` | `basic` or `advanced`                      |

### `search_news`

Search recent news articles.

| Parameter  | Type   | Required | Default | Description                                |
| ---------- | ------ | -------- | ------- | ------------------------------------------ |
| query      | string | Yes      | --      | Search query string                        |
| maxResults | number | No       | `5`     | Maximum results to return (1--20)          |
| days       | number | No       | `7`     | Number of days to look back (1--365)       |
| topic      | string | No       | `news`  | Topic filter                               |

### `search_images`

Search for images.

| Parameter  | Type   | Required | Default | Description                       |
| ---------- | ------ | -------- | ------- | --------------------------------- |
| query      | string | Yes      | --      | Search query string               |
| maxResults | number | No       | `5`     | Maximum results to return (1--20) |

### `get_answer`

Get a direct answer with sources.

| Parameter         | Type    | Required | Default | Description                          |
| ----------------- | ------- | -------- | ------- | ------------------------------------ |
| query             | string  | Yes      | --      | Question to answer                   |
| searchDepth       | string  | No       | `basic` | `basic` or `advanced`                |
| includeRawContent | boolean | No       | `false` | Include raw content from sources     |

### `search_academic`

Search academic papers and publications.

| Parameter  | Type   | Required | Default | Description                       |
| ---------- | ------ | -------- | ------- | --------------------------------- |
| query      | string | Yes      | --      | Search query string               |
| maxResults | number | No       | `5`     | Maximum results to return (1--20) |
| year       | number | No       | --      | Filter by publication year        |

### `search_code`

Search code repositories and snippets.

| Parameter  | Type   | Required | Default | Description                       |
| ---------- | ------ | -------- | ------- | --------------------------------- |
| query      | string | Yes      | --      | Search query string               |
| maxResults | number | No       | `5`     | Maximum results to return (1--20) |
| language   | string | No       | --      | Programming language filter       |

### `batch_search`

Perform multiple searches in one call.

| Parameter | Type     | Required | Default | Description                                                  |
| --------- | -------- | -------- | ------- | ------------------------------------------------------------ |
| queries   | object[] | Yes      | --      | Array of `{query, maxResults}` objects (max 5)               |

## L1 Architecture

- **No hardcoded vendor endpoints.** All API calls go through `context.providerClient.request()` (preferred) or `context.gatewayClient.request()` (fallback).
- **BYOK (Bring Your Own Key).** API keys are managed outside of skill code via the platform adapter.
- **Input validation.** All parameters are validated and sanitized before use.
- **Secret redaction.** Tavily API keys and other tokens are stripped from all output strings.

## Return Format

**Success:**

```json
{
  "result": "Search results for \"test\":\n\n1. Example Result\n   URL: https://example.com\n   Content snippet",
  "metadata": {
    "success": true,
    "action": "search",
    "layer": "L1",
    "query": "test",
    "resultCount": 3,
    "results": [...]
  }
}
```

**Error:**

```json
{
  "result": "Error: provider not configured",
  "metadata": {
    "success": false,
    "error": "PROVIDER_NOT_CONFIGURED"
  }
}
```

## Example Usage

```js
// General search
await execute({ action: 'search', query: 'latest AI news', maxResults: 5 }, context);

// Extract content from URLs
await execute({ action: 'extract', urls: ['https://example.com/article'] }, context);

// Search news from last 3 days
await execute({ action: 'search_news', query: 'technology', days: 3 }, context);

// Get a direct answer
await execute({ action: 'get_answer', query: 'What is the capital of France?', searchDepth: 'advanced' }, context);

// Search academic papers
await execute({ action: 'search_academic', query: 'machine learning', year: 2024 }, context);

// Search code
await execute({ action: 'search_code', query: 'react hooks', language: 'JavaScript' }, context);

// Batch search
await execute({ action: 'batch_search', queries: [{ query: 'AI' }, { query: 'ML', maxResults: 3 }] }, context);
```

## Testing

Run the test suite (requires Node.js 18+):

```bash
node --test skills/tavily-search/__tests__/handler.test.js
```

The test suite contains 170+ assertions across 23 describe blocks covering action validation, provider configuration, all 8 actions, input validation helpers, endpoint routing, error handling, and edge cases.
