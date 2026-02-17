import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { execute, validate, meta, _clearStore, _storeSize } from "../handler.js";

// ---------------------------------------------------------------------------
// Helper: create a presentation and return the result
// ---------------------------------------------------------------------------

async function createPresentation(overrides = {}) {
  const params = {
    action: "create_presentation",
    title: "Test Presentation",
    ...overrides,
  };
  return execute(params, {});
}

async function addSlide(presentationId, overrides = {}) {
  const params = {
    action: "add_slide",
    presentationId,
    ...overrides,
  };
  return execute(params, {});
}

async function addText(presentationId, slideIndex, text, options) {
  const params = {
    action: "add_text",
    presentationId,
    slideIndex,
    text,
  };
  if (options) params.options = options;
  return execute(params, {});
}

async function addImage(presentationId, slideIndex, imageUrl, options) {
  const params = {
    action: "add_image",
    presentationId,
    slideIndex,
    imageUrl,
  };
  if (options) params.options = options;
  return execute(params, {});
}

// ===========================================================================
// meta export
// ===========================================================================

describe("pptx-generator: meta", () => {
  it("should export meta with correct name", () => {
    assert.equal(meta.name, "pptx-generator");
  });

  it("should export meta with version", () => {
    assert.equal(meta.version, "1.0.0");
  });

  it("should export meta with description", () => {
    assert.ok(meta.description.length > 0);
  });

  it("should export meta with all 6 actions", () => {
    assert.equal(meta.actions.length, 6);
    assert.ok(meta.actions.includes("create_presentation"));
    assert.ok(meta.actions.includes("add_slide"));
    assert.ok(meta.actions.includes("add_text"));
    assert.ok(meta.actions.includes("add_image"));
    assert.ok(meta.actions.includes("get_presentation"));
    assert.ok(meta.actions.includes("list_presentations"));
  });
});

// ===========================================================================
// validate export
// ===========================================================================

