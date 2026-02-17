/**
 * Citation Generator Skill Handler
 *
 * L0 skill -- pure local computation, no external API calls.
 *
 * Generate and manage academic citations in multiple formats (APA, MLA, Chicago, BibTeX).
 */

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// In-memory store (module-level, persists across calls)
// ---------------------------------------------------------------------------

const store = new Map();

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

export function _clearStore() {
  store.clear();
}

export function _storeSize() {
  return store.size;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  "create_citation",
  "format_citation",
  "list_citations",
  "get_citation",
  "delete_citation",
  "export_bibliography",
];

const VALID_TYPES = ["article", "book", "website", "conference"];
const VALID_STYLES = ["apa", "mla", "chicago", "bibtex"];

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function validateNonEmptyString(value, fieldName) {
  if (!value || typeof value !== "string") {
    return { valid: false, error: `The "${fieldName}" parameter is required and must be a non-empty string.` };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: `The "${fieldName}" parameter must not be empty.` };
  }
  return { valid: true, value: trimmed };
}

function validateCitationType(type) {
  const v = validateNonEmptyString(type, "type");
  if (!v.valid) return v;
  if (!VALID_TYPES.includes(v.value)) {
    return { valid: false, error: `Invalid type "${v.value}". Must be one of: ${VALID_TYPES.join(", ")}` };
  }
  return { valid: true, value: v.value };
}

function validateStyle(style) {
  const v = validateNonEmptyString(style, "style");
  if (!v.valid) return v;
  if (!VALID_STYLES.includes(v.value.toLowerCase())) {
    return { valid: false, error: `Invalid style "${v.value}". Must be one of: ${VALID_STYLES.join(", ")}` };
  }
  return { valid: true, value: v.value.toLowerCase() };
}

// ---------------------------------------------------------------------------
// Citation formatting functions
// ---------------------------------------------------------------------------

function formatAuthorsApa(authors) {
  if (!authors || authors.length === 0) return "";
  if (authors.length === 1) return `${authors[0]}.`;
  if (authors.length === 2) return `${authors[0]}, & ${authors[1]}.`;
  return `${authors.slice(0, -1).join(", ")}, & ${authors[authors.length - 1]}.`;
}

function formatAuthorsMla(authors) {
  if (!authors || authors.length === 0) return "";
  if (authors.length === 1) return `${authors[0]}.`;
  if (authors.length === 2) return `${authors[0]}, and ${authors[1]}.`;
  return `${authors[0]}, et al.`;
}

function formatAuthorsChicago(authors) {
  if (!authors || authors.length === 0) return "";
  if (authors.length === 1) return `${authors[0]}.`;
  if (authors.length <= 3) return `${authors.slice(0, -1).join(", ")}, and ${authors[authors.length - 1]}.`;
  return `${authors[0]} et al.`;
}

function formatCitationApa(citation) {
  const authors = formatAuthorsApa(citation.authors);
  const year = citation.year ? ` (${citation.year}).` : ".";
  const title = citation.title ? ` ${citation.title}.` : "";
  const source = citation.source ? ` ${citation.source}.` : "";
  const doi = citation.doi ? ` https://doi.org/${citation.doi}` : "";
  const url = !doi && citation.url ? ` Retrieved from ${citation.url}` : "";
  return `${authors}${year}${title}${source}${doi}${url}`.trim();
}

function formatCitationMla(citation) {
  const authors = formatAuthorsMla(citation.authors);
  const title = citation.title ? ` "${citation.title}."` : "";
  const source = citation.source ? ` ${citation.source},` : "";
  const year = citation.year ? ` ${citation.year}.` : ".";
  const url = citation.url ? ` ${citation.url}.` : "";
  return `${authors}${title}${source}${year}${url}`.trim();
}

function formatCitationChicago(citation) {
  const authors = formatAuthorsChicago(citation.authors);
  const title = citation.title ? ` "${citation.title}."` : "";
  const source = citation.source ? ` ${citation.source}` : "";
  const year = citation.year ? ` (${citation.year}).` : ".";
  const doi = citation.doi ? ` https://doi.org/${citation.doi}.` : "";
  return `${authors}${title}${source}${year}${doi}`.trim();
}

