import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { execute, validate, meta, _clearStore, _storeSize } from "../handler.js";

// ---------------------------------------------------------------------------
// Helper: create a chart and return the result
// ---------------------------------------------------------------------------

function defaultData() {
  return {
    labels: ["Jan", "Feb", "Mar"],
    datasets: [{ label: "Sales", data: [10, 20, 30] }],
  };
}

async function createChart(overrides = {}) {
  const params = {
    action: "create_chart",
    type: "bar",
    title: "Test Chart",
    data: defaultData(),
    ...overrides,
  };
  return execute(params, {});
}

async function getChart(chartId) {
  return execute({ action: "get_chart", chartId }, {});
}

async function updateChart(chartId, updates = {}) {
  return execute({ action: "update_chart", chartId, ...updates }, {});
}

async function deleteChart(chartId) {
  return execute({ action: "delete_chart", chartId }, {});
}

async function exportConfig(chartId) {
  return execute({ action: "export_config", chartId }, {});
}

// ===========================================================================
// meta export
// ===========================================================================

describe("chart-generator: meta", () => {
  it("should export meta with correct name", () => {
    assert.equal(meta.name, "chart-generator");
  });

  it("should export meta with version", () => {
    assert.equal(meta.version, "1.0.0");
  });

  it("should export meta with description", () => {
    assert.ok(meta.description.length > 0);
  });

  it("should export meta with all 7 actions", () => {
    assert.equal(meta.actions.length, 7);
    assert.ok(meta.actions.includes("create_chart"));
    assert.ok(meta.actions.includes("update_chart"));
    assert.ok(meta.actions.includes("get_chart"));
    assert.ok(meta.actions.includes("delete_chart"));
    assert.ok(meta.actions.includes("export_config"));
    assert.ok(meta.actions.includes("list_charts"));
    assert.ok(meta.actions.includes("list_chart_types"));
  });
});

// ===========================================================================
// validate export
// ===========================================================================

