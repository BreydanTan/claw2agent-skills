/**
 * Spreadsheet Analyzer Skill Handler
 *
 * A spreadsheet analyzer that works on in-memory tabular data (arrays of objects /
 * CSV-like data). Provides statistical analysis, filtering, sorting, aggregation,
 * pivot tables, and data validation. Pure local computation, no external APIs.
 */

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that data is a non-empty array of objects.
 * Returns null if valid, or an error response object if invalid.
 */
function validateData(data) {
  if (!Array.isArray(data)) {
    return {
      result: "Error: 'data' must be an array of objects.",
      metadata: { success: false, error: "INVALID_DATA" },
    };
  }
  if (data.length === 0) {
    return {
      result: "Error: 'data' must be a non-empty array.",
      metadata: { success: false, error: "EMPTY_DATA" },
    };
  }
  for (let i = 0; i < data.length; i++) {
    if (typeof data[i] !== "object" || data[i] === null || Array.isArray(data[i])) {
      return {
        result: `Error: Each element in 'data' must be a plain object. Element at index ${i} is not.`,
        metadata: { success: false, error: "INVALID_ROW" },
      };
    }
  }
  return null;
}

/**
 * Extract all column names from data rows.
 */
function allColumns(data) {
  const cols = new Set();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      cols.add(key);
    }
  }
  return [...cols];
}

/**
 * Get numeric values for a column, skipping nulls / NaN.
 */
function numericValues(data, column) {
  const values = [];
  for (const row of data) {
    const v = row[column];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isNaN(n)) {
      values.push(n);
    }
  }
  return values;
}

// ---------------------------------------------------------------------------
// Statistics Helpers
// ---------------------------------------------------------------------------

function calcMin(values) {
  return Math.min(...values);
}

function calcMax(values) {
  return Math.max(...values);
}

function calcSum(values) {
  return values.reduce((a, b) => a + b, 0);
}

function calcMean(values) {
  return calcSum(values) / values.length;
}

function calcMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function calcStddev(values) {
  const mean = calcMean(values);
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// ---------------------------------------------------------------------------
// Comparison Helpers
// ---------------------------------------------------------------------------

/**
 * Compare a row value against a condition value using the given operator.
 */
function evaluateCondition(rowValue, operator, condValue) {
  switch (operator) {
    case "eq":
      // eslint-disable-next-line eqeqeq
      return rowValue == condValue;
    case "neq":
      // eslint-disable-next-line eqeqeq
      return rowValue != condValue;
    case "gt":
      return Number(rowValue) > Number(condValue);
    case "gte":
      return Number(rowValue) >= Number(condValue);
    case "lt":
      return Number(rowValue) < Number(condValue);
    case "lte":
      return Number(rowValue) <= Number(condValue);
    case "contains":
      return String(rowValue).includes(String(condValue));
    case "startsWith":
      return String(rowValue).startsWith(String(condValue));
    case "endsWith":
      return String(rowValue).endsWith(String(condValue));
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Type Inference
// ---------------------------------------------------------------------------

function inferType(values) {
  let numericCount = 0;
  let booleanCount = 0;
  let dateCount = 0;
  let stringCount = 0;
  let nullCount = 0;

  for (const v of values) {
    if (v === null || v === undefined || v === "") {
      nullCount++;
      continue;
    }
    if (typeof v === "boolean") {
      booleanCount++;
      continue;
    }
    if (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))) {
      numericCount++;
      continue;
    }
    if (typeof v === "string" && !Number.isNaN(Date.parse(v)) && /\d{4}-\d{2}-\d{2}/.test(v)) {
      dateCount++;
      continue;
    }
    stringCount++;
  }

  const total = values.length - nullCount;
  if (total === 0) return "null";
  if (numericCount === total) return "number";
  if (booleanCount === total) return "boolean";
  if (dateCount === total) return "date";
  if (numericCount > total / 2) return "mixed-number";
  return "string";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionAnalyze(data, columns) {
  const cols = columns && columns.length > 0 ? columns : allColumns(data);
  const stats = {};

  for (const col of cols) {
    const values = numericValues(data, col);
    if (values.length === 0) {
      stats[col] = {
        count: 0,
        error: "No numeric values found",
      };
      continue;
    }

    stats[col] = {
      count: values.length,
      min: calcMin(values),
      max: calcMax(values),
      sum: calcSum(values),
      mean: Math.round(calcMean(values) * 1e6) / 1e6,
      median: calcMedian(values),
      stddev: Math.round(calcStddev(values) * 1e6) / 1e6,
    };
  }

  const lines = ["Statistical Analysis", "====================", ""];
  for (const [col, s] of Object.entries(stats)) {
    lines.push(`Column: ${col}`);
    if (s.error) {
      lines.push(`  ${s.error}`);
    } else {
      lines.push(`  Count:  ${s.count}`);
      lines.push(`  Min:    ${s.min}`);
      lines.push(`  Max:    ${s.max}`);
      lines.push(`  Sum:    ${s.sum}`);
      lines.push(`  Mean:   ${s.mean}`);
      lines.push(`  Median: ${s.median}`);
      lines.push(`  Stddev: ${s.stddev}`);
    }
    lines.push("");
  }

  return {
    result: lines.join("\n"),
    metadata: { success: true, action: "analyze", columns: cols, stats },
  };
}

function actionFilter(data, conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return {
      result: "Error: 'conditions' must be a non-empty array of {column, operator, value}.",
      metadata: { success: false, error: "INVALID_CONDITIONS" },
    };
  }

  const filtered = data.filter((row) => {
    return conditions.every((cond) => {
      const { column, operator, value } = cond;
      return evaluateCondition(row[column], operator, value);
    });
  });

  return {
    result: `Filtered ${filtered.length} of ${data.length} rows matching ${conditions.length} condition(s).`,
    metadata: {
      success: true,
      action: "filter",
      totalRows: data.length,
      matchedRows: filtered.length,
      conditions,
      rows: filtered,
    },
  };
}

function actionSort(data, sortBy) {
  if (!Array.isArray(sortBy) || sortBy.length === 0) {
    return {
      result: "Error: 'sortBy' must be a non-empty array of {column, direction}.",
      metadata: { success: false, error: "INVALID_SORT_BY" },
    };
  }

  const sorted = [...data].sort((a, b) => {
    for (const { column, direction } of sortBy) {
      const dir = direction === "desc" ? -1 : 1;
      const aVal = a[column];
      const bVal = b[column];

      if (aVal === bVal) continue;
      if (aVal === null || aVal === undefined) return 1 * dir;
      if (bVal === null || bVal === undefined) return -1 * dir;

      // Try numeric comparison first
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        if (aNum !== bNum) return (aNum - bNum) * dir;
        continue;
      }

      // String comparison
      const cmp = String(aVal).localeCompare(String(bVal));
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });

  return {
    result: `Sorted ${sorted.length} rows by ${sortBy.map((s) => `${s.column} ${s.direction || "asc"}`).join(", ")}.`,
    metadata: {
      success: true,
      action: "sort",
      rowCount: sorted.length,
      sortBy,
      rows: sorted,
    },
  };
}

function actionAggregate(data, groupBy, aggregations) {
  if (!groupBy || typeof groupBy !== "string") {
    return {
      result: "Error: 'groupBy' must be a non-empty string (column name).",
      metadata: { success: false, error: "INVALID_GROUP_BY" },
    };
  }

  if (!Array.isArray(aggregations) || aggregations.length === 0) {
    return {
      result: "Error: 'aggregations' must be a non-empty array of {column, function}.",
      metadata: { success: false, error: "INVALID_AGGREGATIONS" },
    };
  }

  // Group rows by the groupBy column
  const groups = new Map();
  for (const row of data) {
    const key = row[groupBy] === undefined || row[groupBy] === null ? "__null__" : String(row[groupBy]);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }

  const results = [];
  for (const [groupKey, rows] of groups) {
    const entry = { [groupBy]: groupKey === "__null__" ? null : groupKey };

    for (const agg of aggregations) {
      const { column, function: fn } = agg;
      const values = numericValues(rows, column);
      const label = `${fn}_${column}`;

      switch (fn) {
        case "sum":
          entry[label] = values.length > 0 ? calcSum(values) : 0;
          break;
        case "avg":
          entry[label] = values.length > 0 ? Math.round(calcMean(values) * 1e6) / 1e6 : null;
          break;
        case "count":
          entry[label] = rows.length;
          break;
        case "min":
          entry[label] = values.length > 0 ? calcMin(values) : null;
          break;
        case "max":
          entry[label] = values.length > 0 ? calcMax(values) : null;
          break;
        default:
          entry[label] = null;
      }
    }

    results.push(entry);
  }

  const lines = ["Aggregation Results", "===================", ""];
  lines.push(`Grouped by: ${groupBy}`);
  lines.push(`Groups: ${results.length}`);
  lines.push("");

  for (const entry of results) {
    const groupVal = entry[groupBy] === null ? "(null)" : entry[groupBy];
    lines.push(`  ${groupBy} = ${groupVal}`);
    for (const agg of aggregations) {
      const label = `${agg.function}_${agg.column}`;
      lines.push(`    ${label}: ${entry[label]}`);
    }
    lines.push("");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "aggregate",
      groupBy,
      groupCount: results.length,
      aggregations,
      groups: results,
    },
  };
}

