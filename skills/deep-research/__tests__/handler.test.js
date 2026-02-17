import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

/**
 * Build a DuckDuckGo HTML result block for a single search result.
 */
function buildResultHtml(url, title, snippet) {
  return `<a class="result__a" href="${url}">${title}</a>` +
    `<a class="result__snippet">${snippet}</a>`;
}

/**
 * Build a full DuckDuckGo HTML response with multiple results.
 */
function buildSearchHtml(results) {
  return '<html><body>' +
    results.map(r => buildResultHtml(r.url, r.title, r.snippet)).join('\n') +
    '</body></html>';
}

/**
 * Create a mock fetch that returns the same HTML for every call.
 */
function mockFetchWithHtml(html) {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => html,
  });
}

/**
 * Create a mock fetch that returns different HTML for sequential calls.
 */
function mockFetchSequential(htmlArray) {
  let callIndex = 0;
  global.fetch = async () => {
    const html = htmlArray[callIndex] || htmlArray[htmlArray.length - 1];
    callIndex++;
    return { ok: true, status: 200, text: async () => html };
  };
}

/**
 * Create a mock fetch that tracks calls and returns HTML.
 */
function mockFetchWithSpy(html) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => html };
  };
  return calls;
}

/**
 * Create a mock fetch that always rejects.
 */
function mockFetchError(message) {
  global.fetch = async () => { throw new Error(message); };
}

/**
 * Create a mock fetch that returns a non-ok response.
 */
function mockFetchHttpError(status) {
  global.fetch = async () => ({
    ok: false,
    status,
    text: async () => 'Error page',
  });
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleResults = [
  { url: 'https://example.com/1', title: 'Result One', snippet: 'This is a long snippet about the first result with enough text to pass filters.' },
  { url: 'https://example.com/2', title: 'Result Two', snippet: 'This is a long snippet about the second result with enough text to pass filters.' },
  { url: 'https://example.com/3', title: 'Result Three', snippet: 'This is a long snippet about the third result with enough text to pass filters.' },
];

const sampleHtml = buildSearchHtml(sampleResults);
const emptyHtml = '<html><body>No results found</body></html>';

// ---------------------------------------------------------------------------
// 1. Parameter validation - topic
// ---------------------------------------------------------------------------
describe('deep-research: topic validation', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should throw if topic is missing', async () => {
    await assert.rejects(() => execute({}, {}), { message: /topic is required/i });
  });

  it('should throw if topic is undefined', async () => {
    await assert.rejects(() => execute({ topic: undefined }, {}), { message: /topic is required/i });
  });

  it('should throw if topic is null', async () => {
    await assert.rejects(() => execute({ topic: null }, {}), { message: /topic is required/i });
  });

  it('should throw if topic is empty string', async () => {
    await assert.rejects(() => execute({ topic: '' }, {}), { message: /topic is required/i });
  });

  it('should throw if topic is whitespace only', async () => {
    await assert.rejects(() => execute({ topic: '   ' }, {}), { message: /topic is required/i });
  });

  it('should throw if topic is tabs and newlines only', async () => {
    await assert.rejects(() => execute({ topic: '\t\n\r' }, {}), { message: /topic is required/i });
  });

  it('should accept a valid topic string', async () => {
    const result = await execute({ topic: 'artificial intelligence' }, {});
    assert.ok(result.result);
    assert.ok(result.metadata);
  });

  it('should accept a single character topic', async () => {
    const result = await execute({ topic: 'x' }, {});
    assert.ok(result.result.includes('x'));
  });

  it('should accept a very long topic string', async () => {
    const longTopic = 'a'.repeat(500);
    const result = await execute({ topic: longTopic }, {});
    assert.ok(result.result);
  });

  it('should accept topic with special characters', async () => {
    const result = await execute({ topic: 'C++ vs C# performance & optimization' }, {});
    assert.ok(result.result);
  });

  it('should pass when params has no depth (defaults)', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.equal(result.metadata.depth, 'standard');
  });
});

