/**
 * Excel API Skill Handler
 *
 * L0 skill -- pure local computation, no external API calls.
 *
 * Excel/spreadsheet manipulation skill that works with JSON data structures
 * representing spreadsheets. Provides actions to create workbooks, add sheets,
 * set cell values, retrieve sheet data, compute formulas, export CSV, and
 * list workbooks. All data is stored in an in-memory Map-based store.
 */

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// In-memory workbook store (module-level so it persists across calls)
// ---------------------------------------------------------------------------

const store = new Map();

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

/**
 * Clear the entire in-memory store. Used by tests for isolation.
 */
export function _clearStore() {
  store.clear();
}

/**
 * Return the current number of workbooks in the store.
 * @returns {number}
 */
export function _storeSize() {
  return store.size;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  "create_workbook",
  "add_sheet",
  "set_cells",
  "get_sheet",
  "compute_formula",
  "export_csv",
  "list_workbooks",
];

const VALID_FORMULAS = ["SUM", "AVG", "COUNT", "MIN", "MAX", "MEDIAN"];
const MAX_NAME_LENGTH = 200;
const MAX_SHEET_NAME_LENGTH = 31;
const MAX_CELLS = 10000;
const SHEET_NAME_INVALID_CHARS = /[[\]:*?/\\]/;

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validate a sheet name: must be a non-empty string, max 31 chars,
 * no special characters []:*?/\
 */
function validateSheetName(name) {
  if (!name || typeof name !== "string" || name.trim() === "") {
    return "Sheet name is required and must be a non-empty string.";
  }
  if (name.length > MAX_SHEET_NAME_LENGTH) {
    return `Sheet name must be at most ${MAX_SHEET_NAME_LENGTH} characters (got ${name.length}).`;
  }
  if (SHEET_NAME_INVALID_CHARS.test(name)) {
    return "Sheet name must not contain any of these characters: [ ] : * ? / \\";
  }
  return null;
}

/**
 * Validate a cell range object { startRow, startCol, endRow, endCol }.
 * All values must be non-negative integers and start <= end.
 */
function validateRange(range) {
  if (!range || typeof range !== "object") {
    return "Range is required and must be an object with startRow, startCol, endRow, endCol.";
  }
  const { startRow, startCol, endRow, endCol } = range;
  if (!Number.isInteger(startRow) || !Number.isInteger(startCol) ||
      !Number.isInteger(endRow) || !Number.isInteger(endCol)) {
    return "Range values (startRow, startCol, endRow, endCol) must be integers.";
  }
  if (startRow < 0 || startCol < 0 || endRow < 0 || endCol < 0) {
    return "Range values must be non-negative.";
  }
  if (startRow > endRow) {
    return "startRow must be less than or equal to endRow.";
  }
  if (startCol > endCol) {
    return "startCol must be less than or equal to endCol.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get numeric values from a sheet within a given range.
 */
function getNumericValuesInRange(sheetData, range) {
  const { startRow, startCol, endRow, endCol } = range;
  const values = [];
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const key = `${r},${c}`;
      const val = sheetData.get(key);
      if (val === undefined || val === null || val === "") continue;
      const n = Number(val);
      if (!Number.isNaN(n)) {
        values.push(n);
      }
    }
  }
  return values;
}

/**
 * Get the bounding box of all data in a sheet.
 */
