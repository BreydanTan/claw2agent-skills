import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { execute, validate, meta, _clearStore, _storeSize } from "../handler.js";

// ---------------------------------------------------------------------------
// Helper: create a workbook and return the result
// ---------------------------------------------------------------------------

async function createWorkbook(overrides = {}) {
  const params = {
    action: "create_workbook",
    name: "Test Workbook",
    ...overrides,
  };
  return execute(params, {});
}

async function addSheet(workbookId, sheetName = "Sheet1") {
  return execute({ action: "add_sheet", workbookId, sheetName }, {});
}

async function setCells(workbookId, sheetName, cells) {
  return execute({ action: "set_cells", workbookId, sheetName, cells }, {});
}

async function getSheet(workbookId, sheetName) {
  return execute({ action: "get_sheet", workbookId, sheetName }, {});
}

async function computeFormula(workbookId, sheetName, formula, range) {
  return execute({ action: "compute_formula", workbookId, sheetName, formula, range }, {});
}

async function exportCsv(workbookId, sheetName) {
  return execute({ action: "export_csv", workbookId, sheetName }, {});
}

// ===========================================================================
// meta export
// ===========================================================================

describe("excel-api: meta", () => {
  it("should export meta with correct name", () => {
    assert.equal(meta.name, "excel-api");
  });

  it("should export meta with version", () => {
    assert.equal(meta.version, "1.0.0");
  });

  it("should export meta with description", () => {
    assert.ok(meta.description.length > 0);
  });

  it("should export meta with all 7 actions", () => {
    assert.equal(meta.actions.length, 7);
    assert.ok(meta.actions.includes("create_workbook"));
    assert.ok(meta.actions.includes("add_sheet"));
    assert.ok(meta.actions.includes("set_cells"));
    assert.ok(meta.actions.includes("get_sheet"));
    assert.ok(meta.actions.includes("compute_formula"));
    assert.ok(meta.actions.includes("export_csv"));
    assert.ok(meta.actions.includes("list_workbooks"));
  });
});

// ===========================================================================
// validate export
// ===========================================================================

describe("excel-api: validate", () => {
  it("should return valid for create_workbook action", () => {
    const res = validate({ action: "create_workbook" });
    assert.equal(res.valid, true);
  });

  it("should return valid for add_sheet action", () => {
    const res = validate({ action: "add_sheet" });
    assert.equal(res.valid, true);
  });

  it("should return valid for set_cells action", () => {
    const res = validate({ action: "set_cells" });
    assert.equal(res.valid, true);
  });

  it("should return valid for get_sheet action", () => {
    const res = validate({ action: "get_sheet" });
    assert.equal(res.valid, true);
  });

  it("should return valid for compute_formula action", () => {
    const res = validate({ action: "compute_formula" });
    assert.equal(res.valid, true);
  });

  it("should return valid for export_csv action", () => {
    const res = validate({ action: "export_csv" });
    assert.equal(res.valid, true);
  });

  it("should return valid for list_workbooks action", () => {
    const res = validate({ action: "list_workbooks" });
    assert.equal(res.valid, true);
  });

  it("should return invalid for unknown action", () => {
    const res = validate({ action: "unknown" });
    assert.equal(res.valid, false);
    assert.ok(res.error.includes("Invalid action"));
  });

  it("should return invalid for missing action", () => {
    const res = validate({});
    assert.equal(res.valid, false);
  });

  it("should return invalid for null params", () => {
    const res = validate(null);
    assert.equal(res.valid, false);
  });

  it("should return invalid for undefined params", () => {
    const res = validate(undefined);
    assert.equal(res.valid, false);
  });
});

// ===========================================================================
// _clearStore / _storeSize
// ===========================================================================

