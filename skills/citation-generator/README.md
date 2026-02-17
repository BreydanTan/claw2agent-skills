# Citation Generator [L0]

Generate and manage academic citations in multiple formats (APA, MLA, Chicago, BibTeX).

## Actions

### `create_citation`
Create a new citation entry.

| Parameter | Required | Type   | Description                                      |
|-----------|----------|--------|--------------------------------------------------|
| type      | ✅       | string | `article`, `book`, `website`, or `conference`    |
| title     | ✅       | string | Title of the work                                |
| authors   | ✅       | string | Comma-separated author names                     |
| year      | ✅       | string | Publication year                                 |
| source    | ❌       | string | Journal, publisher, or website name              |
| url       | ❌       | string | URL of the work                                  |
| doi       | ❌       | string | DOI identifier                                   |

### `format_citation`
Format a citation in a specific style.

| Parameter  | Required | Type   | Description                          |
|------------|----------|--------|--------------------------------------|
| citationId | ✅       | string | ID of the citation to format         |
| style      | ✅       | string | `apa`, `mla`, `chicago`, or `bibtex` |

### `list_citations`
List all stored citations.

| Parameter | Required | Type   | Description            |
|-----------|----------|--------|------------------------|
| type      | ❌       | string | Filter by citation type |

### `get_citation`
Get details of a specific citation.

| Parameter  | Required | Type   | Description  |
|------------|----------|--------|--------------|
| citationId | ✅       | string | Citation ID  |

### `delete_citation`
Delete a citation.

| Parameter  | Required | Type   | Description  |
|------------|----------|--------|--------------|
| citationId | ✅       | string | Citation ID  |

### `export_bibliography`
Export citations as a formatted bibliography.

| Parameter | Required | Type   | Description                                  |
|-----------|----------|--------|----------------------------------------------|
| style     | ✅       | string | `apa`, `mla`, `chicago`, or `bibtex`         |
| ids       | ❌       | string | Comma-separated IDs (default: all citations) |

## Return Format

### Success
```json
{
  "result": "Citation Created\nID: abc-123\nType: article\nTitle: Deep Learning\nAuthors: LeCun, Bengio\nYear: 2015",
  "metadata": {
    "success": true,
    "action": "create_citation",
    "id": "abc-123",
    "type": "article",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Error
```json
{
  "result": "Error: Citation with ID \"xyz\" not found.",
  "metadata": { "success": false, "error": "NOT_FOUND" }
}
```

## Error Codes

| Code           | Description                |
|----------------|----------------------------|
| INVALID_ACTION | Unknown or missing action  |
| INVALID_INPUT  | Bad or missing parameters  |
| NOT_FOUND      | Citation not found         |

## Testing

```bash
node --test skills/citation-generator/__tests__/handler.test.js
```
