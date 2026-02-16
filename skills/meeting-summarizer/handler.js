/**
 * Meeting Summarizer Skill Handler
 *
 * A rule-based meeting transcript analyzer that extracts summaries, action items,
 * decisions, participation stats, and generates formatted meeting minutes.
 * No external API calls required.
 */

// ---------------------------------------------------------------------------
// Security: Input Sanitization
// ---------------------------------------------------------------------------

/**
 * Strip HTML/script tags to prevent XSS in output.
 */
function sanitize(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
}

// ---------------------------------------------------------------------------
// Pattern Definitions
// ---------------------------------------------------------------------------

const ACTION_PATTERNS = [
  /\bwill\s+(?:do|take|handle|complete|finish|prepare|send|create|write|update|review|check|follow\s+up|schedule|set\s+up|look\s+into|investigate)\b/i,
  /\baction\s+item\s*:/i,
  /\baction\s+item\b/i,
  /\btodo\s*:/i,
  /\btodo\b/i,
  /\bassigned\s+to\b/i,
  /\btake\s+care\s+of\b/i,
  /\bfollow\s+up\b/i,
  /\bresponsible\s+for\b/i,
  /\bneeds?\s+to\b/i,
  /\bshould\s+(?:do|take|handle|complete|prepare|send|create|write|update|review)\b/i,
  /\bplease\s+(?:do|take|handle|complete|prepare|send|create|write|update|review)\b/i,
  /\bi'?ll\s+(?:do|take|handle|complete|prepare|send|create|write|update|review)\b/i,
];

const DECISION_PATTERNS = [
  /\bdecided\b/i,
  /\bagreed\b/i,
  /\bconclusion\b/i,
  /\bresolved\b/i,
  /\bwe'?ll\s+go\s+with\b/i,
  /\bfinal\s+decision\b/i,
  /\blet'?s\s+go\s+(?:with|ahead)\b/i,
  /\bapproved\b/i,
  /\bconfirmed\b/i,
  /\bconsensus\b/i,
  /\bwe\s+(?:will|are\s+going\s+to)\b/i,
  /\bsettled\s+on\b/i,
  /\bthe\s+plan\s+is\b/i,
];

const TIMESTAMP_PATTERN = /\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)\]?/gi;

const SPEAKER_LINE_PATTERN = /^([A-Za-z][A-Za-z\s.'-]{0,30}?)\s*:\s*(.+)$/;

const PRIORITY_KEYWORDS = {
  high: /\b(?:urgent|asap|critical|high\s+priority|immediately|right\s+away|top\s+priority)\b/i,
  medium: /\b(?:medium\s+priority|soon|this\s+week|important)\b/i,
  low: /\b(?:low\s+priority|when\s+possible|nice\s+to\s+have|eventually|no\s+rush)\b/i,
};

const DEADLINE_PATTERN = /\b(?:by|before|due|deadline|until)\s+([A-Za-z0-9,\s]+?)(?:\.|$|;)/i;

const TOPIC_STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "its", "our", "their", "mine",
  "yours", "hers", "ours", "theirs", "this", "that", "these", "those",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "not", "no", "nor", "so", "too", "very", "just", "also", "then",
  "than", "but", "and", "or", "if", "of", "at", "by", "for", "with",
  "about", "against", "between", "through", "during", "before", "after",
  "above", "below", "to", "from", "up", "down", "in", "out", "on", "off",
  "over", "under", "again", "further", "here", "there", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "any",
  "only", "own", "same", "so", "than", "too", "very", "say", "said",
  "think", "know", "get", "go", "make", "like", "going", "thing",
  "things", "yeah", "yes", "okay", "ok", "right", "well", "got", "let",
  "still", "want", "see", "come", "take", "look", "really", "good",
  "one", "two", "much", "now", "way", "lot",
]);

// ---------------------------------------------------------------------------
// Parsing Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the transcript into an array of { speaker, text, line } objects.
 */
function parseLines(transcript) {
  const rawLines = transcript.split("\n").filter((l) => l.trim().length > 0);
  const parsed = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    // Strip leading timestamps
    const cleaned = line.replace(TIMESTAMP_PATTERN, "").trim();
    const match = cleaned.match(SPEAKER_LINE_PATTERN);
    if (match) {
      parsed.push({ speaker: match[1].trim(), text: match[2].trim(), line: i + 1 });
    } else {
      parsed.push({ speaker: null, text: cleaned || line, line: i + 1 });
    }
  }

  return parsed;
}

/**
 * Extract unique speakers from parsed lines.
 */
