/**
 * Memory Manager Skill Handler
 *
 * Persistent key-value memory using a local JSON file.
 * Supports store, retrieve, search, list, and delete operations.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const MEMORY_FILE_PATH = "/data/memory.json";

/**
 * Execute a memory management action.
 *
 * @param {object} params - The tool parameters.
 * @param {string} params.action - "store" | "retrieve" | "search" | "list" | "delete"
 * @param {string} [params.key] - Memory key for store/retrieve/delete.
 * @param {string} [params.value] - Value to store.
 * @param {string} [params.query] - Search query for fuzzy matching.
 * @param {object} context - Execution context provided by the runtime.
 * @returns {Promise<{result: string, metadata: object}>}
 */
export async function execute(params, context) {
  const { action, key, value, query } = params;

  switch (action) {
    case "store":
      return await storeEntry(key, value);
    case "retrieve":
      return await retrieveEntry(key);
    case "search":
      return await searchEntries(query);
    case "list":
      return await listEntries();
    case "delete":
      return await deleteEntry(key);
    default:
      throw new Error(
        `Unknown action: "${action}". Supported actions: store, retrieve, search, list, delete.`
      );
  }
}

/**
 * Load memory from disk. Creates file if it doesn't exist.
 */
async function loadMemory() {
  try {
    if (!existsSync(MEMORY_FILE_PATH)) {
      // Ensure directory exists
      const dir = dirname(MEMORY_FILE_PATH);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(MEMORY_FILE_PATH, JSON.stringify({}, null, 2), "utf-8");
      return {};
    }
    const raw = await readFile(MEMORY_FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      return {};
    }
    throw new Error(`Failed to load memory file: ${err.message}`);
  }
}

/**
 * Save memory to disk.
 */
async function saveMemory(memory) {
  const dir = dirname(MEMORY_FILE_PATH);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(MEMORY_FILE_PATH, JSON.stringify(memory, null, 2), "utf-8");
}

/**
 * Store a key-value pair with a timestamp.
 */
async function storeEntry(key, value) {
  if (!key || key.trim().length === 0) {
    throw new Error("A key is required for the store action.");
  }
  if (value === undefined || value === null) {
    throw new Error("A value is required for the store action.");
  }

  const memory = await loadMemory();
  const isUpdate = key in memory;
  const timestamp = new Date().toISOString();

  memory[key] = {
    value,
    createdAt: isUpdate ? memory[key].createdAt : timestamp,
    updatedAt: timestamp,
  };

  await saveMemory(memory);

  return {
    result: isUpdate
      ? `Updated memory entry "${key}" successfully.`
      : `Stored new memory entry "${key}" successfully.`,
    metadata: {
      key,
      isUpdate,
      timestamp,
      totalEntries: Object.keys(memory).length,
    },
  };
}

/**
 * Retrieve an entry by its exact key.
 */
async function retrieveEntry(key) {
  if (!key || key.trim().length === 0) {
    throw new Error("A key is required for the retrieve action.");
  }

  const memory = await loadMemory();

  if (!(key in memory)) {
    return {
      result: `No memory entry found for key "${key}".`,
      metadata: { key, found: false },
    };
  }

  const entry = memory[key];
  return {
    result: [
      `Memory entry for "${key}":`,
      `  Value: ${entry.value}`,
      `  Created: ${entry.createdAt}`,
      `  Updated: ${entry.updatedAt}`,
    ].join("\n"),
    metadata: {
      key,
      found: true,
      value: entry.value,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  };
}

/**
 * Search entries with fuzzy matching on keys and values.
 */
async function searchEntries(query) {
  if (!query || query.trim().length === 0) {
    throw new Error("A query is required for the search action.");
  }

  const memory = await loadMemory();
  const queryLower = query.toLowerCase();
  const matches = [];

  for (const [key, entry] of Object.entries(memory)) {
    const keyLower = key.toLowerCase();
    const valueLower = String(entry.value).toLowerCase();

    // Calculate a simple relevance score based on substring and token matching
    let score = 0;

    // Exact key match
    if (keyLower === queryLower) {
      score += 100;
    }
    // Key contains query
    else if (keyLower.includes(queryLower)) {
      score += 60;
    }
    // Value contains query
    if (valueLower.includes(queryLower)) {
      score += 40;
    }

    // Token-level matching for fuzzy results
    const queryTokens = queryLower.split(/\s+/);
    for (const token of queryTokens) {
      if (token.length < 2) continue;
      if (keyLower.includes(token)) score += 15;
      if (valueLower.includes(token)) score += 10;
    }

    // Levenshtein-based similarity for short queries
    if (queryLower.length <= 20) {
      const keySimilarity = similarity(keyLower, queryLower);
      if (keySimilarity > 0.4) {
        score += Math.round(keySimilarity * 30);
      }
    }

    if (score > 0) {
      matches.push({ key, entry, score });
    }
  }

  // Sort by relevance score descending
  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return {
      result: `No memory entries match the query "${query}".`,
      metadata: { query, matchCount: 0 },
    };
  }

  const formatted = matches.slice(0, 10).map((m, i) => {
    return `${i + 1}. [${m.key}] (score: ${m.score}): ${m.entry.value}`;
  });

  return {
    result: `Found ${matches.length} match(es) for "${query}":\n\n${formatted.join("\n")}`,
    metadata: {
      query,
      matchCount: matches.length,
      topMatches: matches.slice(0, 10).map((m) => ({
        key: m.key,
        score: m.score,
        value: m.entry.value,
      })),
    },
  };
}

/**
 * List all memory entries.
 */
async function listEntries() {
  const memory = await loadMemory();
  const entries = Object.entries(memory);

  if (entries.length === 0) {
    return {
      result: "Memory is empty. No entries stored.",
      metadata: { totalEntries: 0 },
    };
  }

  const formatted = entries.map(([key, entry]) => {
    const valuePreview =
      String(entry.value).length > 80
        ? String(entry.value).slice(0, 80) + "..."
        : entry.value;
    return `  - ${key}: ${valuePreview} (updated: ${entry.updatedAt})`;
  });

  return {
    result: `Memory contains ${entries.length} entry/entries:\n\n${formatted.join("\n")}`,
    metadata: {
      totalEntries: entries.length,
      keys: entries.map(([key]) => key),
    },
  };
}

/**
 * Delete an entry by key.
 */
async function deleteEntry(key) {
  if (!key || key.trim().length === 0) {
    throw new Error("A key is required for the delete action.");
  }

  const memory = await loadMemory();

  if (!(key in memory)) {
    return {
      result: `No memory entry found for key "${key}". Nothing to delete.`,
      metadata: { key, deleted: false },
    };
  }

  const deletedValue = memory[key].value;
  delete memory[key];
  await saveMemory(memory);

  return {
    result: `Deleted memory entry "${key}" successfully.`,
    metadata: {
      key,
      deleted: true,
      deletedValue,
      remainingEntries: Object.keys(memory).length,
    },
  };
}

/**
 * Simple Levenshtein-distance-based similarity (0 to 1).
 */
function similarity(a, b) {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  return 1 - distance / maxLen;
}

/**
 * Compute the Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}