function actionPivot(data, rowField, columnField, valueField, aggregation) {
  if (!rowField || typeof rowField !== "string") {
    return {
      result: "Error: 'rowField' must be a non-empty string.",
      metadata: { success: false, error: "INVALID_ROW_FIELD" },
    };
  }
  if (!columnField || typeof columnField !== "string") {
    return {
      result: "Error: 'columnField' must be a non-empty string.",
      metadata: { success: false, error: "INVALID_COLUMN_FIELD" },
    };
  }
  if (!valueField || typeof valueField !== "string") {
    return {
      result: "Error: 'valueField' must be a non-empty string.",
      metadata: { success: false, error: "INVALID_VALUE_FIELD" },
    };
  }

  const validAggregations = ["sum", "avg", "count", "min", "max"];
  const agg = aggregation || "sum";
  if (!validAggregations.includes(agg)) {
    return {
      result: `Error: 'aggregation' must be one of: ${validAggregations.join(", ")}.`,
      metadata: { success: false, error: "INVALID_AGGREGATION" },
    };
  }

  // Collect unique row keys and column keys
  const rowKeys = new Set();
  const colKeys = new Set();
  for (const row of data) {
    const rk = row[rowField] === undefined || row[rowField] === null ? "(null)" : String(row[rowField]);
    const ck = row[columnField] === undefined || row[columnField] === null ? "(null)" : String(row[columnField]);
    rowKeys.add(rk);
    colKeys.add(ck);
  }

  const sortedRowKeys = [...rowKeys].sort();
  const sortedColKeys = [...colKeys].sort();

  // Build a map of (rowKey, colKey) -> [values]
  const cells = new Map();
  for (const row of data) {
    const rk = row[rowField] === undefined || row[rowField] === null ? "(null)" : String(row[rowField]);
    const ck = row[columnField] === undefined || row[columnField] === null ? "(null)" : String(row[columnField]);
    const key = `${rk}|||${ck}`;
    if (!cells.has(key)) {
      cells.set(key, []);
    }
    const v = row[valueField];
    if (v !== null && v !== undefined && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) {
        cells.get(key).push(n);
      }
    }
  }

  // Aggregate cells
  const pivotTable = [];
  for (const rk of sortedRowKeys) {
    const entry = { [rowField]: rk };
    for (const ck of sortedColKeys) {
      const key = `${rk}|||${ck}`;
      const values = cells.get(key) || [];
      let cellValue = null;

      if (values.length > 0) {
        switch (agg) {
          case "sum":
            cellValue = calcSum(values);
            break;
          case "avg":
            cellValue = Math.round(calcMean(values) * 1e6) / 1e6;
            break;
          case "count":
            cellValue = values.length;
            break;
          case "min":
            cellValue = calcMin(values);
            break;
          case "max":
            cellValue = calcMax(values);
            break;
        }
      } else if (agg === "count") {
        cellValue = 0;
      }

      entry[ck] = cellValue;
    }
    pivotTable.push(entry);
  }

  // Format text output
  const lines = ["Pivot Table", "===========", ""];
  lines.push(`Rows: ${rowField} | Columns: ${columnField} | Values: ${agg}(${valueField})`);
  lines.push("");

  // Header
  const header = [rowField.padEnd(15), ...sortedColKeys.map((c) => String(c).padEnd(12))].join(" | ");
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (const entry of pivotTable) {
    const rowValues = [String(entry[rowField]).padEnd(15)];
    for (const ck of sortedColKeys) {
      const val = entry[ck] === null ? "-" : String(entry[ck]);
      rowValues.push(val.padEnd(12));
    }
    lines.push(rowValues.join(" | "));
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "pivot",
      rowField,
      columnField,
      valueField,
      aggregation: agg,
      rowCount: sortedRowKeys.length,
      columnCount: sortedColKeys.length,
      pivotTable,
    },
  };
}

