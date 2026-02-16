/**
 * Prompt Optimizer Skill Handler
 *
 * A rule-based prompt quality analyzer that scores, analyzes, optimizes,
 * and compares prompts for AI models. No external API calls required.
 */

// ---------------------------------------------------------------------------
// Quality Check Definitions
// ---------------------------------------------------------------------------

const CHECKS = {
  clarity: {
    weight: 20,
    label: "Clarity",
    description: "Clear instruction or task with imperative verbs",
  },
  specificity: {
    weight: 15,
    label: "Specificity",
    description: "Sufficient detail, constraints, and format requirements",
  },
  structure: {
    weight: 15,
    label: "Structure",
    description: "Organized with sections, headings, steps, or bullet points",
  },
  context: {
    weight: 10,
    label: "Context",
    description: "Background or context provided for the task",
  },
  outputFormat: {
    weight: 15,
    label: "Output Format",
    description: "Desired output format is specified",
  },
  examples: {
    weight: 10,
    label: "Examples",
    description: "Includes examples to illustrate expectations",
  },
  constraints: {
    weight: 10,
    label: "Constraints",
    description: "Sets boundaries and limitations",
  },
  role: {
    weight: 5,
    label: "Role",
    description: "Assigns a persona or role to the AI",
  },
};

// ---------------------------------------------------------------------------
// Pattern Matchers
// ---------------------------------------------------------------------------

const IMPERATIVE_VERBS = [
  "write", "create", "generate", "list", "explain", "describe", "summarize",
  "analyze", "compare", "translate", "convert", "build", "design", "develop",
  "implement", "optimize", "review", "evaluate", "suggest", "recommend",
  "provide", "give", "tell", "show", "find", "extract", "identify",
  "calculate", "determine", "outline", "draft", "compose", "rewrite",
  "refactor", "debug", "fix", "improve", "help", "make", "define",
];

const CONTEXT_PATTERNS = [
  /\byou are\b/i,
  /\bgiven\b/i,
  /\bcontext\s*:/i,
  /\bbackground\s*:/i,
  /\bscenario\s*:/i,
  /\bsituation\s*:/i,
  /\bassume\b/i,
  /\bsuppose\b/i,
];

const OUTPUT_FORMAT_PATTERNS = [
  /\bformat\b/i,
  /\bjson\b/i,
  /\bmarkdown\b/i,
  /\blist\b/i,
  /\btable\b/i,
  /\bcsv\b/i,
  /\bxml\b/i,
  /\byaml\b/i,
  /\bbullet\s*point/i,
  /\bnumbered\s*list/i,
  /\bparagraph/i,
  /\bcode\s*block/i,
  /\boutput\s*should\b/i,
  /\breturn\s*(as|in|the)\b/i,
  /\brespond\s*(with|in|using)\b/i,
];

const EXAMPLE_PATTERNS = [
  /\bexample\b/i,
  /\be\.g\./i,
  /\bfor instance\b/i,
  /\bsuch as\b/i,
  /\bsample\b/i,
  /\blike this\b/i,
  /\bhere is an?\b/i,
  /\binput\s*:.*output\s*:/is,
];

const CONSTRAINT_PATTERNS = [
  /\bdo not\b/i,
  /\bdon't\b/i,
  /\bavoid\b/i,
  /\bmust\b/i,
  /\blimit\b/i,
  /\bonly\b/i,
  /\bshould not\b/i,
  /\bnever\b/i,
  /\bmaximum\b/i,
  /\bminimum\b/i,
  /\bat most\b/i,
  /\bat least\b/i,
  /\bno more than\b/i,
  /\bensure\b/i,
  /\brequire/i,
];

const ROLE_PATTERNS = [
  /\byou are a\b/i,
  /\bact as\b/i,
  /\bas a\b/i,
  /\byou're a\b/i,
  /\bplay the role\b/i,
  /\bpretend\b/i,
  /\bimagine you're\b/i,
  /\bimagine you are\b/i,
  /\brole\s*:/i,
  /\bpersona\s*:/i,
];

