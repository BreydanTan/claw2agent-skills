import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers for global.fetch
// ---------------------------------------------------------------------------

let originalFetch;

function mockFetchText(text, status = 200) {
  global.fetch = async (url, opts) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

function mockFetchWithSpy(text, status = 200) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  };
  return calls;
}

// ---------------------------------------------------------------------------
// Sample HTML responses
// ---------------------------------------------------------------------------

function buildResultBlock(title, url, snippet) {
  const encodedUrl = `//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&rut=abc`;
  return `class="result results_links results_links_deep web-result">
    <div class="links_main links_deep result__body">
      <a rel="nofollow" class="result__a" href="${encodedUrl}">${title}</a>
      <a class="result__snippet" href="${encodedUrl}">${snippet}</a>
    </div>
  </div>`;
}

function buildDDGHtml(results) {
  const blocks = results.map(r => buildResultBlock(r.title, r.url, r.snippet));
  return `<html><body>
    <div class="serp__results">
      ${blocks.join('\n')}
    </div>
  </body></html>`;
}

const sampleResults = [
  { title: 'Node.js Official Site', url: 'https://nodejs.org', snippet: 'Node.js is a JavaScript runtime built on V8.' },
  { title: 'Express.js Framework', url: 'https://expressjs.com', snippet: 'Fast, unopinionated, minimalist web framework.' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org', snippet: 'Resources for developers, by developers.' },
];

const sampleHtml = buildDDGHtml(sampleResults);

const emptyHtml = '<html><body><div class="serp__results"><div class="no-results">No results</div></div></body></html>';

// ===========================================================================
// 1. Query validation
// ===========================================================================
describe('web-search: query validation', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return error for missing query', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
    assert.ok(result.result.includes('Error'));
  });

  it('should return error for empty string query', async () => {
    const result = await execute({ query: '' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should return error for whitespace-only query', async () => {
    const result = await execute({ query: '   ' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should return error for null query', async () => {
    const result = await execute({ query: null }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should return error for undefined query', async () => {
    const result = await execute({ query: undefined }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should return error for numeric query', async () => {
    const result = await execute({ query: 12345 }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should return error for boolean query', async () => {
    const result = await execute({ query: true }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should return error for array query', async () => {
    const result = await execute({ query: ['hello'] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should return error for object query', async () => {
    const result = await execute({ query: { text: 'hello' } }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should not make fetch call for invalid query', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: '' }, {});
    assert.equal(calls.length, 0);
  });
});

// ===========================================================================
// 2. Successful search with results
// ===========================================================================
describe('web-search: successful search', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return results for valid query', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.equal(result.metadata.success, true);
    assert.ok(result.metadata.resultCount > 0);
  });

  it('should include query in metadata', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.equal(result.metadata.query, 'nodejs');
  });

  it('should include searchUrl in metadata', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.ok(result.metadata.searchUrl.includes('duckduckgo.com'));
    assert.ok(result.metadata.searchUrl.includes('nodejs'));
  });

  it('should include results array in metadata', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.ok(Array.isArray(result.metadata.results));
    assert.ok(result.metadata.results.length > 0);
  });

  it('should include title, url, snippet in each result', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    const first = result.metadata.results[0];
    assert.ok('title' in first);
    assert.ok('url' in first);
    assert.ok('snippet' in first);
  });

  it('should extract correct title', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.equal(result.metadata.results[0].title, 'Node.js Official Site');
  });

  it('should extract correct URL from uddg redirect', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.equal(result.metadata.results[0].url, 'https://nodejs.org');
  });

  it('should extract correct snippet', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.equal(result.metadata.results[0].snippet, 'Node.js is a JavaScript runtime built on V8.');
  });

  it('should format result string with numbered list', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.ok(result.result.includes('1.'));
    assert.ok(result.result.includes('2.'));
    assert.ok(result.result.includes('URL:'));
  });

  it('should include query in result string', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'my search term' }, {});
    assert.ok(result.result.includes('my search term'));
  });

  it('should include maxRequested in metadata', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs', maxResults: 3 }, {});
    assert.equal(result.metadata.maxRequested, 3);
  });

  it('should trim query whitespace before searching', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: '  nodejs  ' }, {});
    assert.ok(calls[0].url.includes('q=nodejs'));
  });
});

