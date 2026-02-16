/**
 * Topic Monitor Skill Handler
 *
 * In-memory topic and keyword monitoring system.
 * Supports creating keyword watches, scanning content for matches,
 * viewing stored matches, and generating topic statistics.
 */

/**
 * In-memory store for watched topics.
 * Key: topic name (string)
 * Value: { keywords: string[], caseSensitive: boolean, createdAt: string,
 *          matchCount: number, matches: object[] }
 */
const topics = new Map();

/** Maximum number of topics allowed. */
const MAX_TOPICS = 50;

/** Maximum number of keywords per topic. */
const MAX_KEYWORDS_PER_TOPIC = 20;

/** Maximum number of stored matches per topic (ring buffer). */
const MAX_MATCHES_PER_TOPIC = 500;

/**
 * Execute a topic monitor action.
 *
 * @param {object} params - The tool parameters.
 * @param {string} params.action - "watch" | "unwatch" | "list" | "check" | "matches" | "stats"
 * @param {string} [params.topic] - Topic name/identifier.
 * @param {string[]} [params.keywords] - Keywords to monitor.
 * @param {boolean} [params.caseSensitive=false] - Whether matching is case-sensitive.
 * @param {string} [params.content] - Content to scan for matches.
 * @param {string} [params.source] - Source label for the content being checked.
 * @param {number} [params.limit] - Limit for matches retrieval.
 * @param {object} context - Execution context provided by the runtime.
 * @returns {Promise<{result: string, metadata: object}>}
 */
export async function execute(params, context) {
  const { action } = params;

  const validActions = ['watch', 'unwatch', 'list', 'check', 'matches', 'stats'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' }
    };
  }

  switch (action) {
    case 'watch':
      return handleWatch(params);
    case 'unwatch':
      return handleUnwatch(params);
    case 'list':
      return handleList();
    case 'check':
      return handleCheck(params);
    case 'matches':
      return handleMatches(params);
    case 'stats':
      return handleStats();
    default:
      return {
        result: `Error: Unknown action "${action}".`,
        metadata: { success: false, error: 'INVALID_ACTION' }
      };
  }
}

/**
 * Create a new topic watch with associated keywords.
 */
function handleWatch(params) {
  const { topic, keywords, caseSensitive = false } = params;

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return {
      result: 'Error: A topic name is required for the watch action.',
      metadata: { success: false, error: 'MISSING_TOPIC' }
    };
  }

  const trimmedTopic = topic.trim();

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return {
      result: 'Error: At least one keyword is required for the watch action.',
      metadata: { success: false, error: 'MISSING_KEYWORDS' }
    };
  }

  if (topics.has(trimmedTopic)) {
    return {
      result: `Error: Topic "${trimmedTopic}" is already being watched. Unwatch it first to recreate.`,
      metadata: { success: false, error: 'DUPLICATE_TOPIC', topic: trimmedTopic }
    };
  }

  if (topics.size >= MAX_TOPICS) {
    return {
      result: `Error: Maximum number of topics (${MAX_TOPICS}) reached. Remove some topics before adding new ones.`,
      metadata: { success: false, error: 'TOO_MANY_TOPICS', maxTopics: MAX_TOPICS }
    };
  }

  // Filter and validate keywords
  const validKeywords = keywords
    .filter(k => typeof k === 'string' && k.trim().length > 0)
    .map(k => k.trim());

  if (validKeywords.length === 0) {
    return {
      result: 'Error: At least one non-empty keyword is required.',
      metadata: { success: false, error: 'MISSING_KEYWORDS' }
    };
  }

  if (validKeywords.length > MAX_KEYWORDS_PER_TOPIC) {
    return {
      result: `Error: Too many keywords. Maximum is ${MAX_KEYWORDS_PER_TOPIC} per topic, received ${validKeywords.length}.`,
      metadata: { success: false, error: 'TOO_MANY_KEYWORDS', maxKeywords: MAX_KEYWORDS_PER_TOPIC }
    };
  }

  const entry = {
    keywords: validKeywords,
    caseSensitive: Boolean(caseSensitive),
    createdAt: new Date().toISOString(),
    matchCount: 0,
    matches: []
  };

  topics.set(trimmedTopic, entry);

  return {
    result: `Now watching topic "${trimmedTopic}" with ${validKeywords.length} keyword(s): ${validKeywords.join(', ')}`,
    metadata: {
      success: true,
      action: 'watch',
      topic: trimmedTopic,
      keywords: validKeywords,
      caseSensitive: entry.caseSensitive,
      totalTopics: topics.size
    }
  };
}

/**
 * Remove a topic watch.
 */