function formatCitationBibtex(citation) {
  const entryType = citation.type === "book" ? "book" : (citation.type === "conference" ? "inproceedings" : "article");
  const key = citation.id || "unknown";
  const lines = [`@${entryType}{${key},`];
  if (citation.authors && citation.authors.length > 0) {
    lines.push(`  author = {${citation.authors.join(" and ")}},`);
  }
  if (citation.title) lines.push(`  title = {${citation.title}},`);
  if (citation.source) {
    const field = citation.type === "book" ? "publisher" : "journal";
    lines.push(`  ${field} = {${citation.source}},`);
  }
  if (citation.year) lines.push(`  year = {${citation.year}},`);
  if (citation.doi) lines.push(`  doi = {${citation.doi}},`);
  if (citation.url) lines.push(`  url = {${citation.url}},`);
  lines.push("}");
  return lines.join("\n");
}

function formatCitation(citation, style) {
  switch (style) {
    case "apa": return formatCitationApa(citation);
    case "mla": return formatCitationMla(citation);
    case "chicago": return formatCitationChicago(citation);
    case "bibtex": return formatCitationBibtex(citation);
    default: return formatCitationApa(citation);
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionCreateCitation(params) {
  const typeV = validateCitationType(params.type);
  if (!typeV.valid) {
    return {
      result: `Error: ${typeV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const titleV = validateNonEmptyString(params.title, "title");
  if (!titleV.valid) {
    return {
      result: `Error: ${titleV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const authorsV = validateNonEmptyString(params.authors, "authors");
  if (!authorsV.valid) {
    return {
      result: `Error: ${authorsV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const yearV = validateNonEmptyString(params.year, "year");
  if (!yearV.valid) {
    return {
      result: `Error: ${yearV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const id = crypto.randomUUID();
  const authorsList = authorsV.value.split(",").map((a) => a.trim()).filter(Boolean);

  const citation = {
    id,
    type: typeV.value,
    title: titleV.value,
    authors: authorsList,
    year: yearV.value,
    source: params.source && typeof params.source === "string" ? params.source.trim() : null,
    url: params.url && typeof params.url === "string" ? params.url.trim() : null,
    doi: params.doi && typeof params.doi === "string" ? params.doi.trim() : null,
    createdAt: new Date().toISOString(),
  };

  store.set(id, citation);

  return {
    result: `Citation Created\nID: ${id}\nType: ${citation.type}\nTitle: ${citation.title}\nAuthors: ${citation.authors.join(", ")}\nYear: ${citation.year}`,
    metadata: {
      success: true,
      action: "create_citation",
      id,
      type: citation.type,
      timestamp: new Date().toISOString(),
    },
  };
}

function actionFormatCitation(params) {
  const idV = validateNonEmptyString(params.citationId, "citationId");
  if (!idV.valid) {
    return {
      result: `Error: ${idV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const styleV = validateStyle(params.style);
  if (!styleV.valid) {
    return {
      result: `Error: ${styleV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const citation = store.get(idV.value);
  if (!citation) {
    return {
      result: `Error: Citation with ID "${idV.value}" not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const formatted = formatCitation(citation, styleV.value);

  return {
    result: `Formatted Citation (${styleV.value.toUpperCase()})\n\n${formatted}`,
    metadata: {
      success: true,
      action: "format_citation",
      citationId: idV.value,
      style: styleV.value,
      formatted,
      timestamp: new Date().toISOString(),
    },
  };
}

function actionListCitations(params) {
  const typeFilter = params.type && typeof params.type === "string" ? params.type.trim() : null;
  let citations = Array.from(store.values());

  if (typeFilter) {
    citations = citations.filter((c) => c.type === typeFilter);
  }

  const lines = [
    `Citation List`,
    typeFilter ? `Type filter: ${typeFilter}` : "All types",
    `Count: ${citations.length} citation(s)`,
    "",
    ...citations.map((c, i) => {
      return `${i + 1}. [${c.type}] ${c.title} (${c.year}) — ID: ${c.id}`;
    }),
  ];

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "list_citations",
      count: citations.length,
      typeFilter,
      timestamp: new Date().toISOString(),
    },
  };
}

function actionGetCitation(params) {
  const idV = validateNonEmptyString(params.citationId, "citationId");
  if (!idV.valid) {
    return {
      result: `Error: ${idV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const citation = store.get(idV.value);
  if (!citation) {
    return {
      result: `Error: Citation with ID "${idV.value}" not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const lines = [
    `Citation Details`,
    `ID: ${citation.id}`,
    `Type: ${citation.type}`,
    `Title: ${citation.title}`,
    `Authors: ${citation.authors.join(", ")}`,
    `Year: ${citation.year}`,
    citation.source ? `Source: ${citation.source}` : null,
    citation.url ? `URL: ${citation.url}` : null,
    citation.doi ? `DOI: ${citation.doi}` : null,
    `Created: ${citation.createdAt}`,
  ].filter(Boolean);

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "get_citation",
      citationId: idV.value,
      citation,
      timestamp: new Date().toISOString(),
    },
  };
}

function actionDeleteCitation(params) {
  const idV = validateNonEmptyString(params.citationId, "citationId");
  if (!idV.valid) {
    return {
      result: `Error: ${idV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (!store.has(idV.value)) {
    return {
      result: `Error: Citation with ID "${idV.value}" not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  store.delete(idV.value);

  return {
    result: `Citation "${idV.value}" deleted successfully.`,
    metadata: {
      success: true,
      action: "delete_citation",
      citationId: idV.value,
      timestamp: new Date().toISOString(),
    },
  };
}

function actionExportBibliography(params) {
  const styleV = validateStyle(params.style);
  if (!styleV.valid) {
    return {
      result: `Error: ${styleV.error}`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  let citations;
  if (params.ids && typeof params.ids === "string") {
    const idList = params.ids.split(",").map((id) => id.trim()).filter(Boolean);
    citations = idList.map((id) => store.get(id)).filter(Boolean);
  } else {
    citations = Array.from(store.values());
  }

  if (citations.length === 0) {
    return {
      result: `Bibliography is empty. No citations to export.`,
      metadata: {
        success: true,
        action: "export_bibliography",
        style: styleV.value,
        count: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const entries = citations.map((c) => formatCitation(c, styleV.value));
  const separator = styleV.value === "bibtex" ? "\n\n" : "\n\n";
  const bibliography = entries.join(separator);

  return {
    result: `Bibliography (${styleV.value.toUpperCase()}, ${citations.length} entries)\n\n${bibliography}`,
    metadata: {
      success: true,
      action: "export_bibliography",
      style: styleV.value,
      count: citations.length,
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

export function validate(params) {
  const { action } = params || {};

  if (!action || !VALID_ACTIONS.includes(action)) {
    return {
      valid: false,
      error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(", ")}`,
    };
  }

  switch (action) {
    case "create_citation": {
      const typeV = validateCitationType(params.type);
      if (!typeV.valid) return { valid: false, error: typeV.error };
      const titleV = validateNonEmptyString(params.title, "title");
      if (!titleV.valid) return { valid: false, error: titleV.error };
      const authorsV = validateNonEmptyString(params.authors, "authors");
      if (!authorsV.valid) return { valid: false, error: authorsV.error };
      const yearV = validateNonEmptyString(params.year, "year");
      if (!yearV.valid) return { valid: false, error: yearV.error };
      return { valid: true };
    }
    case "format_citation": {
      const idV = validateNonEmptyString(params.citationId, "citationId");
      if (!idV.valid) return { valid: false, error: idV.error };
      const styleV = validateStyle(params.style);
      if (!styleV.valid) return { valid: false, error: styleV.error };
      return { valid: true };
    }
    case "list_citations":
      return { valid: true };
    case "get_citation": {
      const idV = validateNonEmptyString(params.citationId, "citationId");
      if (!idV.valid) return { valid: false, error: idV.error };
      return { valid: true };
    }
    case "delete_citation": {
      const idV = validateNonEmptyString(params.citationId, "citationId");
      if (!idV.valid) return { valid: false, error: idV.error };
      return { valid: true };
    }
    case "export_bibliography": {
      const styleV = validateStyle(params.style);
      if (!styleV.valid) return { valid: false, error: styleV.error };
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: "citation-generator",
  version: "1.0.0",
  description: "Generate and manage academic citations in multiple formats (APA, MLA, Chicago, BibTeX).",
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

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
    case "create_citation":
      return actionCreateCitation(params);
    case "format_citation":
      return actionFormatCitation(params);
    case "list_citations":
      return actionListCitations(params);
    case "get_citation":
      return actionGetCitation(params);
    case "delete_citation":
      return actionDeleteCitation(params);
    case "export_bibliography":
      return actionExportBibliography(params);
    default:
      return {
        result: `Error: Unknown action '${String(action)}'.`,
        metadata: { success: false, error: "INVALID_ACTION" },
      };
  }
}

export {
  VALID_ACTIONS,
  VALID_TYPES,
  VALID_STYLES,
  validateNonEmptyString,
  validateCitationType,
  validateStyle,
  formatCitation,
  formatCitationApa,
  formatCitationMla,
  formatCitationChicago,
  formatCitationBibtex,
};