describe("pptx-generator: validate", () => {
  it("should return valid for create_presentation action", () => {
    const res = validate({ action: "create_presentation" });
    assert.equal(res.valid, true);
  });

  it("should return valid for add_slide action", () => {
    const res = validate({ action: "add_slide" });
    assert.equal(res.valid, true);
  });

  it("should return valid for add_text action", () => {
    const res = validate({ action: "add_text" });
    assert.equal(res.valid, true);
  });

  it("should return valid for add_image action", () => {
    const res = validate({ action: "add_image" });
    assert.equal(res.valid, true);
  });

  it("should return valid for get_presentation action", () => {
    const res = validate({ action: "get_presentation" });
    assert.equal(res.valid, true);
  });

  it("should return valid for list_presentations action", () => {
    const res = validate({ action: "list_presentations" });
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

describe("pptx-generator: store helpers", () => {
  beforeEach(() => { _clearStore(); });

  it("should start with empty store", () => {
    assert.equal(_storeSize(), 0);
  });

  it("should reflect store size after creating presentations", async () => {
    await createPresentation();
    assert.equal(_storeSize(), 1);
    await createPresentation({ title: "Second" });
    assert.equal(_storeSize(), 2);
  });

  it("should clear all presentations", async () => {
    await createPresentation();
    await createPresentation({ title: "Second" });
    assert.equal(_storeSize(), 2);
    _clearStore();
    assert.equal(_storeSize(), 0);
  });
});

// ===========================================================================
// Action: invalid / missing actions
// ===========================================================================

describe("pptx-generator: action validation", () => {
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
    assert.ok(res.result.includes("create_presentation"));
    assert.ok(res.result.includes("add_slide"));
    assert.ok(res.result.includes("list_presentations"));
  });
});

// ===========================================================================
// Action: create_presentation
// ===========================================================================

describe("pptx-generator: create_presentation", () => {
  beforeEach(() => { _clearStore(); });

  it("should create a presentation with title only", async () => {
    const res = await createPresentation({ title: "My Deck" });
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "create_presentation");
    assert.equal(res.metadata.title, "My Deck");
    assert.ok(res.metadata.presentationId);
  });

  it("should create a presentation with author", async () => {
    const res = await createPresentation({ title: "My Deck", author: "Alice" });
    assert.equal(res.metadata.author, "Alice");
  });

  it("should default theme to 'default'", async () => {
    const res = await createPresentation({ title: "My Deck" });
    assert.equal(res.metadata.theme, "default");
  });

  it("should accept 'dark' theme", async () => {
    const res = await createPresentation({ title: "My Deck", theme: "dark" });
    assert.equal(res.metadata.theme, "dark");
  });

  it("should accept 'corporate' theme", async () => {
    const res = await createPresentation({ title: "My Deck", theme: "corporate" });
    assert.equal(res.metadata.theme, "corporate");
  });

  it("should accept 'minimal' theme", async () => {
    const res = await createPresentation({ title: "My Deck", theme: "minimal" });
    assert.equal(res.metadata.theme, "minimal");
  });

  it("should reject invalid theme", async () => {
    const res = await createPresentation({ title: "My Deck", theme: "neon" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("neon"));
  });

  it("should return error for missing title", async () => {
    const res = await execute({ action: "create_presentation" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for empty string title", async () => {
    const res = await createPresentation({ title: "" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for whitespace-only title", async () => {
    const res = await createPresentation({ title: "   " });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-string title", async () => {
    const res = await createPresentation({ title: 123 });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should trim the title", async () => {
    const res = await createPresentation({ title: "  Trimmed  " });
    assert.equal(res.metadata.title, "Trimmed");
  });

  it("should generate unique IDs for different presentations", async () => {
    const res1 = await createPresentation({ title: "First" });
    const res2 = await createPresentation({ title: "Second" });
    assert.notEqual(res1.metadata.presentationId, res2.metadata.presentationId);
  });

  it("should set author to null when not provided", async () => {
    const res = await createPresentation({ title: "No Author" });
    assert.equal(res.metadata.author, null);
  });

  it("should include createdAt in metadata", async () => {
    const res = await createPresentation({ title: "Timestamped" });
    assert.ok(res.metadata.createdAt);
    assert.ok(typeof res.metadata.createdAt === "string");
  });

  it("should include presentationId in result text", async () => {
    const res = await createPresentation({ title: "My Deck" });
    assert.ok(res.result.includes(res.metadata.presentationId));
  });

  it("should include title in result text", async () => {
    const res = await createPresentation({ title: "My Deck" });
    assert.ok(res.result.includes("My Deck"));
  });
});

// ===========================================================================
// Action: add_slide
// ===========================================================================

describe("pptx-generator: add_slide", () => {
  beforeEach(() => { _clearStore(); });

  it("should add a slide to a presentation", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "add_slide");
    assert.equal(res.metadata.slideIndex, 0);
  });

  it("should default layout to 'content'", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId);
    assert.equal(res.metadata.layout, "content");
  });

  it("should accept 'title' layout", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId, { layout: "title" });
    assert.equal(res.metadata.layout, "title");
  });

  it("should accept 'two_column' layout", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId, { layout: "two_column" });
    assert.equal(res.metadata.layout, "two_column");
  });

  it("should accept 'image' layout", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId, { layout: "image" });
    assert.equal(res.metadata.layout, "image");
  });

  it("should accept 'blank' layout", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId, { layout: "blank" });
    assert.equal(res.metadata.layout, "blank");
  });

  it("should reject invalid layout", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId, { layout: "fullscreen" });
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("fullscreen"));
  });

  it("should increment slide index", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    const s0 = await addSlide(id);
    const s1 = await addSlide(id);
    const s2 = await addSlide(id);
    assert.equal(s0.metadata.slideIndex, 0);
    assert.equal(s1.metadata.slideIndex, 1);
    assert.equal(s2.metadata.slideIndex, 2);
  });

  it("should track totalSlides in metadata", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addSlide(id);
    assert.equal(res.metadata.totalSlides, 2);
  });

  it("should store slide title", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId, { title: "Slide Title" });
    assert.equal(res.metadata.title, "Slide Title");
  });

  it("should set title to null when not provided", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId);
    assert.equal(res.metadata.title, null);
  });

  it("should return error for missing presentationId", async () => {
    const res = await execute({ action: "add_slide" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent presentation", async () => {
    const res = await addSlide("non-existent-id");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should include layout in result text", async () => {
    const pres = await createPresentation();
    const res = await addSlide(pres.metadata.presentationId, { layout: "title" });
    assert.ok(res.result.includes("title"));
  });
});

// ===========================================================================
// Action: add_text
// ===========================================================================