function handleUnwatch(params) {
  const { topic } = params;

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return {
      result: 'Error: A topic name is required for the unwatch action.',
      metadata: { success: false, error: 'MISSING_TOPIC' }
    };
  }

  const trimmedTopic = topic.trim();

  if (!topics.has(trimmedTopic)) {
    return {
      result: `Error: Topic "${trimmedTopic}" is not being watched.`,
      metadata: { success: false, error: 'TOPIC_NOT_FOUND', topic: trimmedTopic }
    };
  }

  const entry = topics.get(trimmedTopic);
  topics.delete(trimmedTopic);

  return {
    result: `Stopped watching topic "${trimmedTopic}". Had ${entry.matchCount} match(es) recorded.`,
    metadata: {
      success: true,
      action: 'unwatch',
      topic: trimmedTopic,
      matchCount: entry.matchCount,
      remainingTopics: topics.size
    }
  };
}

/**
 * List all watched topics with their keyword count and match count.
 */
function handleList() {
  if (topics.size === 0) {
    return {
      result: 'No topics are currently being watched.',
      metadata: { success: true, action: 'list', topicCount: 0, topics: [] }
    };
  }

  const entries = [];
  for (const [name, entry] of topics) {
    entries.push({
      topic: name,
      keywords: entry.keywords,
      keywordCount: entry.keywords.length,
      matchCount: entry.matchCount,
      caseSensitive: entry.caseSensitive,
      createdAt: entry.createdAt
    });
  }

  const formatted = entries.map((e, i) => {
    return `${i + 1}. "${e.topic}" - ${e.keywordCount} keyword(s), ${e.matchCount} match(es), case-sensitive: ${e.caseSensitive}\n   Keywords: ${e.keywords.join(', ')}\n   Created: ${e.createdAt}`;
  });

  return {
    result: `Watched topics (${entries.length}):\n\n${formatted.join('\n\n')}`,
    metadata: {
      success: true,
      action: 'list',
      topicCount: entries.length,
      topics: entries
    }
  };
}

/**
 * Scan content against all watched topics and return matches.
 * Uses word boundary matching by default to avoid partial word matches.
 */
function handleCheck(params) {
  const { content, source = 'unknown' } = params;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return {
      result: 'Error: Content is required for the check action.',
      metadata: { success: false, error: 'MISSING_CONTENT' }
    };
  }

  if (topics.size === 0) {
    return {
      result: 'No topics are being watched. Add topics first using the "watch" action.',
      metadata: { success: true, action: 'check', matchedTopics: 0, results: [] }
    };
  }

  const timestamp = new Date().toISOString();
  const results = [];

  for (const [topicName, entry] of topics) {
    const matchedKeywords = [];

    for (const keyword of entry.keywords) {
      const regex = buildKeywordRegex(keyword, entry.caseSensitive);
      if (regex.test(content)) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length > 0) {
      // Extract snippets for each matched keyword
      const snippets = extractSnippets(content, matchedKeywords, entry.caseSensitive);

      // Build the match record
      const matchRecord = {
        source,
        snippet: snippets[0] || '',
        matchedKeywords,
        timestamp
      };

      // Store in ring buffer
      if (entry.matches.length >= MAX_MATCHES_PER_TOPIC) {
        entry.matches.shift();
      }
      entry.matches.push(matchRecord);
      entry.matchCount++;

      results.push({
        topic: topicName,
        matchedKeywords,
        snippets
      });
    }
  }

  if (results.length === 0) {
    return {
      result: `No matches found in the provided content from "${source}".`,
      metadata: {
        success: true,
        action: 'check',
        source,
        matchedTopics: 0,
        results: []
      }
    };
  }

  const formatted = results.map((r, i) => {
    const snippetText = r.snippets.map(s => `    "${s}"`).join('\n');
    return `${i + 1}. Topic "${r.topic}" - matched keywords: ${r.matchedKeywords.join(', ')}\n   Snippets:\n${snippetText}`;
  });

  return {
    result: `Found matches in ${results.length} topic(s) from "${source}":\n\n${formatted.join('\n\n')}`,
    metadata: {
      success: true,
      action: 'check',
      source,
      matchedTopics: results.length,
      results
    }
  };
}

/**
 * View stored matches for a specific topic.
 */
function handleMatches(params) {
  const { topic, limit } = params;

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return {
      result: 'Error: A topic name is required for the matches action.',
      metadata: { success: false, error: 'MISSING_TOPIC' }
    };
  }

  const trimmedTopic = topic.trim();

  if (!topics.has(trimmedTopic)) {
    return {
      result: `Error: Topic "${trimmedTopic}" is not being watched.`,
      metadata: { success: false, error: 'TOPIC_NOT_FOUND', topic: trimmedTopic }
    };
  }

  const entry = topics.get(trimmedTopic);
  const allMatches = entry.matches;

  if (allMatches.length === 0) {
    return {
      result: `No matches recorded yet for topic "${trimmedTopic}".`,
      metadata: {
        success: true,
        action: 'matches',
        topic: trimmedTopic,
        matchCount: 0,
        matches: []
      }
    };
  }

  // Apply limit: return the most recent matches
  const effectiveLimit = (typeof limit === 'number' && limit > 0) ? limit : allMatches.length;
  const recentMatches = allMatches.slice(-effectiveLimit);

  const formatted = recentMatches.map((m, i) => {
    return `${i + 1}. [${m.timestamp}] Source: "${m.source}"\n   Matched: ${m.matchedKeywords.join(', ')}\n   Snippet: "${m.snippet}"`;
  });

  return {
    result: `Matches for topic "${trimmedTopic}" (showing ${recentMatches.length} of ${allMatches.length}):\n\n${formatted.join('\n\n')}`,
    metadata: {
      success: true,
      action: 'matches',
      topic: trimmedTopic,
      totalMatches: allMatches.length,
      returnedCount: recentMatches.length,
      matches: recentMatches
    }
  };
}

