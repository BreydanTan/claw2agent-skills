/**
 * Chart Generator Skill Handler
 *
 * L0 skill -- pure local computation, no external API calls.
 *
 * Create and manage chart configurations for data visualization.
 * Provides actions to create charts, update them, retrieve chart configs,
 * delete charts, export Chart.js-compatible configs, and list charts/types.
 * All data is stored in an in-memory Map-based store.
 */

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// In-memory chart store (module-level so it persists across calls)
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
 * Return the current number of charts in the store.
 * @returns {number}
 */
export function _storeSize() {
  return store.size;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  "create_chart",
  "update_chart",
  "get_chart",
  "delete_chart",
  "export_config",
  "list_charts",
  "list_chart_types",
];

const VALID_CHART_TYPES = ["line", "bar", "pie", "doughnut", "radar", "scatter", "area"];

const CHART_TYPE_DESCRIPTIONS = {
  line: "Line chart for displaying data trends over time or continuous data.",
  bar: "Bar chart for comparing categorical data with rectangular bars.",
  pie: "Pie chart for showing proportional data as slices of a circle.",
  doughnut: "Doughnut chart similar to pie but with a hollow center.",
  radar: "Radar chart for displaying multivariate data on a radial grid.",
  scatter: "Scatter chart for showing relationships between two variables.",
  area: "Area chart similar to line but with the region below filled.",
};

const MAX_TITLE_LENGTH = 200;
const MAX_LABELS = 100;
const MAX_DATASETS = 20;
const MAX_DATA_VALUES = 1000;

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validate chart title: must be a non-empty string, max 200 chars.
 */
function validateTitle(title) {
  if (!title || typeof title !== "string" || title.trim() === "") {
    return "Title is required and must be a non-empty string.";
  }
  if (title.trim().length > MAX_TITLE_LENGTH) {
    return `Title must be at most ${MAX_TITLE_LENGTH} characters (got ${title.trim().length}).`;
  }
  return null;
}

/**
 * Validate chart type: must be one of the valid chart types.
 */
function validateChartType(type) {
  if (!type || typeof type !== "string") {
    return "Chart type is required and must be a string.";
  }
  if (!VALID_CHART_TYPES.includes(type)) {
    return `Invalid chart type '${type}'. Must be one of: ${VALID_CHART_TYPES.join(", ")}.`;
  }
  return null;
}

/**
 * Validate chart data: must have labels (array of strings) and datasets (array of objects).
 */
function validateData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Data is required and must be an object with 'labels' and 'datasets'.";
  }

  // Validate labels
  if (!Array.isArray(data.labels)) {
    return "Data 'labels' must be an array.";
  }
  if (data.labels.length > MAX_LABELS) {
    return `Data 'labels' must have at most ${MAX_LABELS} items (got ${data.labels.length}).`;
  }
  for (let i = 0; i < data.labels.length; i++) {
    if (typeof data.labels[i] !== "string") {
      return `Data label at index ${i} must be a string.`;
    }
  }

  // Validate datasets
  if (!Array.isArray(data.datasets)) {
    return "Data 'datasets' must be an array.";
  }
  if (data.datasets.length === 0) {
    return "Data 'datasets' must be a non-empty array.";
  }
  if (data.datasets.length > MAX_DATASETS) {
    return `Data 'datasets' must have at most ${MAX_DATASETS} datasets (got ${data.datasets.length}).`;
  }

  for (let i = 0; i < data.datasets.length; i++) {
    const ds = data.datasets[i];
    if (!ds || typeof ds !== "object" || Array.isArray(ds)) {
      return `Dataset at index ${i} must be an object with 'label' and 'data'.`;
    }
    if (!ds.label || typeof ds.label !== "string" || ds.label.trim() === "") {
      return `Dataset at index ${i} must have a non-empty string 'label'.`;
    }
    if (!Array.isArray(ds.data)) {
      return `Dataset at index ${i} 'data' must be an array of numbers.`;
    }
    if (ds.data.length > MAX_DATA_VALUES) {
      return `Dataset at index ${i} 'data' must have at most ${MAX_DATA_VALUES} values (got ${ds.data.length}).`;
    }
    for (let j = 0; j < ds.data.length; j++) {
      if (typeof ds.data[j] !== "number" || Number.isNaN(ds.data[j])) {
        return `Dataset at index ${i}, data value at index ${j} must be a finite number.`;
      }
    }
  }

  return null;
}

/**
 * Validate chartId: must be a non-empty string.
 */
function validateChartId(chartId) {
  if (!chartId || typeof chartId !== "string" || chartId.trim() === "") {
    return "Chart ID is required and must be a non-empty string.";
  }
  return null;
}

/**
 * Validate options object (optional).
 */