const STRUCTURE_PATTERNS = [
  /^\s*#{1,6}\s+/m,          // Markdown headings
  /^\s*\d+\.\s+/m,           // Numbered lists
  /^\s*[-*]\s+/m,            // Bullet points
  /^\s*step\s+\d+/im,        // Step N
  /\n\n/,                     // Paragraph breaks
  /^\s*\w+\s*:/m,            // Label: value pattern
  /```/,                      // Code blocks
];

// ---------------------------------------------------------------------------
// Check Evaluators
// ---------------------------------------------------------------------------

/**
 * Evaluate a single quality dimension and return a score (0-1) plus details.
 */
function evaluateClarity(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const matchedVerbs = IMPERATIVE_VERBS.filter((v) => words.includes(v));
  const hasQuestionMark = text.includes("?");
  const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;

  let score = 0;
  const issues = [];
  const suggestions = [];

  if (matchedVerbs.length > 0) {
    score += 0.6;
  } else if (hasQuestionMark) {
    score += 0.4;
  } else {
    issues.push("No clear instruction verb or question found");
    suggestions.push("Start with a clear imperative verb (e.g., Write, Create, Explain, Analyze)");
  }

  if (sentenceCount >= 2) {
    score += 0.2;
  }

  // Bonus for having a clear first sentence that is instructional
  const firstSentence = text.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length > 10 && firstSentence.length < 200) {
    score += 0.2;
  } else if (firstSentence.length <= 10) {
    issues.push("Opening instruction is very short");
    suggestions.push("Provide a more detailed opening instruction");
  }

  return { score: Math.min(score, 1), issues, suggestions, matchedVerbs };
}

function evaluateSpecificity(text) {
  const wordCount = text.split(/\s+/).length;
  let score = 0;
  const issues = [];
  const suggestions = [];

  // Length-based scoring
  if (wordCount >= 100) {
    score += 0.5;
  } else if (wordCount >= 50) {
    score += 0.35;
  } else if (wordCount >= 20) {
    score += 0.2;
  } else {
    issues.push(`Prompt is very short (${wordCount} words)`);
    suggestions.push("Add more specific details about what you want");
  }

  // Check for specific numbers, quantities, or measurements
  const hasNumbers = /\b\d+\b/.test(text);
  if (hasNumbers) {
    score += 0.2;
  } else {
    suggestions.push("Consider adding specific quantities or measurements where relevant");
  }

  // Check for quoted terms or technical specifics
  const hasQuotes = /["'].*?["']/.test(text);
  const hasTechnicalTerms = /\b(API|function|class|method|endpoint|database|algorithm|framework)\b/i.test(text);
  if (hasQuotes || hasTechnicalTerms) {
    score += 0.15;
  }

  // Check for descriptive adjectives / qualifiers
  const qualifiers = /\b(detailed|comprehensive|concise|brief|thorough|specific|accurate|professional)\b/i;
  if (qualifiers.test(text)) {
    score += 0.15;
  } else {
    suggestions.push("Add qualifiers like 'detailed', 'concise', or 'comprehensive' to set expectations");
  }

  return { score: Math.min(score, 1), issues, suggestions, wordCount };
}

function evaluateStructure(text) {
  let score = 0;
  const issues = [];
  const suggestions = [];
  const foundPatterns = [];

  for (const pattern of STRUCTURE_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.15;
      foundPatterns.push(pattern.source);
    }
  }

  // Bonus for multiple paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 3) {
    score += 0.1;
  }

  if (score === 0) {
    issues.push("No structural elements found (headings, lists, steps)");
    suggestions.push("Break your prompt into sections using headings, numbered steps, or bullet points");
  }

  return { score: Math.min(score, 1), issues, suggestions, paragraphs: paragraphs.length };
}

function evaluateContext(text) {
  let score = 0;
  const issues = [];
  const suggestions = [];
  const matched = [];

  for (const pattern of CONTEXT_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.25;
      matched.push(pattern.source);
    }
  }

  // Check for lengthy context (more words = more likely context is present)
  const wordCount = text.split(/\s+/).length;
  if (wordCount >= 50) {
    score += 0.2;
  }

  if (score === 0) {
    issues.push("No context or background information detected");
    suggestions.push("Add context about the situation, audience, or purpose (e.g., 'Given a dataset of...', 'You are helping a...')");
  }

  return { score: Math.min(score, 1), issues, suggestions, matched };
}

function evaluateOutputFormat(text) {
  let score = 0;
  const issues = [];
  const suggestions = [];
  const matched = [];

  for (const pattern of OUTPUT_FORMAT_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.2;
      matched.push(pattern.source);
    }
  }

  if (score === 0) {
    issues.push("No output format specification detected");
    suggestions.push("Specify the desired output format (e.g., 'Return the result as a JSON object', 'Format as a markdown table')");
  }

  return { score: Math.min(score, 1), issues, suggestions, matched };
}

function evaluateExamples(text) {
  let score = 0;
  const issues = [];
  const suggestions = [];
  const matched = [];

  for (const pattern of EXAMPLE_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.3;
      matched.push(pattern.source);
    }
  }

  if (score === 0) {
    issues.push("No examples provided");
    suggestions.push("Include an example of expected input/output to clarify your expectations");
  }

  return { score: Math.min(score, 1), issues, suggestions, matched };
}

function evaluateConstraints(text) {
  let score = 0;
  const issues = [];
  const suggestions = [];
  const matched = [];

  for (const pattern of CONSTRAINT_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.15;
      matched.push(pattern.source);
    }
  }

  if (score === 0) {
    issues.push("No constraints or boundaries set");
    suggestions.push("Add constraints like 'Do not include...', 'Limit to...', 'Must be under 500 words'");
  }

  return { score: Math.min(score, 1), issues, suggestions, matched };
}

function evaluateRole(text) {
  let score = 0;
  const issues = [];
  const suggestions = [];
  const matched = [];

  for (const pattern of ROLE_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.4;
      matched.push(pattern.source);
    }
  }

  if (score === 0) {
    issues.push("No role or persona assigned");
    suggestions.push("Consider assigning a role (e.g., 'You are a senior software engineer...', 'Act as a data analyst...')");
  }

  return { score: Math.min(score, 1), issues, suggestions, matched };
}

// ---------------------------------------------------------------------------
// Core Analysis Engine
// ---------------------------------------------------------------------------

/**
 * Run all quality checks against a prompt and return structured results.
 */
function runChecks(text) {
  const results = {
    clarity: evaluateClarity(text),
    specificity: evaluateSpecificity(text),
    structure: evaluateStructure(text),
    context: evaluateContext(text),
    outputFormat: evaluateOutputFormat(text),
    examples: evaluateExamples(text),
    constraints: evaluateConstraints(text),
    role: evaluateRole(text),
  };

  // Compute weighted total score (0-100)
  let totalScore = 0;
  for (const [key, check] of Object.entries(CHECKS)) {
    totalScore += results[key].score * check.weight;
  }
  totalScore = Math.round(totalScore);

  // Collect all issues and suggestions
  const allIssues = [];
  const allSuggestions = [];
  for (const [key, result] of Object.entries(results)) {
    for (const issue of result.issues) {
      allIssues.push({ dimension: CHECKS[key].label, issue });
    }
    for (const suggestion of result.suggestions) {
      allSuggestions.push({ dimension: CHECKS[key].label, suggestion });
    }
  }

  return { results, totalScore, allIssues, allSuggestions };
}

/**
 * Determine a quality tier label from a numeric score.
 */
function getScoreTier(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Needs Improvement";
  return "Poor";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionAnalyze(prompt, targetModel) {
  const { results, totalScore, allIssues, allSuggestions } = runChecks(prompt);
  const tier = getScoreTier(totalScore);

  const lines = [
    "Prompt Analysis",
    "===============",
    "",
    `Overall Score: ${totalScore}/100 (${tier})`,
    `Target Model: ${targetModel}`,
    `Word Count: ${prompt.split(/\s+/).length}`,
    "",
    "Dimension Scores",
    "-----------------",
  ];

  for (const [key, check] of Object.entries(CHECKS)) {
    const dimScore = Math.round(results[key].score * 100);
    const bar = buildBar(dimScore);
    lines.push(`  ${check.label.padEnd(15)} ${bar} ${dimScore}% (weight: ${check.weight})`);
  }

  if (allIssues.length > 0) {
    lines.push("", "Issues Found", "------------");
    for (const { dimension, issue } of allIssues) {
      lines.push(`  [${dimension}] ${issue}`);
    }
  }

  if (allSuggestions.length > 0) {
    lines.push("", "Suggestions", "-----------");
    for (const { dimension, suggestion } of allSuggestions) {
      lines.push(`  [${dimension}] ${suggestion}`);
    }
  }

  // Model-specific tips
  const modelTips = getModelTips(targetModel, results);
  if (modelTips.length > 0) {
    lines.push("", `Tips for ${targetModel}`, "-----------");
    for (const tip of modelTips) {
      lines.push(`  - ${tip}`);
    }
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "analyze",
      score: totalScore,
      tier,
      issueCount: allIssues.length,
      suggestionCount: allSuggestions.length,
      dimensions: Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, Math.round(v.score * 100)])
      ),
    },
  };
}

function actionOptimize(prompt, targetModel) {
  const { results, totalScore } = runChecks(prompt);
  const sections = [];

  // Build an optimized version of the prompt
  const hasRole = results.role.score > 0;
  const hasContext = results.context.score > 0;
  const hasFormat = results.outputFormat.score > 0;
  const hasConstraints = results.constraints.score > 0;
  const hasExamples = results.examples.score > 0;
  const hasStructure = results.structure.score > 0;

  // 1. Add role if missing
  if (!hasRole) {
    sections.push("## Role\nYou are an expert assistant specialized in this task.\n");
  }

  // 2. Add context section if missing
  if (!hasContext) {
    sections.push("## Context\n[Consider adding relevant background information here]\n");
  }

  // 3. Main task - restructure the original prompt
  if (hasStructure) {
    sections.push(`## Task\n${prompt.trim()}\n`);
  } else {
    // Break the prompt into sentences and present as steps
    const sentences = prompt
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length > 1) {
      const steps = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
      sections.push(`## Task\n${steps}\n`);
    } else {
      sections.push(`## Task\n${prompt.trim()}\n`);
    }
  }

  // 4. Add constraints section if missing
  if (!hasConstraints) {
    sections.push("## Constraints\n- Keep the response focused and relevant\n- Be accurate and precise\n");
  }

  // 5. Add output format if missing
  if (!hasFormat) {
    sections.push("## Output Format\nProvide your response in a clear, well-structured format.\n");
  }

  // 6. Add examples section if missing
  if (!hasExamples) {
    sections.push("## Example\n[Consider adding an example of expected input/output here]\n");
  }

  const optimizedPrompt = sections.join("\n");

  // Score the new version
  const { totalScore: newScore } = runChecks(optimizedPrompt);
  const improvement = newScore - totalScore;

  const lines = [
    "Optimized Prompt",
    "================",
    "",
    optimizedPrompt,
    "",
    "---",
    `Original Score: ${totalScore}/100`,
    `Optimized Score: ${newScore}/100`,
    `Improvement: +${Math.max(0, improvement)} points`,
    "",
    "Changes Made:",
  ];

  if (!hasRole) lines.push("  - Added role assignment section");
  if (!hasContext) lines.push("  - Added context placeholder section");
  if (!hasStructure) lines.push("  - Restructured prompt into numbered steps");
  if (!hasConstraints) lines.push("  - Added constraints section");
  if (!hasFormat) lines.push("  - Added output format specification");
  if (!hasExamples) lines.push("  - Added example placeholder section");

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "optimize",
      originalScore: totalScore,
      optimizedScore: newScore,
      improvement: Math.max(0, improvement),
    },
  };
}

