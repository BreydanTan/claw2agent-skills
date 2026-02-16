/**
 * Knowledge Base Skill Handler
 *
 * In-memory keyword-based knowledge store with TF-IDF-like scoring.
 * Entries consist of a key, content, and auto-extracted keywords.
 * Search ranks results by computing a relevance score based on
 * term frequency (TF) and inverse document frequency (IDF).
 */

/**
 * In-memory store for knowledge entries.
 * Key: entry key (string)
 * Value: { key, content, keywords[], addedAt, wordFrequency: Map<word, count> }
 */
const knowledgeStore = new Map();

/**
 * Common English stop words to exclude from keyword extraction.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for', 'of', 'and',
  'or', 'but', 'not', 'with', 'this', 'that', 'from', 'by', 'as', 'be', 'was',
  'were', 'been', 'are', 'am', 'has', 'had', 'have', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'if', 'then',
  'than', 'so', 'no', 'yes', 'up', 'out', 'about', 'into', 'over', 'after',
  'before', 'between', 'under', 'above', 'below', 'each', 'every', 'all', 'any',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'too', 'very', 'just', 'because', 'through', 'during', 'while', 'what', 'which',
  'who', 'whom', 'how', 'when', 'where', 'why', 'here', 'there', 'its', 'my',
  'your', 'his', 'her', 'our', 'their', 'we', 'you', 'he', 'she', 'they', 'me',
  'him', 'us', 'them', 'i'
]);

/**
 * Tokenize and normalize a text string into words.
 * Removes punctuation, converts to lowercase, filters stop words and short tokens.
 *
 * @param {string} text
 * @returns {string[]} Array of normalized words
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Build a word frequency map from an array of tokens.
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function buildWordFrequency(tokens) {
  const freq = new Map();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return freq;
}

/**
 * Extract keywords from content by selecting the most frequent meaningful terms.
 * @param {string} content
 * @param {number} maxKeywords - Maximum keywords to extract
 * @returns {string[]}
 */
function extractKeywords(content, maxKeywords = 20) {
  const tokens = tokenize(content);
  const freq = buildWordFrequency(tokens);

  // Sort by frequency descending, then alphabetically
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return sorted.slice(0, maxKeywords).map(([word]) => word);
}

/**
 * Compute Inverse Document Frequency for a term across all documents.
 * IDF = log(N / (1 + df)) where N = total docs, df = docs containing term
 *
 * @param {string} term
 * @returns {number}
 */
function computeIDF(term) {
  const totalDocs = knowledgeStore.size;
  if (totalDocs === 0) return 0;

  let docFrequency = 0;
  for (const entry of knowledgeStore.values()) {
    if (entry.wordFrequency.has(term)) {
      docFrequency++;
    }
  }

  return Math.log((totalDocs) / (1 + docFrequency)) + 1;
}

/**
 * Score a single entry against a search query using TF-IDF.
 *
 * @param {Object} entry - Knowledge entry
 * @param {string[]} queryTokens - Tokenized query words
 * @returns {number} Relevance score
 */
function scoreEntry(entry, queryTokens) {
  let score = 0;
  const totalTerms = [...entry.wordFrequency.values()].reduce((a, b) => a + b, 0) || 1;

  for (const queryTerm of queryTokens) {
    const termFreq = entry.wordFrequency.get(queryTerm) || 0;
    if (termFreq === 0) continue;

    // TF: normalized term frequency
    const tf = termFreq / totalTerms;

    // IDF: inverse document frequency
    const idf = computeIDF(queryTerm);

    score += tf * idf;

    // Bonus for exact keyword match (term is in the extracted keywords list)
    if (entry.keywords.includes(queryTerm)) {
      score += 0.1 * idf;
    }
  }

  return score;
}

/**
 * Add a knowledge entry to the store.
 */
function handleAdd(key, content) {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return {
      result: 'Error: key is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_KEY' }
    };
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return {
      result: 'Error: content is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_CONTENT' }
    };
  }

  const trimmedKey = key.trim();
  const isUpdate = knowledgeStore.has(trimmedKey);
  const tokens = tokenize(content);
  const keywords = extractKeywords(content);
  const wordFrequency = buildWordFrequency(tokens);

  const entry = {
    key: trimmedKey,
    content,
    keywords,
    wordFrequency,
    addedAt: new Date().toISOString(),
    tokenCount: tokens.length
  };

  knowledgeStore.set(trimmedKey, entry);

  return {
    result: `Knowledge entry "${trimmedKey}" ${isUpdate ? 'updated' : 'added'} successfully.\nKeywords: ${keywords.join(', ')}\nTokens indexed: ${tokens.length}`,
    metadata: {
      success: true,
      action: 'add',
      key: trimmedKey,
      isUpdate,
      keywordCount: keywords.length,
      tokenCount: tokens.length,
      keywords
    }
  };
}