describe("pptx-generator: add_text", () => {
  beforeEach(() => { _clearStore(); });

  it("should add text to a slide", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addText(id, 0, "Hello World");
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "add_text");
    assert.equal(res.metadata.slideIndex, 0);
    assert.equal(res.metadata.elementIndex, 0);
  });

  it("should track text length in metadata", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addText(id, 0, "Hello");
    assert.equal(res.metadata.textLength, 5);
  });

  it("should track total elements in metadata", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "First");
    const res = await addText(id, 0, "Second");
    assert.equal(res.metadata.totalElements, 2);
  });

  it("should increment element index", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const e0 = await addText(id, 0, "First");
    const e1 = await addText(id, 0, "Second");
    assert.equal(e0.metadata.elementIndex, 0);
    assert.equal(e1.metadata.elementIndex, 1);
  });

  it("should apply bold option", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Bold text", { bold: true });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.bold, true);
  });

  it("should apply italic option", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Italic text", { italic: true });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.italic, true);
  });

  it("should apply fontSize option", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Big text", { fontSize: 36 });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.fontSize, 36);
  });

  it("should apply color option", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Red text", { color: "#FF0000" });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.color, "#FF0000");
  });

  it("should apply position options (x, y)", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Positioned", { x: 100, y: 200 });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.x, 100);
    assert.equal(el.y, 200);
  });

  it("should apply size options (width, height)", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Sized", { width: 300, height: 50 });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.width, 300);
    assert.equal(el.height, 50);
  });

  it("should use default options when none provided", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Default options");
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.bold, false);
    assert.equal(el.italic, false);
    assert.equal(el.fontSize, 18);
    assert.equal(el.color, "#000000");
    assert.equal(el.x, 0);
    assert.equal(el.y, 0);
    assert.equal(el.width, 600);
    assert.equal(el.height, 40);
  });

  it("should return error for missing presentationId", async () => {
    const res = await execute({ action: "add_text", slideIndex: 0, text: "Hello" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent presentation", async () => {
    const res = await addText("bad-id", 0, "Hello");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for missing slideIndex", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await execute({ action: "add_text", presentationId: id, text: "Hello" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-numeric slideIndex", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await execute({ action: "add_text", presentationId: id, slideIndex: "zero", text: "Hello" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for negative slideIndex", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addText(id, -1, "Hello");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("out of bounds"));
  });

  it("should return error for slideIndex beyond bounds", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addText(id, 5, "Hello");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("out of bounds"));
  });

  it("should return error for missing text", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await execute({ action: "add_text", presentationId: id, slideIndex: 0 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for empty text", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addText(id, 0, "");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for whitespace-only text", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addText(id, 0, "   ");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for text exceeding max length", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const longText = "a".repeat(5001);
    const res = await addText(id, 0, longText);
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("5000"));
  });

  it("should accept text at exactly max length", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const exactText = "a".repeat(5000);
    const res = await addText(id, 0, exactText);
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.textLength, 5000);
  });

  it("should return error for non-string text", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await execute({ action: "add_text", presentationId: id, slideIndex: 0, text: 123 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });
});

// ===========================================================================
// Action: add_image
// ===========================================================================