describe("excel-api: store helpers", () => {
  beforeEach(() => { _clearStore(); });

  it("should start with empty store", () => {
    assert.equal(_storeSize(), 0);
  });

  it("should reflect store size after creating workbooks", async () => {
    await createWorkbook();
    assert.equal(_storeSize(), 1);
    await createWorkbook({ name: "Second" });
    assert.equal(_storeSize(), 2);
  });

  it("should clear all workbooks", async () => {
    await createWorkbook();
    await createWorkbook({ name: "Second" });
    assert.equal(_storeSize(), 2);
    _clearStore();
    assert.equal(_storeSize(), 0);
  });
});

// ===========================================================================
// Action: invalid / missing actions
// ===========================================================================

describe("excel-api: action validation", () => {
  beforeEach(() => { _clearStore(); });

  it("should return error when action is missing", async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_ACTION");
    assert.ok(res.result.includes("Error"));
  });

  it("should return error when action is null", async () => {
    const res = await execute({ action: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_ACTION");
  });

  it("should return error when action is undefined", async () => {
    const res = await execute({ action: undefined }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_ACTION");
  });

  it("should return error for unknown action", async () => {
    const res = await execute({ action: "unknown_action" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_ACTION");
    assert.ok(res.result.includes("Unknown action"));
  });

  it("should return error when params is null", async () => {
    const res = await execute(null, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_ACTION");
  });

  it("should return error when params is undefined", async () => {
    const res = await execute(undefined, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_ACTION");
  });

  it("should list supported actions in error message", async () => {
    const res = await execute({}, {});
    assert.ok(res.result.includes("create_workbook"));
    assert.ok(res.result.includes("add_sheet"));
    assert.ok(res.result.includes("list_workbooks"));
  });
});

// ===========================================================================
// Action: create_workbook
// ===========================================================================

describe("excel-api: create_workbook", () => {
  beforeEach(() => { _clearStore(); });

  it("should create a workbook with a name", async () => {
    const res = await createWorkbook({ name: "My Workbook" });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "create_workbook");
    assert.equal(res.metadata.name, "My Workbook");
    assert.ok(res.metadata.workbookId);
  });

  it("should generate a UUID for workbook ID", async () => {
    const res = await createWorkbook();
    assert.ok(typeof res.metadata.workbookId === "string");
    assert.ok(res.metadata.workbookId.length > 0);
    // UUID format check (rough)
    assert.ok(res.metadata.workbookId.includes("-"));
  });

  it("should trim the name", async () => {
    const res = await createWorkbook({ name: "  Trimmed  " });
    assert.equal(res.metadata.name, "Trimmed");
  });

  it("should include workbookId in result text", async () => {
    const res = await createWorkbook({ name: "My Workbook" });
    assert.ok(res.result.includes(res.metadata.workbookId));
  });

  it("should include name in result text", async () => {
    const res = await createWorkbook({ name: "My Workbook" });
    assert.ok(res.result.includes("My Workbook"));
  });

  it("should include createdAt in metadata", async () => {
    const res = await createWorkbook();
    assert.ok(res.metadata.createdAt);
    assert.ok(typeof res.metadata.createdAt === "string");
  });

  it("should generate unique IDs for different workbooks", async () => {
    const res1 = await createWorkbook({ name: "First" });
    const res2 = await createWorkbook({ name: "Second" });
    assert.notEqual(res1.metadata.workbookId, res2.metadata.workbookId);
  });

  it("should return error for missing name", async () => {
    const res = await execute({ action: "create_workbook" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for empty string name", async () => {
    const res = await createWorkbook({ name: "" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for whitespace-only name", async () => {
    const res = await createWorkbook({ name: "   " });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-string name", async () => {
    const res = await createWorkbook({ name: 123 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for name exceeding 200 characters", async () => {
    const res = await createWorkbook({ name: "a".repeat(201) });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("200"));
  });

  it("should accept name at exactly 200 characters", async () => {
    const res = await createWorkbook({ name: "a".repeat(200) });
    assert.equal(res.metadata.success, true);
  });
});

// ===========================================================================
// Action: add_sheet
// ===========================================================================

describe("excel-api: add_sheet", () => {
  beforeEach(() => { _clearStore(); });

  it("should add a sheet to a workbook", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Sheet1");
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "add_sheet");
    assert.equal(res.metadata.sheetName, "Sheet1");
  });

  it("should track totalSheets in metadata", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await addSheet(id, "Sheet2");
    assert.equal(res.metadata.totalSheets, 2);
  });

  it("should return error for missing workbookId", async () => {
    const res = await execute({ action: "add_sheet", sheetName: "Sheet1" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent workbook", async () => {
    const res = await addSheet("non-existent-id", "Sheet1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for missing sheetName", async () => {
    const wb = await createWorkbook();
    const res = await execute({ action: "add_sheet", workbookId: wb.metadata.workbookId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for empty sheetName", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for sheetName exceeding 31 characters", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "a".repeat(32));
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("31"));
  });

  it("should accept sheetName at exactly 31 characters", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "a".repeat(31));
    assert.equal(res.metadata.success, true);
  });

  it("should reject sheetName with [ character", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Sheet[1]");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should reject sheetName with ] character", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Sheet]1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should reject sheetName with : character", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Sheet:1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should reject sheetName with * character", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Sheet*1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should reject sheetName with ? character", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Sheet?1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should reject sheetName with / character", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Sheet/1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should reject sheetName with backslash character", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Sheet\\1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should reject duplicate sheet names", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await addSheet(id, "Sheet1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("already exists"));
  });

  it("should include sheetName in result text", async () => {
    const wb = await createWorkbook();
    const res = await addSheet(wb.metadata.workbookId, "Revenue");
    assert.ok(res.result.includes("Revenue"));
  });
});

// ===========================================================================
// Action: set_cells
// ===========================================================================

describe("excel-api: set_cells", () => {
  beforeEach(() => { _clearStore(); });

  it("should set cells in a sheet", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: "Hello" },
      { row: 0, col: 1, value: 42 },
    ]);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "set_cells");
    assert.equal(res.metadata.cellsSet, 2);
  });

  it("should return error for missing workbookId", async () => {
    const res = await execute({ action: "set_cells", sheetName: "Sheet1", cells: [{ row: 0, col: 0, value: 1 }] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent workbook", async () => {
    const res = await setCells("bad-id", "Sheet1", [{ row: 0, col: 0, value: 1 }]);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for non-existent sheet", async () => {
    const wb = await createWorkbook();
    const res = await setCells(wb.metadata.workbookId, "Missing", [{ row: 0, col: 0, value: 1 }]);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for non-array cells", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await execute({ action: "set_cells", workbookId: id, sheetName: "Sheet1", cells: "not-array" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for empty cells array", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await setCells(id, "Sheet1", []);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for cells exceeding max 10000", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const cells = [];
    for (let i = 0; i < 10001; i++) {
      cells.push({ row: 0, col: i, value: i });
    }
    const res = await setCells(id, "Sheet1", cells);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("10000"));
  });

  it("should accept exactly 10000 cells", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const cells = [];
    for (let i = 0; i < 10000; i++) {
      cells.push({ row: Math.floor(i / 100), col: i % 100, value: i });
    }
    const res = await setCells(id, "Sheet1", cells);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.cellsSet, 10000);
  });

  it("should return error for cell with negative row", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await setCells(id, "Sheet1", [{ row: -1, col: 0, value: 1 }]);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for cell with negative col", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await setCells(id, "Sheet1", [{ row: 0, col: -1, value: 1 }]);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for cell with non-integer row", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await setCells(id, "Sheet1", [{ row: 1.5, col: 0, value: 1 }]);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for cell missing value", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await setCells(id, "Sheet1", [{ row: 0, col: 0 }]);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should allow null as a cell value", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await setCells(id, "Sheet1", [{ row: 0, col: 0, value: null }]);
    assert.equal(res.metadata.success, true);
  });

  it("should overwrite existing cell values", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: "old" }]);
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: "new" }]);
    const sheet = await getSheet(id, "Sheet1");
    assert.equal(sheet.metadata.rows[0][0], "new");
  });

  it("should include sheetName in result text", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Revenue");
    const res = await setCells(id, "Revenue", [{ row: 0, col: 0, value: 100 }]);
    assert.ok(res.result.includes("Revenue"));
  });
});