describe("chart-generator: validate", () => {
  it("should return valid for create_chart action", () => {
    const res = validate({ action: "create_chart" });
    assert.equal(res.valid, true);
  });

  it("should return valid for update_chart action", () => {
    const res = validate({ action: "update_chart" });
    assert.equal(res.valid, true);
  });

  it("should return valid for get_chart action", () => {
    const res = validate({ action: "get_chart" });
    assert.equal(res.valid, true);
  });

  it("should return valid for delete_chart action", () => {
    const res = validate({ action: "delete_chart" });
    assert.equal(res.valid, true);
  });

  it("should return valid for export_config action", () => {
    const res = validate({ action: "export_config" });
    assert.equal(res.valid, true);
  });

  it("should return valid for list_charts action", () => {
    const res = validate({ action: "list_charts" });
    assert.equal(res.valid, true);
  });

  it("should return valid for list_chart_types action", () => {
    const res = validate({ action: "list_chart_types" });
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

describe("chart-generator: store helpers", () => {
  beforeEach(() => { _clearStore(); });

  it("should start with empty store", () => {
    assert.equal(_storeSize(), 0);
  });

  it("should reflect store size after creating charts", async () => {
    await createChart();
    assert.equal(_storeSize(), 1);
    await createChart({ title: "Second" });
    assert.equal(_storeSize(), 2);
  });

  it("should clear all charts", async () => {
    await createChart();
    await createChart({ title: "Second" });
    assert.equal(_storeSize(), 2);
    _clearStore();
    assert.equal(_storeSize(), 0);
  });
});

// ===========================================================================
// Action: invalid / missing actions
// ===========================================================================

describe("chart-generator: action validation", () => {
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
    assert.ok(res.result.includes("create_chart"));
    assert.ok(res.result.includes("list_charts"));
    assert.ok(res.result.includes("list_chart_types"));
  });
});

// ===========================================================================
// Action: create_chart
// ===========================================================================

describe("chart-generator: create_chart", () => {
  beforeEach(() => { _clearStore(); });

  it("should create a chart with valid params", async () => {
    const res = await createChart({ title: "My Chart", type: "line" });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "create_chart");
    assert.equal(res.metadata.title, "My Chart");
    assert.equal(res.metadata.type, "line");
    assert.ok(res.metadata.chartId);
  });

  it("should generate a UUID for chart ID", async () => {
    const res = await createChart();
    assert.ok(typeof res.metadata.chartId === "string");
    assert.ok(res.metadata.chartId.length > 0);
    assert.ok(res.metadata.chartId.includes("-"));
  });

  it("should trim the title", async () => {
    const res = await createChart({ title: "  Trimmed Title  " });
    assert.equal(res.metadata.title, "Trimmed Title");
  });

  it("should include chartId in result text", async () => {
    const res = await createChart({ title: "My Chart" });
    assert.ok(res.result.includes(res.metadata.chartId));
  });

  it("should include title in result text", async () => {
    const res = await createChart({ title: "Revenue Chart" });
    assert.ok(res.result.includes("Revenue Chart"));
  });

  it("should include type in result text", async () => {
    const res = await createChart({ type: "pie" });
    assert.ok(res.result.includes("pie"));
  });

  it("should include createdAt in metadata", async () => {
    const res = await createChart();
    assert.ok(res.metadata.createdAt);
    assert.ok(typeof res.metadata.createdAt === "string");
  });

  it("should include datasetCount in metadata", async () => {
    const res = await createChart();
    assert.equal(res.metadata.datasetCount, 1);
  });

  it("should include labelCount in metadata", async () => {
    const res = await createChart();
    assert.equal(res.metadata.labelCount, 3);
  });

  it("should generate unique IDs for different charts", async () => {
    const res1 = await createChart({ title: "First" });
    const res2 = await createChart({ title: "Second" });
    assert.notEqual(res1.metadata.chartId, res2.metadata.chartId);
  });

  // Type validation
  it("should accept line type", async () => {
    const res = await createChart({ type: "line" });
    assert.equal(res.metadata.success, true);
  });

  it("should accept bar type", async () => {
    const res = await createChart({ type: "bar" });
    assert.equal(res.metadata.success, true);
  });

  it("should accept pie type", async () => {
    const res = await createChart({ type: "pie" });
    assert.equal(res.metadata.success, true);
  });

  it("should accept doughnut type", async () => {
    const res = await createChart({ type: "doughnut" });
    assert.equal(res.metadata.success, true);
  });

  it("should accept radar type", async () => {
    const res = await createChart({ type: "radar" });
    assert.equal(res.metadata.success, true);
  });

  it("should accept scatter type", async () => {
    const res = await createChart({ type: "scatter" });
    assert.equal(res.metadata.success, true);
  });

  it("should accept area type", async () => {
    const res = await createChart({ type: "area" });
    assert.equal(res.metadata.success, true);
  });

  it("should return error for invalid chart type", async () => {
    const res = await createChart({ type: "histogram" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("histogram"));
  });

  it("should return error for missing type", async () => {
    const res = await execute({ action: "create_chart", title: "X", data: defaultData() }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-string type", async () => {
    const res = await createChart({ type: 123 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  // Title validation
  it("should return error for missing title", async () => {
    const res = await execute({ action: "create_chart", type: "bar", data: defaultData() }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for empty string title", async () => {
    const res = await createChart({ title: "" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for whitespace-only title", async () => {
    const res = await createChart({ title: "   " });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-string title", async () => {
    const res = await createChart({ title: 123 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for title exceeding 200 characters", async () => {
    const res = await createChart({ title: "a".repeat(201) });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("200"));
  });

  it("should accept title at exactly 200 characters", async () => {
    const res = await createChart({ title: "a".repeat(200) });
    assert.equal(res.metadata.success, true);
  });

  // Data validation
  it("should return error for missing data", async () => {
    const res = await execute({ action: "create_chart", type: "bar", title: "X" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-object data", async () => {
    const res = await createChart({ data: "not-object" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for array data", async () => {
    const res = await createChart({ data: [1, 2, 3] });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for missing labels in data", async () => {
    const res = await createChart({ data: { datasets: [{ label: "A", data: [1] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-array labels", async () => {
    const res = await createChart({ data: { labels: "not-array", datasets: [{ label: "A", data: [1] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for labels exceeding 100 items", async () => {
    const labels = Array.from({ length: 101 }, (_, i) => `L${i}`);
    const res = await createChart({ data: { labels, datasets: [{ label: "A", data: [1] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("100"));
  });

  it("should accept exactly 100 labels", async () => {
    const labels = Array.from({ length: 100 }, (_, i) => `L${i}`);
    const res = await createChart({ data: { labels, datasets: [{ label: "A", data: [1] }] } });
    assert.equal(res.metadata.success, true);
  });

  it("should return error for non-string label", async () => {
    const res = await createChart({ data: { labels: [123], datasets: [{ label: "A", data: [1] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for missing datasets in data", async () => {
    const res = await createChart({ data: { labels: ["A"] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-array datasets", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: "not-array" } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for empty datasets array", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for datasets exceeding 20", async () => {
    const datasets = Array.from({ length: 21 }, (_, i) => ({ label: `DS${i}`, data: [1] }));
    const res = await createChart({ data: { labels: ["A"], datasets } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("20"));
  });

  it("should accept exactly 20 datasets", async () => {
    const datasets = Array.from({ length: 20 }, (_, i) => ({ label: `DS${i}`, data: [1] }));
    const res = await createChart({ data: { labels: ["A"], datasets } });
    assert.equal(res.metadata.success, true);
  });

  it("should return error for dataset missing label", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ data: [1] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for dataset with empty label", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "", data: [1] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for dataset with non-string label", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: 42, data: [1] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for dataset missing data", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A" }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for dataset with non-array data", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A", data: "bad" }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for dataset data exceeding 1000 values", async () => {
    const dataVals = Array.from({ length: 1001 }, (_, i) => i);
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A", data: dataVals }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("1000"));
  });

  it("should accept exactly 1000 data values", async () => {
    const dataVals = Array.from({ length: 1000 }, (_, i) => i);
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A", data: dataVals }] } });
    assert.equal(res.metadata.success, true);
  });

  it("should return error for non-number data values", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A", data: ["bad"] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for NaN data values", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A", data: [NaN] }] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should accept negative numbers in data values", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A", data: [-10, -5, 0] }] } });
    assert.equal(res.metadata.success, true);
  });

  it("should accept zero values in data", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A", data: [0] }] } });
    assert.equal(res.metadata.success, true);
  });

  it("should accept empty labels array", async () => {
    const res = await createChart({ data: { labels: [], datasets: [{ label: "A", data: [1] }] } });
    assert.equal(res.metadata.success, true);
  });

  it("should accept dataset with empty data array", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [{ label: "A", data: [] }] } });
    assert.equal(res.metadata.success, true);
  });

  // Options validation
  it("should accept chart with valid options", async () => {
    const res = await createChart({
      options: { backgroundColor: "#ff0000", borderColor: "#000000", legend: true, responsive: false },
    });
    assert.equal(res.metadata.success, true);
  });

  it("should accept chart without options", async () => {
    const res = await createChart();
    assert.equal(res.metadata.success, true);
  });

  it("should return error for non-object options", async () => {
    const res = await createChart({ options: "bad" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for array options", async () => {
    const res = await createChart({ options: [1, 2] });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for unknown option key", async () => {
    const res = await createChart({ options: { unknownKey: true } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("unknownKey"));
  });

  it("should return error for non-string backgroundColor", async () => {
    const res = await createChart({ options: { backgroundColor: 123 } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-string borderColor", async () => {
    const res = await createChart({ options: { borderColor: true } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-boolean legend", async () => {
    const res = await createChart({ options: { legend: "yes" } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-boolean responsive", async () => {
    const res = await createChart({ options: { responsive: 1 } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should accept null options", async () => {
    const res = await createChart({ options: null });
    assert.equal(res.metadata.success, true);
  });

  it("should accept empty options object", async () => {
    const res = await createChart({ options: {} });
    assert.equal(res.metadata.success, true);
  });

  it("should deep copy data to prevent external mutation", async () => {
    const data = defaultData();
    const res = await createChart({ data });
    data.labels.push("Mutated");
    const get = await getChart(res.metadata.chartId);
    assert.equal(get.metadata.data.labels.length, 3);
  });

  it("should create multiple datasets", async () => {
    const data = {
      labels: ["Q1", "Q2"],
      datasets: [
        { label: "Revenue", data: [100, 200] },
        { label: "Cost", data: [50, 80] },
      ],
    };
    const res = await createChart({ data });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.datasetCount, 2);
  });

  it("should return error for dataset that is not an object", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: ["bad"] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for dataset that is null", async () => {
    const res = await createChart({ data: { labels: ["A"], datasets: [null] } });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });
});

// ===========================================================================
// Action: update_chart
// ===========================================================================

describe("chart-generator: update_chart", () => {
  beforeEach(() => { _clearStore(); });

  it("should update chart title", async () => {
    const c = await createChart({ title: "Old Title" });
    const res = await updateChart(c.metadata.chartId, { title: "New Title" });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "update_chart");
    assert.equal(res.metadata.title, "New Title");
    assert.ok(res.metadata.updatedFields.includes("title"));
  });

  it("should update chart data", async () => {
    const c = await createChart();
    const newData = { labels: ["X", "Y"], datasets: [{ label: "New", data: [5, 10] }] };
    const res = await updateChart(c.metadata.chartId, { data: newData });
    assert.equal(res.metadata.success, true);
    assert.ok(res.metadata.updatedFields.includes("data"));
  });

  it("should update chart options", async () => {
    const c = await createChart();
    const res = await updateChart(c.metadata.chartId, { options: { legend: false } });
    assert.equal(res.metadata.success, true);
    assert.ok(res.metadata.updatedFields.includes("options"));
  });

  it("should update multiple fields at once", async () => {
    const c = await createChart();
    const res = await updateChart(c.metadata.chartId, {
      title: "Updated",
      options: { responsive: false },
    });
    assert.equal(res.metadata.success, true);
    assert.ok(res.metadata.updatedFields.includes("title"));
    assert.ok(res.metadata.updatedFields.includes("options"));
  });

  it("should trim updated title", async () => {
    const c = await createChart();
    const res = await updateChart(c.metadata.chartId, { title: "  Trimmed  " });
    assert.equal(res.metadata.title, "Trimmed");
  });

  it("should update updatedAt timestamp", async () => {
    const c = await createChart();
    const before = c.metadata.createdAt;
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));
    const res = await updateChart(c.metadata.chartId, { title: "Updated" });
    assert.ok(res.metadata.updatedAt);
  });

  it("should persist updated data", async () => {
    const c = await createChart();
    const newData = { labels: ["X"], datasets: [{ label: "New", data: [99] }] };
    await updateChart(c.metadata.chartId, { data: newData });
    const get = await getChart(c.metadata.chartId);
    assert.deepEqual(get.metadata.data.labels, ["X"]);
    assert.equal(get.metadata.data.datasets[0].data[0], 99);
  });

  it("should return error for missing chartId", async () => {
    const res = await execute({ action: "update_chart", title: "X" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent chart", async () => {
    const res = await updateChart("non-existent-id", { title: "X" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for no update fields provided", async () => {
    const c = await createChart();
    const res = await execute({ action: "update_chart", chartId: c.metadata.chartId }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("No fields"));
  });

  it("should return error for invalid title in update", async () => {
    const c = await createChart();
    const res = await updateChart(c.metadata.chartId, { title: "" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for invalid data in update", async () => {
    const c = await createChart();
    const res = await updateChart(c.metadata.chartId, { data: "bad" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for invalid options in update", async () => {
    const c = await createChart();
    const res = await updateChart(c.metadata.chartId, { options: "bad" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should include updated fields in result text", async () => {
    const c = await createChart();
    const res = await updateChart(c.metadata.chartId, { title: "New" });
    assert.ok(res.result.includes("title"));
    assert.ok(res.result.includes("updated"));
  });

  it("should return error for title exceeding 200 chars in update", async () => {
    const c = await createChart();
    const res = await updateChart(c.metadata.chartId, { title: "a".repeat(201) });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });
});

// ===========================================================================
// Action: get_chart
// ===========================================================================

describe("chart-generator: get_chart", () => {
  beforeEach(() => { _clearStore(); });

  it("should retrieve a chart by ID", async () => {
    const c = await createChart({ title: "My Chart", type: "pie" });
    const res = await getChart(c.metadata.chartId);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "get_chart");
    assert.equal(res.metadata.title, "My Chart");
    assert.equal(res.metadata.type, "pie");
  });

  it("should return chart data in metadata", async () => {
    const c = await createChart();
    const res = await getChart(c.metadata.chartId);
    assert.ok(res.metadata.data);
    assert.deepEqual(res.metadata.data.labels, ["Jan", "Feb", "Mar"]);
    assert.equal(res.metadata.data.datasets.length, 1);
  });

  it("should return chart options in metadata", async () => {
    const c = await createChart({ options: { legend: true } });
    const res = await getChart(c.metadata.chartId);
    assert.deepEqual(res.metadata.options, { legend: true });
  });

  it("should include title in result text", async () => {
    const c = await createChart({ title: "Revenue Chart" });
    const res = await getChart(c.metadata.chartId);
    assert.ok(res.result.includes("Revenue Chart"));
  });

  it("should include type in result text", async () => {
    const c = await createChart({ type: "radar" });
    const res = await getChart(c.metadata.chartId);
    assert.ok(res.result.includes("radar"));
  });

  it("should include dataset info in result text", async () => {
    const c = await createChart();
    const res = await getChart(c.metadata.chartId);
    assert.ok(res.result.includes("Sales"));
  });

  it("should include timestamps in metadata", async () => {
    const c = await createChart();
    const res = await getChart(c.metadata.chartId);
    assert.ok(res.metadata.createdAt);
    assert.ok(res.metadata.updatedAt);
  });

  it("should return error for missing chartId", async () => {
    const res = await execute({ action: "get_chart" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for empty chartId", async () => {
    const res = await getChart("");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent chart", async () => {
    const res = await getChart("non-existent-id");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should deep copy data to prevent external mutation", async () => {
    const c = await createChart();
    const get1 = await getChart(c.metadata.chartId);
    get1.metadata.data.labels.push("Mutated");
    const get2 = await getChart(c.metadata.chartId);
    assert.equal(get2.metadata.data.labels.length, 3);
  });
});

// ===========================================================================
// Action: delete_chart
// ===========================================================================

describe("chart-generator: delete_chart", () => {
  beforeEach(() => { _clearStore(); });

  it("should delete a chart", async () => {
    const c = await createChart({ title: "To Delete" });
    assert.equal(_storeSize(), 1);
    const res = await deleteChart(c.metadata.chartId);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "delete_chart");
    assert.equal(res.metadata.title, "To Delete");
    assert.equal(_storeSize(), 0);
  });

  it("should include title in result text", async () => {
    const c = await createChart({ title: "Deleted Chart" });
    const res = await deleteChart(c.metadata.chartId);
    assert.ok(res.result.includes("Deleted Chart"));
  });

  it("should make chart unretrievable after deletion", async () => {
    const c = await createChart();
    await deleteChart(c.metadata.chartId);
    const res = await getChart(c.metadata.chartId);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for missing chartId", async () => {
    const res = await execute({ action: "delete_chart" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent chart", async () => {
    const res = await deleteChart("non-existent-id");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should not affect other charts when one is deleted", async () => {
    const c1 = await createChart({ title: "Keep" });
    const c2 = await createChart({ title: "Delete" });
    await deleteChart(c2.metadata.chartId);
    assert.equal(_storeSize(), 1);
    const res = await getChart(c1.metadata.chartId);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.title, "Keep");
  });

  it("should return error for deleting same chart twice", async () => {
    const c = await createChart();
    await deleteChart(c.metadata.chartId);
    const res = await deleteChart(c.metadata.chartId);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });
});

// ===========================================================================
// Action: export_config
// ===========================================================================

describe("chart-generator: export_config", () => {
  beforeEach(() => { _clearStore(); });

  it("should export a Chart.js-compatible config", async () => {
    const c = await createChart({ type: "bar", title: "Sales Chart" });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "export_config");
    assert.ok(res.metadata.config);
  });

  it("should set correct type in config", async () => {
    const c = await createChart({ type: "bar" });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.type, "bar");
  });

  it("should map area type to line in config", async () => {
    const c = await createChart({ type: "area" });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.type, "line");
    assert.equal(res.metadata.chartjsType, "line");
  });

  it("should set fill=true for area charts", async () => {
    const c = await createChart({ type: "area" });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.data.datasets[0].fill, true);
  });

  it("should not set fill for non-area charts", async () => {
    const c = await createChart({ type: "bar" });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.data.datasets[0].fill, undefined);
  });

  it("should include labels in config data", async () => {
    const c = await createChart();
    const res = await exportConfig(c.metadata.chartId);
    assert.deepEqual(res.metadata.config.data.labels, ["Jan", "Feb", "Mar"]);
  });

  it("should include datasets in config data", async () => {
    const c = await createChart();
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.data.datasets.length, 1);
    assert.equal(res.metadata.config.data.datasets[0].label, "Sales");
    assert.deepEqual(res.metadata.config.data.datasets[0].data, [10, 20, 30]);
  });

  it("should include title in config options", async () => {
    const c = await createChart({ title: "My Title" });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.options.plugins.title.display, true);
    assert.equal(res.metadata.config.options.plugins.title.text, "My Title");
  });

  it("should include legend in config options", async () => {
    const c = await createChart({ options: { legend: false } });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.options.plugins.legend.display, false);
  });

  it("should default legend to true", async () => {
    const c = await createChart();
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.options.plugins.legend.display, true);
  });

  it("should include responsive in config options", async () => {
    const c = await createChart({ options: { responsive: false } });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.options.responsive, false);
  });

  it("should default responsive to true", async () => {
    const c = await createChart();
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.options.responsive, true);
  });

  it("should include backgroundColor in datasets when set", async () => {
    const c = await createChart({ options: { backgroundColor: "#ff0000" } });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.data.datasets[0].backgroundColor, "#ff0000");
  });

  it("should include borderColor in datasets when set", async () => {
    const c = await createChart({ options: { borderColor: "#000000" } });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.config.data.datasets[0].borderColor, "#000000");
  });

  it("should return valid JSON in result field", async () => {
    const c = await createChart();
    const res = await exportConfig(c.metadata.chartId);
    const parsed = JSON.parse(res.result);
    assert.ok(parsed.type);
    assert.ok(parsed.data);
    assert.ok(parsed.options);
  });

  it("should return error for missing chartId", async () => {
    const res = await execute({ action: "export_config" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent chart", async () => {
    const res = await exportConfig("non-existent-id");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should include chartId in metadata", async () => {
    const c = await createChart();
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.chartId, c.metadata.chartId);
  });

  it("should include title in metadata", async () => {
    const c = await createChart({ title: "Export Test" });
    const res = await exportConfig(c.metadata.chartId);
    assert.equal(res.metadata.title, "Export Test");
  });
});

// ===========================================================================
// Action: list_charts
// ===========================================================================

describe("chart-generator: list_charts", () => {
  beforeEach(() => { _clearStore(); });

  it("should return empty list when no charts exist", async () => {
    const res = await execute({ action: "list_charts" }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "list_charts");
    assert.equal(res.metadata.count, 0);
    assert.deepEqual(res.metadata.charts, []);
    assert.ok(res.result.includes("No charts found"));
  });

  it("should list a single chart", async () => {
    await createChart({ title: "Only One" });
    const res = await execute({ action: "list_charts" }, {});
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.charts[0].title, "Only One");
  });

  it("should list multiple charts", async () => {
    await createChart({ title: "First" });
    await createChart({ title: "Second" });
    await createChart({ title: "Third" });
    const res = await execute({ action: "list_charts" }, {});
    assert.equal(res.metadata.count, 3);
  });

  it("should include type in chart summaries", async () => {
    await createChart({ title: "Pie Chart", type: "pie" });
    const res = await execute({ action: "list_charts" }, {});
    assert.equal(res.metadata.charts[0].type, "pie");
  });

  it("should include datasetCount in chart summaries", async () => {
    const data = {
      labels: ["A"],
      datasets: [
        { label: "D1", data: [1] },
        { label: "D2", data: [2] },
      ],
    };
    await createChart({ data });
    const res = await execute({ action: "list_charts" }, {});
    assert.equal(res.metadata.charts[0].datasetCount, 2);
  });

  it("should include labelCount in chart summaries", async () => {
    await createChart();
    const res = await execute({ action: "list_charts" }, {});
    assert.equal(res.metadata.charts[0].labelCount, 3);
  });

  it("should include formatted result text with title", async () => {
    await createChart({ title: "Listed Chart" });
    const res = await execute({ action: "list_charts" }, {});
    assert.ok(res.result.includes("Charts"));
    assert.ok(res.result.includes("Listed Chart"));
  });

  it("should include total count in result text", async () => {
    await createChart({ title: "A" });
    await createChart({ title: "B" });
    const res = await execute({ action: "list_charts" }, {});
    assert.ok(res.result.includes("Total: 2"));
  });

  it("should include timestamps in chart summaries", async () => {
    await createChart();
    const res = await execute({ action: "list_charts" }, {});
    assert.ok(res.metadata.charts[0].createdAt);
    assert.ok(res.metadata.charts[0].updatedAt);
  });
});

// ===========================================================================
// Action: list_chart_types
// ===========================================================================

describe("chart-generator: list_chart_types", () => {
  beforeEach(() => { _clearStore(); });

  it("should list all supported chart types", async () => {
    const res = await execute({ action: "list_chart_types" }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "list_chart_types");
    assert.equal(res.metadata.count, 7);
  });

  it("should include all 7 types", async () => {
    const res = await execute({ action: "list_chart_types" }, {});
    const typeNames = res.metadata.types.map((t) => t.type);
    assert.ok(typeNames.includes("line"));
    assert.ok(typeNames.includes("bar"));
    assert.ok(typeNames.includes("pie"));
    assert.ok(typeNames.includes("doughnut"));
    assert.ok(typeNames.includes("radar"));
    assert.ok(typeNames.includes("scatter"));
    assert.ok(typeNames.includes("area"));
  });

  it("should include description for each type", async () => {
    const res = await execute({ action: "list_chart_types" }, {});
    for (const t of res.metadata.types) {
      assert.ok(t.description.length > 0, `Missing description for type ${t.type}`);
    }
  });

  it("should include formatted result text", async () => {
    const res = await execute({ action: "list_chart_types" }, {});
    assert.ok(res.result.includes("Supported Chart Types"));
    assert.ok(res.result.includes("line"));
    assert.ok(res.result.includes("bar"));
    assert.ok(res.result.includes("pie"));
  });

  it("should not require any store data", async () => {
    // Store is empty, should still work
    assert.equal(_storeSize(), 0);
    const res = await execute({ action: "list_chart_types" }, {});
    assert.equal(res.metadata.success, true);
  });
});

// ===========================================================================
// Full workflow integration
// ===========================================================================

describe("chart-generator: full workflow", () => {
  beforeEach(() => { _clearStore(); });

  it("should execute full create -> get -> update -> export -> delete workflow", async () => {
    // 1. Create chart
    const create = await createChart({ title: "Sales Report", type: "line" });
    assert.equal(create.metadata.success, true);
    const id = create.metadata.chartId;

    // 2. Get chart
    const get = await getChart(id);
    assert.equal(get.metadata.success, true);
    assert.equal(get.metadata.title, "Sales Report");

    // 3. Update chart
    const update = await updateChart(id, { title: "Updated Sales Report" });
    assert.equal(update.metadata.success, true);
    assert.equal(update.metadata.title, "Updated Sales Report");

    // 4. Export config
    const exp = await exportConfig(id);
    assert.equal(exp.metadata.success, true);
    assert.equal(exp.metadata.config.type, "line");
    assert.equal(exp.metadata.config.options.plugins.title.text, "Updated Sales Report");

    // 5. Delete chart
    const del = await deleteChart(id);
    assert.equal(del.metadata.success, true);

    // 6. Verify deleted
    const getAfter = await getChart(id);
    assert.equal(getAfter.metadata.success, false);
    assert.equal(getAfter.metadata.error, "NOT_FOUND");
  });

  it("should handle multiple charts independently", async () => {
    const c1 = await createChart({ title: "Chart 1", type: "bar" });
    const c2 = await createChart({ title: "Chart 2", type: "pie" });

    const get1 = await getChart(c1.metadata.chartId);
    const get2 = await getChart(c2.metadata.chartId);

    assert.equal(get1.metadata.title, "Chart 1");
    assert.equal(get1.metadata.type, "bar");
    assert.equal(get2.metadata.title, "Chart 2");
    assert.equal(get2.metadata.type, "pie");
  });

  it("should list charts after creating multiple", async () => {
    await createChart({ title: "A", type: "line" });
    await createChart({ title: "B", type: "bar" });
    await createChart({ title: "C", type: "pie" });

    const list = await execute({ action: "list_charts" }, {});
    assert.equal(list.metadata.count, 3);
  });

  it("should update data and verify via get_chart", async () => {
    const c = await createChart();
    const newData = {
      labels: ["Q1", "Q2", "Q3", "Q4"],
      datasets: [
        { label: "Revenue", data: [100, 200, 300, 400] },
        { label: "Profit", data: [50, 80, 120, 180] },
      ],
    };
    await updateChart(c.metadata.chartId, { data: newData });
    const get = await getChart(c.metadata.chartId);
    assert.equal(get.metadata.data.labels.length, 4);
    assert.equal(get.metadata.data.datasets.length, 2);
    assert.equal(get.metadata.data.datasets[1].label, "Profit");
  });

  it("should export correct config for each chart type", async () => {
    const types = ["line", "bar", "pie", "doughnut", "radar", "scatter"];
    for (const type of types) {
      const c = await createChart({ type, title: `${type} chart` });
      const exp = await exportConfig(c.metadata.chartId);
      assert.equal(exp.metadata.config.type, type);
    }
  });

  it("should export area chart as line with fill", async () => {
    const c = await createChart({ type: "area", title: "Area" });
    const exp = await exportConfig(c.metadata.chartId);
    assert.equal(exp.metadata.config.type, "line");
    assert.equal(exp.metadata.config.data.datasets[0].fill, true);
  });

  it("should preserve options through create and export", async () => {
    const c = await createChart({
      options: { backgroundColor: "rgba(0,0,0,0.1)", borderColor: "red", legend: false, responsive: true },
    });
    const exp = await exportConfig(c.metadata.chartId);
    assert.equal(exp.metadata.config.data.datasets[0].backgroundColor, "rgba(0,0,0,0.1)");
    assert.equal(exp.metadata.config.data.datasets[0].borderColor, "red");
    assert.equal(exp.metadata.config.options.plugins.legend.display, false);
    assert.equal(exp.metadata.config.options.responsive, true);
  });

  it("should handle create, delete, list cycle", async () => {
    const c1 = await createChart({ title: "Keep" });
    const c2 = await createChart({ title: "Remove" });
    assert.equal(_storeSize(), 2);

    await deleteChart(c2.metadata.chartId);
    assert.equal(_storeSize(), 1);

    const list = await execute({ action: "list_charts" }, {});
    assert.equal(list.metadata.count, 1);
    assert.equal(list.metadata.charts[0].title, "Keep");
  });

  it("should list chart types independently of stored charts", async () => {
    await createChart({ title: "A" });
    const types = await execute({ action: "list_chart_types" }, {});
    assert.equal(types.metadata.count, 7);
  });

  it("should handle update followed by export", async () => {
    const c = await createChart({ type: "bar", title: "Before" });
    await updateChart(c.metadata.chartId, {
      title: "After",
      options: { legend: false },
    });
    const exp = await exportConfig(c.metadata.chartId);
    assert.equal(exp.metadata.config.options.plugins.title.text, "After");
    assert.equal(exp.metadata.config.options.plugins.legend.display, false);
  });

  it("should handle many charts without issues", async () => {
    for (let i = 0; i < 50; i++) {
      await createChart({ title: `Chart ${i}`, type: "line" });
    }
    assert.equal(_storeSize(), 50);
    const list = await execute({ action: "list_charts" }, {});
    assert.equal(list.metadata.count, 50);
  });

  it("should export config with multiple datasets", async () => {
    const data = {
      labels: ["A", "B", "C"],
      datasets: [
        { label: "Revenue", data: [10, 20, 30] },
        { label: "Cost", data: [5, 10, 15] },
        { label: "Profit", data: [5, 10, 15] },
      ],
    };
    const c = await createChart({ data, title: "Multi-Dataset" });
    const exp = await exportConfig(c.metadata.chartId);
    assert.equal(exp.metadata.config.data.datasets.length, 3);
    assert.equal(exp.metadata.config.data.datasets[2].label, "Profit");
  });
});
