# Spreadsheet Analyzer

Analyze tabular data with statistics, filtering, sorting, aggregation, pivot tables, and data validation. Pure local computation with no external API calls.

> **Note:** This is a pure computation skill that works on in-memory tabular data (arrays of objects). No external dependencies required.

## Features

- **Analyze** - Compute statistics for numeric columns (min, max, mean, median, stddev, sum, count)
- **Filter** - Filter rows by conditions with multiple operators (eq, neq, gt, gte, lt, lte, contains, startsWith, endsWith)
- **Sort** - Sort rows by one or more columns with ascending/descending direction
- **Aggregate** - Group by column and compute aggregations (sum, avg, count, min, max)
- **Pivot** - Create pivot tables with configurable row, column, value fields and aggregation
- **Describe Columns** - Infer column types and compute per-column statistics
- **Find Duplicates** - Identify duplicate rows based on specified columns
- **Validate Data** - Validate data quality with rules (not_null, unique, type, range, pattern)

## Usage

### Analyze numeric columns

```json
{
  "action": "analyze",
  "data": [
    {"name": "Alice", "age": 30, "salary": 90000},
    {"name": "Bob", "age": 25, "salary": 85000}
  ],
  "columns": ["age", "salary"]
}
```

### Filter rows

```json
{
  "action": "filter",
  "data": [
    {"name": "Alice", "age": 30, "department": "Engineering"},
    {"name": "Bob", "age": 25, "department": "Marketing"}
  ],
  "conditions": [
    {"column": "age", "operator": "gte", "value": 28},
    {"column": "department", "operator": "eq", "value": "Engineering"}
  ]
}
```

### Sort rows

```json
{
  "action": "sort",
  "data": [
    {"name": "Alice", "age": 30},
    {"name": "Bob", "age": 25}
  ],
  "sortBy": [
    {"column": "age", "direction": "desc"}
  ]
}
```

### Aggregate data

```json
{
  "action": "aggregate",
  "data": [
    {"department": "Eng", "salary": 90000},
    {"department": "Eng", "salary": 85000},
    {"department": "Sales", "salary": 70000}
  ],
  "groupBy": "department",
  "aggregations": [
    {"column": "salary", "function": "sum"},
    {"column": "salary", "function": "avg"}
  ]
}
```

### Create pivot table

```json
{
  "action": "pivot",
  "data": [
    {"product": "Widget", "region": "North", "revenue": 1000},
    {"product": "Widget", "region": "South", "revenue": 1500},
    {"product": "Gadget", "region": "North", "revenue": 2000}
  ],
  "rowField": "product",
  "columnField": "region",
  "valueField": "revenue",
  "aggregation": "sum"
}
```

### Describe columns

```json
{
  "action": "describe_columns",
  "data": [
    {"name": "Alice", "age": 30, "active": true},
    {"name": "Bob", "age": 25, "active": false}
  ]
}
```

### Find duplicates

```json
{
  "action": "find_duplicates",
  "data": [
    {"name": "Alice", "age": 30},
    {"name": "Bob", "age": 25},
    {"name": "Alice", "age": 30}
  ],
  "columns": ["name", "age"]
}
```

### Validate data

```json
{
  "action": "validate_data",
  "data": [
    {"name": "Alice", "age": 30, "email": "alice@test.com"},
    {"name": null, "age": -5, "email": "invalid"}
  ],
  "rules": [
    {"column": "name", "rule": "not_null"},
    {"column": "age", "rule": "range", "min": 0, "max": 150},
    {"column": "email", "rule": "pattern", "pattern": "^[^@]+@[^@]+\\.[^@]+$"}
  ]
}
```

## Data Format

Data is always an array of objects (rows):

```json
[
  {"column1": "value1", "column2": 123},
  {"column1": "value2", "column2": 456}
]
```

## Parameters

| Parameter      | Type     | Required | Description                                                                 |
|----------------|----------|----------|-----------------------------------------------------------------------------|
| `action`       | string   | Yes      | One of: `analyze`, `filter`, `sort`, `aggregate`, `pivot`, `describe_columns`, `find_duplicates`, `validate_data` |
| `data`         | Object[] | Yes      | Array of row objects to analyze                                             |
| `columns`      | string[] | No       | Column names (for `analyze` and `find_duplicates`)                          |
| `conditions`   | Object[] | No       | Filter conditions with `{column, operator, value}` (for `filter`)           |
| `sortBy`       | Object[] | No       | Sort specifications with `{column, direction}` (for `sort`)                 |
| `groupBy`      | string   | No       | Column to group by (for `aggregate`)                                        |
| `aggregations` | Object[] | No       | Aggregation specs with `{column, function}` (for `aggregate`)               |
| `rowField`     | string   | No       | Row grouping field (for `pivot`)                                            |
| `columnField`  | string   | No       | Column grouping field (for `pivot`)                                         |
| `valueField`   | string   | No       | Value field to aggregate (for `pivot`)                                      |
| `aggregation`  | string   | No       | Aggregation function for pivot: sum, avg, count, min, max (default: sum)    |
| `rules`        | Object[] | No       | Validation rules with `{column, rule, ...}` (for `validate_data`)           |

## Response Format

All actions return an object with:

- `result` - Human-readable formatted text output
- `metadata` - Structured data including `success`, `action`, and action-specific fields

## Requirements

- No API key required
- No external dependencies
- Works entirely offline with pure local computation