// ===========================================================================
// Action: get_sheet
// ===========================================================================

describe("excel-api: get_sheet", () => {
  beforeEach(() => { _clearStore(); });

  it("should retrieve an empty sheet", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await getSheet(id, "Sheet1");
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "get_sheet");
    assert.equal(res.metadata.cellCount, 0);
    assert.equal(res.metadata.rowCount, 0);
    assert.equal(res.metadata.colCount, 0);
    assert.deepEqual(res.metadata.rows, []);
  });

  it("should retrieve sheet data as 2D array", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: "A1" },
      { row: 0, col: 1, value: "B1" },
      { row: 1, col: 0, value: "A2" },
      { row: 1, col: 1, value: "B2" },
    ]);
    const res = await getSheet(id, "Sheet1");
    assert.equal(res.metadata.rowCount, 2);
    assert.equal(res.metadata.colCount, 2);
    assert.deepEqual(res.metadata.rows, [
      ["A1", "B1"],
      ["A2", "B2"],
    ]);
  });

  it("should fill gaps with null", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: "A1" },
      { row: 2, col: 2, value: "C3" },
    ]);
    const res = await getSheet(id, "Sheet1");
    assert.equal(res.metadata.rowCount, 3);
    assert.equal(res.metadata.colCount, 3);
    assert.equal(res.metadata.rows[0][0], "A1");
    assert.equal(res.metadata.rows[0][1], null);
    assert.equal(res.metadata.rows[1][0], null);
    assert.equal(res.metadata.rows[2][2], "C3");
  });

  it("should return error for missing workbookId", async () => {
    const res = await execute({ action: "get_sheet", sheetName: "Sheet1" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent workbook", async () => {
    const res = await getSheet("bad-id", "Sheet1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for non-existent sheet", async () => {
    const wb = await createWorkbook();
    const res = await getSheet(wb.metadata.workbookId, "Missing");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should include sheet name in result text", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Revenue");
    const res = await getSheet(id, "Revenue");
    assert.ok(res.result.includes("Revenue"));
  });

  it("should show (empty sheet) for empty sheets in result", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Empty");
    const res = await getSheet(id, "Empty");
    assert.ok(res.result.includes("(empty sheet)"));
  });

  it("should return correct cellCount", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 1 },
      { row: 0, col: 1, value: 2 },
      { row: 0, col: 2, value: 3 },
    ]);
    const res = await getSheet(id, "Sheet1");
    assert.equal(res.metadata.cellCount, 3);
  });
});

