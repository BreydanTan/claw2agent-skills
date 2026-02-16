import fs from "node:fs";
import path from "node:path";

export async function execute(params, context) {
  const { action, filePath, data, sheetName = "Sheet1" } = params;

  if (!action || !filePath) {
    throw new Error("Parameters 'action' and 'filePath' are required");
  }

  switch (action) {
    case "read":
      return readCsv(filePath);
    case "write":
      return writeCsv(filePath, data);
    case "analyze":
      return analyzeCsv(filePath);
    default:
      throw new Error(
        `Unknown action: ${action}. Supported actions: read, write, analyze`
      );
  }
}

/**
 * Parse a CSV line, respecting quoted fields that may contain commas or newlines.
 */
function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parse full CSV text into an array of objects using the header row as keys.
 */
function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return { headers: [], records: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      let value = values[j] !== undefined ? values[j] : "";
      // Auto-convert numeric values
      if (value !== "" && !isNaN(Number(value))) {
        value = Number(value);
      }
      record[headers[j]] = value;
    }
    records.push(record);
  }

  return { headers, records };
}

/**
 * Escape a CSV field value, wrapping in quotes if it contains commas, quotes, or newlines.
 */
function escapeCsvField(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function readCsv(filePath) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const csvText = fs.readFileSync(resolvedPath, "utf-8");
  const { headers, records } = parseCsv(csvText);

  const lines = [
    `CSV Read: ${path.basename(resolvedPath)}`,
    `==================`,
    `Rows: ${records.length}`,
    `Columns: ${headers.join(", ")}`,
    ``,
    `Data (JSON):`,
    JSON.stringify(records, null, 2),
  ];

  return {
    result: lines.join("\n"),
    metadata: {
      action: "read",
      rowCount: records.length,
      columns: headers,
      filePath: resolvedPath,
    },
  };
}

async function writeCsv(filePath, data) {
  if (!data) {
    throw new Error("The 'data' parameter is required for the write action");
  }

  let records;
  try {
    records = typeof data === "string" ? JSON.parse(data) : data;
  } catch (error) {
    throw new Error(`Failed to parse JSON data: ${error.message}`);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Data must be a non-empty JSON array of objects");
  }

  // Collect all unique headers from all records
  const headerSet = new Set();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);

  // Build CSV content
  const csvLines = [headers.map(escapeCsvField).join(",")];

  for (const record of records) {
    const row = headers.map((h) => escapeCsvField(record[h]));
    csvLines.push(row.join(","));
  }

  const csvContent = csvLines.join("\n") + "\n";
  const resolvedPath = path.resolve(filePath);

  // Ensure the directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, csvContent, "utf-8");

  return {
    result: `CSV written to ${resolvedPath} (${records.length} rows, ${headers.length} columns)`,
    metadata: {
      action: "write",
      rowCount: records.length,
      columns: headers,
      filePath: resolvedPath,
    },
  };
}

async function analyzeCsv(filePath) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const csvText = fs.readFileSync(resolvedPath, "utf-8");
  const { headers, records } = parseCsv(csvText);

  const lines = [
    `CSV Analysis: ${path.basename(resolvedPath)}`,
    `============================`,
    `Total rows: ${records.length}`,
    `Total columns: ${headers.length}`,
    `Column names: ${headers.join(", ")}`,
    ``,
  ];

  // Compute stats for numeric columns
  const numericStats = {};
  for (const header of headers) {
    const numericValues = records
      .map((r) => r[header])
      .filter((v) => typeof v === "number" && !isNaN(v));

    if (numericValues.length > records.length * 0.5) {
      // More than half are numeric, treat as numeric column
      const sum = numericValues.reduce((a, b) => a + b, 0);
      const mean = sum / numericValues.length;
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);

      // Standard deviation
      const squaredDiffs = numericValues.map((v) => (v - mean) ** 2);
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / numericValues.length;
      const stdDev = Math.sqrt(variance);

      numericStats[header] = { count: numericValues.length, sum, mean, min, max, stdDev };
    }
  }

  const numericColumns = Object.keys(numericStats);
  if (numericColumns.length > 0) {
    lines.push(`Numeric Column Statistics:`);
    lines.push(`--------------------------`);
    for (const col of numericColumns) {
      const s = numericStats[col];
      lines.push(`  ${col}:`);
      lines.push(`    Count: ${s.count}`);
      lines.push(`    Min: ${s.min}`);
      lines.push(`    Max: ${s.max}`);
      lines.push(`    Mean: ${s.mean.toFixed(4)}`);
      lines.push(`    Std Dev: ${s.stdDev.toFixed(4)}`);
      lines.push(`    Sum: ${s.sum}`);
      lines.push(``);
    }
  } else {
    lines.push(`No numeric columns detected.`);
  }

  return {
    result: lines.join("\n"),
    metadata: {
      action: "analyze",
      rowCount: records.length,
      columns: headers,
      numericColumns,
      filePath: resolvedPath,
    },
  };
}
