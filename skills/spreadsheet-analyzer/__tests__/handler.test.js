import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { execute } from "../handler.js";

// ---------------------------------------------------------------------------
// Sample Data Sets
// ---------------------------------------------------------------------------

const EMPLOYEES = [
  { name: "Alice", age: 30, department: "Engineering", salary: 90000 },
  { name: "Bob", age: 25, department: "Engineering", salary: 85000 },
  { name: "Carol", age: 35, department: "Marketing", salary: 75000 },
  { name: "Dave", age: 28, department: "Marketing", salary: 70000 },
  { name: "Eve", age: 40, department: "Engineering", salary: 110000 },
  { name: "Frank", age: 33, department: "Sales", salary: 65000 },
  { name: "Grace", age: 29, department: "Sales", salary: 72000 },
  { name: "Hank", age: 45, department: "Engineering", salary: 120000 },
];

const SALES_DATA = [
  { product: "Widget", region: "North", quarter: "Q1", revenue: 1000 },
  { product: "Widget", region: "South", quarter: "Q1", revenue: 1500 },
  { product: "Widget", region: "North", quarter: "Q2", revenue: 1200 },
  { product: "Widget", region: "South", quarter: "Q2", revenue: 1800 },
  { product: "Gadget", region: "North", quarter: "Q1", revenue: 2000 },
  { product: "Gadget", region: "South", quarter: "Q1", revenue: 2500 },
  { product: "Gadget", region: "North", quarter: "Q2", revenue: 2200 },
  { product: "Gadget", region: "South", quarter: "Q2", revenue: 3000 },
];

const DATA_WITH_NULLS = [
  { name: "Alice", age: 30, email: "alice@test.com" },
  { name: "Bob", age: null, email: "bob@test.com" },
  { name: null, age: 35, email: null },
  { name: "Dave", age: 28, email: "dave@test.com" },
  { name: "", age: "", email: "" },
];

const DATA_WITH_DUPLICATES = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
  { name: "Alice", age: 30 },
  { name: "Carol", age: 35 },
  { name: "Bob", age: 25 },
  { name: "Bob", age: 25 },
  { name: "Dave", age: 40 },
];

const SINGLE_ROW = [{ name: "Alice", age: 30, salary: 90000 }];

const MIXED_TYPES = [
  { id: 1, value: "hello", active: true },
  { id: 2, value: "world", active: false },
  { id: 3, value: "test", active: true },
];