// ---------------------------------------------------------------------------
// 2. Depth parameter
// ---------------------------------------------------------------------------
describe('deep-research: depth parameter', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should default depth to "standard"', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.equal(result.metadata.depth, 'standard');
  });

  it('should accept depth "quick"', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.depth, 'quick');
  });

  it('should accept depth "standard"', async () => {
    const result = await execute({ topic: 'test', depth: 'standard' }, {});
    assert.equal(result.metadata.depth, 'standard');
  });

  it('should accept depth "deep"', async () => {
    const result = await execute({ topic: 'test', depth: 'deep' }, {});
    assert.equal(result.metadata.depth, 'deep');
  });

  it('should generate 3 queries for quick depth', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.queryCount, 3);
    assert.equal(result.metadata.queries.length, 3);
  });

  it('should generate 4 queries for standard depth', async () => {
    const result = await execute({ topic: 'test', depth: 'standard' }, {});
    assert.equal(result.metadata.queryCount, 4);
    assert.equal(result.metadata.queries.length, 4);
  });

  it('should generate 5 queries for deep depth', async () => {
    const result = await execute({ topic: 'test', depth: 'deep' }, {});
    assert.equal(result.metadata.queryCount, 5);
    assert.equal(result.metadata.queries.length, 5);
  });

  it('should default to 4 queries for unknown depth', async () => {
    const result = await execute({ topic: 'test', depth: 'unknown' }, {});
    assert.equal(result.metadata.queryCount, 4);
  });

  it('should include the raw topic as the first query', async () => {
    const result = await execute({ topic: 'machine learning' }, {});
    assert.equal(result.metadata.queries[0], 'machine learning');
  });

  it('should include overview query for standard depth', async () => {
    const result = await execute({ topic: 'quantum computing', depth: 'standard' }, {});
    assert.ok(result.metadata.queries.some(q => q.includes('overview explanation')));
  });

  it('should include latest developments query for deep depth', async () => {
    const result = await execute({ topic: 'AI', depth: 'deep' }, {});
    assert.ok(result.metadata.queries.some(q => q.includes('latest developments')));
  });

  it('should include pros cons query for deep depth', async () => {
    const result = await execute({ topic: 'AI', depth: 'deep' }, {});
    assert.ok(result.metadata.queries.some(q => q.includes('pros cons analysis')));
  });

  it('should include expert opinion query for deep depth', async () => {
    const result = await execute({ topic: 'AI', depth: 'deep' }, {});
    assert.ok(result.metadata.queries.some(q => q.includes('expert opinion research')));
  });
});

// ---------------------------------------------------------------------------
// 3. Return value structure
// ---------------------------------------------------------------------------
describe('deep-research: return value structure', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should return an object with result and metadata', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(typeof result.result === 'string');
    assert.ok(typeof result.metadata === 'object');
  });

  it('should include queryCount in metadata', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(typeof result.metadata.queryCount === 'number');
  });

  it('should include sourceCount in metadata', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(typeof result.metadata.sourceCount === 'number');
  });

  it('should include depth in metadata', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(typeof result.metadata.depth === 'string');
  });

  it('should include queries array in metadata', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(Array.isArray(result.metadata.queries));
  });

  it('should have result as a non-empty string', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.length > 0);
  });
});

// ---------------------------------------------------------------------------
// 4. Report format
// ---------------------------------------------------------------------------
describe('deep-research: report format', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should include Research Report header with topic', async () => {
    const result = await execute({ topic: 'blockchain' }, {});
    assert.ok(result.result.includes('# Research Report: blockchain'));
  });

  it('should include depth in header', async () => {
    const result = await execute({ topic: 'test', depth: 'deep' }, {});
    assert.ok(result.result.includes('**Depth:** deep'));
  });

  it('should include query count in header', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('**Queries:** 3'));
  });

  it('should include Summary section', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.includes('## Summary'));
  });

  it('should include Key Findings section', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.includes('## Key Findings'));
  });

  it('should include Sources section', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.includes('## Sources'));
  });

  it('should include Search Queries Used section', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.includes('## Search Queries Used'));
  });

  it('should list sources as numbered markdown links', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.includes('1. ['));
    assert.ok(result.result.includes(']('));
  });

  it('should include query details with result counts', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.includes('results)'));
  });

  it('should show findings with title and snippet', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.includes('**Result One**'));
  });

  it('should include source count in header', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result.includes('**Sources found:**'));
  });
});

