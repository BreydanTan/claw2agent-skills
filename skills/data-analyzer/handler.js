export async function execute(params, context) {
  const { data, operation, field, value, order = "asc" } = params;

  if (!data || !operation) {
    throw new Error("Parameters 'data' and 'operation' are required");
  }

  // Parse the JSON data
  let records;
  try {
    records = typeof data === "string" ? JSON.parse(data) : data;
  } catch (error) {
    throw new Error(`Failed to parse JSON data: ${error.message}`);
  }

  if (!Array.isArray(records)) {
    throw new Error("Data must be a JSON array of objects");
  }

  switch (operation) {
    case "summary":
      return performSummary(records);
    case "average":
      return performAverage(records, field);
    case "count":
      return performCount(records);
    case "filter":
      return performFilter(records, field, value);
    case "sort":
      return performSort(records, field, order);
    case "groupBy":
      return performGroupBy(records, field);
    default:
      throw new Error(
        `Unknown operation: ${operation}. Supported: summary, average, count, filter, sort, groupBy`
      );
  }
}

function performSummary(records) {
  const count = records.length;

  if (count === 0) {
    return {
      result: "Dataset is empty (0 records).",
      metadata: { operation: "summary", recordCount: 0 },
    };
  }

  // Gather all field names
  const fieldSet = new Set();
  for (const record of records) {
    if (typeof record === "object" && record !== null) {
      for (const key of Object.keys(record)) {
        fieldSet.add(key);
      }
    }
  }
  const fields = Array.from(fieldSet);

  // Determine field types
  const fieldTypes = {};
  for (const f of fields) {
    const sampleValues = records
      .slice(0, 10)
      .map((r) => r[f])
      .filter((v) => v !== undefined && v !== null);
    const types = [...new Set(sampleValues.map((v) => typeof v))];
    fieldTypes[f] = types.join(", ");
  }

  // Sample record
  const sample = records[0];

  const lines = [
    `Dataset Summary`,
    `===============`,
    `Total records: ${count}`,
    `Fields (${fields.length}): ${fields.join(", ")}`,
    ``,
    `Field types:`,
    ...fields.map((f) => `  - ${f}: ${fieldTypes[f]}`),
    ``,
    `Sample record:`,
    JSON.stringify(sample, null, 2),
  ];

  return {
    result: lines.join("\n"),
    metadata: { operation: "summary", recordCount: count },
  };
}

function performAverage(records, field) {
  if (!field) {
    throw new Error("The 'field' parameter is required for the average operation");
  }

  const numericValues = records
    .map((r) => r[field])
    .filter((v) => v !== undefined && v !== null && !isNaN(Number(v)))
    .map(Number);

  if (numericValues.length === 0) {
    throw new Error(`No numeric values found in field '${field}'`);
  }

  const sum = numericValues.reduce((acc, val) => acc + val, 0);
  const avg = sum / numericValues.length;
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);

  const lines = [
    `Average of '${field}'`,
    `=====================`,
    `Average: ${avg.toFixed(4)}`,
    `Sum: ${sum}`,
    `Min: ${min}`,
    `Max: ${max}`,
    `Count (numeric): ${numericValues.length}`,
    `Count (total): ${records.length}`,
  ];

  return {
    result: lines.join("\n"),
    metadata: { operation: "average", recordCount: records.length },
  };
}

function performCount(records) {
  return {
    result: `Total records: ${records.length}`,
    metadata: { operation: "count", recordCount: records.length },
  };
}

function performFilter(records, field, value) {
  if (!field) {
    throw new Error("The 'field' parameter is required for the filter operation");
  }
  if (value === undefined || value === null) {
    throw new Error("The 'value' parameter is required for the filter operation");
  }

  const filtered = records.filter((r) => {
    const fieldValue = r[field];
    // Compare loosely to handle string/number comparisons
    return String(fieldValue) === String(value);
  });

  const lines = [
    `Filter: ${field} = ${value}`,
    `========================`,
    `Matched ${filtered.length} of ${records.length} records`,
    ``,
    ...filtered.slice(0, 20).map((r, i) => `[${i + 1}] ${JSON.stringify(r)}`),
  ];

  if (filtered.length > 20) {
    lines.push(`... and ${filtered.length - 20} more records`);
  }

  return {
    result: lines.join("\n"),
    metadata: { operation: "filter", recordCount: filtered.length },
  };
}

function performSort(records, field, order) {
  if (!field) {
    throw new Error("The 'field' parameter is required for the sort operation");
  }

  const sorted = [...records].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];

    // Handle null/undefined
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    // Numeric comparison if both are numbers
    if (typeof aVal === "number" && typeof bVal === "number") {
      return order === "asc" ? aVal - bVal : bVal - aVal;
    }

    // String comparison
    const comparison = String(aVal).localeCompare(String(bVal));
    return order === "asc" ? comparison : -comparison;
  });

  const lines = [
    `Sort by '${field}' (${order})`,
    `========================`,
    `${sorted.length} records sorted`,
    ``,
    ...sorted.slice(0, 20).map((r, i) => `[${i + 1}] ${JSON.stringify(r)}`),
  ];

  if (sorted.length > 20) {
    lines.push(`... and ${sorted.length - 20} more records`);
  }

  return {
    result: lines.join("\n"),
    metadata: { operation: "sort", recordCount: sorted.length },
  };
}

function performGroupBy(records, field) {
  if (!field) {
    throw new Error("The 'field' parameter is required for the groupBy operation");
  }

  const groups = {};
  for (const record of records) {
    const key = String(record[field] ?? "(null)");
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(record);
  }

  const groupEntries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  const lines = [
    `Group by '${field}'`,
    `========================`,
    `${groupEntries.length} unique groups from ${records.length} records`,
    ``,
    ...groupEntries.map(
      ([key, items]) => `  ${key}: ${items.length} record${items.length !== 1 ? "s" : ""}`
    ),
  ];

  return {
    result: lines.join("\n"),
    metadata: { operation: "groupBy", recordCount: records.length },
  };
}