function extractSpeakers(parsedLines) {
  const speakers = new Set();
  for (const entry of parsedLines) {
    if (entry.speaker) {
      speakers.add(entry.speaker);
    }
  }
  return [...speakers];
}

/**
 * Extract timestamps from the transcript text.
 */
function extractTimestamps(transcript) {
  const matches = [];
  let match;
  const pattern = /\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)\]?/gi;
  while ((match = pattern.exec(transcript)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

/**
 * Estimate meeting duration from first and last timestamp.
 */
function estimateDuration(timestamps) {
  if (timestamps.length < 2) return null;

  const toMinutes = (ts) => {
    const cleaned = ts.replace(/\s*(AM|PM)/i, (_, p) => ` ${p}`).trim();
    const parts = cleaned.split(/[:\s]+/);
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const ampm = parts.length > 2 ? parts[parts.length - 1].toUpperCase() : null;

    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  };

  const first = toMinutes(timestamps[0]);
  const last = toMinutes(timestamps[timestamps.length - 1]);

  if (last <= first) return null;
  return last - first;
}

/**
 * Extract key topics via simple word frequency analysis (bigrams + trigrams).
 */
function extractTopics(parsedLines, maxTopics = 5) {
  const ngramCounts = new Map();

  for (const entry of parsedLines) {
    const words = entry.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !TOPIC_STOP_WORDS.has(w));

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      ngramCounts.set(bigram, (ngramCounts.get(bigram) || 0) + 1);
    }

    // Trigrams
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      ngramCounts.set(trigram, (ngramCounts.get(trigram) || 0) + 1);
    }
  }

  // Sort by frequency, take top N with count > 1
  const sorted = [...ngramCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics);

  return sorted.map(([phrase, count]) => ({ phrase, count }));
}

/**
 * Detect overall tone/sentiment via simple keyword matching.
 */
function detectTone(parsedLines) {
  const positiveWords = /\b(?:great|excellent|good|agree|love|fantastic|wonderful|excited|happy|pleased|progress|success|achieved|resolved|productive)\b/gi;
  const negativeWords = /\b(?:problem|issue|concern|disagree|bad|terrible|worried|frustrated|delay|blocked|failed|risk|difficult|challenge|unfortunately)\b/gi;
  const neutralWords = /\b(?:discuss|review|update|status|plan|schedule|next|current|information|report|process)\b/gi;

  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const entry of parsedLines) {
    const text = entry.text;
    const posMatches = text.match(positiveWords);
    const negMatches = text.match(negativeWords);
    const neuMatches = text.match(neutralWords);
    if (posMatches) positive += posMatches.length;
    if (negMatches) negative += negMatches.length;
    if (neuMatches) neutral += neuMatches.length;
  }

  const total = positive + negative + neutral;
  if (total === 0) return "neutral";

  if (positive > negative * 2 && positive > neutral) return "positive";
  if (negative > positive * 2 && negative > neutral) return "negative";
  if (negative > positive) return "mixed-negative";
  if (positive > negative) return "mixed-positive";
  return "neutral";
}

/**
 * Detect the priority of a text line.
 */
function detectPriority(text) {
  if (PRIORITY_KEYWORDS.high.test(text)) return "high";
  if (PRIORITY_KEYWORDS.medium.test(text)) return "medium";
  if (PRIORITY_KEYWORDS.low.test(text)) return "low";
  return null;
}

/**
 * Extract a deadline from a text line.
 */
function extractDeadline(text) {
  const match = text.match(DEADLINE_PATTERN);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionSummarize(transcript) {
  const parsedLines = parseLines(transcript);
  const speakers = extractSpeakers(parsedLines);
  const timestamps = extractTimestamps(transcript);
  const duration = estimateDuration(timestamps);
  const topics = extractTopics(parsedLines);
  const tone = detectTone(parsedLines);
  const totalLines = parsedLines.length;
  const wordCount = parsedLines.reduce((sum, e) => sum + e.text.split(/\s+/).length, 0);

  const lines = [
    "Meeting Summary",
    "===============",
    "",
  ];

  if (speakers.length > 0) {
    lines.push(`Participants (${speakers.length}): ${speakers.join(", ")}`);
  } else {
    lines.push("Participants: Unable to identify (no speaker labels found)");
  }

  if (duration !== null) {
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;
    lines.push(`Estimated Duration: ${durationStr}`);
  } else if (timestamps.length > 0) {
    lines.push("Estimated Duration: Unable to calculate from timestamps");
  } else {
    lines.push("Estimated Duration: No timestamps found");
  }

  lines.push(`Total Lines: ${totalLines}`);
  lines.push(`Word Count: ${wordCount}`);
  lines.push(`Overall Tone: ${tone}`);

  if (topics.length > 0) {
    lines.push("", "Key Topics", "----------");
    for (const { phrase, count } of topics) {
      lines.push(`  - ${phrase} (mentioned ${count} times)`);
    }
  } else {
    lines.push("", "Key Topics: No recurring topics identified");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "summarize",
      participantCount: speakers.length,
      duration: duration,
      tone,
      topicCount: topics.length,
      wordCount,
      lineCount: totalLines,
    },
  };
}