const NUMERIC_STRINGS = [
  { name: "A", score: "85" },
  { name: "B", score: "92" },
  { name: "C", score: "78" },
  { name: "D", score: "95" },
];

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: error handling", () => {
  it("should return error for missing action", async () => {
    const result = await execute({ data: EMPLOYEES }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_ACTION");
  });

  it("should return error for unknown action", async () => {
    const result = await execute({ action: "invalid_action", data: EMPLOYEES }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "UNKNOWN_ACTION");
    assert.ok(result.result.includes("Unknown action"));
  });

  it("should return error for missing data", async () => {
    const result = await execute({ action: "analyze" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_DATA");
  });

  it("should return error for non-array data", async () => {
    const result = await execute({ action: "analyze", data: "not an array" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_DATA");
  });

  it("should return error for empty array data", async () => {
    const result = await execute({ action: "analyze", data: [] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "EMPTY_DATA");
  });

  it("should return error for array of non-objects", async () => {
    const result = await execute({ action: "analyze", data: [1, 2, 3] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_ROW");
  });

  it("should return error for array containing null elements", async () => {
    const result = await execute({ action: "analyze", data: [null, { a: 1 }] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_ROW");
  });

  it("should return error for array containing nested arrays", async () => {
    const result = await execute({ action: "analyze", data: [[1, 2], { a: 1 }] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_ROW");
  });

  it("should return error when params is null", async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_ACTION");
  });

  it("should return error when params is undefined", async () => {
    const result = await execute(undefined, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_ACTION");
  });
});

// ---------------------------------------------------------------------------
// analyze action
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: analyze", () => {
  let sampleData;

  beforeEach(() => {
    sampleData = [...EMPLOYEES];
  });

  it("should compute statistics for all numeric columns when columns not specified", async () => {
    const result = await execute({ action: "analyze", data: sampleData }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "analyze");
    assert.ok(result.metadata.stats.age);
    assert.ok(result.metadata.stats.salary);
  });

  it("should compute correct min for age column", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["age"] }, {});

    assert.equal(result.metadata.stats.age.min, 25);
  });

  it("should compute correct max for age column", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["age"] }, {});

    assert.equal(result.metadata.stats.age.max, 45);
  });

  it("should compute correct sum for salary column", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["salary"] }, {});

    assert.equal(result.metadata.stats.salary.sum, 687000);
  });

  it("should compute correct mean for salary column", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["salary"] }, {});

    assert.equal(result.metadata.stats.salary.mean, 687000 / 8);
  });

  it("should compute correct median for even-length data", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["age"] }, {});

    // ages sorted: 25, 28, 29, 30, 33, 35, 40, 45 => median = (30+33)/2 = 31.5
    assert.equal(result.metadata.stats.age.median, 31.5);
  });

  it("should compute correct median for odd-length data", async () => {
    const data = [{ v: 1 }, { v: 3 }, { v: 5 }];
    const result = await execute({ action: "analyze", data, columns: ["v"] }, {});

    assert.equal(result.metadata.stats.v.median, 3);
  });

  it("should compute stddev", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["age"] }, {});

    assert.ok(typeof result.metadata.stats.age.stddev === "number");
    assert.ok(result.metadata.stats.age.stddev > 0);
  });

  it("should compute count of numeric values", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["age"] }, {});

    assert.equal(result.metadata.stats.age.count, 8);
  });

  it("should handle non-numeric columns gracefully", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["name"] }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.stats.name.count, 0);
    assert.ok(result.metadata.stats.name.error);
  });

  it("should handle specific columns parameter", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["salary"] }, {});

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.stats.salary);
    assert.ok(!result.metadata.stats.age, "Should not include unrequested columns");
  });

  it("should handle numeric strings", async () => {
    const result = await execute({ action: "analyze", data: NUMERIC_STRINGS, columns: ["score"] }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.stats.score.count, 4);
    assert.equal(result.metadata.stats.score.min, 78);
    assert.equal(result.metadata.stats.score.max, 95);
  });

  it("should skip null/undefined values in statistics", async () => {
    const result = await execute({ action: "analyze", data: DATA_WITH_NULLS, columns: ["age"] }, {});

    assert.ok(result.metadata.success);
    // Only rows with numeric age: 30, 35, 28 = 3 values
    assert.equal(result.metadata.stats.age.count, 3);
  });

  it("should include formatted text output", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["age"] }, {});

    assert.ok(result.result.includes("Statistical Analysis"));
    assert.ok(result.result.includes("Column: age"));
    assert.ok(result.result.includes("Min:"));
    assert.ok(result.result.includes("Max:"));
    assert.ok(result.result.includes("Mean:"));
  });

  it("should handle single row", async () => {
    const result = await execute({ action: "analyze", data: SINGLE_ROW, columns: ["age"] }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.stats.age.count, 1);
    assert.equal(result.metadata.stats.age.min, 30);
    assert.equal(result.metadata.stats.age.max, 30);
    assert.equal(result.metadata.stats.age.mean, 30);
    assert.equal(result.metadata.stats.age.median, 30);
    assert.equal(result.metadata.stats.age.stddev, 0);
  });

  it("should handle column that does not exist", async () => {
    const result = await execute({ action: "analyze", data: sampleData, columns: ["nonexistent"] }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.stats.nonexistent.count, 0);
  });
});