// ---------------------------------------------------------------------------
// 5. Fetch behavior and mocking
// ---------------------------------------------------------------------------
describe('deep-research: fetch behavior', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should POST to DuckDuckGo HTML endpoint', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(calls.length > 0);
    assert.equal(calls[0].url, 'https://html.duckduckgo.com/html/');
    assert.equal(calls[0].options.method, 'POST');
  });

  it('should send form-urlencoded content type', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  });

  it('should send a User-Agent header', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(calls[0].options.headers['User-Agent']);
    assert.ok(calls[0].options.headers['User-Agent'].includes('Mozilla'));
  });

  it('should send the query in the request body', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(calls[0].options.body.includes('q=test'));
  });

  it('should make one fetch call per query', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(calls.length, 3); // quick = 3 queries
  });

  it('should make 4 fetch calls for standard depth', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ topic: 'test', depth: 'standard' }, {});
    assert.equal(calls.length, 4);
  });

  it('should make 5 fetch calls for deep depth', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ topic: 'test', depth: 'deep' }, {});
    assert.equal(calls.length, 5);
  });
});

// ---------------------------------------------------------------------------
// 6. Fetch error handling
// ---------------------------------------------------------------------------
describe('deep-research: fetch error handling', () => {
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  it('should handle network error gracefully', async () => {
    mockFetchError('Network error');
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result);
    assert.ok(result.metadata);
  });

  it('should report zero sources on total failure', async () => {
    mockFetchError('Connection refused');
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.sourceCount, 0);
  });

  it('should still return all query count on error', async () => {
    mockFetchError('Timeout');
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.queryCount, 3);
  });

  it('should include error info in query details in the report', async () => {
    mockFetchError('Connection refused');
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('(error:'));
  });

  it('should handle HTTP error (non-ok response)', async () => {
    mockFetchHttpError(429);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('(error:'));
    assert.equal(result.metadata.sourceCount, 0);
  });

  it('should handle HTTP 500 error', async () => {
    mockFetchHttpError(500);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.sourceCount, 0);
    assert.ok(result.result.includes('error'));
  });

  it('should handle partial fetch failures', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      if (callCount === 2) throw new Error('One failed');
      return { ok: true, status: 200, text: async () => sampleHtml };
    };
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    // 2 out of 3 should succeed, 1 error
    assert.ok(result.metadata.sourceCount > 0);
    assert.ok(result.result.includes('(error:'));
  });

  it('should handle all fetches returning HTTP errors', async () => {
    mockFetchHttpError(403);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.sourceCount, 0);
  });

  it('should show no findings message when all fetches fail', async () => {
    mockFetchError('Total failure');
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('No findings available'));
  });

  it('should show no results message in summary when no sources', async () => {
    mockFetchError('Total failure');
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('No results were found'));
  });
});