/**
 * Return statistics about all watched topics.
 */
function handleStats() {
  const topicCount = topics.size;

  if (topicCount === 0) {
    return {
      result: 'No topics are being watched. Statistics are empty.',
      metadata: {
        success: true,
        action: 'stats',
        totalTopics: 0,
        totalMatches: 0,
        totalKeywords: 0,
        mostActiveTopics: [],
        keywordCoverage: []
      }
    };
  }

  let totalMatches = 0;
  let totalKeywords = 0;
  const topicStats = [];
  const keywordMap = new Map();

  for (const [name, entry] of topics) {
    totalMatches += entry.matchCount;
    totalKeywords += entry.keywords.length;

    topicStats.push({
      topic: name,
      matchCount: entry.matchCount,
      keywordCount: entry.keywords.length
    });

    for (const keyword of entry.keywords) {
      const key = keyword.toLowerCase();
      if (!keywordMap.has(key)) {
        keywordMap.set(key, new Set());
      }
      keywordMap.get(key).add(name);
    }
  }

  // Sort by match count descending to find most active
  topicStats.sort((a, b) => b.matchCount - a.matchCount);
  const mostActiveTopics = topicStats.slice(0, 5);

  // Build keyword coverage: which keywords appear in how many topics
  const keywordCoverage = [];
  for (const [keyword, topicSet] of keywordMap) {
    keywordCoverage.push({
      keyword,
      topicCount: topicSet.size,
      topics: Array.from(topicSet)
    });
  }
  keywordCoverage.sort((a, b) => b.topicCount - a.topicCount);

  const lines = [
    `Topic Monitor Statistics:`,
    `  Total topics: ${topicCount}`,
    `  Total matches: ${totalMatches}`,
    `  Total keywords tracked: ${totalKeywords}`,
    `  Unique keywords: ${keywordMap.size}`,
    ``,
    `Most active topics:`,
    ...mostActiveTopics.map((t, i) => `  ${i + 1}. "${t.topic}" - ${t.matchCount} match(es), ${t.keywordCount} keyword(s)`),
    ``,
    `Keyword coverage (top 10):`,
    ...keywordCoverage.slice(0, 10).map(k => `  - "${k.keyword}" used in ${k.topicCount} topic(s): ${k.topics.join(', ')}`)
  ];

  return {
    result: lines.join('\n'),
    metadata: {
      success: true,
      action: 'stats',
      totalTopics: topicCount,
      totalMatches,
      totalKeywords,
      uniqueKeywords: keywordMap.size,
      mostActiveTopics,
      keywordCoverage: keywordCoverage.slice(0, 10)
    }
  };
}

/**
 * Build a regex for keyword matching with word boundary support.
 *
 * @param {string} keyword - The keyword to match.
 * @param {boolean} caseSensitive - Whether matching is case-sensitive.
 * @returns {RegExp}
 */
function buildKeywordRegex(keyword, caseSensitive) {
  // Escape special regex characters
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = caseSensitive ? 'g' : 'gi';
  return new RegExp(`\\b${escaped}\\b`, flags);
}

/**
 * Extract contextual snippets (50 characters before and after) for matched keywords.
 *
 * @param {string} content - The full content being scanned.
 * @param {string[]} matchedKeywords - Keywords that matched.
 * @param {boolean} caseSensitive - Whether matching is case-sensitive.
 * @returns {string[]} Array of snippet strings.
 */
function extractSnippets(content, matchedKeywords, caseSensitive) {
  const snippets = [];
  const seen = new Set();

  for (const keyword of matchedKeywords) {
    const regex = buildKeywordRegex(keyword, caseSensitive);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const start = Math.max(0, match.index - 50);
      const end = Math.min(content.length, match.index + match[0].length + 50);
      const snippet = content.substring(start, end).replace(/\n/g, ' ');

      // Deduplicate similar snippets
      const snippetKey = `${start}-${end}`;
      if (!seen.has(snippetKey)) {
        seen.add(snippetKey);
        snippets.push(snippet);
      }

      // Prevent infinite loops for zero-length matches
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }

  return snippets;
}

/**
 * Exported for testing: reset the in-memory store.
 */
export function _resetForTesting() {
  topics.clear();
}