describe("pptx-generator: add_image", () => {
  beforeEach(() => { _clearStore(); });

  it("should add image to a slide", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addImage(id, 0, "https://example.com/image.png");
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "add_image");
    assert.equal(res.metadata.slideIndex, 0);
    assert.equal(res.metadata.elementIndex, 0);
  });

  it("should store imageUrl in metadata", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addImage(id, 0, "https://example.com/photo.jpg");
    assert.equal(res.metadata.imageUrl, "https://example.com/photo.jpg");
  });

  it("should track total elements after adding image", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Some text");
    const res = await addImage(id, 0, "https://example.com/img.png");
    assert.equal(res.metadata.totalElements, 2);
    assert.equal(res.metadata.elementIndex, 1);
  });

  it("should apply alt option", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addImage(id, 0, "https://example.com/img.png", { alt: "Chart image" });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.alt, "Chart image");
  });

  it("should apply position options (x, y)", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addImage(id, 0, "https://example.com/img.png", { x: 50, y: 75 });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.x, 50);
    assert.equal(el.y, 75);
  });

  it("should apply size options (width, height)", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addImage(id, 0, "https://example.com/img.png", { width: 800, height: 600 });
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.width, 800);
    assert.equal(el.height, 600);
  });

  it("should use default options when none provided", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addImage(id, 0, "https://example.com/img.png");
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const el = get.metadata.presentation.slides[0].elements[0];
    assert.equal(el.alt, "");
    assert.equal(el.x, 0);
    assert.equal(el.y, 0);
    assert.equal(el.width, 400);
    assert.equal(el.height, 300);
  });

  it("should return error for missing presentationId", async () => {
    const res = await execute({ action: "add_image", slideIndex: 0, imageUrl: "https://example.com/img.png" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent presentation", async () => {
    const res = await addImage("bad-id", 0, "https://example.com/img.png");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should return error for missing slideIndex", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await execute({ action: "add_image", presentationId: id, imageUrl: "https://example.com/img.png" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for out-of-bounds slideIndex", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addImage(id, 3, "https://example.com/img.png");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("out of bounds"));
  });

  it("should return error for negative slideIndex", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addImage(id, -1, "https://example.com/img.png");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for missing imageUrl", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await execute({ action: "add_image", presentationId: id, slideIndex: 0 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for invalid imageUrl (not a URL)", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addImage(id, 0, "not-a-url");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
    assert.ok(res.result.includes("valid HTTP or HTTPS URL"));
  });

  it("should return error for ftp URL", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addImage(id, 0, "ftp://example.com/img.png");
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should accept http URL", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addImage(id, 0, "http://example.com/img.png");
    assert.equal(res.metadata.success, true);
  });

  it("should accept https URL", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const res = await addImage(id, 0, "https://example.com/img.png");
    assert.equal(res.metadata.success, true);
  });
});

// ===========================================================================
// Action: get_presentation
// ===========================================================================

describe("pptx-generator: get_presentation", () => {
  beforeEach(() => { _clearStore(); });

  it("should retrieve a presentation by ID", async () => {
    const pres = await createPresentation({ title: "Get Me" });
    const id = pres.metadata.presentationId;
    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "get_presentation");
    assert.equal(res.metadata.presentation.title, "Get Me");
  });

  it("should return full presentation structure", async () => {
    const pres = await createPresentation({ title: "Full", author: "Bob", theme: "dark" });
    const id = pres.metadata.presentationId;
    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    const p = res.metadata.presentation;
    assert.equal(p.title, "Full");
    assert.equal(p.author, "Bob");
    assert.equal(p.theme, "dark");
    assert.ok(Array.isArray(p.slides));
  });

  it("should include slides and elements", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id, { layout: "title", title: "Welcome" });
    await addText(id, 0, "Hello World");
    await addImage(id, 0, "https://example.com/img.png");

    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    const p = res.metadata.presentation;
    assert.equal(p.slides.length, 1);
    assert.equal(p.slides[0].elements.length, 2);
    assert.equal(p.slides[0].elements[0].type, "text");
    assert.equal(p.slides[0].elements[1].type, "image");
  });

  it("should include formatted result text", async () => {
    const pres = await createPresentation({ title: "Text Check" });
    const id = pres.metadata.presentationId;
    await addSlide(id, { title: "Slide One" });

    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.ok(res.result.includes("Presentation: Text Check"));
    assert.ok(res.result.includes("Slide 0"));
    assert.ok(res.result.includes("Slide One"));
  });

  it("should show text preview in result", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addText(id, 0, "Short preview text");

    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.ok(res.result.includes("Short preview text"));
  });

  it("should truncate long text preview at 50 chars", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    const longText = "a".repeat(100);
    await addText(id, 0, longText);

    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.ok(res.result.includes("..."));
  });

  it("should show image URL in result", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addImage(id, 0, "https://example.com/chart.png");

    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.ok(res.result.includes("https://example.com/chart.png"));
  });

  it("should return error for missing presentationId", async () => {
    const res = await execute({ action: "get_presentation" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "INVALID_INPUT");
  });

  it("should return error for non-existent presentation", async () => {
    const res = await execute({ action: "get_presentation", presentationId: "bad-id" }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, "NOT_FOUND");
  });

  it("should show slide body and notes", async () => {
    const pres = await createPresentation();
    const id = pres.metadata.presentationId;
    await addSlide(id, { body: "Body text here", notes: "Speaker notes" });

    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.ok(res.result.includes("Body text here"));
    assert.ok(res.result.includes("Speaker notes"));
  });

  it("should show '(none)' for missing author", async () => {
    const pres = await createPresentation({ title: "No Author" });
    const id = pres.metadata.presentationId;
    const res = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.ok(res.result.includes("(none)"));
  });
});