// ---------------------------------------------------------------------------
// filter action
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: filter", () => {
  let sampleData;

  beforeEach(() => {
    sampleData = [...EMPLOYEES];
  });

  it("should filter with eq operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "department", operator: "eq", value: "Engineering" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 4);
    for (const row of result.metadata.rows) {
      assert.equal(row.department, "Engineering");
    }
  });

  it("should filter with neq operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "department", operator: "neq", value: "Engineering" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 4);
    for (const row of result.metadata.rows) {
      assert.notEqual(row.department, "Engineering");
    }
  });

  it("should filter with gt operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "age", operator: "gt", value: 35 }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 2); // Eve (40) and Hank (45)
    for (const row of result.metadata.rows) {
      assert.ok(row.age > 35);
    }
  });

  it("should filter with gte operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "age", operator: "gte", value: 35 }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 3); // Carol (35), Eve (40), Hank (45)
  });

  it("should filter with lt operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "salary", operator: "lt", value: 75000 }],
    }, {});

    assert.ok(result.metadata.success);
    for (const row of result.metadata.rows) {
      assert.ok(row.salary < 75000);
    }
  });

  it("should filter with lte operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "salary", operator: "lte", value: 75000 }],
    }, {});

    assert.ok(result.metadata.success);
    for (const row of result.metadata.rows) {
      assert.ok(row.salary <= 75000);
    }
  });

  it("should filter with contains operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "name", operator: "contains", value: "a" }],
    }, {});

    assert.ok(result.metadata.success);
    // Carol, Dave, Grace, Frank, Hank contain 'a'
    assert.ok(result.metadata.matchedRows > 0);
    for (const row of result.metadata.rows) {
      assert.ok(row.name.includes("a"));
    }
  });

  it("should filter with startsWith operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "name", operator: "startsWith", value: "A" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 1);
    assert.equal(result.metadata.rows[0].name, "Alice");
  });

  it("should filter with endsWith operator", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "name", operator: "endsWith", value: "e" }],
    }, {});

    assert.ok(result.metadata.success);
    for (const row of result.metadata.rows) {
      assert.ok(row.name.endsWith("e"));
    }
  });

  it("should apply multiple conditions (AND logic)", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [
        { column: "department", operator: "eq", value: "Engineering" },
        { column: "age", operator: "gt", value: 30 },
      ],
    }, {});

    assert.ok(result.metadata.success);
    for (const row of result.metadata.rows) {
      assert.equal(row.department, "Engineering");
      assert.ok(row.age > 30);
    }
  });

  it("should return all rows when no conditions match", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "age", operator: "gt", value: 100 }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 0);
    assert.deepEqual(result.metadata.rows, []);
  });

  it("should return error for missing conditions", async () => {
    const result = await execute({ action: "filter", data: sampleData }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_CONDITIONS");
  });

  it("should return error for empty conditions array", async () => {
    const result = await execute({ action: "filter", data: sampleData, conditions: [] }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_CONDITIONS");
  });

  it("should include totalRows in metadata", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "department", operator: "eq", value: "Sales" }],
    }, {});

    assert.equal(result.metadata.totalRows, 8);
  });

  it("should handle unknown operator gracefully (no match)", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "name", operator: "regex", value: "A.*" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 0);
  });

  it("should include formatted result text", async () => {
    const result = await execute({
      action: "filter",
      data: sampleData,
      conditions: [{ column: "department", operator: "eq", value: "Sales" }],
    }, {});

    assert.ok(result.result.includes("Filtered"));
    assert.ok(result.result.includes("condition(s)"));
  });
});