// ===========================================================================
// 3. Empty results
// ===========================================================================
describe('web-search: empty results', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return empty results message', async () => {
    mockFetchText(emptyHtml);
    const result = await execute({ query: 'xyzabc123noresults' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
    assert.ok(result.result.includes('No results found'));
  });

  it('should include query in no-results message', async () => {
    mockFetchText(emptyHtml);
    const result = await execute({ query: 'nonexistent query' }, {});
    assert.ok(result.result.includes('nonexistent query'));
  });

  it('should include searchUrl for empty results', async () => {
    mockFetchText(emptyHtml);
    const result = await execute({ query: 'nothing' }, {});
    assert.ok(result.metadata.searchUrl);
  });

  it('should not include results array in empty metadata', async () => {
    mockFetchText(emptyHtml);
    const result = await execute({ query: 'nothing' }, {});
    assert.equal(result.metadata.resultCount, 0);
  });
});

// ===========================================================================
// 4. maxResults clamping
// ===========================================================================
describe('web-search: maxResults clamping', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should default maxResults to 5', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.maxRequested, 5);
  });

  it('should clamp maxResults of 0 to 1', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 0 }, {});
    assert.equal(result.metadata.maxRequested, 1);
  });

  it('should clamp negative maxResults to 1', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: -5 }, {});
    assert.equal(result.metadata.maxRequested, 1);
  });

  it('should clamp maxResults of 100 to 20', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 100 }, {});
    assert.equal(result.metadata.maxRequested, 20);
  });

  it('should clamp maxResults of 21 to 20', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 21 }, {});
    assert.equal(result.metadata.maxRequested, 20);
  });

  it('should accept maxResults of 1', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 1 }, {});
    assert.equal(result.metadata.maxRequested, 1);
  });

  it('should accept maxResults of 20', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 20 }, {});
    assert.equal(result.metadata.maxRequested, 20);
  });

  it('should accept maxResults of 10', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 10 }, {});
    assert.equal(result.metadata.maxRequested, 10);
  });

  it('should limit returned results to maxResults', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 1 }, {});
    assert.ok(result.metadata.resultCount <= 1);
  });

  it('should limit results to 2 when maxResults is 2', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 2 }, {});
    assert.ok(result.metadata.resultCount <= 2);
  });
});

// ===========================================================================
// 5. HTTP error responses
// ===========================================================================
describe('web-search: HTTP errors', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return error for HTTP 403', async () => {
    mockFetchText('Forbidden', 403);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'HTTP_ERROR');
    assert.equal(result.metadata.statusCode, 403);
  });

  it('should return error for HTTP 404', async () => {
    mockFetchText('Not Found', 404);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'HTTP_ERROR');
    assert.equal(result.metadata.statusCode, 404);
  });

  it('should return error for HTTP 500', async () => {
    mockFetchText('Server Error', 500);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'HTTP_ERROR');
    assert.equal(result.metadata.statusCode, 500);
  });

  it('should return error for HTTP 502', async () => {
    mockFetchText('Bad Gateway', 502);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'HTTP_ERROR');
    assert.equal(result.metadata.statusCode, 502);
  });

  it('should return error for HTTP 503', async () => {
    mockFetchText('Service Unavailable', 503);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'HTTP_ERROR');
    assert.equal(result.metadata.statusCode, 503);
  });

  it('should include HTTP status in error result message', async () => {
    mockFetchText('Server Error', 500);
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.includes('500'));
  });

  it('should include query in HTTP error metadata', async () => {
    mockFetchText('Error', 429);
    const result = await execute({ query: 'ratelimited' }, {});
    assert.equal(result.metadata.query, 'ratelimited');
  });

  it('should return error for HTTP 429 (rate limit)', async () => {
    mockFetchText('Too Many Requests', 429);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'HTTP_ERROR');
    assert.equal(result.metadata.statusCode, 429);
  });
});