function actionExtractActions(transcript) {
  const parsedLines = parseLines(transcript);
  const actions = [];

  for (const entry of parsedLines) {
    const fullText = entry.text;
    const isAction = ACTION_PATTERNS.some((p) => p.test(fullText));

    if (!isAction) continue;

    const assignee = entry.speaker || "Unassigned";
    const priority = detectPriority(fullText);
    const deadline = extractDeadline(fullText);

    // Clean up the task text
    let task = fullText
      .replace(DEADLINE_PATTERN, "")
      .replace(PRIORITY_KEYWORDS.high, "")
      .replace(PRIORITY_KEYWORDS.medium, "")
      .replace(PRIORITY_KEYWORDS.low, "")
      .replace(/\baction\s+item\s*:\s*/i, "")
      .replace(/\btodo\s*:\s*/i, "")
      .trim();

    // Capitalize first letter
    if (task.length > 0) {
      task = task.charAt(0).toUpperCase() + task.slice(1);
    }

    const actionItem = { assignee, task };
    if (deadline) actionItem.deadline = deadline;
    if (priority) actionItem.priority = priority;

    actions.push(actionItem);
  }

  const lines = [
    "Action Items",
    "============",
    "",
  ];

  if (actions.length === 0) {
    lines.push("No action items found in the transcript.");
  } else {
    lines.push(`Found ${actions.length} action item(s):`, "");
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      let entry = `${i + 1}. [${a.assignee}] ${a.task}`;
      if (a.deadline) entry += ` (Due: ${a.deadline})`;
      if (a.priority) entry += ` [${a.priority.toUpperCase()}]`;
      lines.push(entry);
    }
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "extract_actions",
      actionCount: actions.length,
      actions,
    },
  };
}

function actionExtractDecisions(transcript) {
  const parsedLines = parseLines(transcript);
  const decisions = [];

  for (let i = 0; i < parsedLines.length; i++) {
    const entry = parsedLines[i];
    const fullText = entry.text;
    const isDecision = DECISION_PATTERNS.some((p) => p.test(fullText));

    if (!isDecision) continue;

    // Gather context: previous line if available
    const contextLine = i > 0 ? parsedLines[i - 1].text : null;

    // Find participants involved (speaker of this line + any mentioned speakers)
    const participants = [];
    if (entry.speaker) participants.push(entry.speaker);

    const decision = {
      decision: fullText,
    };

    if (contextLine) {
      decision.context = contextLine;
    }

    if (participants.length > 0) {
      decision.participants = participants;
    }

    decisions.push(decision);
  }

  const lines = [
    "Decisions Made",
    "==============",
    "",
  ];

  if (decisions.length === 0) {
    lines.push("No decisions found in the transcript.");
  } else {
    lines.push(`Found ${decisions.length} decision(s):`, "");
    for (let i = 0; i < decisions.length; i++) {
      const d = decisions[i];
      lines.push(`${i + 1}. ${d.decision}`);
      if (d.context) lines.push(`   Context: ${d.context}`);
      if (d.participants && d.participants.length > 0) {
        lines.push(`   Participants: ${d.participants.join(", ")}`);
      }
      lines.push("");
    }
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "extract_decisions",
      decisionCount: decisions.length,
      decisions,
    },
  };
}