function actionDescribeColumns(data) {
  const cols = allColumns(data);
  const descriptions = {};

  for (const col of cols) {
    const values = data.map((row) => row[col]);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
    const uniqueSet = new Set(values.map((v) => (v === undefined ? null : v)));
    const type = inferType(values);

    const desc = {
      type,
      totalCount: values.length,
      nullCount: values.length - nonNull.length,
      uniqueCount: uniqueSet.size,
    };

    if (type === "number" || type === "mixed-number") {
      const nums = numericValues(data, col);
      if (nums.length > 0) {
        desc.min = calcMin(nums);
        desc.max = calcMax(nums);
        desc.mean = Math.round(calcMean(nums) * 1e6) / 1e6;
      }
    }

    if (type === "string") {
      const lengths = nonNull.map((v) => String(v).length);
      if (lengths.length > 0) {
        desc.minLength = Math.min(...lengths);
        desc.maxLength = Math.max(...lengths);
      }
    }

    descriptions[col] = desc;
  }

  const lines = ["Column Descriptions", "===================", ""];
  for (const [col, desc] of Object.entries(descriptions)) {
    lines.push(`Column: ${col}`);
    lines.push(`  Type:    ${desc.type}`);
    lines.push(`  Total:   ${desc.totalCount}`);
    lines.push(`  Nulls:   ${desc.nullCount}`);
    lines.push(`  Unique:  ${desc.uniqueCount}`);
    if (desc.min !== undefined) {
      lines.push(`  Min:     ${desc.min}`);
      lines.push(`  Max:     ${desc.max}`);
      lines.push(`  Mean:    ${desc.mean}`);
    }
    if (desc.minLength !== undefined) {
      lines.push(`  Min Len: ${desc.minLength}`);
      lines.push(`  Max Len: ${desc.maxLength}`);
    }
    lines.push("");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "describe_columns",
      columnCount: cols.length,
      columns: descriptions,
    },
  };
}

function actionFindDuplicates(data, columns) {
  const cols = columns && columns.length > 0 ? columns : allColumns(data);

  // Build a key for each row based on specified columns
  const seen = new Map();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const key = cols.map((c) => JSON.stringify(row[c] === undefined ? null : row[c])).join("|||");
    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key).push({ index: i, row });
  }

  const duplicates = [];
  for (const [, entries] of seen) {
    if (entries.length > 1) {
      duplicates.push({
        count: entries.length,
        indices: entries.map((e) => e.index),
        row: entries[0].row,
      });
    }
  }

  const totalDuplicateRows = duplicates.reduce((sum, d) => sum + d.count, 0);

  const lines = ["Duplicate Analysis", "==================", ""];
  lines.push(`Checked columns: ${cols.join(", ")}`);
  lines.push(`Total rows: ${data.length}`);
  lines.push(`Duplicate groups: ${duplicates.length}`);
  lines.push(`Rows involved in duplicates: ${totalDuplicateRows}`);
  lines.push("");

  if (duplicates.length > 0) {
    for (let i = 0; i < duplicates.length; i++) {
      const d = duplicates[i];
      lines.push(`  Group ${i + 1} (${d.count} occurrences): indices ${d.indices.join(", ")}`);
      const preview = cols.map((c) => `${c}=${JSON.stringify(d.row[c])}`).join(", ");
      lines.push(`    Values: ${preview}`);
    }
  } else {
    lines.push("No duplicates found.");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "find_duplicates",
      columns: cols,
      totalRows: data.length,
      duplicateGroupCount: duplicates.length,
      duplicateRowCount: totalDuplicateRows,
      duplicates,
    },
  };
}

