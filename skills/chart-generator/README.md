# Chart Generator

L0 skill for creating and managing chart configurations for data visualization.

## Overview

The Chart Generator skill provides pure local computation for creating, updating, retrieving, and exporting chart configurations. It supports multiple chart types compatible with Chart.js and stores all data in an in-memory Map-based store.

## Actions

### create_chart
Create a new chart configuration and store it.

**Parameters:**
- `type` (required): Chart type - one of: line, bar, pie, doughnut, radar, scatter, area
- `title` (required): Chart title, max 200 characters
- `data` (required): Object with `labels` (array of strings) and `datasets` (array of objects with `label` and `data`)
- `options` (optional): Object with backgroundColor, borderColor, legend, responsive

### update_chart
Update an existing chart configuration.

**Parameters:**
- `chartId` (required): ID of the chart to update
- `title` (optional): New chart title
- `data` (optional): New chart data
- `options` (optional): New chart options

### get_chart
Retrieve a chart configuration by ID.

**Parameters:**
- `chartId` (required): ID of the chart to retrieve

### delete_chart
Delete a chart from the store.

**Parameters:**
- `chartId` (required): ID of the chart to delete

### export_config
Export a chart as a Chart.js-compatible JSON configuration.

**Parameters:**
- `chartId` (required): ID of the chart to export

### list_charts
List all stored charts with summary information.

### list_chart_types
List all supported chart types with descriptions.

## Supported Chart Types

| Type | Description |
|------|-------------|
| line | Line chart for displaying data trends over time |
| bar | Bar chart for comparing categorical data |
| pie | Pie chart for showing proportional data |
| doughnut | Doughnut chart similar to pie with hollow center |
| radar | Radar chart for multivariate data |
| scatter | Scatter chart for relationships between variables |
| area | Area chart similar to line with filled region |

## Data Validation

- **Labels**: Array of strings, max 100 items
- **Datasets**: Array of objects, max 20 datasets
- **Dataset data**: Array of numbers, max 1000 values per dataset
- **Title**: Non-empty string, max 200 characters, trimmed
- **Options**: backgroundColor (string), borderColor (string), legend (boolean), responsive (boolean)

## Running Tests

```bash
node --test skills/chart-generator/__tests__/handler.test.js
```