/**
 * Search the knowledge base using TF-IDF scoring.
 */
function handleSearch(query) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      result: 'Error: query is required and must be a non-empty string.',
      metadata: { success: false, error: 'INVALID_QUERY' }
    };
  }

  if (knowledgeStore.size === 0) {
    return {
      result: 'The knowledge base is empty. Add entries first using the "add" action.',
      metadata: { success: true, action: 'search', resultCount: 0, results: [] }
    };
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return {
      result: 'Error: query contains no searchable terms after removing stop words.',
      metadata: { success: false, error: 'EMPTY_QUERY_TOKENS' }
    };
  }

  // Score all entries
  const scored = [];
  for (const entry of knowledgeStore.values()) {
    const score = scoreEntry(entry, queryTokens);
    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      result: `No matching entries found for query: "${query}".`,
      metadata: {
        success: true,
        action: 'search',
        query,
        queryTokens,
        resultCount: 0,
        results: []
      }
    };
  }

  // Return top 10 results
  const topResults = scored.slice(0, 10);

  const formatted = topResults
    .map((r, i) => {
      const snippet = r.entry.content.length > 200
        ? r.entry.content.substring(0, 200) + '...'
        : r.entry.content;
      return `${i + 1}. [${r.entry.key}] (score: ${r.score.toFixed(4)})\n   ${snippet}\n   Keywords: ${r.entry.keywords.slice(0, 8).join(', ')}`;
    })
    .join('\n\n');

  return {
    result: `Search results for "${query}" (${topResults.length} of ${scored.length} matches):\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'search',
      query,
      queryTokens,
      resultCount: scored.length,
      returnedCount: topResults.length,
      results: topResults.map(r => ({
        key: r.entry.key,
        score: r.score,
        contentPreview: r.entry.content.substring(0, 200),
        keywords: r.entry.keywords
      }))
    }
  };
}

/**
 * List all entries in the knowledge base.
 */
function handleList() {
  if (knowledgeStore.size === 0) {
    return {
      result: 'The knowledge base is empty.',
      metadata: { success: true, action: 'list', entryCount: 0, entries: [] }
    };
  }

  const entries = [];
  for (const entry of knowledgeStore.values()) {
    entries.push({
      key: entry.key,
      contentPreview: entry.content.length > 100
        ? entry.content.substring(0, 100) + '...'
        : entry.content,
      keywords: entry.keywords,
      tokenCount: entry.tokenCount,
      addedAt: entry.addedAt
    });
  }

  const formatted = entries
    .map((e, i) => `${i + 1}. [${e.key}] (${e.tokenCount} tokens, added ${e.addedAt})\n   ${e.contentPreview}\n   Keywords: ${e.keywords.slice(0, 8).join(', ')}`)
    .join('\n\n');

  return {
    result: `Knowledge base entries (${entries.length}):\n\n${formatted}`,
    metadata: {
      success: true,
      action: 'list',
      entryCount: entries.length,
      entries
    }
  };
}

/**
 * Delete an entry from the knowledge base by key.
 */
function handleDelete(key) {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return {
      result: 'Error: key is required for delete action.',
      metadata: { success: false, error: 'INVALID_KEY' }
    };
  }

  const trimmedKey = key.trim();

  if (!knowledgeStore.has(trimmedKey)) {
    return {
      result: `Error: No entry found with key "${trimmedKey}".`,
      metadata: { success: false, error: 'NOT_FOUND', key: trimmedKey }
    };
  }

  knowledgeStore.delete(trimmedKey);

  return {
    result: `Knowledge entry "${trimmedKey}" deleted successfully.`,
    metadata: {
      success: true,
      action: 'delete',
      key: trimmedKey,
      remainingEntries: knowledgeStore.size
    }
  };
}

/**
 * Execute a knowledge base operation.
 *
 * @param {Object} params
 * @param {string} params.action - One of: search, add, list, delete
 * @param {string} [params.query] - Search query (required for search)
 * @param {string} [params.content] - Content to store (required for add)
 * @param {string} [params.key] - Entry key (required for add/delete)
 * @param {Object} context - Execution context from the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { action, query, content, key } = params;

  const validActions = ['search', 'add', 'list', 'delete'];
  if (!action || !validActions.includes(action)) {
    return {
      result: `Error: Invalid action "${action}". Must be one of: ${validActions.join(', ')}`,
      metadata: { success: false, error: 'INVALID_ACTION' }
    };
  }

  switch (action) {
    case 'add':
      return handleAdd(key, content);
    case 'search':
      return handleSearch(query);
    case 'list':
      return handleList();
    case 'delete':
      return handleDelete(key);
    default:
      return {
        result: `Error: Unknown action "${action}".`,
        metadata: { success: false, error: 'UNKNOWN_ACTION' }
      };
  }
}
