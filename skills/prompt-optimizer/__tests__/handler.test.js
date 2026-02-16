import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execute } from "../handler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GOOD_PROMPT = `You are a senior software engineer specializing in Python.

## Task
Write a Python function called "merge_sort" that takes a list of integers and returns a new list sorted in ascending order using the merge sort algorithm.

## Requirements
- Use type annotations for the function signature
- Include a docstring explaining the algorithm
- Handle edge cases (empty list, single element)
- Do not modify the original list

## Output Format
Return the code as a markdown code block. Include 3 example calls showing input and output.

## Example
Input: [38, 27, 43, 3, 9, 82, 10]
Output: [3, 9, 10, 27, 38, 43, 82]`;

const BAD_PROMPT = "sort list";

const MEDIUM_PROMPT =
  "Write a function that sorts a list of numbers. Make sure it handles empty lists.";

const PROMPT_WITH_ROLE = `You are a data scientist. Analyze the following dataset and provide insights.
Given a CSV of sales data, identify the top 3 products by revenue.
Return the result as a JSON object.
Do not include any products with less than 10 sales.
For example, the output should look like: {"products": [{"name": "Widget", "revenue": 5000}]}`;

// ---------------------------------------------------------------------------
// analyze action
// ---------------------------------------------------------------------------

describe("prompt-optimizer: analyze", () => {
  it("should analyze a good prompt with high scores", async () => {
    const result = await execute(
      { action: "analyze", prompt: GOOD_PROMPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "analyze");
    assert.ok(result.metadata.score > 70, `Expected score > 70 but got ${result.metadata.score}`);
    assert.ok(result.result.includes("Prompt Analysis"));
    assert.ok(result.result.includes("Dimension Scores"));
  });

  it("should analyze a bad prompt with low scores and many suggestions", async () => {
    const result = await execute(
      { action: "analyze", prompt: BAD_PROMPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.score < 30, `Expected score < 30 but got ${result.metadata.score}`);
    assert.ok(result.metadata.suggestionCount > 0, "Should have suggestions");
    assert.ok(result.result.includes("Suggestions"));
  });

  it("should return an error for empty prompt", async () => {
    const result = await execute({ action: "analyze", prompt: "" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_PROMPT");
  });

  it("should return an error when prompt is missing", async () => {
    const result = await execute({ action: "analyze" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_PROMPT");
  });

  it("should include model-specific tips for claude", async () => {
    const result = await execute(
      { action: "analyze", prompt: BAD_PROMPT, targetModel: "claude" },
      {}
    );
    assert.ok(result.result.includes("Tips for claude"));
  });

  it("should include model-specific tips for gpt", async () => {
    const result = await execute(
      { action: "analyze", prompt: BAD_PROMPT, targetModel: "gpt" },
      {}
    );
    assert.ok(result.result.includes("Tips for gpt"));
  });
});

// ---------------------------------------------------------------------------
// optimize action
// ---------------------------------------------------------------------------

describe("prompt-optimizer: optimize", () => {
  it("should optimize a simple prompt and improve score", async () => {
    const result = await execute(
      { action: "optimize", prompt: "Write a sorting function" },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "optimize");
    assert.ok(
      result.metadata.optimizedScore > result.metadata.originalScore,
      `Optimized score (${result.metadata.optimizedScore}) should be higher than original (${result.metadata.originalScore})`
    );
    assert.ok(result.result.includes("Optimized Prompt"));
    assert.ok(result.result.includes("Changes Made:"));
  });

  it("should add missing sections to a bare prompt", async () => {
    const result = await execute(
      { action: "optimize", prompt: "Sort numbers" },
      {}
    );

    assert.ok(result.metadata.success);
    // The optimized prompt should include role, format, constraints sections
    assert.ok(result.result.includes("## Role"), "Should add Role section");
    assert.ok(result.result.includes("## Output Format"), "Should add Output Format section");
    assert.ok(result.result.includes("## Constraints"), "Should add Constraints section");
  });

  it("should return an error for empty prompt", async () => {
    const result = await execute({ action: "optimize", prompt: "" }, {});
    assert.equal(result.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// score action
// ---------------------------------------------------------------------------

describe("prompt-optimizer: score", () => {
  it("should score a high-quality prompt above 70", async () => {
    const result = await execute(
      { action: "score", prompt: GOOD_PROMPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "score");
    assert.ok(result.metadata.score > 70, `Expected score > 70 but got ${result.metadata.score}`);
    assert.ok(result.result.includes("Prompt Quality Score"));
    assert.ok(result.result.includes("Breakdown:"));
  });

  it("should score a minimal prompt below 30", async () => {
    const result = await execute(
      { action: "score", prompt: BAD_PROMPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.score < 30, `Expected score < 30 but got ${result.metadata.score}`);
    assert.equal(result.metadata.tier, "Poor");
  });

  it("should score a medium prompt between the extremes", async () => {
    const result = await execute(
      { action: "score", prompt: MEDIUM_PROMPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.ok(result.metadata.score > 10, "Medium prompt should score above 10");
    assert.ok(result.metadata.score < 80, "Medium prompt should score below 80");
  });

  it("should include dimension breakdown in metadata", async () => {
    const result = await execute(
      { action: "score", prompt: GOOD_PROMPT },
      {}
    );

    assert.ok(result.metadata.dimensions);
    assert.ok("clarity" in result.metadata.dimensions);
    assert.ok("specificity" in result.metadata.dimensions);
    assert.ok("structure" in result.metadata.dimensions);
    assert.ok("context" in result.metadata.dimensions);
    assert.ok("outputFormat" in result.metadata.dimensions);
    assert.ok("examples" in result.metadata.dimensions);
    assert.ok("constraints" in result.metadata.dimensions);
    assert.ok("role" in result.metadata.dimensions);
  });

  it("should assign correct tier labels", async () => {
    const excellent = await execute(
      { action: "score", prompt: GOOD_PROMPT },
      {}
    );
    assert.ok(
      ["Excellent", "Good"].includes(excellent.metadata.tier),
      `Expected Excellent or Good but got ${excellent.metadata.tier}`
    );

    const poor = await execute(
      { action: "score", prompt: BAD_PROMPT },
      {}
    );
    assert.ok(
      ["Poor", "Needs Improvement"].includes(poor.metadata.tier),
      `Expected Poor or Needs Improvement but got ${poor.metadata.tier}`
    );
  });

  it("should return an error for missing prompt", async () => {
    const result = await execute({ action: "score" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_PROMPT");
  });
});

// ---------------------------------------------------------------------------
// compare action
// ---------------------------------------------------------------------------

describe("prompt-optimizer: compare", () => {
  it("should compare two prompts and pick the better one", async () => {
    const result = await execute(
      { action: "compare", promptA: BAD_PROMPT, promptB: GOOD_PROMPT },
      {}
    );

    assert.ok(result.metadata.success);
    assert.equal(result.metadata.action, "compare");
    assert.equal(result.metadata.winner, "B");
    assert.ok(result.metadata.scoreB > result.metadata.scoreA);
    assert.ok(result.result.includes("Prompt Comparison"));
    assert.ok(result.result.includes("Winner: Prompt B"));
  });

  it("should return an error when promptA is missing", async () => {
    const result = await execute(
      { action: "compare", promptB: GOOD_PROMPT },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_PROMPT_A");
  });

  it("should return an error when promptB is missing", async () => {
    const result = await execute(
      { action: "compare", promptA: GOOD_PROMPT },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_PROMPT_B");
  });

  it("should show dimension-level comparison", async () => {
    const result = await execute(
      { action: "compare", promptA: BAD_PROMPT, promptB: GOOD_PROMPT },
      {}
    );
    assert.ok(result.result.includes("Dimension Comparison"));
    assert.ok(result.result.includes("Clarity"));
    assert.ok(result.result.includes("Specificity"));
  });

  it("should correctly compare a prompt with role against one without", async () => {
    const result = await execute(
      {
        action: "compare",
        promptA: MEDIUM_PROMPT,
        promptB: PROMPT_WITH_ROLE,
      },
      {}
    );
    assert.ok(result.metadata.success);
    // PROMPT_WITH_ROLE should win since it has role, context, format, constraints, and examples
    assert.equal(result.metadata.winner, "B");
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("prompt-optimizer: error handling", () => {
  it("should return an error for an invalid action", async () => {
    const result = await execute(
      { action: "invalid_action", prompt: "test" },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "UNKNOWN_ACTION");
    assert.ok(result.result.includes("Unknown action"));
  });

  it("should return an error when action is missing", async () => {
    const result = await execute({ prompt: "test" }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_ACTION");
  });

  it("should handle non-string prompt gracefully", async () => {
    const result = await execute({ action: "analyze", prompt: 12345 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_PROMPT");
  });

  it("should handle whitespace-only prompt as empty", async () => {
    const result = await execute({ action: "score", prompt: "   " }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, "MISSING_PROMPT");
  });
});