// ===========================================================================
// Action: compute_formula
// ===========================================================================

describe("excel-api: compute_formula", () => {
  beforeEach(() => { _clearStore(); });

  it("should compute SUM", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 10 },
      { row: 1, col: 0, value: 20 },
      { row: 2, col: 0, value: 30 },
    ]);
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.value, 60);
    assert.equal(res.metadata.formula, "SUM");
  });

  it("should compute AVG", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 10 },
      { row: 1, col: 0, value: 20 },
      { row: 2, col: 0, value: 30 },
    ]);
    const res = await computeFormula(id, "Sheet1", "AVG", { startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
    assert.equal(res.metadata.value, 20);
  });

  it("should compute COUNT", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 10 },
      { row: 1, col: 0, value: "text" },
      { row: 2, col: 0, value: 30 },
    ]);
    const res = await computeFormula(id, "Sheet1", "COUNT", { startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
    assert.equal(res.metadata.value, 2); // only numeric values counted
  });

  it("should compute MIN", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 15 },
      { row: 1, col: 0, value: 5 },
      { row: 2, col: 0, value: 25 },
    ]);
    const res = await computeFormula(id, "Sheet1", "MIN", { startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
    assert.equal(res.metadata.value, 5);
  });

  it("should compute MAX", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 15 },
      { row: 1, col: 0, value: 5 },
      { row: 2, col: 0, value: 25 },
    ]);
    const res = await computeFormula(id, "Sheet1", "MAX", { startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
    assert.equal(res.metadata.value, 25);
  });

  it("should compute MEDIAN with odd count", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 3 },
      { row: 1, col: 0, value: 1 },
      { row: 2, col: 0, value: 2 },
    ]);
    const res = await computeFormula(id, "Sheet1", "MEDIAN", { startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
    assert.equal(res.metadata.value, 2);
  });

  it("should compute MEDIAN with even count", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 1 },
      { row: 1, col: 0, value: 2 },
      { row: 2, col: 0, value: 3 },
      { row: 3, col: 0, value: 4 },
    ]);
    const res = await computeFormula(id, "Sheet1", "MEDIAN", { startRow: 0, startCol: 0, endRow: 3, endCol: 0 });
    assert.equal(res.metadata.value, 2.5);
  });

  it("should accept lowercase formula names", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: 10 }]);
    const res = await computeFormula(id, "Sheet1", "sum", { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.formula, "SUM");
    assert.equal(res.metadata.value, 10);
  });

  it("should skip non-numeric values in formulas", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 10 },
      { row: 1, col: 0, value: "hello" },
      { row: 2, col: 0, value: 20 },
    ]);
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
    assert.equal(res.metadata.value, 30);
    assert.equal(res.metadata.numericCount, 2);
  });

  it("should handle range spanning multiple columns", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 1 },
      { row: 0, col: 1, value: 2 },
      { row: 1, col: 0, value: 3 },
      { row: 1, col: 1, value: 4 },
    ]);
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
    assert.equal(res.metadata.value, 10);
  });

  it("should return null value when no numeric values found", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: "text" }]);
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.value, null);
    assert.equal(res.metadata.numericCount, 0);
  });

  it("should return COUNT=0 when no numeric values in range", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: "text" }]);
    const res = await computeFormula(id, "Sheet1", "COUNT", { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.value, 0);
  });

  it("should return error for invalid formula", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await computeFormula(id, "Sheet1", "INVALID", { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("INVALID"));
  });

  it("should return error for missing formula", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await execute({ action: "compute_formula", workbookId: id, sheetName: "Sheet1", range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 } }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for missing range", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await execute({ action: "compute_formula", workbookId: id, sheetName: "Sheet1", formula: "SUM" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for negative range values", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: -1, startCol: 0, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error when startRow > endRow", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: 5, startCol: 0, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error when startCol > endCol", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: 0, startCol: 5, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-integer range values", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: 0.5, startCol: 0, endRow: 1, endCol: 0 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent workbook", async () => {
    const res = await computeFormula("bad-id", "Sheet1", "SUM", { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for non-existent sheet", async () => {
    const wb = await createWorkbook();
    const res = await computeFormula(wb.metadata.workbookId, "Missing", "SUM", { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should include formula result in result text", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: 42 }]);
    const res = await computeFormula(id, "Sheet1", "SUM", { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    assert.ok(res.result.includes("42"));
    assert.ok(res.result.includes("SUM"));
  });
});

// ===========================================================================
// Action: export_csv
// ===========================================================================

describe("excel-api: export_csv", () => {
  beforeEach(() => { _clearStore(); });

  it("should export empty sheet as empty string", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    const res = await exportCsv(id, "Sheet1");
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "export_csv");
    assert.equal(res.metadata.csv, "");
  });

  it("should export simple data as CSV", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: "Name" },
      { row: 0, col: 1, value: "Age" },
      { row: 1, col: 0, value: "Alice" },
      { row: 1, col: 1, value: 30 },
    ]);
    const res = await exportCsv(id, "Sheet1");
    assert.equal(res.metadata.csv, "Name,Age\nAlice,30");
  });

  it("should escape values with commas", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: "hello, world" }]);
    const res = await exportCsv(id, "Sheet1");
    assert.equal(res.metadata.csv, '"hello, world"');
  });

  it("should escape values with quotes", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: 'say "hi"' }]);
    const res = await exportCsv(id, "Sheet1");
    assert.equal(res.metadata.csv, '"say ""hi"""');
  });

  it("should handle null cells as empty in CSV", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: "A" },
      { row: 0, col: 2, value: "C" },
    ]);
    const res = await exportCsv(id, "Sheet1");
    assert.equal(res.metadata.csv, "A,,C");
  });

  it("should include rowCount and colCount in metadata", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: 1 },
      { row: 1, col: 1, value: 2 },
    ]);
    const res = await exportCsv(id, "Sheet1");
    assert.equal(res.metadata.rowCount, 2);
    assert.equal(res.metadata.colCount, 2);
  });

  it("should return error for missing workbookId", async () => {
    const res = await execute({ action: "export_csv", sheetName: "Sheet1" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent workbook", async () => {
    const res = await exportCsv("bad-id", "Sheet1");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for non-existent sheet", async () => {
    const wb = await createWorkbook();
    const res = await exportCsv(wb.metadata.workbookId, "Missing");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return CSV in result field", async () => {
    const wb = await createWorkbook();
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [{ row: 0, col: 0, value: "data" }]);
    const res = await exportCsv(id, "Sheet1");
    assert.equal(res.result, "data");
  });
});