// ===========================================================================
// Action: list_presentations
// ===========================================================================

describe("pptx-generator: list_presentations", () => {
  beforeEach(() => { _clearStore(); });

  it("should return empty list when no presentations exist", async () => {
    const res = await execute({ action: "list_presentations" }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, "list_presentations");
    assert.equal(res.metadata.count, 0);
    assert.deepEqual(res.metadata.presentations, []);
    assert.ok(res.result.includes("No presentations found"));
  });

  it("should list a single presentation", async () => {
    await createPresentation({ title: "Only One" });
    const res = await execute({ action: "list_presentations" }, {});
    assert.equal(res.metadata.count, 1);
    assert.equal(res.metadata.presentations[0].title, "Only One");
  });

  it("should list multiple presentations", async () => {
    await createPresentation({ title: "First" });
    await createPresentation({ title: "Second" });
    await createPresentation({ title: "Third" });
    const res = await execute({ action: "list_presentations" }, {});
    assert.equal(res.metadata.count, 3);
  });

  it("should include slideCount in summaries", async () => {
    const pres = await createPresentation({ title: "With Slides" });
    const id = pres.metadata.presentationId;
    await addSlide(id);
    await addSlide(id);
    const res = await execute({ action: "list_presentations" }, {});
    const summary = res.metadata.presentations.find((p) => p.title === "With Slides");
    assert.equal(summary.slideCount, 2);
  });

  it("should include theme in summaries", async () => {
    await createPresentation({ title: "Dark Pres", theme: "dark" });
    const res = await execute({ action: "list_presentations" }, {});
    const summary = res.metadata.presentations.find((p) => p.title === "Dark Pres");
    assert.equal(summary.theme, "dark");
  });

  it("should include author in summaries", async () => {
    await createPresentation({ title: "Authored", author: "Jane" });
    const res = await execute({ action: "list_presentations" }, {});
    const summary = res.metadata.presentations.find((p) => p.title === "Authored");
    assert.equal(summary.author, "Jane");
  });

  it("should include formatted result text with title", async () => {
    await createPresentation({ title: "Listed Pres" });
    const res = await execute({ action: "list_presentations" }, {});
    assert.ok(res.result.includes("Presentations"));
    assert.ok(res.result.includes("Listed Pres"));
  });

  it("should include total count in result text", async () => {
    await createPresentation({ title: "A" });
    await createPresentation({ title: "B" });
    const res = await execute({ action: "list_presentations" }, {});
    assert.ok(res.result.includes("Total: 2"));
  });
});

// ===========================================================================
// Full workflow integration
// ===========================================================================

