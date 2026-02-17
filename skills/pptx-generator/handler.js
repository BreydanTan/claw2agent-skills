/**
 * PPTX Generator Skill Handler
 *
 * L0 skill -- pure local computation, no external API calls.
 *
 * Generate PowerPoint presentation data structures (JSON-based slide
 * definitions). Provides actions to create presentations, add slides,
 * add text/image elements, retrieve, and list presentations.
 * All data is stored in an in-memory Map-based store.
 */

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// In-memory presentation store (module-level so it persists across calls)
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
 * Return the current number of presentations in the store.
 * @returns {number}
 */
export function _storeSize() {
  return store.size;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  "create_presentation",
  "add_slide",
  "add_text",
  "add_image",
  "get_presentation",
  "list_presentations",
];

const VALID_LAYOUTS = ["title", "content", "two_column", "image", "blank"];
const VALID_THEMES = ["default", "dark", "corporate", "minimal"];
const MAX_TEXT_LENGTH = 5000;

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a string is a valid URL.
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionCreatePresentation(params) {
  const { title, author, theme } = params;

  if (!title || typeof title !== "string" || title.trim() === "") {
    return {
      result: "Error: 'title' is required and must be a non-empty string.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const resolvedTheme = theme || "default";
  if (!VALID_THEMES.includes(resolvedTheme)) {
    return {
      result: `Error: Invalid theme '${resolvedTheme}'. Must be one of: ${VALID_THEMES.join(", ")}.`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const presentation = {
    id,
    title: title.trim(),
    author: author || null,
    theme: resolvedTheme,
    slides: [],
    createdAt: now,
    updatedAt: now,
  };

  store.set(id, presentation);

  return {
    result: `Presentation '${presentation.title}' created successfully with ID ${id}.`,
    metadata: {
      success: true,
      action: "create_presentation",
      presentationId: id,
      title: presentation.title,
      author: presentation.author,
      theme: presentation.theme,
      createdAt: now,
    },
  };
}

function actionAddSlide(params) {
  const { presentationId, layout, title, body, notes } = params;

  if (!presentationId || typeof presentationId !== "string") {
    return {
      result: "Error: 'presentationId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const presentation = store.get(presentationId);
  if (!presentation) {
    return {
      result: `Error: Presentation with ID '${presentationId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  const resolvedLayout = layout || "content";
  if (!VALID_LAYOUTS.includes(resolvedLayout)) {
    return {
      result: `Error: Invalid layout '${resolvedLayout}'. Must be one of: ${VALID_LAYOUTS.join(", ")}.`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const slideIndex = presentation.slides.length;
  const slide = {
    index: slideIndex,
    layout: resolvedLayout,
    title: title || null,
    body: body || null,
    notes: notes || null,
    elements: [],
  };

  presentation.slides.push(slide);
  presentation.updatedAt = new Date().toISOString();

  return {
    result: `Slide ${slideIndex} added to presentation '${presentation.title}' with layout '${resolvedLayout}'.`,
    metadata: {
      success: true,
      action: "add_slide",
      presentationId,
      slideIndex,
      layout: resolvedLayout,
      title: slide.title,
      totalSlides: presentation.slides.length,
    },
  };
}

function actionAddText(params) {
  const { presentationId, slideIndex, text, options } = params;

  if (!presentationId || typeof presentationId !== "string") {
    return {
      result: "Error: 'presentationId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const presentation = store.get(presentationId);
  if (!presentation) {
    return {
      result: `Error: Presentation with ID '${presentationId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  if (slideIndex === undefined || slideIndex === null || typeof slideIndex !== "number") {
    return {
      result: "Error: 'slideIndex' is required and must be a number.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (slideIndex < 0 || slideIndex >= presentation.slides.length) {
    return {
      result: `Error: 'slideIndex' ${slideIndex} is out of bounds. Presentation has ${presentation.slides.length} slide(s) (0-based).`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (!text || typeof text !== "string" || text.trim() === "") {
    return {
      result: "Error: 'text' is required and must be a non-empty string.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      result: `Error: 'text' exceeds maximum length of ${MAX_TEXT_LENGTH} characters (got ${text.length}).`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const opts = options || {};
  const element = {
    type: "text",
    text,
    bold: opts.bold || false,
    italic: opts.italic || false,
    fontSize: opts.fontSize || 18,
    color: opts.color || "#000000",
    x: opts.x || 0,
    y: opts.y || 0,
    width: opts.width || 600,
    height: opts.height || 40,
  };

  const slide = presentation.slides[slideIndex];
  slide.elements.push(element);
  presentation.updatedAt = new Date().toISOString();

  return {
    result: `Text element added to slide ${slideIndex} in presentation '${presentation.title}'.`,
    metadata: {
      success: true,
      action: "add_text",
      presentationId,
      slideIndex,
      elementIndex: slide.elements.length - 1,
      textLength: text.length,
      totalElements: slide.elements.length,
    },
  };
}

function actionAddImage(params) {
  const { presentationId, slideIndex, imageUrl, options } = params;

  if (!presentationId || typeof presentationId !== "string") {
    return {
      result: "Error: 'presentationId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const presentation = store.get(presentationId);
  if (!presentation) {
    return {
      result: `Error: Presentation with ID '${presentationId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  if (slideIndex === undefined || slideIndex === null || typeof slideIndex !== "number") {
    return {
      result: "Error: 'slideIndex' is required and must be a number.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (slideIndex < 0 || slideIndex >= presentation.slides.length) {
    return {
      result: `Error: 'slideIndex' ${slideIndex} is out of bounds. Presentation has ${presentation.slides.length} slide(s) (0-based).`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (!imageUrl || typeof imageUrl !== "string") {
    return {
      result: "Error: 'imageUrl' is required and must be a string.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  if (!isValidUrl(imageUrl)) {
    return {
      result: `Error: 'imageUrl' must be a valid HTTP or HTTPS URL. Got: '${imageUrl}'.`,
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const opts = options || {};
  const element = {
    type: "image",
    imageUrl,
    alt: opts.alt || "",
    x: opts.x || 0,
    y: opts.y || 0,
    width: opts.width || 400,
    height: opts.height || 300,
  };

  const slide = presentation.slides[slideIndex];
  slide.elements.push(element);
  presentation.updatedAt = new Date().toISOString();

  return {
    result: `Image element added to slide ${slideIndex} in presentation '${presentation.title}'.`,
    metadata: {
      success: true,
      action: "add_image",
      presentationId,
      slideIndex,
      elementIndex: slide.elements.length - 1,
      imageUrl,
      totalElements: slide.elements.length,
    },
  };
}

function actionGetPresentation(params) {
  const { presentationId } = params;

  if (!presentationId || typeof presentationId !== "string") {
    return {
      result: "Error: 'presentationId' is required.",
      metadata: { success: false, error: "INVALID_INPUT" },
    };
  }

  const presentation = store.get(presentationId);
  if (!presentation) {
    return {
      result: `Error: Presentation with ID '${presentationId}' not found.`,
      metadata: { success: false, error: "NOT_FOUND" },
    };
  }

  // Build text summary
  const lines = [
    `Presentation: ${presentation.title}`,
    "=".repeat(40),
    "",
    `ID:      ${presentation.id}`,
    `Author:  ${presentation.author || "(none)"}`,
    `Theme:   ${presentation.theme}`,
    `Slides:  ${presentation.slides.length}`,
    `Created: ${presentation.createdAt}`,
    `Updated: ${presentation.updatedAt}`,
    "",
  ];

  for (const slide of presentation.slides) {
    lines.push(`--- Slide ${slide.index} [${slide.layout}] ---`);
    if (slide.title) lines.push(`  Title: ${slide.title}`);
    if (slide.body) lines.push(`  Body: ${slide.body}`);
    if (slide.notes) lines.push(`  Notes: ${slide.notes}`);
    lines.push(`  Elements: ${slide.elements.length}`);

    for (let i = 0; i < slide.elements.length; i++) {
      const el = slide.elements[i];
      if (el.type === "text") {
        const preview = el.text.length > 50 ? el.text.substring(0, 50) + "..." : el.text;
        lines.push(`    [${i}] Text: "${preview}"`);
      } else if (el.type === "image") {
        lines.push(`    [${i}] Image: ${el.imageUrl}`);
      }
    }
    lines.push("");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "get_presentation",
      presentation,
    },
  };
}

function actionListPresentations() {
  const presentations = [...store.values()];

  if (presentations.length === 0) {
    return {
      result: "No presentations found.",
      metadata: {
        success: true,
        action: "list_presentations",
        count: 0,
        presentations: [],
      },
    };
  }

  const lines = [
    "Presentations",
    "=============",
    "",
    `Total: ${presentations.length}`,
    "",
  ];

  const summaries = presentations.map((p) => ({
    id: p.id,
    title: p.title,
    author: p.author,
    theme: p.theme,
    slideCount: p.slides.length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  for (const s of summaries) {
    lines.push(`  [${s.id}] ${s.title} (${s.slideCount} slides, theme: ${s.theme})`);
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "list_presentations",
      count: presentations.length,
      presentations: summaries,
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
  name: "pptx-generator",
  version: "1.0.0",
  description:
    "Generate PowerPoint presentation data structures (JSON-based slide definitions). Pure local computation, no external APIs.",
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

/**
 * Execute the PPTX generator skill.
 *
 * @param {Object} params
 * @param {string} params.action - create_presentation, add_slide, add_text, add_image, get_presentation, list_presentations
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
    case "create_presentation":
      return actionCreatePresentation(params);

    case "add_slide":
      return actionAddSlide(params);

    case "add_text":
      return actionAddText(params);

    case "add_image":
      return actionAddImage(params);

    case "get_presentation":
      return actionGetPresentation(params);

    case "list_presentations":
      return actionListPresentations();

    default:
      return {
        result: `Error: Unknown action '${String(action)}'.`,
        metadata: { success: false, error: "INVALID_ACTION" },
      };
  }
}