// ===========================================================================
// Action: list_workbooks
// ===========================================================================

describe("excel-api: list_workbooks", () => {
  beforeEach(() => { _clearStore(); });

  it("should return empty list when no workbooks exist", async () => {
    const res = await execute({ action: "list_workbooks" }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "list_workbooks");
    assert.equal(res.metadata.count, 0);
    assert.deepEqual(res.metadata.workbooks, []);
    assert.ok(res.result.includes("No workbooks found"));
  });

  it("should list a single workbook", async () => {
    await createWorkbook({ name: "Only One" });
    const res = await execute({ action: "list_workbooks" }, {});
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.workbooks[0].name, "Only One");
  });

  it("should list multiple workbooks", async () => {
    await createWorkbook({ name: "First" });
    await createWorkbook({ name: "Second" });
    await createWorkbook({ name: "Third" });
    const res = await execute({ action: "list_workbooks" }, {});
    assert.equal(res.metadata.count, 3);
  });

  it("should include sheetCount in summaries", async () => {
    const wb = await createWorkbook({ name: "With Sheets" });
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await addSheet(id, "Sheet2");
    const res = await execute({ action: "list_workbooks" }, {});
    const summary = res.metadata.workbooks.find((w) => w.name === "With Sheets");
    assert.equal(summary.sheetCount, 2);
  });

  it("should include sheetNames in summaries", async () => {
    const wb = await createWorkbook({ name: "Named Sheets" });
    const id = wb.metadata.workbookId;
    await addSheet(id, "Revenue");
    await addSheet(id, "Expenses");
    const res = await execute({ action: "list_workbooks" }, {});
    const summary = res.metadata.workbooks.find((w) => w.name === "Named Sheets");
    assert.ok(summary.sheetNames.includes("Revenue"));
    assert.ok(summary.sheetNames.includes("Expenses"));
  });

  it("should include formatted result text with name", async () => {
    await createWorkbook({ name: "Listed WB" });
    const res = await execute({ action: "list_workbooks" }, {});
    assert.ok(res.result.includes("Workbooks"));
    assert.ok(res.result.includes("Listed WB"));
  });

  it("should include total count in result text", async () => {
    await createWorkbook({ name: "A" });
    await createWorkbook({ name: "B" });
    const res = await execute({ action: "list_workbooks" }, {});
    assert.ok(res.result.includes("Total: 2"));
  });
});

