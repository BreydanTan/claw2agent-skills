/**
 * Web Search Skill Handler
 *
 * Searches the web using DuckDuckGo's HTML interface.
 * Parses the returned HTML to extract result titles, URLs, and snippets.
 * No API key is required.
 */

/**
 * Parse DuckDuckGo HTML search results into structured data.
 * @param {string} html - Raw HTML from DuckDuckGo
 * @param {number} maxResults - Maximum number of results to extract
 * @returns {Array<{title: string, url: string, snippet: string}>}
 */
function parseResults(html, maxResults) {
  const results = [];

  // DuckDuckGo HTML results are wrapped in <div class="result ..."> blocks.
  // Each result contains:
  //   - <a class="result__a" href="...">Title</a>
  //   - <a class="result__snippet" ...>Snippet text</a>
  //   - <a class="result__url" href="...">Display URL</a>

  // Split by result blocks
  const resultBlocks = html.split(/class="result\s/g);

  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i];

    // Extract title and URL from result__a link
    const titleMatch = block.match(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;

    let url = titleMatch[1];
    let title = titleMatch[2].replace(/<[^>]*>/g, '').trim();

    // DuckDuckGo wraps URLs through a redirect; extract the actual URL
    const uddgMatch = url.match(/uddg=([^&]*)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }

    // Extract snippet
    let snippet = '';
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (snippetMatch) {
      snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    // Skip if we don't have meaningful data
    if (!title || !url) continue;

    // Decode HTML entities
    title = decodeHTMLEntities(title);
    snippet = decodeHTMLEntities(snippet);

    results.push({ title, url, snippet });
  }

  return results;
}

/**
 * Decode common HTML entities in a string.
 * @param {string} text
 * @returns {string}
 */
function decodeHTMLEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Execute a web search using DuckDuckGo.
 *
 * @param {Object} params
 * @param {string} params.query - The search query
 * @param {number} [params.maxResults=5] - Maximum results to return
 * @param {Object} context - Execution context provided by the runtime
 * @returns {Promise<{result: string, metadata: Object}>}
 */
export async function execute(params, context) {
  const { query, maxResults = 5 } = params;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      result: 'Error: A non-empty search query is required.',
      metadata: { success: false, error: 'INVALID_QUERY' }
    };
  }

  const clampedMax = Math.min(Math.max(1, maxResults), 20);
  const encodedQuery = encodeURIComponent(query.trim());
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClawAgent/1.0; +https://github.com/claw2agent)',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      return {
        result: `Error: DuckDuckGo returned HTTP ${response.status}.`,
        metadata: {
          success: false,
          error: 'HTTP_ERROR',
          statusCode: response.status,
          query
        }
      };
    }

    const html = await response.text();
    const results = parseResults(html, clampedMax);

    if (results.length === 0) {
      return {
        result: `No results found for query: "${query}".`,
        metadata: {
          success: true,
          query,
          resultCount: 0,
          searchUrl
        }
      };
    }

    // Format results as a readable string
    const formatted = results
      .map((r, idx) => `${idx + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
      .join('\n\n');

    return {
      result: `Search results for "${query}":\n\n${formatted}`,
      metadata: {
        success: true,
        query,
        resultCount: results.length,
        maxRequested: clampedMax,
        searchUrl,
        results
      }
    };
  } catch (error) {
    return {
      result: `Error performing web search: ${error.message}`,
      metadata: {
        success: false,
        error: 'FETCH_ERROR',
        errorMessage: error.message,
        query
      }
    };
  }
}