function getSheetBounds(sheetData) {
  let maxRow = -1;
  let maxCol = -1;
  for (const key of sheetData.keys()) {
    const [r, c] = key.split(",").map(Number);
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  return { maxRow, maxCol };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionCreateWorkbook(params) {
  const { name } = params;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return {
      result: "Error: 'name' is required and must be a non-empty string.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (name.length > MAX_NAME_LENGTH) {
    return {
      result: `Error: 'name' must be at most ${MAX_NAME_LENGTH} characters (got ${name.length}).`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const workbook = {
    id,
    name: name.trim(),
    sheets: new Map(),
    createdAt: now,
    updatedAt: now,
  };

  store.set(id, workbook);

  return {
    result: `Workbook '${workbook.name}' created successfully with ID ${id}.`,
    metadata: {
      success: true,
      action: "create_workbook",
      workbookId: id,
      name: workbook.name,
      createdAt: now,
    },
  };
}

function actionAddSheet(params) {
  const { workbookId, sheetName } = params;

  if (!workbookId || typeof workbookId !== "string") {
    return {
      result: "Error: 'workbookId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const workbook = store.get(workbookId);
  if (!workbook) {
    return {
      result: `Error: Workbook with ID '${workbookId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const nameError = validateSheetName(sheetName);
  if (nameError) {
    return {
      result: `Error: ${nameError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (workbook.sheets.has(sheetName)) {
    return {
      result: `Error: Sheet '${sheetName}' already exists in workbook '${workbook.name}'.`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  // Each sheet stores cells as a Map with keys "row,col"
  workbook.sheets.set(sheetName, new Map());
  workbook.updatedAt = new Date().toISOString();

  return {
    result: `Sheet '${sheetName}' added to workbook '${workbook.name}'.`,
    metadata: {
      success: true,
      action: "add_sheet",
      workbookId,
      sheetName,
      totalSheets: workbook.sheets.size,
    },
  };
}

function actionSetCells(params) {
  const { workbookId, sheetName, cells } = params;

  if (!workbookId || typeof workbookId !== "string") {
    return {
      result: "Error: 'workbookId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const workbook = store.get(workbookId);
  if (!workbook) {
    return {
      result: `Error: Workbook with ID '${workbookId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  if (!sheetName || typeof sheetName !== "string") {
    return {
      result: "Error: 'sheetName' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (!workbook.sheets.has(sheetName)) {
    return {
      result: `Error: Sheet '${sheetName}' not found in workbook '${workbook.name}'.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  if (!Array.isArray(cells)) {
    return {
      result: "Error: 'cells' must be an array of { row, col, value } objects.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (cells.length === 0) {
    return {
      result: "Error: 'cells' must be a non-empty array.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (cells.length > MAX_CELLS) {
    return {
      result: `Error: 'cells' array exceeds maximum of ${MAX_CELLS} cells (got ${cells.length}).`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  // Validate each cell entry
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell || typeof cell !== "object") {
      return {
        result: `Error: Cell at index ${i} must be an object with { row, col, value }.`,
        metadata: { success: false, error: "INVALID_INPUT" },
      };
    }
    if (!Number.isInteger(cell.row) || cell.row < 0) {
      return {
        result: `Error: Cell at index ${i} has invalid 'row'. Must be a non-negative integer.`,
        metadata: { success: false, error: "INVALID_INPUT" },
      };
    }
    if (!Number.isInteger(cell.col) || cell.col < 0) {
      return {
        result: `Error: Cell at index ${i} has invalid 'col'. Must be a non-negative integer.`,
        metadata: { success: false, error: "INVALID_INPUT" },
      };
    }
    if (cell.value === undefined) {
      return {
        result: `Error: Cell at index ${i} is missing 'value'.`,
        metadata: { success: false, error: "INVALID_INPUT" },
      };
    }
  }

  const sheetData = workbook.sheets.get(sheetName);

  let setCellCount = 0;
  for (const cell of cells) {
    const key = `${cell.row},${cell.col}`;
    sheetData.set(key, cell.value);
    setCellCount++;
  }

  workbook.updatedAt = new Date().toISOString();

  return {
    result: `Set ${setCellCount} cell(s) in sheet '${sheetName}' of workbook '${workbook.name}'.`,
    metadata: {
      success: true,
      action: "set_cells",
      workbookId,
      sheetName,
      cellsSet: setCellCount,
    },
  };
}

function actionGetSheet(params) {
  const { workbookId, sheetName } = params;

  if (!workbookId || typeof workbookId !== "string") {
    return {
      result: "Error: 'workbookId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const workbook = store.get(workbookId);
  if (!workbook) {
    return {
      result: `Error: Workbook with ID '${workbookId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  if (!sheetName || typeof sheetName !== "string") {
    return {
      result: "Error: 'sheetName' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (!workbook.sheets.has(sheetName)) {
    return {
      result: `Error: Sheet '${sheetName}' not found in workbook '${workbook.name}'.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const sheetData = workbook.sheets.get(sheetName);
  const { maxRow, maxCol } = getSheetBounds(sheetData);

  // Build 2D array representation
  const rows = [];
  if (maxRow >= 0 && maxCol >= 0) {
    for (let r = 0; r <= maxRow; r++) {
      const row = [];
      for (let c = 0; c <= maxCol; c++) {
        const key = `${r},${c}`;
        row.push(sheetData.has(key) ? sheetData.get(key) : null);
      }
      rows.push(row);
    }
  }

  const cellCount = sheetData.size;

  // Build text representation
  const lines = [
    `Sheet: ${sheetName}`,
    `Workbook: ${workbook.name}`,
    "=".repeat(40),
    "",
    `Cells: ${cellCount}`,
    `Dimensions: ${maxRow >= 0 ? maxRow + 1 : 0} rows x ${maxCol >= 0 ? maxCol + 1 : 0} cols`,
    "",
  ];

  if (rows.length > 0) {
    for (let r = 0; r < rows.length; r++) {
      const rowStr = rows[r].map((v) => (v === null ? "" : String(v))).join("\t");
      lines.push(`  Row ${r}: ${rowStr}`);
    }
  } else {
    lines.push("  (empty sheet)");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "get_sheet",
      workbookId,
      sheetName,
      cellCount,
      rowCount: maxRow >= 0 ? maxRow + 1 : 0,
      colCount: maxCol >= 0 ? maxCol + 1 : 0,
      rows,
    },
  };
}

function actionComputeFormula(params) {
  const { workbookId, sheetName, formula, range } = params;

  if (!workbookId || typeof workbookId !== "string") {
    return {
      result: "Error: 'workbookId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const workbook = store.get(workbookId);
  if (!workbook) {
    return {
      result: `Error: Workbook with ID '${workbookId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  if (!sheetName || typeof sheetName !== "string") {
    return {
      result: "Error: 'sheetName' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (!workbook.sheets.has(sheetName)) {
    return {
      result: `Error: Sheet '${sheetName}' not found in workbook '${workbook.name}'.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  if (!formula || typeof formula !== "string") {
    return {
      result: "Error: 'formula' is required and must be a string.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const upperFormula = formula.toUpperCase();
  if (!VALID_FORMULAS.includes(upperFormula)) {
    return {
      result: `Error: Invalid formula '${formula}'. Must be one of: ${VALID_FORMULAS.join(", ")}.`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const rangeError = validateRange(range);
  if (rangeError) {
    return {
      result: `Error: ${rangeError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const sheetData = workbook.sheets.get(sheetName);
  const values = getNumericValuesInRange(sheetData, range);

  if (values.length === 0 && upperFormula !== "COUNT") {
    return {
      result: `Formula ${upperFormula} found no numeric values in the specified range.`,
      metadata: {
        success: true,
        action: "compute_formula",
        workbookId,
        sheetName,
        formula: upperFormula,
        range,
        value: null,
        numericCount: 0,
      },
    };
  }

  let computedValue;
  switch (upperFormula) {
    case "SUM":
      computedValue = values.reduce((a, b) => a + b, 0);
      break;
    case "AVG":
      computedValue = values.reduce((a, b) => a + b, 0) / values.length;
      break;
    case "COUNT":
      computedValue = values.length;
      break;
    case "MIN":
      computedValue = Math.min(...values);
      break;
    case "MAX":
      computedValue = Math.max(...values);
      break;
    case "MEDIAN": {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        computedValue = (sorted[mid - 1] + sorted[mid]) / 2;
      } else {
        computedValue = sorted[mid];
      }
      break;
    }
  }

  return {
    result: `${upperFormula} = ${computedValue}`,
    metadata: {
      success: true,
      action: "compute_formula",
      workbookId,
      sheetName,
      formula: upperFormula,
      range,
      value: computedValue,
      numericCount: values.length,
    },
  };
}

function actionExportCsv(params) {
  const { workbookId, sheetName } = params;

  if (!workbookId || typeof workbookId !== "string") {
    return {
      result: "Error: 'workbookId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const workbook = store.get(workbookId);
  if (!workbook) {
    return {
      result: `Error: Workbook with ID '${workbookId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  if (!sheetName || typeof sheetName !== "string") {
    return {
      result: "Error: 'sheetName' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (!workbook.sheets.has(sheetName)) {
    return {
      result: `Error: Sheet '${sheetName}' not found in workbook '${workbook.name}'.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const sheetData = workbook.sheets.get(sheetName);
  const { maxRow, maxCol } = getSheetBounds(sheetData);

  if (maxRow < 0 || maxCol < 0) {
    return {
      result: "",
      metadata: {
        success: true,
        action: "export_csv",
        workbookId,
        sheetName,
        rowCount: 0,
        colCount: 0,
        csv: "",
      },
    };
  }

  const csvLines = [];
  for (let r = 0; r <= maxRow; r++) {
    const rowParts = [];
    for (let c = 0; c <= maxCol; c++) {
      const key = `${r},${c}`;
      const val = sheetData.has(key) ? sheetData.get(key) : "";
      const strVal = val === null ? "" : String(val);
      // Escape CSV: if value contains comma, quote, or newline, wrap in quotes
      if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
        rowParts.push('"' + strVal.replace(/"/g, '""') + '"');
      } else {
        rowParts.push(strVal);
      }
    }
    csvLines.push(rowParts.join(","));
  }

  const csv = csvLines.join("\n");

  return {
    result: csv,
    metadata: {
      success: true,
      action: "export_csv",
      workbookId,
      sheetName,
      rowCount: maxRow + 1,
      colCount: maxCol + 1,
      csv,
    },
  };
}

function actionListWorkbooks() {
  const workbooks = [...store.values()];

  if (workbooks.length === 0) {
    return {
      result: "No workbooks found.",
      metadata: {
        success: true,
        action: "list_workbooks",
        count: 0,
        workbooks: [],
      },
    };
  }

  const lines = [
    "Workbooks",
    "=========",
    "",
    `Total: ${workbooks.length}`,
    "",
  ];

  const summaries = workbooks.map((wb) => ({
    id: wb.id,
    name: wb.name,
    sheetCount: wb.sheets.size,
    sheetNames: [...wb.sheets.keys()],
    createdAt: wb.createdAt,
    updatedAt: wb.updatedAt,
  }));

  for (const s of summaries) {
    lines.push(`  [${s.id}] ${s.name} (${s.sheetCount} sheet(s): ${s.sheetNames.join(", ") || "(none)"})`);
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "list_workbooks",
      count: workbooks.length,
      workbooks: summaries,
    },
  };
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

/**
 * Validate parameters before execution.
 * @param {Object} params
 * @returns {{ valid: boolean, error?: string }}
 */
export function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      valid: false,
      error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(", ")}`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: "excel-api",
  version: "1.0.0",
  description:
    "Excel/spreadsheet manipulation skill. Pure local computation with JSON data structures representing spreadsheets.",
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute the excel-api skill.
 *
 * @param {Object} params
 * @param {string} params.action - create_workbook, add_sheet, set_cells, get_sheet, compute_formula, export_csv, list_workbooks
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action } = params || {};

  if (!action) {
    return {
      result:
        "Error: The 'action' parameter is required. Supported actions: " +
        VALID_ACTIONS.join(", ") +
        ".",
      metadata: { success: false, error: "INVALID_ACTION" },
    };
  }

  if (!VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Unknown action '${String(action)}'. Supported actions: ${VALID_ACTIONS.join(", ")}.`,
      metadata: { success: false, error: "INVALID_ACTION" },
    };
  }

  switch (action) {
    case "create_workbook":
      return actionCreateWorkbook(params);

    case "add_sheet":
      return actionAddSheet(params);

    case "set_cells":
      return actionSetCells(params);

    case "get_sheet":
      return actionGetSheet(params);

    case "compute_formula":
      return actionComputeFormula(params);

    case "export_csv":
      return actionExportCsv(params);

    case "list_workbooks":
      return actionListWorkbooks();

    default:
      return {
        result: `Error: Unknown action '${String(action)}'.`,
        metadata: { success: false, error: "INVALID_ACTION" },
      };
  }
}