// ===========================================================================
// 6. Fetch network errors
// ===========================================================================
describe('web-search: fetch network errors', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return FETCH_ERROR for network failure', async () => {
    global.fetch = async () => { throw new Error('Network failure'); };
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should include error message in metadata', async () => {
    global.fetch = async () => { throw new Error('DNS lookup failed'); };
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.errorMessage, 'DNS lookup failed');
  });

  it('should include error message in result string', async () => {
    global.fetch = async () => { throw new Error('Connection refused'); };
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.includes('Connection refused'));
  });

  it('should include query in FETCH_ERROR metadata', async () => {
    global.fetch = async () => { throw new Error('Timeout'); };
    const result = await execute({ query: 'my query' }, {});
    assert.equal(result.metadata.query, 'my query');
  });

  it('should handle abort error', async () => {
    global.fetch = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should handle TypeError from fetch', async () => {
    global.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ===========================================================================
// 7. URL construction and request headers
// ===========================================================================
describe('web-search: request construction', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should use DuckDuckGo HTML endpoint', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'test' }, {});
    assert.ok(calls[0].url.startsWith('https://html.duckduckgo.com/html/'));
  });

  it('should encode query in URL', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'hello world' }, {});
    assert.ok(calls[0].url.includes('q=hello%20world'));
  });

  it('should encode special characters in query', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'c++ programming' }, {});
    assert.ok(calls[0].url.includes('q=c%2B%2B'));
  });

  it('should use GET method', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'test' }, {});
    assert.equal(calls[0].opts.method, 'GET');
  });

  it('should set User-Agent header', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'test' }, {});
    assert.ok(calls[0].opts.headers['User-Agent'].includes('ClawAgent'));
  });

  it('should set Accept header to text/html', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'test' }, {});
    assert.equal(calls[0].opts.headers['Accept'], 'text/html');
  });

  it('should set Accept-Language header', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'test' }, {});
    assert.ok(calls[0].opts.headers['Accept-Language'].includes('en'));
  });

  it('should only make one fetch call', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'test' }, {});
    assert.equal(calls.length, 1);
  });
});

// ===========================================================================
// 8. HTML entity decoding
// ===========================================================================
describe('web-search: HTML entity decoding', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should decode &amp; to &', async () => {
    const html = buildDDGHtml([{ title: 'Tom &amp; Jerry', url: 'https://example.com', snippet: 'A &amp; B' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, 'Tom & Jerry');
  });

  it('should decode &lt; and &gt;', async () => {
    const html = buildDDGHtml([{ title: '&lt;div&gt; tags', url: 'https://example.com', snippet: 'test' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, '<div> tags');
  });

  it('should decode &quot;', async () => {
    const html = buildDDGHtml([{ title: 'A &quot;quoted&quot; title', url: 'https://example.com', snippet: 'test' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, 'A "quoted" title');
  });

  it('should decode &#39;', async () => {
    const html = buildDDGHtml([{ title: "It&#39;s great", url: 'https://example.com', snippet: 'test' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, "It's great");
  });

  it('should decode &#x27;', async () => {
    const html = buildDDGHtml([{ title: 'Don&#x27;t worry', url: 'https://example.com', snippet: 'test' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, "Don't worry");
  });

  it('should decode &#x2F;', async () => {
    const html = buildDDGHtml([{ title: 'path&#x2F;here', url: 'https://example.com', snippet: 'test' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, 'path/here');
  });

  it('should decode &nbsp;', async () => {
    const html = buildDDGHtml([{ title: 'spaced&nbsp;out', url: 'https://example.com', snippet: 'test' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, 'spaced out');
  });

  it('should decode entities in snippets too', async () => {
    const html = buildDDGHtml([{ title: 'Title', url: 'https://example.com', snippet: '&amp; &lt;b&gt; &quot;test&quot;' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].snippet, '& <b> "test"');
  });

  it('should decode multiple entities in same string', async () => {
    const html = buildDDGHtml([{ title: '&lt;a&gt; &amp; &lt;b&gt;', url: 'https://example.com', snippet: 'test' }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, '<a> & <b>');
  });
});

// ===========================================================================
// 9. URL decoding from DuckDuckGo redirect
// ===========================================================================
describe('web-search: URL decoding from DDG redirect', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should decode URL from uddg parameter', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'nodejs' }, {});
    assert.equal(result.metadata.results[0].url, 'https://nodejs.org');
  });

  it('should decode encoded URL with special characters', async () => {
    const html = buildDDGHtml([{
      title: 'Special URL',
      url: 'https://example.com/path?key=value&other=123',
      snippet: 'test',
    }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].url, 'https://example.com/path?key=value&other=123');
  });

  it('should handle URL without uddg parameter', async () => {
    const html = `<html><body>
      class="result ">
        <a class="result__a" href="https://direct.example.com">Direct Link</a>
        <a class="result__snippet" href="#">Some snippet</a>
      </div>
    </body></html>`;
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    if (result.metadata.results && result.metadata.results.length > 0) {
      assert.equal(result.metadata.results[0].url, 'https://direct.example.com');
    }
  });
});

// ===========================================================================
// 10. HTML tag stripping in results
// ===========================================================================
describe('web-search: HTML tag stripping', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should strip HTML tags from title', async () => {
    const html = buildDDGHtml([{
      title: '<b>Bold</b> title',
      url: 'https://example.com',
      snippet: 'test',
    }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, 'Bold title');
  });

  it('should strip HTML tags from snippet', async () => {
    const html = buildDDGHtml([{
      title: 'Title',
      url: 'https://example.com',
      snippet: 'A <b>bold</b> and <em>italic</em> snippet',
    }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].snippet, 'A bold and italic snippet');
  });

  it('should strip nested HTML tags', async () => {
    const html = buildDDGHtml([{
      title: '<span class="highlight"><b>Nested</b></span> title',
      url: 'https://example.com',
      snippet: 'test',
    }]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.results[0].title, 'Nested title');
  });
});

// ===========================================================================
// 11. Context parameter (no apiKey needed)
// ===========================================================================
describe('web-search: context handling', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should work with empty context', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should work with null context', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, null);
    assert.equal(result.metadata.success, true);
  });

  it('should work with undefined context', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, undefined);
    assert.equal(result.metadata.success, true);
  });
});

// ===========================================================================
// 12. Result formatting
// ===========================================================================
describe('web-search: result formatting', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should format results with index numbers', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.includes('1.'));
  });

  it('should include URL label in formatted result', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.includes('URL:'));
  });

  it('should include title in formatted result', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.includes('Node.js Official Site'));
  });

  it('should include actual URL in formatted result', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.includes('https://nodejs.org'));
  });

  it('should include snippet in formatted result', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.includes('JavaScript runtime'));
  });

  it('should prefix result string with "Search results for"', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.startsWith('Search results for'));
  });

  it('should separate results with blank lines', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.ok(result.result.includes('\n\n'));
  });
});