// ---------------------------------------------------------------------------
// sort action
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: sort", () => {
  let sampleData;

  beforeEach(() => {
    sampleData = [...EMPLOYEES];
  });

  it("should sort ascending by numeric column", async () => {
    const result = await execute({
      action: "sort",
      data: sampleData,
      sortBy: [{ column: "age", direction: "asc" }],
    }, {});

    assert.ok(result.metadata.success);
    const ages = result.metadata.rows.map((r) => r.age);
    for (let i = 1; i < ages.length; i++) {
      assert.ok(ages[i] >= ages[i - 1], `Expected ${ages[i]} >= ${ages[i - 1]}`);
    }
  });

  it("should sort descending by numeric column", async () => {
    const result = await execute({
      action: "sort",
      data: sampleData,
      sortBy: [{ column: "salary", direction: "desc" }],
    }, {});

    assert.ok(result.metadata.success);
    const salaries = result.metadata.rows.map((r) => r.salary);
    for (let i = 1; i < salaries.length; i++) {
      assert.ok(salaries[i] <= salaries[i - 1], `Expected ${salaries[i]} <= ${salaries[i - 1]}`);
    }
  });

  it("should sort ascending by string column", async () => {
    const result = await execute({
      action: "sort",
      data: sampleData,
      sortBy: [{ column: "name", direction: "asc" }],
    }, {});

    assert.ok(result.metadata.success);
    const names = result.metadata.rows.map((r) => r.name);
    for (let i = 1; i < names.length; i++) {
      assert.ok(names[i] >= names[i - 1], `Expected '${names[i]}' >= '${names[i - 1]}'`);
    }
  });

  it("should support multi-column sort", async () => {
    const result = await execute({
      action: "sort",
      data: sampleData,
      sortBy: [
        { column: "department", direction: "asc" },
        { column: "salary", direction: "desc" },
      ],
    }, {});

    assert.ok(result.metadata.success);
    const rows = result.metadata.rows;
    // Within same department, salary should be descending
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].department === rows[i - 1].department) {
        assert.ok(rows[i].salary <= rows[i - 1].salary);
      }
    }
  });

  it("should not mutate original data", async () => {
    const original = [...sampleData];
    await execute({
      action: "sort",
      data: sampleData,
      sortBy: [{ column: "age", direction: "desc" }],
    }, {});

    assert.deepEqual(sampleData, original);
  });

  it("should return error for missing sortBy", async () => {
    const result = await execute({ action: "sort", data: sampleData }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_SORT_BY");
  });

  it("should return error for empty sortBy array", async () => {
    const result = await execute({ action: "sort", data: sampleData, sortBy: [] }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_SORT_BY");
  });

  it("should default to ascending when direction not specified", async () => {
    const result = await execute({
      action: "sort",
      data: sampleData,
      sortBy: [{ column: "age" }],
    }, {});

    assert.ok(result.metadata.success);
    const ages = result.metadata.rows.map((r) => r.age);
    for (let i = 1; i < ages.length; i++) {
      assert.ok(ages[i] >= ages[i - 1]);
    }
  });

  it("should handle null values in sort", async () => {
    const data = [
      { name: "A", val: 3 },
      { name: "B", val: null },
      { name: "C", val: 1 },
    ];
    const result = await execute({
      action: "sort",
      data,
      sortBy: [{ column: "val", direction: "asc" }],
    }, {});

    assert.ok(result.metadata.success);
    // null should be placed at the end for ascending
    assert.equal(result.metadata.rows[result.metadata.rows.length - 1].val, null);
  });

  it("should include rowCount in metadata", async () => {
    const result = await execute({
      action: "sort",
      data: sampleData,
      sortBy: [{ column: "age", direction: "asc" }],
    }, {});

    assert.equal(result.metadata.rowCount, 8);
  });

  it("should include formatted result text", async () => {
    const result = await execute({
      action: "sort",
      data: sampleData,
      sortBy: [{ column: "age", direction: "asc" }],
    }, {});

    assert.ok(result.result.includes("Sorted"));
    assert.ok(result.result.includes("age"));
  });

  it("should handle single row sort", async () => {
    const result = await execute({
      action: "sort",
      data: SINGLE_ROW,
      sortBy: [{ column: "age", direction: "asc" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.rowCount, 1);
  });

  it("should handle sort with numeric string values", async () => {
    const result = await execute({
      action: "sort",
      data: NUMERIC_STRINGS,
      sortBy: [{ column: "score", direction: "asc" }],
    }, {});

    assert.ok(result.metadata.success);
    const scores = result.metadata.rows.map((r) => Number(r.score));
    for (let i = 1; i < scores.length; i++) {
      assert.ok(scores[i] >= scores[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// aggregate action
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: aggregate", () => {
  let sampleData;

  beforeEach(() => {
    sampleData = [...EMPLOYEES];
  });

  it("should group by department and compute sum", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
      aggregations: [{ column: "salary", function: "sum" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "aggregate");
    assert.equal(result.metadata.groupCount, 3); // Engineering, Marketing, Sales

    const eng = result.metadata.groups.find((g) => g.department === "Engineering");
    assert.ok(eng);
    assert.equal(eng.sum_salary, 90000 + 85000 + 110000 + 120000);
  });

  it("should compute avg aggregation", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
      aggregations: [{ column: "salary", function: "avg" }],
    }, {});

    assert.ok(result.metadata.success);
    const mktg = result.metadata.groups.find((g) => g.department === "Marketing");
    assert.ok(mktg);
    assert.equal(mktg.avg_salary, (75000 + 70000) / 2);
  });

  it("should compute count aggregation", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
      aggregations: [{ column: "salary", function: "count" }],
    }, {});

    assert.ok(result.metadata.success);
    const eng = result.metadata.groups.find((g) => g.department === "Engineering");
    assert.equal(eng.count_salary, 4);
  });

  it("should compute min aggregation", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
      aggregations: [{ column: "salary", function: "min" }],
    }, {});

    assert.ok(result.metadata.success);
    const sales = result.metadata.groups.find((g) => g.department === "Sales");
    assert.equal(sales.min_salary, 65000);
  });

  it("should compute max aggregation", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
      aggregations: [{ column: "salary", function: "max" }],
    }, {});

    assert.ok(result.metadata.success);
    const eng = result.metadata.groups.find((g) => g.department === "Engineering");
    assert.equal(eng.max_salary, 120000);
  });

  it("should support multiple aggregations at once", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
      aggregations: [
        { column: "salary", function: "sum" },
        { column: "salary", function: "avg" },
        { column: "age", function: "min" },
        { column: "age", function: "max" },
      ],
    }, {});

    assert.ok(result.metadata.success);
    const eng = result.metadata.groups.find((g) => g.department === "Engineering");
    assert.ok(eng.sum_salary > 0);
    assert.ok(eng.avg_salary > 0);
    assert.ok(typeof eng.min_age === "number");
    assert.ok(typeof eng.max_age === "number");
  });

  it("should return error for missing groupBy", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      aggregations: [{ column: "salary", function: "sum" }],
    }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_GROUP_BY");
  });

  it("should return error for missing aggregations", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
    }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_AGGREGATIONS");
  });

  it("should return error for empty aggregations array", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
      aggregations: [],
    }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_AGGREGATIONS");
  });

  it("should handle null group key", async () => {
    const data = [
      { category: "A", val: 10 },
      { category: null, val: 20 },
      { category: "A", val: 30 },
    ];
    const result = await execute({
      action: "aggregate",
      data,
      groupBy: "category",
      aggregations: [{ column: "val", function: "sum" }],
    }, {});

    assert.ok(result.metadata.success);
    const nullGroup = result.metadata.groups.find((g) => g.category === null);
    assert.ok(nullGroup, "Should have a null group");
    assert.equal(nullGroup.sum_val, 20);
  });

  it("should include formatted result text", async () => {
    const result = await execute({
      action: "aggregate",
      data: sampleData,
      groupBy: "department",
      aggregations: [{ column: "salary", function: "sum" }],
    }, {});

    assert.ok(result.result.includes("Aggregation Results"));
    assert.ok(result.result.includes("Grouped by: department"));
    assert.ok(result.result.includes("Groups: 3"));
  });
});