function actionValidateData(data, rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return {
      result: "Error: 'rules' must be a non-empty array of validation rules.",
      metadata: { success: false, error: "INVALID_RULES" },
    };
  }

  const issues = [];

  for (const rule of rules) {
    const { column, rule: ruleName } = rule;

    if (!column || !ruleName) {
      issues.push({
        rule: ruleName || "unknown",
        column: column || "unknown",
        message: "Rule must specify both 'column' and 'rule'.",
        rows: [],
      });
      continue;
    }

    const violatingRows = [];

    switch (ruleName) {
      case "not_null":
        for (let i = 0; i < data.length; i++) {
          const v = data[i][column];
          if (v === null || v === undefined || v === "") {
            violatingRows.push(i);
          }
        }
        break;

      case "unique": {
        const seen = new Map();
        for (let i = 0; i < data.length; i++) {
          const v = JSON.stringify(data[i][column] === undefined ? null : data[i][column]);
          if (seen.has(v)) {
            // Mark both the first occurrence and current as violations
            if (!violatingRows.includes(seen.get(v))) {
              violatingRows.push(seen.get(v));
            }
            violatingRows.push(i);
          } else {
            seen.set(v, i);
          }
        }
        break;
      }

      case "type": {
        const expectedType = rule.expectedType || "number";
        for (let i = 0; i < data.length; i++) {
          const v = data[i][column];
          if (v === null || v === undefined || v === "") continue;
          if (expectedType === "number") {
            if (typeof v !== "number" && Number.isNaN(Number(v))) {
              violatingRows.push(i);
            }
          } else if (expectedType === "string") {
            if (typeof v !== "string") {
              violatingRows.push(i);
            }
          } else if (expectedType === "boolean") {
            if (typeof v !== "boolean") {
              violatingRows.push(i);
            }
          }
        }
        break;
      }

      case "range": {
        const min = rule.min !== undefined ? Number(rule.min) : -Infinity;
        const max = rule.max !== undefined ? Number(rule.max) : Infinity;
        for (let i = 0; i < data.length; i++) {
          const v = data[i][column];
          if (v === null || v === undefined || v === "") continue;
          const n = Number(v);
          if (Number.isNaN(n) || n < min || n > max) {
            violatingRows.push(i);
          }
        }
        break;
      }

      case "pattern": {
        const pattern = rule.pattern;
        if (!pattern) {
          issues.push({
            rule: ruleName,
            column,
            message: "Pattern rule requires a 'pattern' field.",
            rows: [],
          });
          continue;
        }
        let regex;
        try {
          regex = new RegExp(pattern);
        } catch {
          issues.push({
            rule: ruleName,
            column,
            message: `Invalid regex pattern: ${pattern}`,
            rows: [],
          });
          continue;
        }
        for (let i = 0; i < data.length; i++) {
          const v = data[i][column];
          if (v === null || v === undefined || v === "") continue;
          if (!regex.test(String(v))) {
            violatingRows.push(i);
          }
        }
        break;
      }

      default:
        issues.push({
          rule: ruleName,
          column,
          message: `Unknown validation rule: '${ruleName}'.`,
          rows: [],
        });
        continue;
    }

    if (violatingRows.length > 0) {
      issues.push({
        rule: ruleName,
        column,
        message: `${violatingRows.length} row(s) violate '${ruleName}' on column '${column}'.`,
        rows: violatingRows,
      });
    }
  }

  const isValid = issues.length === 0;

  const lines = ["Data Validation Report", "=====================", ""];
  lines.push(`Rules checked: ${rules.length}`);
  lines.push(`Issues found: ${issues.length}`);
  lines.push(`Status: ${isValid ? "VALID" : "INVALID"}`);
  lines.push("");

  if (issues.length > 0) {
    for (const issue of issues) {
      lines.push(`  [${issue.rule}] ${issue.column}: ${issue.message}`);
      if (issue.rows.length > 0) {
        const displayRows = issue.rows.slice(0, 10);
        lines.push(`    Affected rows: ${displayRows.join(", ")}${issue.rows.length > 10 ? ` ... and ${issue.rows.length - 10} more` : ""}`);
      }
    }
  } else {
    lines.push("All validation rules passed.");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "validate_data",
      isValid,
      rulesChecked: rules.length,
      issueCount: issues.length,
      issues,
    },
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute the spreadsheet analyzer skill.
 *
 * @param {Object} params
 * @param {string} params.action - analyze, filter, sort, aggregate, pivot, describe_columns, find_duplicates, or validate_data
 * @param {Object[]} params.data - Array of row objects
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action, data, columns, conditions, sortBy, groupBy, aggregations, rowField, columnField, valueField, aggregation, rules } = params || {};

  if (!action) {
    return {
      result: "Error: The 'action' parameter is required. Supported actions: analyze, filter, sort, aggregate, pivot, describe_columns, find_duplicates, validate_data.",
      metadata: { success: false, error: "MISSING_ACTION" },
    };
  }

  // All actions require data except none -- validate it upfront
  const dataError = validateData(data);
  if (dataError) {
    return dataError;
  }

  switch (action) {
    case "analyze":
      return actionAnalyze(data, columns);

    case "filter":
      return actionFilter(data, conditions);

    case "sort":
      return actionSort(data, sortBy);

    case "aggregate":
      return actionAggregate(data, groupBy, aggregations);

    case "pivot":
      return actionPivot(data, rowField, columnField, valueField, aggregation);

    case "describe_columns":
      return actionDescribeColumns(data);

    case "find_duplicates":
      return actionFindDuplicates(data, columns);

    case "validate_data":
      return actionValidateData(data, rules);

    default:
      return {
        result: `Error: Unknown action '${String(action)}'. Supported actions: analyze, filter, sort, aggregate, pivot, describe_columns, find_duplicates, validate_data.`,
        metadata: { success: false, error: "UNKNOWN_ACTION" },
      };
  }
}