function validateOptions(options) {
  if (options === undefined || options === null) {
    return null;
  }
  if (typeof options !== "object" || Array.isArray(options)) {
    return "Options must be an object.";
  }
  const allowedKeys = ["backgroundColor", "borderColor", "legend", "responsive"];
  const keys = Object.keys(options);
  for (const key of keys) {
    if (!allowedKeys.includes(key)) {
      return `Unknown option '${key}'. Allowed options: ${allowedKeys.join(", ")}.`;
    }
  }
  if (options.backgroundColor !== undefined && typeof options.backgroundColor !== "string") {
    return "Option 'backgroundColor' must be a string.";
  }
  if (options.borderColor !== undefined && typeof options.borderColor !== "string") {
    return "Option 'borderColor' must be a string.";
  }
  if (options.legend !== undefined && typeof options.legend !== "boolean") {
    return "Option 'legend' must be a boolean.";
  }
  if (options.responsive !== undefined && typeof options.responsive !== "boolean") {
    return "Option 'responsive' must be a boolean.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionCreateChart(params) {
  const { type, title, data, options } = params;

  // Validate type
  const typeError = validateChartType(type);
  if (typeError) {
    return {
      result: `Error: ${typeError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  // Validate title
  const titleError = validateTitle(title);
  if (titleError) {
    return {
      result: `Error: ${titleError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  // Validate data
  const dataError = validateData(data);
  if (dataError) {
    return {
      result: `Error: ${dataError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  // Validate options (optional)
  const optionsError = validateOptions(options);
  if (optionsError) {
    return {
      result: `Error: ${optionsError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const chart = {
    id,
    type,
    title: title.trim(),
    data: JSON.parse(JSON.stringify(data)),
    options: options ? JSON.parse(JSON.stringify(options)) : {},
    createdAt: now,
    updatedAt: now,
  };

  store.set(id, chart);

  return {
    result: `Chart '${chart.title}' (${type}) created successfully with ID ${id}.`,
    metadata: {
      success: true,
      action: "create_chart",
      chartId: id,
      type,
      title: chart.title,
      datasetCount: data.datasets.length,
      labelCount: data.labels.length,
      createdAt: now,
    },
  };
}

function actionUpdateChart(params) {
  const { chartId, title, data, options } = params;

  // Validate chartId
  const idError = validateChartId(chartId);
  if (idError) {
    return {
      result: `Error: ${idError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const chart = store.get(chartId);
  if (!chart) {
    return {
      result: `Error: Chart with ID '${chartId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const updated = [];

  // Update title if provided
  if (title !== undefined) {
    const titleError = validateTitle(title);
    if (titleError) {
      return {
        result: `Error: ${titleError}`,
        metadata: { success: false, error: "INVALID_INPUT" },
      };
    }
    chart.title = title.trim();
    updated.push("title");
  }

  // Update data if provided
  if (data !== undefined) {
    const dataError = validateData(data);
    if (dataError) {
      return {
        result: `Error: ${dataError}`,
        metadata: { success: false, error: "INVALID_INPUT" },
      };
    }
    chart.data = JSON.parse(JSON.stringify(data));
    updated.push("data");
  }

  // Update options if provided
  if (options !== undefined) {
    const optionsError = validateOptions(options);
    if (optionsError) {
      return {
        result: `Error: ${optionsError}`,
        metadata: { success: false, error: "INVALID_INPUT" },
      };
    }
    chart.options = JSON.parse(JSON.stringify(options));
    updated.push("options");
  }

  if (updated.length === 0) {
    return {
      result: "Error: No fields provided to update. Provide at least one of: title, data, options.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  chart.updatedAt = new Date().toISOString();

  return {
    result: `Chart '${chart.title}' updated successfully. Fields updated: ${updated.join(", ")}.`,
    metadata: {
      success: true,
      action: "update_chart",
      chartId,
      updatedFields: updated,
      title: chart.title,
      updatedAt: chart.updatedAt,
    },
  };
}

function actionGetChart(params) {
  const { chartId } = params;

  // Validate chartId
  const idError = validateChartId(chartId);
  if (idError) {
    return {
      result: `Error: ${idError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const chart = store.get(chartId);
  if (!chart) {
    return {
      result: `Error: Chart with ID '${chartId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const lines = [
    `Chart: ${chart.title}`,
    `Type: ${chart.type}`,
    "=".repeat(40),
    "",
    `ID: ${chart.id}`,
    `Labels: ${chart.data.labels.join(", ")}`,
    `Datasets: ${chart.data.datasets.length}`,
    "",
  ];

  for (const ds of chart.data.datasets) {
    lines.push(`  Dataset '${ds.label}': [${ds.data.join(", ")}]`);
  }

  if (Object.keys(chart.options).length > 0) {
    lines.push("");
    lines.push(`Options: ${JSON.stringify(chart.options)}`);
  }

  lines.push("");
  lines.push(`Created: ${chart.createdAt}`);
  lines.push(`Updated: ${chart.updatedAt}`);

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "get_chart",
      chartId: chart.id,
      type: chart.type,
      title: chart.title,
      data: JSON.parse(JSON.stringify(chart.data)),
      options: JSON.parse(JSON.stringify(chart.options)),
      createdAt: chart.createdAt,
      updatedAt: chart.updatedAt,
    },
  };
}

function actionDeleteChart(params) {
  const { chartId } = params;

  // Validate chartId
  const idError = validateChartId(chartId);
  if (idError) {
    return {
      result: `Error: ${idError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const chart = store.get(chartId);
  if (!chart) {
    return {
      result: `Error: Chart with ID '${chartId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const title = chart.title;
  store.delete(chartId);

  return {
    result: `Chart '${title}' deleted successfully.`,
    metadata: {
      success: true,
      action: "delete_chart",
      chartId,
      title,
    },
  };
}

function actionExportConfig(params) {
  const { chartId } = params;

  // Validate chartId
  const idError = validateChartId(chartId);
  if (idError) {
    return {
      result: `Error: ${idError}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const chart = store.get(chartId);
  if (!chart) {
    return {
      result: `Error: Chart with ID '${chartId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  // Build Chart.js-compatible config
  const chartType = chart.type === "area" ? "line" : chart.type;

  const datasets = chart.data.datasets.map((ds) => {
    const dataset = {
      label: ds.label,
      data: [...ds.data],
    };
    if (chart.options.backgroundColor) {
      dataset.backgroundColor = chart.options.backgroundColor;
    }
    if (chart.options.borderColor) {
      dataset.borderColor = chart.options.borderColor;
    }
    if (chart.type === "area") {
      dataset.fill = true;
    }
    return dataset;
  });

  const config = {
    type: chartType,
    data: {
      labels: [...chart.data.labels],
      datasets,
    },
    options: {
      responsive: chart.options.responsive !== undefined ? chart.options.responsive : true,
      plugins: {
        title: {
          display: true,
          text: chart.title,
        },
        legend: {
          display: chart.options.legend !== undefined ? chart.options.legend : true,
        },
      },
    },
  };

  const configJson = JSON.stringify(config, null, 2);

  return {
    result: configJson,
    metadata: {
      success: true,
      action: "export_config",
      chartId: chart.id,
      title: chart.title,
      chartjsType: chartType,
      config,
    },
  };
}

function actionListCharts() {
  const charts = [...store.values()];

  if (charts.length === 0) {
    return {
      result: "No charts found.",
      metadata: {
        success: true,
        action: "list_charts",
        count: 0,
        charts: [],
      },
    };
  }

  const lines = [
    "Charts",
    "======",
    "",
    `Total: ${charts.length}`,
    "",
  ];

  const summaries = charts.map((c) => ({
    id: c.id,
    type: c.type,
    title: c.title,
    datasetCount: c.data.datasets.length,
    labelCount: c.data.labels.length,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  for (const s of summaries) {
    lines.push(`  [${s.id}] ${s.title} (${s.type}, ${s.datasetCount} dataset(s), ${s.labelCount} label(s))`);
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "list_charts",
      count: charts.length,
      charts: summaries,
    },
  };
}

function actionListChartTypes() {
  const types = VALID_CHART_TYPES.map((t) => ({
    type: t,
    description: CHART_TYPE_DESCRIPTIONS[t],
  }));

  const lines = [
    "Supported Chart Types",
    "=====================",
    "",
  ];

  for (const t of types) {
    lines.push(`  ${t.type}: ${t.description}`);
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "list_chart_types",
      count: types.length,
      types,
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
  name: "chart-generator",
  version: "1.0.0",
  description:
    "Create and manage chart configurations for data visualization. Pure local computation with in-memory storage.",
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute the chart-generator skill.
 *
 * @param {Object} params
 * @param {string} params.action - create_chart, update_chart, get_chart, delete_chart, export_config, list_charts, list_chart_types
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
    case "create_chart":
      return actionCreateChart(params);

    case "update_chart":
      return actionUpdateChart(params);

    case "get_chart":
      return actionGetChart(params);

    case "delete_chart":
      return actionDeleteChart(params);

    case "export_config":
      return actionExportConfig(params);

    case "list_charts":
      return actionListCharts();

    case "list_chart_types":
      return actionListChartTypes();

    default:
      return {
        result: `Error: Unknown action '${String(action)}'.`,
        metadata: { success: false, error: "INVALID_ACTION" },
      };
  }
}