// ---------------------------------------------------------------------------
// pivot action
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: pivot", () => {
  let sampleData;

  beforeEach(() => {
    sampleData = [...SALES_DATA];
  });

  it("should create a pivot table with sum aggregation", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
      aggregation: "sum",
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "pivot");
    assert.ok(result.metadata.pivotTable.length > 0);
  });

  it("should compute correct pivot values", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
      aggregation: "sum",
    }, {});

    const widget = result.metadata.pivotTable.find((r) => r.product === "Widget");
    assert.ok(widget);
    // Widget North: 1000 + 1200 = 2200
    assert.equal(widget.North, 2200);
    // Widget South: 1500 + 1800 = 3300
    assert.equal(widget.South, 3300);
  });

  it("should support avg aggregation in pivot", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
      aggregation: "avg",
    }, {});

    assert.ok(result.metadata.success);
    const gadget = result.metadata.pivotTable.find((r) => r.product === "Gadget");
    // Gadget North: (2000 + 2200) / 2 = 2100
    assert.equal(gadget.North, 2100);
  });

  it("should support count aggregation in pivot", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
      aggregation: "count",
    }, {});

    assert.ok(result.metadata.success);
    const widget = result.metadata.pivotTable.find((r) => r.product === "Widget");
    assert.equal(widget.North, 2);
    assert.equal(widget.South, 2);
  });

  it("should support min aggregation in pivot", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
      aggregation: "min",
    }, {});

    assert.ok(result.metadata.success);
    const widget = result.metadata.pivotTable.find((r) => r.product === "Widget");
    assert.equal(widget.North, 1000);
  });

  it("should support max aggregation in pivot", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
      aggregation: "max",
    }, {});

    assert.ok(result.metadata.success);
    const gadget = result.metadata.pivotTable.find((r) => r.product === "Gadget");
    assert.equal(gadget.South, 3000);
  });

  it("should default to sum when aggregation not specified", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.aggregation, "sum");
  });

  it("should return error for missing rowField", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      columnField: "region",
      valueField: "revenue",
    }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_ROW_FIELD");
  });

  it("should return error for missing columnField", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      valueField: "revenue",
    }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_COLUMN_FIELD");
  });

  it("should return error for missing valueField", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
    }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_VALUE_FIELD");
  });

  it("should return error for invalid aggregation", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
      aggregation: "invalid",
    }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_AGGREGATION");
  });

  it("should include rowCount and columnCount in metadata", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
    }, {});

    assert.equal(result.metadata.rowCount, 2); // Widget, Gadget
    assert.equal(result.metadata.columnCount, 2); // North, South
  });

  it("should include formatted text output", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "region",
      valueField: "revenue",
    }, {});

    assert.ok(result.result.includes("Pivot Table"));
    assert.ok(result.result.includes("product"));
    assert.ok(result.result.includes("North"));
    assert.ok(result.result.includes("South"));
  });

  it("should handle pivot with three-way grouping", async () => {
    const result = await execute({
      action: "pivot",
      data: sampleData,
      rowField: "product",
      columnField: "quarter",
      valueField: "revenue",
      aggregation: "sum",
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.columnCount, 2); // Q1, Q2
    const widget = result.metadata.pivotTable.find((r) => r.product === "Widget");
    // Widget Q1: 1000 + 1500 = 2500
    assert.equal(widget.Q1, 2500);
  });
});