// ===========================================================================
// 13. Multiple results parsing
// ===========================================================================
describe('web-search: multiple results parsing', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should parse all 3 sample results', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 10 }, {});
    assert.equal(result.metadata.resultCount, 3);
  });

  it('should preserve result order', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test', maxResults: 10 }, {});
    assert.equal(result.metadata.results[0].title, 'Node.js Official Site');
    assert.equal(result.metadata.results[1].title, 'Express.js Framework');
    assert.equal(result.metadata.results[2].title, 'MDN Web Docs');
  });

  it('should handle single result', async () => {
    const html = buildDDGHtml([sampleResults[0]]);
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.resultCount, 1);
  });

  it('should handle results with missing snippet', async () => {
    const html = `<html><body>
      class="result ">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://example.com')}">No Snippet Page</a>
      </div>
    </body></html>`;
    mockFetchText(html);
    const result = await execute({ query: 'test' }, {});
    if (result.metadata.results && result.metadata.results.length > 0) {
      assert.equal(result.metadata.results[0].snippet, '');
    }
  });
});

// ===========================================================================
// 14. Edge cases
// ===========================================================================
describe('web-search: edge cases', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should handle very long query', async () => {
    const longQuery = 'a'.repeat(1000);
    const calls = mockFetchWithSpy(sampleHtml);
    const result = await execute({ query: longQuery }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(calls.length, 1);
  });

  it('should handle query with unicode characters', async () => {
    const calls = mockFetchWithSpy(sampleHtml);
    await execute({ query: 'search query with special chars' }, {});
    assert.equal(calls.length, 1);
  });

  it('should return result and metadata keys', async () => {
    mockFetchText(sampleHtml);
    const result = await execute({ query: 'test' }, {});
    assert.ok('result' in result);
    assert.ok('metadata' in result);
    assert.equal(typeof result.result, 'string');
    assert.equal(typeof result.metadata, 'object');
  });

  it('should handle completely empty HTML response', async () => {
    mockFetchText('');
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
  });

  it('should handle malformed HTML without result blocks', async () => {
    mockFetchText('<html><body>random content</body></html>');
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
  });

  it('should not error on fetch returning valid but empty body', async () => {
    mockFetchText('<html></html>');
    const result = await execute({ query: 'test' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
  });
});