// ===========================================================================
// Full workflow integration
// ===========================================================================

describe("excel-api: full workflow", () => {
  beforeEach(() => { _clearStore(); });

  it("should execute full create -> add_sheet -> set_cells -> get_sheet -> compute_formula -> export_csv workflow", async () => {
    // 1. Create workbook
    const create = await createWorkbook({ name: "Sales Report" });
    assert.equal(create.metadata.success, true);
    const id = create.metadata.workbookId;

    // 2. Add sheet
    const sheet = await addSheet(id, "Q4 Sales");
    assert.equal(sheet.metadata.success, true);

    // 3. Set cells (header + data)
    const cells = await setCells(id, "Q4 Sales", [
      { row: 0, col: 0, value: "Product" },
      { row: 0, col: 1, value: "Revenue" },
      { row: 0, col: 2, value: "Units" },
      { row: 1, col: 0, value: "Widget A" },
      { row: 1, col: 1, value: 1000 },
      { row: 1, col: 2, value: 50 },
      { row: 2, col: 0, value: "Widget B" },
      { row: 2, col: 1, value: 2000 },
      { row: 2, col: 2, value: 100 },
      { row: 3, col: 0, value: "Widget C" },
      { row: 3, col: 1, value: 3000 },
      { row: 3, col: 2, value: 150 },
    ]);
    assert.equal(cells.metadata.success, true);
    assert.equal(cells.metadata.cellsSet, 12);

    // 4. Get sheet to verify
    const get = await getSheet(id, "Q4 Sales");
    assert.equal(get.metadata.success, true);
    assert.equal(get.metadata.rowCount, 4);
    assert.equal(get.metadata.colCount, 3);
    assert.equal(get.metadata.rows[0][0], "Product");
    assert.equal(get.metadata.rows[1][1], 1000);

    // 5. Compute SUM of Revenue column
    const sum = await computeFormula(id, "Q4 Sales", "SUM", { startRow: 1, startCol: 1, endRow: 3, endCol: 1 });
    assert.equal(sum.metadata.success, true);
    assert.equal(sum.metadata.value, 6000);

    // 6. Compute AVG of Units column
    const avg = await computeFormula(id, "Q4 Sales", "AVG", { startRow: 1, startCol: 2, endRow: 3, endCol: 2 });
    assert.equal(avg.metadata.success, true);
    assert.equal(avg.metadata.value, 100);

    // 7. Export CSV
    const csv = await exportCsv(id, "Q4 Sales");
    assert.equal(csv.metadata.success, true);
    assert.ok(csv.metadata.csv.includes("Product,Revenue,Units"));
    assert.ok(csv.metadata.csv.includes("Widget A,1000,50"));
    assert.ok(csv.metadata.csv.includes("Widget B,2000,100"));
    assert.ok(csv.metadata.csv.includes("Widget C,3000,150"));
  });

  it("should handle multiple workbooks independently", async () => {
    const wb1 = await createWorkbook({ name: "Workbook 1" });
    const wb2 = await createWorkbook({ name: "Workbook 2" });

    await addSheet(wb1.metadata.workbookId, "Sheet1");
    await addSheet(wb2.metadata.workbookId, "Sheet1");

    await setCells(wb1.metadata.workbookId, "Sheet1", [{ row: 0, col: 0, value: "WB1" }]);
    await setCells(wb2.metadata.workbookId, "Sheet1", [{ row: 0, col: 0, value: "WB2" }]);

    const get1 = await getSheet(wb1.metadata.workbookId, "Sheet1");
    const get2 = await getSheet(wb2.metadata.workbookId, "Sheet1");

    assert.equal(get1.metadata.rows[0][0], "WB1");
    assert.equal(get2.metadata.rows[0][0], "WB2");
  });

  it("should handle multiple sheets in one workbook", async () => {
    const wb = await createWorkbook({ name: "Multi-sheet" });
    const id = wb.metadata.workbookId;

    await addSheet(id, "Revenue");
    await addSheet(id, "Costs");

    await setCells(id, "Revenue", [{ row: 0, col: 0, value: 5000 }]);
    await setCells(id, "Costs", [{ row: 0, col: 0, value: 2000 }]);

    const rev = await getSheet(id, "Revenue");
    const costs = await getSheet(id, "Costs");

    assert.equal(rev.metadata.rows[0][0], 5000);
    assert.equal(costs.metadata.rows[0][0], 2000);
  });

  it("should list workbooks with correct sheet counts after full workflow", async () => {
    const wb1 = await createWorkbook({ name: "WB1" });
    const wb2 = await createWorkbook({ name: "WB2" });

    await addSheet(wb1.metadata.workbookId, "A");
    await addSheet(wb1.metadata.workbookId, "B");
    await addSheet(wb2.metadata.workbookId, "X");

    const list = await execute({ action: "list_workbooks" }, {});
    assert.equal(list.metadata.count, 2);

    const s1 = list.metadata.workbooks.find((w) => w.name === "WB1");
    const s2 = list.metadata.workbooks.find((w) => w.name === "WB2");
    assert.equal(s1.sheetCount, 2);
    assert.equal(s2.sheetCount, 1);
  });

  it("should compute all formula types on same data", async () => {
    const wb = await createWorkbook({ name: "Formulas" });
    const id = wb.metadata.workbookId;
    await addSheet(id, "Data");
    await setCells(id, "Data", [
      { row: 0, col: 0, value: 10 },
      { row: 1, col: 0, value: 20 },
      { row: 2, col: 0, value: 30 },
      { row: 3, col: 0, value: 40 },
      { row: 4, col: 0, value: 50 },
    ]);
    const range = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };

    const sum = await computeFormula(id, "Data", "SUM", range);
    assert.equal(sum.metadata.value, 150);

    const avg = await computeFormula(id, "Data", "AVG", range);
    assert.equal(avg.metadata.value, 30);

    const count = await computeFormula(id, "Data", "COUNT", range);
    assert.equal(count.metadata.value, 5);

    const min = await computeFormula(id, "Data", "MIN", range);
    assert.equal(min.metadata.value, 10);

    const max = await computeFormula(id, "Data", "MAX", range);
    assert.equal(max.metadata.value, 50);

    const median = await computeFormula(id, "Data", "MEDIAN", range);
    assert.equal(median.metadata.value, 30);
  });

  it("should handle setting boolean and mixed-type cell values", async () => {
    const wb = await createWorkbook({ name: "Mixed Types" });
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: true },
      { row: 0, col: 1, value: false },
      { row: 0, col: 2, value: 42 },
      { row: 0, col: 3, value: "hello" },
      { row: 0, col: 4, value: null },
    ]);
    const get = await getSheet(id, "Sheet1");
    assert.equal(get.metadata.rows[0][0], true);
    assert.equal(get.metadata.rows[0][1], false);
    assert.equal(get.metadata.rows[0][2], 42);
    assert.equal(get.metadata.rows[0][3], "hello");
    assert.equal(get.metadata.rows[0][4], null);
  });

  it("should export CSV with newline values properly escaped", async () => {
    const wb = await createWorkbook({ name: "Newline Test" });
    const id = wb.metadata.workbookId;
    await addSheet(id, "Sheet1");
    await setCells(id, "Sheet1", [
      { row: 0, col: 0, value: "line1\nline2" },
    ]);
    const res = await exportCsv(id, "Sheet1");
    assert.equal(res.metadata.csv, '"line1\nline2"');
  });

  it("should handle large grid of data", async () => {
    const wb = await createWorkbook({ name: "Large Grid" });
    const id = wb.metadata.workbookId;
    await addSheet(id, "Data");

    const cells = [];
    for (let r = 0; r < 50; r++) {
      for (let c = 0; c < 10; c++) {
        cells.push({ row: r, col: c, value: r * 10 + c });
      }
    }
    await setCells(id, "Data", cells);

    const get = await getSheet(id, "Data");
    assert.equal(get.metadata.rowCount, 50);
    assert.equal(get.metadata.colCount, 10);
    assert.equal(get.metadata.cellCount, 500);

    const sum = await computeFormula(id, "Data", "SUM", { startRow: 0, startCol: 0, endRow: 49, endCol: 9 });
    // Sum of 0..499 = 499*500/2 = 124750
    assert.equal(sum.metadata.value, 124750);
  });
});
