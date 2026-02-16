# Markdown Writer Skill

## What this skill does

The Markdown Writer skill creates, formats, and converts Markdown documents programmatically. It accepts structured input (titles, sections, headers, rows, items, code) and produces well-formatted Markdown output. This is useful for generating reports, documentation, formatted tables, lists, and code snippets without manually writing Markdown syntax.

## Supported commands / input shape

All requests require an `action` parameter. Additional parameters depend on the action.

### `create` -- Generate a full document

| Parameter  | Type   | Required | Description                                     |
| ---------- | ------ | -------- | ----------------------------------------------- |
| action     | string | yes      | `"create"`                                      |
| title      | string | yes      | Document title (rendered as an H1 heading)      |
| sections   | array  | yes      | Array of `{ heading: string, content: string }` |

### `table` -- Generate a Markdown table

| Parameter | Type     | Required | Description              |
| --------- | -------- | -------- | ------------------------ |
| action    | string   | yes      | `"table"`                |
| headers   | string[] | yes      | Column header labels     |
| rows      | array    | yes      | Array of string arrays   |

### `list` -- Generate an ordered or unordered list

| Parameter | Type     | Required | Description                        |
| --------- | -------- | -------- | ---------------------------------- |
| action    | string   | yes      | `"list"`                           |
| items     | string[] | yes      | List items                         |
| ordered   | boolean  | no       | `true` for numbered list (default `false`) |

### `codeblock` -- Wrap code in a fenced code block

| Parameter | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| action    | string | yes      | `"codeblock"`                        |
| code      | string | yes      | Code content                         |
| language  | string | no       | Language for syntax highlighting     |

### `toc` -- Generate a table of contents

| Parameter | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| action    | string | yes      | `"toc"`                                |
| content   | string | yes      | Markdown content containing headings   |

### `format` -- Prettify markdown

| Parameter | Type   | Required | Description                    |
| --------- | ------ | -------- | ------------------------------ |
| action    | string | yes      | `"format"`                     |
| content   | string | yes      | Markdown content to clean up   |

## Required config and secrets

This skill does not require any API keys, secrets, or external configuration. It runs entirely locally with no network calls.

## Usage examples

### Create a full document

```json
{
  "action": "create",
  "title": "Project Overview",
  "sections": [
    { "heading": "Introduction", "content": "This project aims to..." },
    { "heading": "Goals", "content": "Our primary goals are..." }
  ]
}
```

### Generate a table

```json
{
  "action": "table",
  "headers": ["Name", "Role", "Status"],
  "rows": [
    ["Alice", "Engineer", "Active"],
    ["Bob", "Designer", "On leave"]
  ]
}
```

### Generate an ordered list

```json
{
  "action": "list",
  "items": ["Install dependencies", "Run tests", "Deploy"],
  "ordered": true
}
```

### Wrap code in a fenced block

```json
{
  "action": "codeblock",
  "code": "const x = 42;\nconsole.log(x);",
  "language": "javascript"
}
```

### Generate a table of contents

```json
{
  "action": "toc",
  "content": "# Title\n## Section A\n### Subsection\n## Section B"
}
```

### Format messy markdown

```json
{
  "action": "format",
  "content": "#  Bad Heading\nSome text\n##No space\n   trailing spaces   \n\n\n\nToo many blanks"
}
```

## Error codes

| Code              | Description                                        |
| ----------------- | -------------------------------------------------- |
| INVALID_ACTION    | The `action` parameter is missing or unrecognized  |
| MISSING_TITLE     | `create` action called without a `title`           |
| MISSING_SECTIONS  | `create` action called without a `sections` array  |
| MISSING_HEADERS   | `table` action called without a `headers` array    |
| MISSING_ROWS      | `table` action called without a `rows` array       |
| MISSING_ITEMS     | `list` action called without an `items` array      |
| EMPTY_ITEMS       | `list` action called with an empty `items` array   |
| MISSING_CODE      | `codeblock` action called without `code`           |
| MISSING_CONTENT   | `toc` or `format` action called without `content`  |
| NO_HEADINGS       | `toc` action found no headings in the content      |
| UNEXPECTED_ERROR  | An unhandled exception occurred (retriable)         |

## Security notes

- This skill performs no file system access. All input and output is in-memory strings.
- No network requests are made.
- No user data is persisted or logged.
- No API keys or credentials are required or handled.

## Limitations

- The `create` action generates H1 for the title and H2 for each section heading. Deeper nesting requires manual editing or multiple passes.
- The `toc` action only detects ATX-style headings (`# Heading`). Setext-style headings (underlined with `=` or `-`) are not recognized.
- The `format` action applies opinionated spacing rules. It does not reflow paragraph text, reformat inline markup, or validate Markdown correctness.
- Table column alignment (left, center, right) is not configurable; all columns use default (left) alignment.
- Nested or multi-level lists are not supported by the `list` action. Each item is rendered at the top level.

## Test instructions

Run the test suite using Node.js (no external dependencies required):

```bash
node skills/markdown-writer/__tests__/handler.test.js
```

All tests use the built-in `assert` module. The test runner prints a summary at the end. A non-zero exit code indicates failures.