function actionGenerateMinutes(transcript) {
  const parsedLines = parseLines(transcript);
  const speakers = extractSpeakers(parsedLines);
  const timestamps = extractTimestamps(transcript);
  const duration = estimateDuration(timestamps);
  const topics = extractTopics(parsedLines);
  const tone = detectTone(parsedLines);

  // Reuse other actions for their data
  const actionsResult = actionExtractActions(transcript);
  const decisionsResult = actionExtractDecisions(transcript);
  const actions = actionsResult.metadata.actions;
  const decisions = decisionsResult.metadata.decisions;

  const lines = [
    "# Meeting Minutes",
    "",
    `**Date:** ${new Date().toISOString().split("T")[0]}`,
  ];

  if (duration !== null) {
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;
    lines.push(`**Duration:** ${durationStr}`);
  }

  lines.push(`**Tone:** ${tone}`);

  // Attendees
  lines.push("", "## Attendees", "");
  if (speakers.length > 0) {
    for (const speaker of speakers) {
      lines.push(`- ${speaker}`);
    }
  } else {
    lines.push("- _No speaker labels found in transcript_");
  }

  // Agenda / Topics
  lines.push("", "## Agenda", "");
  if (topics.length > 0) {
    for (const { phrase } of topics) {
      lines.push(`- ${phrase.charAt(0).toUpperCase() + phrase.slice(1)}`);
    }
  } else {
    lines.push("- _Topics could not be automatically identified_");
  }

  // Discussion Summary
  lines.push("", "## Discussion", "");
  // Group by speaker turns for a condensed discussion summary
  const turns = [];
  let currentSpeaker = null;
  let currentTexts = [];
  for (const entry of parsedLines) {
    if (entry.speaker && entry.speaker !== currentSpeaker) {
      if (currentSpeaker && currentTexts.length > 0) {
        turns.push({ speaker: currentSpeaker, text: currentTexts.join(" ") });
      }
      currentSpeaker = entry.speaker;
      currentTexts = [entry.text];
    } else {
      currentTexts.push(entry.text);
    }
  }
  if (currentSpeaker && currentTexts.length > 0) {
    turns.push({ speaker: currentSpeaker, text: currentTexts.join(" ") });
  }

  if (turns.length > 0) {
    // Show up to 10 speaker turns for the summary
    const displayTurns = turns.slice(0, 10);
    for (const turn of displayTurns) {
      lines.push(`- **${turn.speaker}:** ${turn.text}`);
    }
    if (turns.length > 10) {
      lines.push(`- _... and ${turns.length - 10} more speaker turns_`);
    }
  } else {
    // No speaker labels: just show first few lines
    const preview = parsedLines.slice(0, 5);
    for (const entry of preview) {
      lines.push(`- ${entry.text}`);
    }
    if (parsedLines.length > 5) {
      lines.push(`- _... and ${parsedLines.length - 5} more lines_`);
    }
  }

  // Decisions
  lines.push("", "## Decisions", "");
  if (decisions.length > 0) {
    for (let i = 0; i < decisions.length; i++) {
      lines.push(`${i + 1}. ${decisions[i].decision}`);
    }
  } else {
    lines.push("- _No decisions identified_");
  }

  // Action Items
  lines.push("", "## Action Items", "");
  if (actions.length > 0) {
    lines.push("| # | Assignee | Task | Deadline | Priority |");
    lines.push("|---|----------|------|----------|----------|");
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      lines.push(
        `| ${i + 1} | ${a.assignee} | ${a.task} | ${a.deadline || "-"} | ${a.priority || "-"} |`
      );
    }
  } else {
    lines.push("- _No action items identified_");
  }

  // Next Steps
  lines.push("", "## Next Steps", "");
  if (actions.length > 0) {
    const upcoming = actions.filter((a) => a.deadline).slice(0, 3);
    if (upcoming.length > 0) {
      for (const a of upcoming) {
        lines.push(`- ${a.assignee} to ${a.task.charAt(0).toLowerCase() + a.task.slice(1)}${a.deadline ? ` by ${a.deadline}` : ""}`);
      }
    } else {
      for (const a of actions.slice(0, 3)) {
        lines.push(`- ${a.assignee} to ${a.task.charAt(0).toLowerCase() + a.task.slice(1)}`);
      }
    }
  } else {
    lines.push("- _No next steps identified_");
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "generate_minutes",
      participantCount: speakers.length,
      topicCount: topics.length,
      decisionCount: decisions.length,
      actionCount: actions.length,
      duration,
    },
  };
}