// ---------------------------------------------------------------------------
// 7. Source deduplication
// ---------------------------------------------------------------------------
describe('deep-research: source deduplication', () => {
  beforeEach(() => {
    // Return same results for all queries to test dedup
    mockFetchWithHtml(sampleHtml);
  });

  it('should deduplicate sources by URL across queries', async () => {
    const result = await execute({ topic: 'test', depth: 'standard' }, {});
    // All 4 queries return the same 3 results; should deduplicate to 3
    assert.equal(result.metadata.sourceCount, 3);
  });

  it('should keep first occurrence when deduplicating', async () => {
    const html1 = buildSearchHtml([
      { url: 'https://example.com/dup', title: 'First Title', snippet: 'First snippet that is long enough to pass.' },
    ]);
    const html2 = buildSearchHtml([
      { url: 'https://example.com/dup', title: 'Second Title', snippet: 'Second snippet that is long enough to pass.' },
    ]);
    mockFetchSequential([html1, html2, html1]);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.sourceCount, 1);
    assert.ok(result.result.includes('First Title'));
  });

  it('should count unique sources across different queries', async () => {
    const html1 = buildSearchHtml([
      { url: 'https://a.com', title: 'A', snippet: 'Snippet A that is long enough.' },
    ]);
    const html2 = buildSearchHtml([
      { url: 'https://b.com', title: 'B', snippet: 'Snippet B that is long enough.' },
    ]);
    const html3 = buildSearchHtml([
      { url: 'https://a.com', title: 'A again', snippet: 'Duplicate snippet.' },
      { url: 'https://c.com', title: 'C', snippet: 'Snippet C that is long enough.' },
    ]);
    mockFetchSequential([html1, html2, html3]);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.sourceCount, 3); // a.com, b.com, c.com
  });

  it('should handle zero unique sources', async () => {
    mockFetchWithHtml(emptyHtml);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.sourceCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 8. HTML parsing
// ---------------------------------------------------------------------------
describe('deep-research: HTML parsing', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should parse titles from result blocks', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('Result One'));
    assert.ok(result.result.includes('Result Two'));
  });

  it('should parse URLs from result blocks', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('https://example.com/1'));
  });

  it('should parse snippets from result blocks', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('first result'));
  });

  it('should handle HTML with no result blocks', async () => {
    mockFetchWithHtml('<html><body><div>Nothing here</div></body></html>');
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.sourceCount, 0);
  });

  it('should strip HTML tags from titles', async () => {
    const html = buildSearchHtml([
      { url: 'https://example.com', title: '<b>Bold Title</b>', snippet: 'Snippet text for this result item.' },
    ]);
    mockFetchWithHtml(html);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('Bold Title'));
    assert.ok(!result.result.includes('<b>'));
  });

  it('should decode HTML entities in snippets', async () => {
    const html = buildSearchHtml([
      { url: 'https://example.com', title: 'Title', snippet: 'A &amp; B are &lt;great&gt; enough snippet text here.' },
    ]);
    mockFetchWithHtml(html);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('A & B'));
  });

  it('should handle result with missing snippet', async () => {
    const html = '<html><body>' +
      '<a class="result__a" href="https://example.com">Title Only</a>' +
      '</body></html>';
    mockFetchWithHtml(html);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('Title Only'));
  });

  it('should limit results to 8 per query', async () => {
    const results = [];
    for (let i = 0; i < 12; i++) {
      results.push({
        url: `https://example.com/${i}`,
        title: `Result ${i}`,
        snippet: `Snippet ${i} with enough text to pass filter checks.`,
      });
    }
    mockFetchWithHtml(buildSearchHtml(results));
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    // Should cap at 8 per query, but since all queries return same results, dedup to 8
    assert.ok(result.metadata.sourceCount <= 8);
  });
});

// ---------------------------------------------------------------------------
// 9. Empty results behavior
// ---------------------------------------------------------------------------
describe('deep-research: empty results', () => {
  beforeEach(() => {
    mockFetchWithHtml(emptyHtml);
  });

  it('should return zero sourceCount for empty results', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.equal(result.metadata.sourceCount, 0);
  });

  it('should show no results message in summary', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('No results were found'));
  });

  it('should show no findings message', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('No findings available'));
  });

  it('should show no sources found message', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('No sources found'));
  });

  it('should still include all report sections', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('## Summary'));
    assert.ok(result.result.includes('## Key Findings'));
    assert.ok(result.result.includes('## Sources'));
    assert.ok(result.result.includes('## Search Queries Used'));
  });

  it('should still list queries used even with empty results', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('"test"'));
  });
});

// ---------------------------------------------------------------------------
// 10. Summary section behavior
// ---------------------------------------------------------------------------
describe('deep-research: summary section', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should mention source count in summary when sources have long snippets', async () => {
    const result = await execute({ topic: 'quantum computing' }, {});
    assert.ok(result.result.includes('sources'));
    assert.ok(result.result.includes('quantum computing'));
  });

  it('should show limited snippets message when snippets are short', async () => {
    const html = buildSearchHtml([
      { url: 'https://example.com/1', title: 'Title', snippet: 'Short' },
      { url: 'https://example.com/2', title: 'Title2', snippet: 'Brief' },
    ]);
    mockFetchWithHtml(html);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('detailed snippets were limited'));
  });

  it('should join top snippets in summary', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    // sampleResults have long snippets; should be joined in summary
    assert.ok(result.result.includes('first result'));
  });
});

