/**
 * Deep Research Skill Handler
 *
 * Multi-step research using DuckDuckGo HTML search.
 * Generates queries, fetches results, and compiles a structured report.
 */

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/";

/**
 * Execute a deep research session.
 *
 * @param {object} params - The tool parameters.
 * @param {string} params.topic - The research topic or question.
 * @param {string} [params.depth="standard"] - Research depth: "quick" | "standard" | "deep".
 * @param {object} context - Execution context provided by the runtime.
 * @returns {Promise<{result: string, metadata: object}>}
 */
export async function execute(params, context) {
  const { topic, depth = "standard" } = params;

  if (!topic || topic.trim().length === 0) {
    throw new Error("A research topic is required.");
  }

  // Step 1: Generate search queries based on depth
  const queries = generateQueries(topic, depth);

  // Step 2: Fetch results for each query
  const allResults = [];
  for (const query of queries) {
    try {
      const results = await searchDuckDuckGo(query);
      allResults.push({ query, results });
    } catch (err) {
      allResults.push({ query, results: [], error: err.message });
    }
  }

  // Step 3: Deduplicate and compile findings
  const uniqueSources = deduplicateSources(allResults);
  const report = compileReport(topic, depth, allResults, uniqueSources);

  const totalSources = uniqueSources.length;
  const totalQueries = queries.length;

  return {
    result: report,
    metadata: {
      queryCount: totalQueries,
      sourceCount: totalSources,
      depth,
      queries,
    },
  };
}

/**
 * Generate search queries from the topic based on research depth.
 */
function generateQueries(topic, depth) {
  const baseQueries = [topic];

  // Add perspective-based queries
  const perspectives = [
    `${topic} overview explanation`,
    `${topic} latest developments 2025 2026`,
    `${topic} pros cons analysis`,
    `${topic} expert opinion research`,
  ];

  const depthLimits = {
    quick: 3,
    standard: 4,
    deep: 5,
  };

  const limit = depthLimits[depth] || 4;
  return [...baseQueries, ...perspectives].slice(0, limit);
}

/**
 * Search DuckDuckGo HTML and extract results.
 */
async function searchDuckDuckGo(query) {
  const formBody = new URLSearchParams({ q: query }).toString();

  const response = await fetch(DUCKDUCKGO_HTML_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: formBody,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with status ${response.status}`);
  }

  const html = await response.text();
  return parseSearchResults(html);
}

/**
 * Parse DuckDuckGo HTML results page to extract links, titles, and snippets.
 */
function parseSearchResults(html) {
  const results = [];

  // Match result blocks: each result has a link with class "result__a" and snippet with class "result__snippet"
  const resultBlockRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const titles = [];
  let match;

  while ((match = resultBlockRegex.exec(html)) !== null) {
    titles.push({
      url: decodeURIComponent(
        match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0]
      ),
      title: stripHtmlTags(match[2]).trim(),
    });
  }

  const snippets = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtmlTags(match[1]).trim());
  }

  for (let i = 0; i < titles.length; i++) {
    results.push({
      title: titles[i].title,
      url: titles[i].url,
      snippet: snippets[i] || "",
    });
  }

  return results.slice(0, 8); // Limit results per query
}

/**
 * Strip HTML tags from a string.
 */
function stripHtmlTags(str) {
  return str.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
}

/**
 * Deduplicate sources across all query results by URL.
 */
function deduplicateSources(allResults) {
  const seen = new Map();

  for (const { results } of allResults) {
    for (const result of results) {
      if (result.url && !seen.has(result.url)) {
        seen.set(result.url, result);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Compile all results into a structured research report.
 */
function compileReport(topic, depth, allResults, uniqueSources) {
  const sections = [];

  // Header
  sections.push(`# Research Report: ${topic}`);
  sections.push(`**Depth:** ${depth} | **Queries:** ${allResults.length} | **Sources found:** ${uniqueSources.length}`);
  sections.push("");

  // Summary
  sections.push("## Summary");
  if (uniqueSources.length === 0) {
    sections.push(
      "No results were found for this research topic. Try rephrasing the topic or using different keywords."
    );
  } else {
    const topSnippets = uniqueSources
      .filter((s) => s.snippet && s.snippet.length > 20)
      .slice(0, 5)
      .map((s) => s.snippet);

    if (topSnippets.length > 0) {
      sections.push(
        `Based on ${uniqueSources.length} sources, here is what was found about "${topic}":`
      );
      sections.push("");
      sections.push(topSnippets.join(" ").slice(0, 1500));
    } else {
      sections.push(
        `Found ${uniqueSources.length} sources related to "${topic}" but detailed snippets were limited.`
      );
    }
  }
  sections.push("");

  // Key Findings
  sections.push("## Key Findings");
  if (uniqueSources.length === 0) {
    sections.push("- No findings available.");
  } else {
    const findings = uniqueSources
      .filter((s) => s.snippet && s.snippet.length > 10)
      .slice(0, 10);

    for (const finding of findings) {
      sections.push(`- **${finding.title}**: ${finding.snippet}`);
    }

    if (findings.length === 0) {
      sections.push(
        "- Relevant sources were found, but no detailed snippets could be extracted."
      );
    }
  }
  sections.push("");

  // Sources
  sections.push("## Sources");
  if (uniqueSources.length === 0) {
    sections.push("No sources found.");
  } else {
    for (let i = 0; i < Math.min(uniqueSources.length, 15); i++) {
      const src = uniqueSources[i];
      sections.push(`${i + 1}. [${src.title}](${src.url})`);
    }
  }
  sections.push("");

  // Query Details
  sections.push("## Search Queries Used");
  for (const { query, results, error } of allResults) {
    const status = error
      ? `(error: ${error})`
      : `(${results.length} results)`;
    sections.push(`- "${query}" ${status}`);
  }

  return sections.join("\n");
}