describe("pptx-generator: full workflow", () => {
  beforeEach(() => { _clearStore(); });

  it("should execute full create -> add_slide -> add_text -> add_image -> get workflow", async () => {
    // 1. Create presentation
    const create = await createPresentation({ title: "Sales Report", author: "Alice", theme: "corporate" });
    assert.equal(create.metadata.success, true);
    const id = create.metadata.presentationId;

    // 2. Add title slide
    const slide0 = await addSlide(id, { layout: "title", title: "Q4 Sales Report", body: "Annual review" });
    assert.equal(slide0.metadata.success, true);
    assert.equal(slide0.metadata.slideIndex, 0);

    // 3. Add content slide
    const slide1 = await addSlide(id, { layout: "content", title: "Revenue Overview" });
    assert.equal(slide1.metadata.success, true);
    assert.equal(slide1.metadata.slideIndex, 1);

    // 4. Add text to content slide
    const text0 = await addText(id, 1, "Revenue grew 15% YoY", { bold: true, fontSize: 24 });
    assert.equal(text0.metadata.success, true);

    // 5. Add image to content slide
    const img0 = await addImage(id, 1, "https://charts.example.com/revenue.png", { alt: "Revenue chart", width: 600, height: 400 });
    assert.equal(img0.metadata.success, true);

    // 6. Retrieve and verify
    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.equal(get.metadata.success, true);
    const p = get.metadata.presentation;
    assert.equal(p.title, "Sales Report");
    assert.equal(p.author, "Alice");
    assert.equal(p.theme, "corporate");
    assert.equal(p.slides.length, 2);
    assert.equal(p.slides[0].layout, "title");
    assert.equal(p.slides[0].title, "Q4 Sales Report");
    assert.equal(p.slides[1].layout, "content");
    assert.equal(p.slides[1].elements.length, 2);
    assert.equal(p.slides[1].elements[0].type, "text");
    assert.equal(p.slides[1].elements[0].text, "Revenue grew 15% YoY");
    assert.equal(p.slides[1].elements[0].bold, true);
    assert.equal(p.slides[1].elements[0].fontSize, 24);
    assert.equal(p.slides[1].elements[1].type, "image");
    assert.equal(p.slides[1].elements[1].imageUrl, "https://charts.example.com/revenue.png");
    assert.equal(p.slides[1].elements[1].alt, "Revenue chart");
  });

  it("should handle multiple presentations independently", async () => {
    const p1 = await createPresentation({ title: "Presentation 1" });
    const p2 = await createPresentation({ title: "Presentation 2" });

    await addSlide(p1.metadata.presentationId, { title: "P1 Slide" });
    await addSlide(p2.metadata.presentationId, { title: "P2 Slide" });
    await addSlide(p2.metadata.presentationId, { title: "P2 Slide 2" });

    const get1 = await execute({ action: "get_presentation", presentationId: p1.metadata.presentationId }, {});
    const get2 = await execute({ action: "get_presentation", presentationId: p2.metadata.presentationId }, {});

    assert.equal(get1.metadata.presentation.slides.length, 1);
    assert.equal(get2.metadata.presentation.slides.length, 2);
  });

  it("should allow multiple elements on different slides", async () => {
    const pres = await createPresentation({ title: "Multi-slide" });
    const id = pres.metadata.presentationId;

    await addSlide(id, { layout: "content" });
    await addSlide(id, { layout: "image" });

    await addText(id, 0, "Text on slide 0");
    await addImage(id, 1, "https://example.com/img.png");

    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.equal(get.metadata.presentation.slides[0].elements.length, 1);
    assert.equal(get.metadata.presentation.slides[0].elements[0].type, "text");
    assert.equal(get.metadata.presentation.slides[1].elements.length, 1);
    assert.equal(get.metadata.presentation.slides[1].elements[0].type, "image");
  });

  it("should reflect updates in updatedAt timestamp", async () => {
    const pres = await createPresentation({ title: "Timestamp Test" });
    const id = pres.metadata.presentationId;

    const get1 = await execute({ action: "get_presentation", presentationId: id }, {});
    const createdAt = get1.metadata.presentation.createdAt;

    await addSlide(id);
    const get2 = await execute({ action: "get_presentation", presentationId: id }, {});
    const updatedAt = get2.metadata.presentation.updatedAt;

    // updatedAt should be >= createdAt
    assert.ok(new Date(updatedAt).getTime() >= new Date(createdAt).getTime());
  });

  it("should store slide body and notes correctly", async () => {
    const pres = await createPresentation({ title: "Notes Test" });
    const id = pres.metadata.presentationId;

    await addSlide(id, { title: "Titled", body: "Body content", notes: "Speaker notes here" });

    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    const slide = get.metadata.presentation.slides[0];
    assert.equal(slide.title, "Titled");
    assert.equal(slide.body, "Body content");
    assert.equal(slide.notes, "Speaker notes here");
  });

  it("should handle adding many slides", async () => {
    const pres = await createPresentation({ title: "Many Slides" });
    const id = pres.metadata.presentationId;

    for (let i = 0; i < 20; i++) {
      await addSlide(id, { title: `Slide ${i}` });
    }

    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.equal(get.metadata.presentation.slides.length, 20);
    assert.equal(get.metadata.presentation.slides[19].index, 19);
  });

  it("should handle adding many elements to one slide", async () => {
    const pres = await createPresentation({ title: "Many Elements" });
    const id = pres.metadata.presentationId;
    await addSlide(id);

    for (let i = 0; i < 10; i++) {
      await addText(id, 0, `Element ${i}`);
    }

    const get = await execute({ action: "get_presentation", presentationId: id }, {});
    assert.equal(get.metadata.presentation.slides[0].elements.length, 10);
  });
});