// ---------------------------------------------------------------------------
// 11. Key Findings section
// ---------------------------------------------------------------------------
describe('deep-research: key findings section', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should list findings with bold titles', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('**Result One**'));
  });

  it('should include snippet text in findings', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('first result'));
  });

  it('should show limited findings message when snippets are very short', async () => {
    const html = buildSearchHtml([
      { url: 'https://example.com/1', title: 'Title', snippet: 'Tiny' },
    ]);
    mockFetchWithHtml(html);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('no detailed snippets could be extracted'));
  });

  it('should limit findings to 10 items', async () => {
    const results = [];
    for (let i = 0; i < 15; i++) {
      results.push({
        url: `https://example.com/${i}`,
        title: `Finding ${i}`,
        snippet: `This is finding number ${i} with a long enough snippet text to be included.`,
      });
    }
    mockFetchWithHtml(buildSearchHtml(results));
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    const findingMatches = result.result.match(/\*\*Finding \d+\*\*/g) || [];
    assert.ok(findingMatches.length <= 10);
  });
});

// ---------------------------------------------------------------------------
// 12. Sources section
// ---------------------------------------------------------------------------
describe('deep-research: sources section', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should list sources as numbered markdown links', async () => {
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('1. [Result One](https://example.com/1)'));
  });

  it('should limit sources to 15 entries', async () => {
    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push({
        url: `https://example.com/unique${i}`,
        title: `Source ${i}`,
        snippet: `Snippet ${i} text here.`,
      });
    }
    mockFetchWithHtml(buildSearchHtml(results));
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    const sourceLines = result.result.split('\n').filter(l => /^\d+\. \[/.test(l));
    assert.ok(sourceLines.length <= 15);
  });
});

// ---------------------------------------------------------------------------
// 13. Context parameter
// ---------------------------------------------------------------------------
describe('deep-research: context parameter', () => {
  beforeEach(() => {
    mockFetchWithHtml(sampleHtml);
  });

  it('should work with empty context', async () => {
    const result = await execute({ topic: 'test' }, {});
    assert.ok(result.result);
  });

  it('should work with undefined context', async () => {
    const result = await execute({ topic: 'test' }, undefined);
    assert.ok(result.result);
  });

  it('should work with null context', async () => {
    const result = await execute({ topic: 'test' }, null);
    assert.ok(result.result);
  });

  it('should work with context containing extra properties', async () => {
    const result = await execute({ topic: 'test' }, { apiKey: 'test', extra: true });
    assert.ok(result.result);
  });
});

// ---------------------------------------------------------------------------
// 14. DuckDuckGo URL decoding
// ---------------------------------------------------------------------------
describe('deep-research: URL decoding', () => {
  beforeEach(() => {});

  it('should decode DuckDuckGo redirect URLs', async () => {
    const html = '<html><body>' +
      '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=abc">Title</a>' +
      '<a class="result__snippet">Snippet text that is long enough for filters.</a>' +
      '</body></html>';
    mockFetchWithHtml(html);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('https://example.com/page'));
  });

  it('should handle direct URLs without redirect', async () => {
    const html = buildSearchHtml([
      { url: 'https://direct.example.com/path', title: 'Direct', snippet: 'A long enough snippet for the filter.' },
    ]);
    mockFetchWithHtml(html);
    const result = await execute({ topic: 'test', depth: 'quick' }, {});
    assert.ok(result.result.includes('https://direct.example.com/path'));
  });
});

// ---------------------------------------------------------------------------
// 15. Restore global.fetch
// ---------------------------------------------------------------------------
describe('deep-research: cleanup', () => {
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  it('should have tests that restore global.fetch', () => {
    // This is a structural test to ensure cleanup
    assert.equal(global.fetch, originalFetch);
  });
});