// ---------------------------------------------------------------------------
// describe_columns action
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: describe_columns", () => {
  it("should describe all columns", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "describe_columns");
    assert.ok(result.metadata.columns.name);
    assert.ok(result.metadata.columns.age);
    assert.ok(result.metadata.columns.department);
    assert.ok(result.metadata.columns.salary);
  });

  it("should infer numeric type for age", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    assert.equal(result.metadata.columns.age.type, "number");
  });

  it("should infer string type for name", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    assert.equal(result.metadata.columns.name.type, "string");
  });

  it("should count null values", async () => {
    const result = await execute({ action: "describe_columns", data: DATA_WITH_NULLS }, {});

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.columns.name.nullCount >= 1);
    assert.ok(result.metadata.columns.age.nullCount >= 1);
    assert.ok(result.metadata.columns.email.nullCount >= 1);
  });

  it("should count unique values", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    assert.equal(result.metadata.columns.department.uniqueCount, 3);
  });

  it("should include min/max/mean for numeric columns", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    const ageDef = result.metadata.columns.age;
    assert.equal(ageDef.min, 25);
    assert.equal(ageDef.max, 45);
    assert.ok(typeof ageDef.mean === "number");
  });

  it("should include min/max length for string columns", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    const nameDef = result.metadata.columns.name;
    assert.ok(typeof nameDef.minLength === "number");
    assert.ok(typeof nameDef.maxLength === "number");
  });

  it("should handle boolean type inference", async () => {
    const result = await execute({ action: "describe_columns", data: MIXED_TYPES }, {});

    assert.equal(result.metadata.columns.active.type, "boolean");
  });

  it("should include totalCount for each column", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    assert.equal(result.metadata.columns.name.totalCount, 8);
    assert.equal(result.metadata.columns.age.totalCount, 8);
  });

  it("should report columnCount in metadata", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    assert.equal(result.metadata.columnCount, 4);
  });

  it("should include formatted result text", async () => {
    const result = await execute({ action: "describe_columns", data: EMPLOYEES }, {});

    assert.ok(result.result.includes("Column Descriptions"));
    assert.ok(result.result.includes("Column: name"));
    assert.ok(result.result.includes("Type:"));
    assert.ok(result.result.includes("Nulls:"));
    assert.ok(result.result.includes("Unique:"));
  });

  it("should handle single row data", async () => {
    const result = await execute({ action: "describe_columns", data: SINGLE_ROW }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.columns.age.totalCount, 1);
    assert.equal(result.metadata.columns.age.uniqueCount, 1);
  });
});

// ---------------------------------------------------------------------------
// find_duplicates action
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: find_duplicates", () => {
  it("should find duplicate rows", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: DATA_WITH_DUPLICATES,
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "find_duplicates");
    assert.ok(result.metadata.duplicateGroupCount > 0);
  });

  it("should find Alice and Bob as duplicates", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: DATA_WITH_DUPLICATES,
    }, {});

    assert.equal(result.metadata.duplicateGroupCount, 2); // Alice (2x) and Bob (3x)
    assert.equal(result.metadata.duplicateRowCount, 5); // 2 + 3
  });

  it("should find duplicates based on specific columns", async () => {
    const data = [
      { name: "Alice", dept: "Eng", salary: 100 },
      { name: "Alice", dept: "Sales", salary: 200 },
      { name: "Bob", dept: "Eng", salary: 150 },
    ];
    const result = await execute({
      action: "find_duplicates",
      data,
      columns: ["name"],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.duplicateGroupCount, 1); // Alice appears twice
    assert.equal(result.metadata.duplicateRowCount, 2);
  });

  it("should return no duplicates for unique data", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: EMPLOYEES,
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.duplicateGroupCount, 0);
    assert.equal(result.metadata.duplicateRowCount, 0);
  });

  it("should include indices of duplicate rows", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: DATA_WITH_DUPLICATES,
    }, {});

    for (const dup of result.metadata.duplicates) {
      assert.ok(Array.isArray(dup.indices));
      assert.ok(dup.indices.length >= 2);
    }
  });

  it("should include count per duplicate group", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: DATA_WITH_DUPLICATES,
    }, {});

    for (const dup of result.metadata.duplicates) {
      assert.ok(typeof dup.count === "number");
      assert.ok(dup.count >= 2);
    }
  });

  it("should include totalRows in metadata", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: DATA_WITH_DUPLICATES,
    }, {});

    assert.equal(result.metadata.totalRows, 7);
  });

  it("should include formatted result text", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: DATA_WITH_DUPLICATES,
    }, {});

    assert.ok(result.result.includes("Duplicate Analysis"));
    assert.ok(result.result.includes("Duplicate groups:"));
    assert.ok(result.result.includes("occurrences"));
  });

  it("should show 'No duplicates found' for unique data", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: EMPLOYEES,
    }, {});

    assert.ok(result.result.includes("No duplicates found"));
  });

  it("should handle single row data (no duplicates possible)", async () => {
    const result = await execute({
      action: "find_duplicates",
      data: SINGLE_ROW,
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.duplicateGroupCount, 0);
  });

  it("should handle null values in duplicate detection", async () => {
    const data = [
      { name: null, val: 1 },
      { name: null, val: 1 },
      { name: "A", val: 2 },
    ];
    const result = await execute({
      action: "find_duplicates",
      data,
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.duplicateGroupCount, 1);
  });
});

