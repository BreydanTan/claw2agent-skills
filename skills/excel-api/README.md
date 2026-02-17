# Excel API Skill

L0 skill for Excel/spreadsheet manipulation using JSON data structures. Pure local computation with no external API calls.

## Actions

### create_workbook
Create a new workbook.
- **name** (required, string, max 200 chars): Name of the workbook.

### add_sheet
Add a sheet to an existing workbook.
- **workbookId** (required, string): ID of the workbook.
- **sheetName** (required, string, max 31 chars): Name of the sheet. Must not contain `[ ] : * ? / \`.

### set_cells
Set cell values in a sheet.
- **workbookId** (required, string): ID of the workbook.
- **sheetName** (required, string): Name of the sheet.
- **cells** (required, array, max 10000): Array of `{ row: number, col: number, value: any }`.

### get_sheet
Get all data from a sheet.
- **workbookId** (required, string): ID of the workbook.
- **sheetName** (required, string): Name of the sheet.

### compute_formula
Compute a basic formula on sheet data.
- **workbookId** (required, string): ID of the workbook.
- **sheetName** (required, string): Name of the sheet.
- **formula** (required, string): One of `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`, `MEDIAN`.
- **range** (required, object): `{ startRow, startCol, endRow, endCol }`.

### export_csv
Export a sheet as a CSV string.
- **workbookId** (required, string): ID of the workbook.
- **sheetName** (required, string): Name of the sheet.

### list_workbooks
List all workbooks currently in memory.

## Layer
L0 - Pure local computation, no external API calls.

## Category
Productivity

## Tags
excel, spreadsheet, csv, workbook, formulas, data