function actionAnalyzeParticipation(transcript) {
  const parsedLines = parseLines(transcript);
  const speakers = extractSpeakers(parsedLines);

  if (speakers.length === 0) {
    return {
      result: "Participation Analysis\n======================\n\nNo speaker labels found in the transcript.\nTo analyze participation, the transcript should use the format:\n  Speaker Name: Their message text",
      metadata: {
        success: true,
        action: "analyze_participation",
        speakerCount: 0,
        speakers: {},
      },
    };
  }

  // Compute stats per speaker
  const stats = {};
  for (const speaker of speakers) {
    stats[speaker] = { lines: 0, words: 0 };
  }

  let totalWords = 0;
  let totalLines = 0;

  for (const entry of parsedLines) {
    if (!entry.speaker) continue;
    const wordCount = entry.text.split(/\s+/).filter((w) => w.length > 0).length;
    stats[entry.speaker].lines += 1;
    stats[entry.speaker].words += wordCount;
    totalWords += wordCount;
    totalLines += 1;
  }

  // Calculate percentages and identify dominant/quiet speakers
  const speakerData = [];
  for (const [speaker, data] of Object.entries(stats)) {
    const wordPercent = totalWords > 0 ? (data.words / totalWords) * 100 : 0;
    const linePercent = totalLines > 0 ? (data.lines / totalLines) * 100 : 0;
    speakerData.push({
      speaker,
      lines: data.lines,
      words: data.words,
      wordPercent: Math.round(wordPercent * 10) / 10,
      linePercent: Math.round(linePercent * 10) / 10,
    });
  }

  // Sort by word count descending
  speakerData.sort((a, b) => b.words - a.words);

  const dominant = speakerData[0];
  const quiet = speakerData[speakerData.length - 1];

  const lines = [
    "Participation Analysis",
    "======================",
    "",
    `Total Speakers: ${speakers.length}`,
    `Total Words: ${totalWords}`,
    `Total Speaking Turns: ${totalLines}`,
    "",
    "Speaker Breakdown",
    "-----------------",
  ];

  for (const s of speakerData) {
    const bar = buildBar(s.wordPercent);
    lines.push(`  ${s.speaker.padEnd(20)} ${bar} ${s.wordPercent}% (${s.words} words, ${s.lines} turns)`);
  }

  lines.push("", "Insights", "--------");
  if (speakers.length > 1) {
    lines.push(`  Most active: ${dominant.speaker} (${dominant.wordPercent}% of words)`);
    lines.push(`  Least active: ${quiet.speaker} (${quiet.wordPercent}% of words)`);

    // Check for imbalance
    const evenShare = 100 / speakers.length;
    if (dominant.wordPercent > evenShare * 2) {
      lines.push(`  Note: ${dominant.speaker} dominated the conversation (>${Math.round(evenShare * 2)}% threshold)`);
    }
    if (quiet.wordPercent < evenShare * 0.25) {
      lines.push(`  Note: ${quiet.speaker} had very low participation (<${Math.round(evenShare * 0.25)}% threshold)`);
    }
  } else {
    lines.push(`  Only one speaker identified: ${dominant.speaker}`);
  }

  return {
    result: lines.join("\n"),
    metadata: {
      success: true,
      action: "analyze_participation",
      speakerCount: speakers.length,
      totalWords,
      totalLines,
      speakers: Object.fromEntries(
        speakerData.map((s) => [s.speaker, { words: s.words, lines: s.lines, wordPercent: s.wordPercent }])
      ),
      dominant: dominant.speaker,
      quiet: quiet.speaker,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a simple ASCII progress bar (0-100).
 */
function buildBar(percent) {
  const filled = Math.round(Math.min(percent, 100) / 10);
  return "[" + "#".repeat(filled) + ".".repeat(10 - filled) + "]";
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute the meeting summarizer skill.
 *
 * @param {Object} params
 * @param {string} params.action - summarize, extract_actions, extract_decisions, generate_minutes, or analyze_participation
 * @param {string} params.transcript - The meeting transcript text to analyze
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action, transcript: rawTranscript } = params;

  if (!action) {
    return {
      result: "Error: The 'action' parameter is required. Supported actions: summarize, extract_actions, extract_decisions, generate_minutes, analyze_participation.",
      metadata: { success: false, error: "MISSING_ACTION" },
    };
  }

  if (!rawTranscript || typeof rawTranscript !== "string" || rawTranscript.trim().length === 0) {
    return {
      result: "Error: A non-empty 'transcript' parameter is required.",
      metadata: { success: false, error: "MISSING_TRANSCRIPT" },
    };
  }

  const transcript = sanitize(rawTranscript.trim());

  switch (action) {
    case "summarize":
      return actionSummarize(transcript);

    case "extract_actions":
      return actionExtractActions(transcript);

    case "extract_decisions":
      return actionExtractDecisions(transcript);

    case "generate_minutes":
      return actionGenerateMinutes(transcript);

    case "analyze_participation":
      return actionAnalyzeParticipation(transcript);

    default:
      return {
        result: `Error: Unknown action '${sanitize(action)}'. Supported actions: summarize, extract_actions, extract_decisions, generate_minutes, analyze_participation.`,
        metadata: { success: false, error: "UNKNOWN_ACTION" },
      };
  }
}