// ---------------------------------------------------------------------------
// validate_data action
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: validate_data", () => {
  it("should validate not_null rule", async () => {
    const result = await execute({
      action: "validate_data",
      data: DATA_WITH_NULLS,
      rules: [{ column: "name", rule: "not_null" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "validate_data");
    assert.equal(result.metadata.isValid, false);
    assert.ok(result.metadata.issueCount > 0);
  });

  it("should pass not_null for valid data", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "name", rule: "not_null" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, true);
    assert.equal(result.metadata.issueCount, 0);
  });

  it("should validate unique rule", async () => {
    const result = await execute({
      action: "validate_data",
      data: DATA_WITH_DUPLICATES,
      rules: [{ column: "name", rule: "unique" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    assert.ok(result.metadata.issueCount > 0);
  });

  it("should pass unique rule for unique data", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "name", rule: "unique" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, true);
  });

  it("should validate type rule for numbers", async () => {
    const data = [
      { id: 1, name: "A" },
      { id: "two", name: "B" },
      { id: 3, name: "C" },
    ];
    const result = await execute({
      action: "validate_data",
      data,
      rules: [{ column: "id", rule: "type", expectedType: "number" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    assert.ok(result.metadata.issueCount > 0);
  });

  it("should validate type rule for strings", async () => {
    const data = [
      { name: "Alice", value: 123 },
      { name: "Bob", value: "hello" },
    ];
    const result = await execute({
      action: "validate_data",
      data,
      rules: [{ column: "value", rule: "type", expectedType: "string" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
  });

  it("should validate type rule for booleans", async () => {
    const data = [
      { active: true },
      { active: "yes" },
      { active: false },
    ];
    const result = await execute({
      action: "validate_data",
      data,
      rules: [{ column: "active", rule: "type", expectedType: "boolean" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
  });

  it("should validate range rule", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "age", rule: "range", min: 20, max: 40 }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false); // Hank is 45
  });

  it("should pass range rule when all values in range", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "age", rule: "range", min: 20, max: 50 }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, true);
  });

  it("should validate pattern rule", async () => {
    const data = [
      { email: "alice@test.com" },
      { email: "invalid-email" },
      { email: "bob@test.com" },
    ];
    const result = await execute({
      action: "validate_data",
      data,
      rules: [{ column: "email", rule: "pattern", pattern: "^[^@]+@[^@]+\\.[^@]+$" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    const issue = result.metadata.issues[0];
    assert.ok(issue.rows.includes(1)); // index 1 is invalid
  });

  it("should handle invalid regex pattern gracefully", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "name", rule: "pattern", pattern: "[invalid" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    assert.ok(result.metadata.issues[0].message.includes("Invalid regex"));
  });

  it("should handle missing pattern field in pattern rule", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "name", rule: "pattern" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    assert.ok(result.metadata.issues[0].message.includes("pattern"));
  });

  it("should apply multiple rules at once", async () => {
    const result = await execute({
      action: "validate_data",
      data: DATA_WITH_NULLS,
      rules: [
        { column: "name", rule: "not_null" },
        { column: "email", rule: "not_null" },
        { column: "age", rule: "not_null" },
      ],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    assert.equal(result.metadata.rulesChecked, 3);
    assert.ok(result.metadata.issueCount >= 2);
  });

  it("should return error for missing rules", async () => {
    const result = await execute({ action: "validate_data", data: EMPLOYEES }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_RULES");
  });

  it("should return error for empty rules array", async () => {
    const result = await execute({ action: "validate_data", data: EMPLOYEES, rules: [] }, {});

    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "INVALID_RULES");
  });

  it("should handle unknown validation rule", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "name", rule: "unknown_rule" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    assert.ok(result.metadata.issues[0].message.includes("Unknown validation rule"));
  });

  it("should handle rule with missing column", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ rule: "not_null" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    assert.ok(result.metadata.issues[0].message.includes("must specify"));
  });

  it("should handle rule with missing rule name", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "name" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
  });

  it("should include formatted result text for valid data", async () => {
    const result = await execute({
      action: "validate_data",
      data: EMPLOYEES,
      rules: [{ column: "name", rule: "not_null" }],
    }, {});

    assert.ok(result.result.includes("Data Validation Report"));
    assert.ok(result.result.includes("VALID"));
    assert.ok(result.result.includes("All validation rules passed"));
  });

  it("should include formatted result text for invalid data", async () => {
    const result = await execute({
      action: "validate_data",
      data: DATA_WITH_NULLS,
      rules: [{ column: "name", rule: "not_null" }],
    }, {});

    assert.ok(result.result.includes("Data Validation Report"));
    assert.ok(result.result.includes("INVALID"));
    assert.ok(result.result.includes("Affected rows:"));
  });

  it("should skip null values for type validation", async () => {
    const data = [
      { val: 1 },
      { val: null },
      { val: 3 },
    ];
    const result = await execute({
      action: "validate_data",
      data,
      rules: [{ column: "val", rule: "type", expectedType: "number" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, true);
  });

  it("should skip null values for range validation", async () => {
    const data = [
      { val: 5 },
      { val: null },
      { val: 10 },
    ];
    const result = await execute({
      action: "validate_data",
      data,
      rules: [{ column: "val", rule: "range", min: 1, max: 20 }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, true);
  });

  it("should detect range violations for NaN values", async () => {
    const data = [
      { val: 5 },
      { val: "abc" },
      { val: 10 },
    ];
    const result = await execute({
      action: "validate_data",
      data,
      rules: [{ column: "val", rule: "range", min: 1, max: 20 }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
    assert.ok(result.metadata.issues[0].rows.includes(1));
  });
});

// ---------------------------------------------------------------------------
// Edge Cases and Integration
// ---------------------------------------------------------------------------

describe("spreadsheet-analyzer: edge cases", () => {
  it("should handle data with heterogeneous columns", async () => {
    const data = [
      { a: 1, b: 2 },
      { b: 3, c: 4 },
      { a: 5, c: 6 },
    ];
    const result = await execute({ action: "describe_columns", data }, {});

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.columns.a);
    assert.ok(result.metadata.columns.b);
    assert.ok(result.metadata.columns.c);
  });

  it("should handle data with special characters in values", async () => {
    const data = [
      { name: "O'Brien", value: 10 },
      { name: "Smith & Jones", value: 20 },
    ];
    const result = await execute({
      action: "filter",
      data,
      conditions: [{ column: "name", operator: "contains", value: "O'" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 1);
  });

  it("should handle large numeric values", async () => {
    const data = [
      { val: 1000000000 },
      { val: 2000000000 },
      { val: 3000000000 },
    ];
    const result = await execute({ action: "analyze", data, columns: ["val"] }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.stats.val.sum, 6000000000);
  });

  it("should handle negative numeric values", async () => {
    const data = [
      { val: -10 },
      { val: 0 },
      { val: 10 },
    ];
    const result = await execute({ action: "analyze", data, columns: ["val"] }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.stats.val.min, -10);
    assert.equal(result.metadata.stats.val.max, 10);
    assert.equal(result.metadata.stats.val.mean, 0);
  });

  it("should handle decimal values", async () => {
    const data = [
      { val: 1.5 },
      { val: 2.5 },
      { val: 3.5 },
    ];
    const result = await execute({ action: "analyze", data, columns: ["val"] }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.stats.val.mean, 2.5);
    assert.equal(result.metadata.stats.val.median, 2.5);
  });

  it("should handle identical values in all rows", async () => {
    const data = [
      { val: 42 },
      { val: 42 },
      { val: 42 },
    ];
    const result = await execute({ action: "analyze", data, columns: ["val"] }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.stats.val.stddev, 0);
    assert.equal(result.metadata.stats.val.min, 42);
    assert.equal(result.metadata.stats.val.max, 42);
  });

  it("should handle filter returning all rows", async () => {
    const result = await execute({
      action: "filter",
      data: EMPLOYEES,
      conditions: [{ column: "age", operator: "gt", value: 0 }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.matchedRows, 8);
  });

  it("should handle aggregate with single group", async () => {
    const data = [
      { cat: "A", val: 10 },
      { cat: "A", val: 20 },
      { cat: "A", val: 30 },
    ];
    const result = await execute({
      action: "aggregate",
      data,
      groupBy: "cat",
      aggregations: [{ column: "val", function: "sum" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.groupCount, 1);
    assert.equal(result.metadata.groups[0].sum_val, 60);
  });

  it("should handle pivot with single row/column combination", async () => {
    const data = [
      { row: "A", col: "X", val: 100 },
    ];
    const result = await execute({
      action: "pivot",
      data,
      rowField: "row",
      columnField: "col",
      valueField: "val",
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.pivotTable[0].X, 100);
  });

  it("should handle empty strings treated as null in validation", async () => {
    const data = [
      { name: "" },
      { name: "Alice" },
    ];
    const result = await execute({
      action: "validate_data",
      data,
      rules: [{ column: "name", rule: "not_null" }],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.isValid, false);
  });

  it("should handle undefined column in row for duplicate detection", async () => {
    const data = [
      { name: "Alice" },
      { name: "Alice", extra: "x" },
    ];
    const result = await execute({
      action: "find_duplicates",
      data,
      columns: ["name"],
    }, {});

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.duplicateGroupCount, 1);
  });
});