function actionScore(prompt, targetModel) {
  const { results, totalScore, allIssues, allSuggestions } = runChecks(prompt);
  const tier = getScoreTier(totalScore);

  const lines = [
    "Prompt Quality Score",
    "====================",
    "",
    `Score: ${totalScore}/100`,
    `Tier: ${tier}`,
    `Target: ${targetModel}`,
    "",
    "Breakdown:",
  ];

  for (const [key, check] of Object.entries(CHECKS)) {
    const dimScore = Math.round(results[key].score * 100);
    lines.push(`  ${check.label.padEnd(15)} ${dimScore}%  (weight: ${check.weight})`);
  }

  // Top 3 suggestions
  if (allSuggestions.length > 0) {
    lines.push("", "Top Suggestions:");
    for (const { suggestion } of allSuggestions.slice(0, 3)) {
      lines.push(`  - ${suggestion}`);
    }
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "score",
      score: totalScore,
      tier,
      dimensions: Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, Math.round(v.score * 100)])
      ),
    },
  };
}

function actionCompare(promptA, promptB, targetModel) {
  const checksA = runChecks(promptA);
  const checksB = runChecks(promptB);
  const tierA = getScoreTier(checksA.totalScore);
  const tierB = getScoreTier(checksB.totalScore);

  const winner = checksA.totalScore >= checksB.totalScore ? "A" : "B";
  const diff = Math.abs(checksA.totalScore - checksB.totalScore);

  const lines = [
    "Prompt Comparison",
    "=================",
    "",
    `Prompt A Score: ${checksA.totalScore}/100 (${tierA})`,
    `Prompt B Score: ${checksB.totalScore}/100 (${tierB})`,
    "",
    `Winner: Prompt ${winner} (+${diff} points)`,
    "",
    "Dimension Comparison:",
    `  ${"Dimension".padEnd(15)} ${"A".padStart(5)}  ${"B".padStart(5)}  Better`,
    `  ${"-".repeat(42)}`,
  ];

  for (const [key, check] of Object.entries(CHECKS)) {
    const scoreA = Math.round(checksA.results[key].score * 100);
    const scoreB = Math.round(checksB.results[key].score * 100);
    const better = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "=";
    lines.push(
      `  ${check.label.padEnd(15)} ${String(scoreA + "%").padStart(5)}  ${String(scoreB + "%").padStart(5)}  ${better}`
    );
  }

  // Highlight unique strengths
  const strengthsA = [];
  const strengthsB = [];
  for (const [key, check] of Object.entries(CHECKS)) {
    const scoreA = checksA.results[key].score;
    const scoreB = checksB.results[key].score;
    if (scoreA > scoreB + 0.2) strengthsA.push(check.label);
    if (scoreB > scoreA + 0.2) strengthsB.push(check.label);
  }

  if (strengthsA.length > 0) {
    lines.push("", `Prompt A strengths: ${strengthsA.join(", ")}`);
  }
  if (strengthsB.length > 0) {
    lines.push(`Prompt B strengths: ${strengthsB.join(", ")}`);
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "compare",
      scoreA: checksA.totalScore,
      scoreB: checksB.totalScore,
      winner,
      difference: diff,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a simple ASCII progress bar.
 */
function buildBar(percent) {
  const filled = Math.round(percent / 10);
  return "[" + "#".repeat(filled) + ".".repeat(10 - filled) + "]";
}

/**
 * Return model-specific tips based on the analysis results.
 */
function getModelTips(targetModel, results) {
  const tips = [];
  const model = (targetModel || "general").toLowerCase();

  if (model === "claude") {
    if (results.role.score === 0) {
      tips.push("Claude responds well to role assignment with detailed persona descriptions");
    }
    if (results.structure.score < 0.5) {
      tips.push("Claude handles XML-style tags well for structuring prompts (e.g., <context>, <instructions>)");
    }
    tips.push("Use Claude's extended thinking by asking it to reason step-by-step");
  } else if (model === "gpt") {
    if (results.role.score === 0) {
      tips.push("GPT models benefit from system-level role instructions");
    }
    if (results.outputFormat.score === 0) {
      tips.push("GPT-4 excels with JSON mode; specify the output schema explicitly");
    }
    tips.push("Consider using structured output features for predictable formatting");
  } else {
    if (results.clarity.score < 0.5) {
      tips.push("Place the most important instruction at the beginning of the prompt");
    }
    if (results.examples.score === 0) {
      tips.push("Few-shot examples dramatically improve output quality across all models");
    }
  }

  return tips;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute the prompt optimizer skill.
 *
 * @param {Object} params
 * @param {string} params.action - analyze, optimize, score, or compare
 * @param {string} [params.prompt] - The prompt to analyze/optimize/score
 * @param {string} [params.promptA] - First prompt for comparison
 * @param {string} [params.promptB] - Second prompt for comparison
 * @param {string} [params.targetModel] - Target AI model (claude, gpt, general)
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action, prompt, promptA, promptB, targetModel = "general" } = params;

  if (!action) {
    return {
      result: "Error: The 'action' parameter is required. Supported actions: analyze, optimize, score, compare.",
      metadata: { success: false, error: "MISSING_ACTION" },
    };
  }

  switch (action) {
    case "analyze": {
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return {
          result: "Error: A non-empty 'prompt' parameter is required for the analyze action.",
          metadata: { success: false, error: "MISSING_PROMPT" },
        };
      }
      return actionAnalyze(prompt.trim(), targetModel);
    }

    case "optimize": {
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return {
          result: "Error: A non-empty 'prompt' parameter is required for the optimize action.",
          metadata: { success: false, error: "MISSING_PROMPT" },
        };
      }
      return actionOptimize(prompt.trim(), targetModel);
    }

    case "score": {
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return {
          result: "Error: A non-empty 'prompt' parameter is required for the score action.",
          metadata: { success: false, error: "MISSING_PROMPT" },
        };
      }
      return actionScore(prompt.trim(), targetModel);
    }

    case "compare": {
      if (!promptA || typeof promptA !== "string" || promptA.trim().length === 0) {
        return {
          result: "Error: A non-empty 'promptA' parameter is required for the compare action.",
          metadata: { success: false, error: "MISSING_PROMPT_A" },
        };
      }
      if (!promptB || typeof promptB !== "string" || promptB.trim().length === 0) {
        return {
          result: "Error: A non-empty 'promptB' parameter is required for the compare action.",
          metadata: { success: false, error: "MISSING_PROMPT_B" },
        };
      }
      return actionCompare(promptA.trim(), promptB.trim(), targetModel);
    }

    default:
      return {
        result: `Error: Unknown action '${action}'. Supported actions: analyze, optimize, score, compare.`,
        metadata: { success: false, error: "UNKNOWN_ACTION" },
      };
  }
}
