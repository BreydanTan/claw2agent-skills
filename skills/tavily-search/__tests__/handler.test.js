import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  redactSensitive,
  validateQuery,
  validateUrls,
  validateSearchDepth,
  validateBatchQueries,
  clampMaxResults,
  clampDays,
  sanitizeDomains,
  VALID_ACTIONS,
  VALID_SEARCH_DEPTHS,
  MAX_QUERY_LENGTH,
  MAX_BATCH_QUERIES,
  MAX_URLS,
  MAX_MAX_RESULTS,
  DEFAULT_MAX_RESULTS,
  DEFAULT_NEWS_DAYS,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse) {
  return {
    providerClient: {
      request: async (_method, _path, _body) => requestResponse,
    },
  };
}

/**
 * Build a mock context where .request() tracks calls and returns data.
 */
function mockContextWithSpy(requestResponse) {
  const calls = [];
  return {
    context: {
      providerClient: {
        request: async (method, path, body) => {
          calls.push({ method, path, body });
          return requestResponse;
        },
      },
    },
    calls,
  };
}

/**
 * Build a mock context where .request() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
  };
}

/**
 * Build a mock context using gatewayClient only.
 */
function mockGatewayContext(requestResponse) {
  return {
    gatewayClient: {
      request: async (_method, _path, _body) => requestResponse,
    },
  };
}

// ---------------------------------------------------------------------------
// Sample response data
// ---------------------------------------------------------------------------

const sampleSearchResponse = {
  results: [
    { title: 'Example Result 1', url: 'https://example.com/1', content: 'Content snippet 1', score: 0.95 },
    { title: 'Example Result 2', url: 'https://example.com/2', content: 'Content snippet 2', score: 0.88 },
    { title: 'Example Result 3', url: 'https://example.com/3', content: 'Content snippet 3', score: 0.80 },
  ],
  answer: 'This is a direct answer to the query.',
};

const sampleEmptyResponse = {
  results: [],
};

const sampleExtractResponse = {
  results: [
    { url: 'https://example.com/page1', title: 'Page 1', raw_content: 'Full content of page 1 extracted from the website.' },
    { url: 'https://example.com/page2', title: 'Page 2', content: 'Content of page 2.' },
  ],
};

const sampleNewsResponse = {
  results: [
    { title: 'Breaking News', url: 'https://news.example.com/1', content: 'News content', published_date: '2025-01-15' },
    { title: 'Tech Update', url: 'https://news.example.com/2', content: 'Tech news content', date: '2025-01-14' },
  ],
};

const sampleImagesResponse = {
  images: [
    { url: 'https://images.example.com/img1.jpg', description: 'A beautiful sunset' },
    { url: 'https://images.example.com/img2.jpg', description: 'Mountain landscape' },
  ],
};

const sampleAnswerResponse = {
  answer: 'The capital of France is Paris.',
  results: [
    { title: 'France - Wikipedia', url: 'https://en.wikipedia.org/wiki/France' },
    { title: 'Paris - Capital', url: 'https://example.com/paris' },
  ],
};

const sampleAcademicResponse = {
  results: [
    { title: 'Machine Learning Survey', url: 'https://arxiv.org/abs/1234', authors: 'Smith et al.', year: '2024', content: 'Abstract text here' },
    { title: 'Deep Learning Review', url: 'https://arxiv.org/abs/5678', authors: 'Jones et al.', content: 'Another abstract' },
  ],
};

const sampleCodeResponse = {
  results: [
    { title: 'React Hooks Tutorial', url: 'https://github.com/example/react-hooks', language: 'JavaScript', content: 'Code example' },
    { title: 'Python ML Library', url: 'https://github.com/example/ml-lib', language: 'Python', content: 'Python code' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('tavily-search: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const result = await execute({ action: 'invalid' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('invalid'));
  });

  it('should reject missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject undefined params', async () => {
    const result = await execute(undefined, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should list all valid actions in error message', async () => {
    const result = await execute({ action: 'nope' }, {});
    for (const action of VALID_ACTIONS) {
      assert.ok(result.result.includes(action), `Error should mention action "${action}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all external actions
// ---------------------------------------------------------------------------
describe('tavily-search: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail search without client', async () => {
    const result = await execute({ action: 'search', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
    assert.ok(result.result.includes('provider not configured'));
  });

  it('should fail extract without client', async () => {
    const result = await execute({ action: 'extract', urls: ['https://example.com'] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_news without client', async () => {
    const result = await execute({ action: 'search_news', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_images without client', async () => {
    const result = await execute({ action: 'search_images', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_answer without client', async () => {
    const result = await execute({ action: 'get_answer', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_academic without client', async () => {
    const result = await execute({ action: 'search_academic', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail search_code without client', async () => {
    const result = await execute({ action: 'search_code', query: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail batch_search without client', async () => {
    const result = await execute({ action: 'batch_search', queries: [{ query: 'test' }] }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. search action
// ---------------------------------------------------------------------------
describe('tavily-search: search', () => {
  beforeEach(() => {});

  it('should search successfully with default params', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search', query: 'test query' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.query, 'test query');
    assert.equal(result.metadata.resultCount, 3);
    assert.ok(result.result.includes('Example Result 1'));
    assert.ok(result.result.includes('test query'));
  });

  it('should pass searchDepth to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test', searchDepth: 'advanced' }, context);
    assert.equal(calls[0].body.search_depth, 'advanced');
  });

  it('should pass maxResults to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test', maxResults: 10 }, context);
    assert.equal(calls[0].body.max_results, 10);
  });

  it('should pass includeDomains to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test', includeDomains: ['example.com'] }, context);
    assert.deepEqual(calls[0].body.include_domains, ['example.com']);
  });

  it('should pass excludeDomains to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test', excludeDomains: ['spam.com'] }, context);
    assert.deepEqual(calls[0].body.exclude_domains, ['spam.com']);
  });

  it('should pass includeAnswer to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test', includeAnswer: true }, context);
    assert.equal(calls[0].body.include_answer, true);
  });

  it('should not include domains when arrays are empty', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test', includeDomains: [], excludeDomains: [] }, context);
    assert.equal(calls[0].body.include_domains, undefined);
    assert.equal(calls[0].body.exclude_domains, undefined);
  });

  it('should use default searchDepth of basic', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].body.search_depth, 'basic');
  });

  it('should handle empty results', async () => {
    const ctx = mockContext(sampleEmptyResponse);
    const result = await execute({ action: 'search', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
    assert.ok(result.result.includes('No results found'));
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should reject empty query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search', query: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should reject whitespace-only query', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search', query: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should reject invalid searchDepth', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search', query: 'test', searchDepth: 'ultra' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SEARCH_DEPTH');
  });

  it('should include answer in metadata when present', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search', query: 'test', includeAnswer: true }, ctx);
    assert.equal(result.metadata.answer, 'This is a direct answer to the query.');
  });

  it('should use POST method to /search endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/search');
  });

  it('should clamp maxResults to maximum', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test', maxResults: 100 }, context);
    assert.equal(calls[0].body.max_results, MAX_MAX_RESULTS);
  });

  it('should clamp maxResults to minimum', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test', maxResults: -5 }, context);
    assert.equal(calls[0].body.max_results, 1);
  });

  it('should handle network error', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
    assert.ok(result.result.includes('Connection refused'));
  });

  it('should return structured results in metadata', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.results.length, 3);
    assert.equal(result.metadata.results[0].title, 'Example Result 1');
    assert.equal(result.metadata.results[0].url, 'https://example.com/1');
    assert.equal(result.metadata.results[0].score, 0.95);
  });
});

// ---------------------------------------------------------------------------
// 4. extract action
// ---------------------------------------------------------------------------
describe('tavily-search: extract', () => {
  beforeEach(() => {});

  it('should extract content successfully', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const result = await execute({ action: 'extract', urls: ['https://example.com/page1', 'https://example.com/page2'] }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'extract');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.extractedCount, 2);
    assert.ok(result.result.includes('Page 1'));
    assert.ok(result.result.includes('Page 2'));
  });

  it('should pass extractDepth to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleExtractResponse);
    await execute({ action: 'extract', urls: ['https://example.com'], extractDepth: 'advanced' }, context);
    assert.equal(calls[0].body.extract_depth, 'advanced');
  });

  it('should use POST method to /extract endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleExtractResponse);
    await execute({ action: 'extract', urls: ['https://example.com'] }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/extract');
  });

  it('should reject missing urls', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const result = await execute({ action: 'extract' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URLS');
  });

  it('should reject empty urls array', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const result = await execute({ action: 'extract', urls: [] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URLS');
  });

  it('should reject non-array urls', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const result = await execute({ action: 'extract', urls: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URLS');
  });

  it('should reject invalid URL in array', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const result = await execute({ action: 'extract', urls: ['not-a-url'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URLS');
  });

  it('should reject ftp URLs', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const result = await execute({ action: 'extract', urls: ['ftp://example.com/file'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URLS');
  });

  it('should reject too many URLs', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const urls = Array.from({ length: MAX_URLS + 1 }, (_, i) => `https://example.com/${i}`);
    const result = await execute({ action: 'extract', urls }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URLS');
    assert.ok(result.result.includes('Too many URLs'));
  });

  it('should reject invalid extractDepth', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const result = await execute({ action: 'extract', urls: ['https://example.com'], extractDepth: 'deep' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_EXTRACT_DEPTH');
  });

  it('should handle empty extraction results', async () => {
    const ctx = mockContext({ results: [] });
    const result = await execute({ action: 'extract', urls: ['https://example.com'] }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.extractedCount, 0);
    assert.ok(result.result.includes('No content'));
  });

  it('should handle network error', async () => {
    const ctx = mockContextError(new Error('Timeout'));
    const result = await execute({ action: 'extract', urls: ['https://example.com'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should reject empty string URL in array', async () => {
    const ctx = mockContext(sampleExtractResponse);
    const result = await execute({ action: 'extract', urls: [''] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URLS');
  });

  it('should default extractDepth to basic', async () => {
    const { context, calls } = mockContextWithSpy(sampleExtractResponse);
    await execute({ action: 'extract', urls: ['https://example.com'] }, context);
    assert.equal(calls[0].body.extract_depth, 'basic');
  });
});

// ---------------------------------------------------------------------------
// 5. search_news action
// ---------------------------------------------------------------------------
describe('tavily-search: search_news', () => {
  beforeEach(() => {});

  it('should search news successfully', async () => {
    const ctx = mockContext(sampleNewsResponse);
    const result = await execute({ action: 'search_news', query: 'technology' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_news');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.resultCount, 2);
    assert.ok(result.result.includes('Breaking News'));
    assert.ok(result.result.includes('Tech Update'));
  });

  it('should pass days parameter to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleNewsResponse);
    await execute({ action: 'search_news', query: 'test', days: 3 }, context);
    assert.equal(calls[0].body.days, 3);
  });

  it('should default days to 7', async () => {
    const { context, calls } = mockContextWithSpy(sampleNewsResponse);
    await execute({ action: 'search_news', query: 'test' }, context);
    assert.equal(calls[0].body.days, DEFAULT_NEWS_DAYS);
  });

  it('should pass custom topic to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleNewsResponse);
    await execute({ action: 'search_news', query: 'test', topic: 'technology' }, context);
    assert.equal(calls[0].body.topic, 'technology');
  });

  it('should default topic to news', async () => {
    const { context, calls } = mockContextWithSpy(sampleNewsResponse);
    await execute({ action: 'search_news', query: 'test' }, context);
    assert.equal(calls[0].body.topic, 'news');
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleNewsResponse);
    const result = await execute({ action: 'search_news' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should handle empty news results', async () => {
    const ctx = mockContext(sampleEmptyResponse);
    const result = await execute({ action: 'search_news', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
    assert.ok(result.result.includes('No news found'));
  });

  it('should include published dates in results', async () => {
    const ctx = mockContext(sampleNewsResponse);
    const result = await execute({ action: 'search_news', query: 'test' }, ctx);
    assert.equal(result.metadata.results[0].publishedDate, '2025-01-15');
    assert.equal(result.metadata.results[1].publishedDate, '2025-01-14');
  });

  it('should clamp days to max 365', async () => {
    const { context, calls } = mockContextWithSpy(sampleNewsResponse);
    await execute({ action: 'search_news', query: 'test', days: 999 }, context);
    assert.equal(calls[0].body.days, 365);
  });

  it('should clamp days to min 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleNewsResponse);
    await execute({ action: 'search_news', query: 'test', days: -5 }, context);
    assert.equal(calls[0].body.days, 1);
  });

  it('should handle network error', async () => {
    const ctx = mockContextError(new Error('Server down'));
    const result = await execute({ action: 'search_news', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 6. search_images action
// ---------------------------------------------------------------------------
describe('tavily-search: search_images', () => {
  beforeEach(() => {});

  it('should search images successfully', async () => {
    const ctx = mockContext(sampleImagesResponse);
    const result = await execute({ action: 'search_images', query: 'sunset' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_images');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.resultCount, 2);
    assert.ok(result.result.includes('beautiful sunset'));
    assert.ok(result.result.includes('Mountain landscape'));
  });

  it('should pass search_type images to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleImagesResponse);
    await execute({ action: 'search_images', query: 'test' }, context);
    assert.equal(calls[0].body.search_type, 'images');
  });

  it('should handle results field instead of images field', async () => {
    const ctx = mockContext({ results: [{ url: 'https://img.example.com/1.jpg', title: 'Image 1' }] });
    const result = await execute({ action: 'search_images', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 1);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleImagesResponse);
    const result = await execute({ action: 'search_images' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should handle empty image results', async () => {
    const ctx = mockContext({ images: [] });
    const result = await execute({ action: 'search_images', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
    assert.ok(result.result.includes('No images found'));
  });

  it('should pass maxResults to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleImagesResponse);
    await execute({ action: 'search_images', query: 'test', maxResults: 3 }, context);
    assert.equal(calls[0].body.max_results, 3);
  });

  it('should handle network error', async () => {
    const ctx = mockContextError(new Error('API error'));
    const result = await execute({ action: 'search_images', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should include image URLs in metadata', async () => {
    const ctx = mockContext(sampleImagesResponse);
    const result = await execute({ action: 'search_images', query: 'test' }, ctx);
    assert.equal(result.metadata.images[0].url, 'https://images.example.com/img1.jpg');
    assert.equal(result.metadata.images[1].url, 'https://images.example.com/img2.jpg');
  });
});

// ---------------------------------------------------------------------------
// 7. get_answer action
// ---------------------------------------------------------------------------
describe('tavily-search: get_answer', () => {
  beforeEach(() => {});

  it('should get answer successfully', async () => {
    const ctx = mockContext(sampleAnswerResponse);
    const result = await execute({ action: 'get_answer', query: 'What is the capital of France?' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_answer');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.hasAnswer, true);
    assert.equal(result.metadata.answer, 'The capital of France is Paris.');
    assert.equal(result.metadata.sourceCount, 2);
    assert.ok(result.result.includes('capital of France is Paris'));
    assert.ok(result.result.includes('Sources:'));
  });

  it('should pass include_answer true to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleAnswerResponse);
    await execute({ action: 'get_answer', query: 'test' }, context);
    assert.equal(calls[0].body.include_answer, true);
  });

  it('should pass includeRawContent to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleAnswerResponse);
    await execute({ action: 'get_answer', query: 'test', includeRawContent: true }, context);
    assert.equal(calls[0].body.include_raw_content, true);
  });

  it('should pass searchDepth to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleAnswerResponse);
    await execute({ action: 'get_answer', query: 'test', searchDepth: 'advanced' }, context);
    assert.equal(calls[0].body.search_depth, 'advanced');
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleAnswerResponse);
    const result = await execute({ action: 'get_answer' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should reject invalid searchDepth', async () => {
    const ctx = mockContext(sampleAnswerResponse);
    const result = await execute({ action: 'get_answer', query: 'test', searchDepth: 'extreme' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SEARCH_DEPTH');
  });

  it('should handle no answer and no results', async () => {
    const ctx = mockContext({ answer: null, results: [] });
    const result = await execute({ action: 'get_answer', query: 'unanswerable' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.hasAnswer, false);
    assert.equal(result.metadata.sourceCount, 0);
    assert.ok(result.result.includes('No answer found'));
  });

  it('should handle answer without sources', async () => {
    const ctx = mockContext({ answer: 'Direct answer here.', results: [] });
    const result = await execute({ action: 'get_answer', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.hasAnswer, true);
    assert.equal(result.metadata.sourceCount, 0);
    assert.ok(result.result.includes('Direct answer here'));
  });

  it('should include source details in metadata', async () => {
    const ctx = mockContext(sampleAnswerResponse);
    const result = await execute({ action: 'get_answer', query: 'test' }, ctx);
    assert.equal(result.metadata.sources.length, 2);
    assert.equal(result.metadata.sources[0].title, 'France - Wikipedia');
    assert.equal(result.metadata.sources[0].url, 'https://en.wikipedia.org/wiki/France');
  });

  it('should handle network error', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({ action: 'get_answer', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 8. search_academic action
// ---------------------------------------------------------------------------
describe('tavily-search: search_academic', () => {
  beforeEach(() => {});

  it('should search academic papers successfully', async () => {
    const ctx = mockContext(sampleAcademicResponse);
    const result = await execute({ action: 'search_academic', query: 'machine learning' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_academic');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.resultCount, 2);
    assert.ok(result.result.includes('Machine Learning Survey'));
    assert.ok(result.result.includes('Smith et al.'));
  });

  it('should pass topic academic to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleAcademicResponse);
    await execute({ action: 'search_academic', query: 'test' }, context);
    assert.equal(calls[0].body.topic, 'academic');
  });

  it('should pass year filter to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleAcademicResponse);
    await execute({ action: 'search_academic', query: 'test', year: 2024 }, context);
    assert.equal(calls[0].body.year, 2024);
  });

  it('should not pass year when not provided', async () => {
    const { context, calls } = mockContextWithSpy(sampleAcademicResponse);
    await execute({ action: 'search_academic', query: 'test' }, context);
    assert.equal(calls[0].body.year, undefined);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleAcademicResponse);
    const result = await execute({ action: 'search_academic' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should handle empty academic results', async () => {
    const ctx = mockContext(sampleEmptyResponse);
    const result = await execute({ action: 'search_academic', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
    assert.ok(result.result.includes('No academic papers found'));
  });

  it('should pass maxResults to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleAcademicResponse);
    await execute({ action: 'search_academic', query: 'test', maxResults: 8 }, context);
    assert.equal(calls[0].body.max_results, 8);
  });

  it('should include author and year in results', async () => {
    const ctx = mockContext(sampleAcademicResponse);
    const result = await execute({ action: 'search_academic', query: 'test' }, ctx);
    assert.equal(result.metadata.results[0].authors, 'Smith et al.');
    assert.equal(result.metadata.results[0].year, '2024');
  });

  it('should handle network error', async () => {
    const ctx = mockContextError(new Error('Service unavailable'));
    const result = await execute({ action: 'search_academic', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should include year in metadata when provided', async () => {
    const ctx = mockContext(sampleAcademicResponse);
    const result = await execute({ action: 'search_academic', query: 'test', year: 2024 }, ctx);
    assert.equal(result.metadata.year, 2024);
  });

  it('should set year to null when not provided', async () => {
    const ctx = mockContext(sampleAcademicResponse);
    const result = await execute({ action: 'search_academic', query: 'test' }, ctx);
    assert.equal(result.metadata.year, null);
  });
});

// ---------------------------------------------------------------------------
// 9. search_code action
// ---------------------------------------------------------------------------
describe('tavily-search: search_code', () => {
  beforeEach(() => {});

  it('should search code successfully', async () => {
    const ctx = mockContext(sampleCodeResponse);
    const result = await execute({ action: 'search_code', query: 'react hooks' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'search_code');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.resultCount, 2);
    assert.ok(result.result.includes('React Hooks Tutorial'));
    assert.ok(result.result.includes('[JavaScript]'));
  });

  it('should pass topic code to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleCodeResponse);
    await execute({ action: 'search_code', query: 'test' }, context);
    assert.equal(calls[0].body.topic, 'code');
  });

  it('should pass language filter to client', async () => {
    const { context, calls } = mockContextWithSpy(sampleCodeResponse);
    await execute({ action: 'search_code', query: 'test', language: 'Python' }, context);
    assert.equal(calls[0].body.language, 'Python');
  });

  it('should not pass language when not provided', async () => {
    const { context, calls } = mockContextWithSpy(sampleCodeResponse);
    await execute({ action: 'search_code', query: 'test' }, context);
    assert.equal(calls[0].body.language, undefined);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleCodeResponse);
    const result = await execute({ action: 'search_code' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should handle empty code results', async () => {
    const ctx = mockContext(sampleEmptyResponse);
    const result = await execute({ action: 'search_code', query: 'nonexistent' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
    assert.ok(result.result.includes('No code results found'));
  });

  it('should include language in metadata', async () => {
    const ctx = mockContext(sampleCodeResponse);
    const result = await execute({ action: 'search_code', query: 'test', language: 'JavaScript' }, ctx);
    assert.equal(result.metadata.language, 'JavaScript');
  });

  it('should set language to null when not provided', async () => {
    const ctx = mockContext(sampleCodeResponse);
    const result = await execute({ action: 'search_code', query: 'test' }, ctx);
    assert.equal(result.metadata.language, null);
  });

  it('should include language in result entries', async () => {
    const ctx = mockContext(sampleCodeResponse);
    const result = await execute({ action: 'search_code', query: 'test' }, ctx);
    assert.equal(result.metadata.results[0].language, 'JavaScript');
    assert.equal(result.metadata.results[1].language, 'Python');
  });

  it('should handle network error', async () => {
    const ctx = mockContextError(new Error('API key expired'));
    const result = await execute({ action: 'search_code', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 10. batch_search action
// ---------------------------------------------------------------------------
describe('tavily-search: batch_search', () => {
  beforeEach(() => {});

  it('should perform batch search successfully', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({
      action: 'batch_search',
      queries: [
        { query: 'query one' },
        { query: 'query two', maxResults: 3 },
      ],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'batch_search');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.queryCount, 2);
    assert.equal(result.metadata.totalResults, 6); // 3 results per query
    assert.ok(result.result.includes('query one'));
    assert.ok(result.result.includes('query two'));
  });

  it('should reject missing queries', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'batch_search' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERIES');
  });

  it('should reject empty queries array', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'batch_search', queries: [] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERIES');
  });

  it('should reject non-array queries', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'batch_search', queries: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERIES');
  });

  it('should reject too many queries', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const queries = Array.from({ length: MAX_BATCH_QUERIES + 1 }, (_, i) => ({ query: `query ${i}` }));
    const result = await execute({ action: 'batch_search', queries }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERIES');
    assert.ok(result.result.includes('Too many queries'));
  });

  it('should reject query without query field', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'batch_search', queries: [{ maxResults: 5 }] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERIES');
  });

  it('should reject invalid query object', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const result = await execute({ action: 'batch_search', queries: [null] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERIES');
  });

  it('should handle partial failures in batch', async () => {
    let callCount = 0;
    const ctx = {
      providerClient: {
        request: async () => {
          callCount++;
          if (callCount === 2) throw new Error('Second query failed');
          return sampleSearchResponse;
        },
      },
    };
    const result = await execute({
      action: 'batch_search',
      queries: [
        { query: 'first query' },
        { query: 'failing query' },
        { query: 'third query' },
      ],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.errorCount, 1);
    assert.equal(result.metadata.queryCount, 3);
    assert.ok(result.metadata.errors.length === 1);
    assert.equal(result.metadata.errors[0].query, 'failing query');
  });

  it('should use POST /search for each query', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({
      action: 'batch_search',
      queries: [{ query: 'one' }, { query: 'two' }],
    }, context);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/search');
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].path, '/search');
    assert.equal(calls[0].body.query, 'one');
    assert.equal(calls[1].body.query, 'two');
  });

  it('should apply maxResults per query', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({
      action: 'batch_search',
      queries: [{ query: 'one', maxResults: 3 }, { query: 'two', maxResults: 7 }],
    }, context);
    assert.equal(calls[0].body.max_results, 3);
    assert.equal(calls[1].body.max_results, 7);
  });

  it('should handle all queries failing', async () => {
    const ctx = mockContextError(new Error('All failed'));
    const result = await execute({
      action: 'batch_search',
      queries: [{ query: 'one' }, { query: 'two' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.errorCount, 2);
    assert.equal(result.metadata.totalResults, 0);
  });

  it('should default maxResults per batch query', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({
      action: 'batch_search',
      queries: [{ query: 'test' }],
    }, context);
    assert.equal(calls[0].body.max_results, DEFAULT_MAX_RESULTS);
  });
});

// ---------------------------------------------------------------------------
// 11. getClient helper
// ---------------------------------------------------------------------------
describe('tavily-search: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient over gatewayClient', () => {
    const result = getClient({
      providerClient: { request: () => {} },
      gatewayClient: { request: () => {} },
    });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });

  it('should return null for null context', () => {
    assert.equal(getClient(null), null);
  });
});

// ---------------------------------------------------------------------------
// 12. redactSensitive
// ---------------------------------------------------------------------------
describe('tavily-search: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact Tavily API key patterns', () => {
    const input = 'Using tvly-ABCDEFGHIJKLMNOPQRSTUVWXYZab for auth';
    const output = redactSensitive(input);
    assert.ok(!output.includes('tvly-ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should not alter clean strings', () => {
    const input = 'Search results for query: test';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 13. validateQuery helper
// ---------------------------------------------------------------------------
describe('tavily-search: validateQuery', () => {
  beforeEach(() => {});

  it('should accept valid query', () => {
    const result = validateQuery('test query');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'test query');
  });

  it('should trim whitespace', () => {
    const result = validateQuery('  hello world  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'hello world');
  });

  it('should reject null query', () => {
    const result = validateQuery(null);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject undefined query', () => {
    const result = validateQuery(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject empty query', () => {
    const result = validateQuery('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only query', () => {
    const result = validateQuery('   ');
    assert.equal(result.valid, false);
  });

  it('should reject query exceeding max length', () => {
    const result = validateQuery('x'.repeat(MAX_QUERY_LENGTH + 1));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
  });

  it('should accept query at max length', () => {
    const result = validateQuery('x'.repeat(MAX_QUERY_LENGTH));
    assert.equal(result.valid, true);
  });

  it('should reject numeric query', () => {
    const result = validateQuery(42);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 14. validateUrls helper
// ---------------------------------------------------------------------------
describe('tavily-search: validateUrls', () => {
  beforeEach(() => {});

  it('should accept valid URL array', () => {
    const result = validateUrls(['https://example.com', 'http://test.org']);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized.length, 2);
  });

  it('should trim URL whitespace', () => {
    const result = validateUrls(['  https://example.com  ']);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized[0], 'https://example.com');
  });

  it('should reject null', () => {
    const result = validateUrls(null);
    assert.equal(result.valid, false);
  });

  it('should reject non-array', () => {
    const result = validateUrls('https://example.com');
    assert.equal(result.valid, false);
  });

  it('should reject empty array', () => {
    const result = validateUrls([]);
    assert.equal(result.valid, false);
  });

  it('should reject invalid URL', () => {
    const result = validateUrls(['not-a-url']);
    assert.equal(result.valid, false);
  });

  it('should reject ftp URL', () => {
    const result = validateUrls(['ftp://example.com/file']);
    assert.equal(result.valid, false);
  });

  it('should reject empty string URL', () => {
    const result = validateUrls(['']);
    assert.equal(result.valid, false);
  });

  it('should reject too many URLs', () => {
    const urls = Array.from({ length: MAX_URLS + 1 }, (_, i) => `https://example.com/${i}`);
    const result = validateUrls(urls);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Too many URLs'));
  });

  it('should accept exactly MAX_URLS', () => {
    const urls = Array.from({ length: MAX_URLS }, (_, i) => `https://example.com/${i}`);
    const result = validateUrls(urls);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized.length, MAX_URLS);
  });
});

// ---------------------------------------------------------------------------
// 15. validateSearchDepth helper
// ---------------------------------------------------------------------------
describe('tavily-search: validateSearchDepth', () => {
  beforeEach(() => {});

  it('should accept basic', () => {
    const result = validateSearchDepth('basic');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'basic');
  });

  it('should accept advanced', () => {
    const result = validateSearchDepth('advanced');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'advanced');
  });

  it('should default to basic for undefined', () => {
    const result = validateSearchDepth(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'basic');
  });

  it('should default to basic for null', () => {
    const result = validateSearchDepth(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'basic');
  });

  it('should reject invalid depth', () => {
    const result = validateSearchDepth('ultra');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('ultra'));
  });

  it('should reject number', () => {
    const result = validateSearchDepth(42);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateBatchQueries helper
// ---------------------------------------------------------------------------
describe('tavily-search: validateBatchQueries', () => {
  beforeEach(() => {});

  it('should accept valid batch queries', () => {
    const result = validateBatchQueries([{ query: 'one' }, { query: 'two', maxResults: 3 }]);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized.length, 2);
    assert.equal(result.sanitized[0].query, 'one');
    assert.equal(result.sanitized[1].maxResults, 3);
  });

  it('should default maxResults per query', () => {
    const result = validateBatchQueries([{ query: 'test' }]);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized[0].maxResults, DEFAULT_MAX_RESULTS);
  });

  it('should reject null', () => {
    const result = validateBatchQueries(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty array', () => {
    const result = validateBatchQueries([]);
    assert.equal(result.valid, false);
  });

  it('should reject too many queries', () => {
    const queries = Array.from({ length: MAX_BATCH_QUERIES + 1 }, (_, i) => ({ query: `q${i}` }));
    const result = validateBatchQueries(queries);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Too many queries'));
  });

  it('should reject null item in array', () => {
    const result = validateBatchQueries([null]);
    assert.equal(result.valid, false);
  });

  it('should reject item without query field', () => {
    const result = validateBatchQueries([{ maxResults: 5 }]);
    assert.equal(result.valid, false);
  });

  it('should reject empty query in item', () => {
    const result = validateBatchQueries([{ query: '' }]);
    assert.equal(result.valid, false);
  });

  it('should accept exactly MAX_BATCH_QUERIES', () => {
    const queries = Array.from({ length: MAX_BATCH_QUERIES }, (_, i) => ({ query: `q${i}` }));
    const result = validateBatchQueries(queries);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized.length, MAX_BATCH_QUERIES);
  });
});

// ---------------------------------------------------------------------------
// 17. clampMaxResults helper
// ---------------------------------------------------------------------------
describe('tavily-search: clampMaxResults', () => {
  beforeEach(() => {});

  it('should default to 5 for undefined', () => {
    assert.equal(clampMaxResults(undefined), DEFAULT_MAX_RESULTS);
  });

  it('should default to 5 for null', () => {
    assert.equal(clampMaxResults(null), DEFAULT_MAX_RESULTS);
  });

  it('should accept valid number', () => {
    assert.equal(clampMaxResults(10), 10);
  });

  it('should clamp to max', () => {
    assert.equal(clampMaxResults(100), MAX_MAX_RESULTS);
  });

  it('should clamp to min', () => {
    assert.equal(clampMaxResults(-5), 1);
  });

  it('should floor decimal values', () => {
    assert.equal(clampMaxResults(3.7), 3);
  });

  it('should default for NaN', () => {
    assert.equal(clampMaxResults('abc'), DEFAULT_MAX_RESULTS);
  });

  it('should default for Infinity', () => {
    assert.equal(clampMaxResults(Infinity), DEFAULT_MAX_RESULTS);
  });
});

// ---------------------------------------------------------------------------
// 18. clampDays helper
// ---------------------------------------------------------------------------
describe('tavily-search: clampDays', () => {
  beforeEach(() => {});

  it('should default to 7 for undefined', () => {
    assert.equal(clampDays(undefined), DEFAULT_NEWS_DAYS);
  });

  it('should default to 7 for null', () => {
    assert.equal(clampDays(null), DEFAULT_NEWS_DAYS);
  });

  it('should accept valid number', () => {
    assert.equal(clampDays(14), 14);
  });

  it('should clamp to max 365', () => {
    assert.equal(clampDays(999), 365);
  });

  it('should clamp to min 1', () => {
    assert.equal(clampDays(-10), 1);
  });

  it('should floor decimal values', () => {
    assert.equal(clampDays(3.9), 3);
  });

  it('should default for NaN', () => {
    assert.equal(clampDays('abc'), DEFAULT_NEWS_DAYS);
  });
});

// ---------------------------------------------------------------------------
// 19. sanitizeDomains helper
// ---------------------------------------------------------------------------
describe('tavily-search: sanitizeDomains', () => {
  beforeEach(() => {});

  it('should accept valid domain array', () => {
    const result = sanitizeDomains(['example.com', 'test.org']);
    assert.deepEqual(result, ['example.com', 'test.org']);
  });

  it('should trim domains', () => {
    const result = sanitizeDomains(['  example.com  ']);
    assert.deepEqual(result, ['example.com']);
  });

  it('should filter empty strings', () => {
    const result = sanitizeDomains(['example.com', '', '  ', 'test.org']);
    assert.deepEqual(result, ['example.com', 'test.org']);
  });

  it('should return undefined for non-array', () => {
    assert.equal(sanitizeDomains('example.com'), undefined);
    assert.equal(sanitizeDomains(null), undefined);
    assert.equal(sanitizeDomains(undefined), undefined);
  });

  it('should filter non-string items', () => {
    const result = sanitizeDomains(['example.com', 42, null, 'test.org']);
    assert.deepEqual(result, ['example.com', 'test.org']);
  });
});

// ---------------------------------------------------------------------------
// 20. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('tavily-search: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path, body) => {
          calledPath = path;
          return sampleSearchResponse;
        },
      },
    };
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/search');
  });

  it('should prefer providerClient over gatewayClient', async () => {
    let usedClient = null;
    const ctx = {
      providerClient: {
        request: async () => {
          usedClient = 'provider';
          return sampleSearchResponse;
        },
      },
      gatewayClient: {
        request: async () => {
          usedClient = 'gateway';
          return sampleSearchResponse;
        },
      },
    };
    await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(usedClient, 'provider');
  });
});

// ---------------------------------------------------------------------------
// 21. Endpoint routing (L1 compliance)
// ---------------------------------------------------------------------------
describe('tavily-search: endpoint routing', () => {
  beforeEach(() => {});

  it('should use POST /search for search action', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test' }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/search');
  });

  it('should use POST /extract for extract action', async () => {
    const { context, calls } = mockContextWithSpy(sampleExtractResponse);
    await execute({ action: 'extract', urls: ['https://example.com'] }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/extract');
  });

  it('should use POST /search for search_news action', async () => {
    const { context, calls } = mockContextWithSpy(sampleNewsResponse);
    await execute({ action: 'search_news', query: 'test' }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/search');
  });

  it('should use POST /search for search_images action', async () => {
    const { context, calls } = mockContextWithSpy(sampleImagesResponse);
    await execute({ action: 'search_images', query: 'test' }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/search');
  });

  it('should use POST /search for get_answer action', async () => {
    const { context, calls } = mockContextWithSpy(sampleAnswerResponse);
    await execute({ action: 'get_answer', query: 'test' }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/search');
  });

  it('should use POST /search for search_academic action', async () => {
    const { context, calls } = mockContextWithSpy(sampleAcademicResponse);
    await execute({ action: 'search_academic', query: 'test' }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/search');
  });

  it('should use POST /search for search_code action', async () => {
    const { context, calls } = mockContextWithSpy(sampleCodeResponse);
    await execute({ action: 'search_code', query: 'test' }, context);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/search');
  });

  it('should not contain hardcoded URLs in any endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: 'test' }, context);
    await execute({ action: 'search_news', query: 'test' }, context);
    await execute({ action: 'search_images', query: 'test' }, context);
    await execute({ action: 'get_answer', query: 'test' }, context);
    await execute({ action: 'search_academic', query: 'test' }, context);
    await execute({ action: 'search_code', query: 'test' }, context);

    for (const call of calls) {
      assert.ok(!call.path.includes('https://'), 'Path must not contain https://');
      assert.ok(!call.path.includes('api.tavily.com'), 'Path must not contain api.tavily.com');
    }
  });
});

// ---------------------------------------------------------------------------
// 22. Error handling and edge cases
// ---------------------------------------------------------------------------
describe('tavily-search: error handling', () => {
  beforeEach(() => {});

  it('should handle error with code property', async () => {
    const ctx = {
      providerClient: {
        request: async () => {
          const err = new Error('Rate limit exceeded');
          err.code = 'RATE_LIMITED';
          throw err;
        },
      },
    };
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'RATE_LIMITED');
  });

  it('should handle query with very long text up to limit', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const longQuery = 'a'.repeat(MAX_QUERY_LENGTH);
    const result = await execute({ action: 'search', query: longQuery }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should handle query exceeding max length', async () => {
    const ctx = mockContext(sampleSearchResponse);
    const longQuery = 'a'.repeat(MAX_QUERY_LENGTH + 1);
    const result = await execute({ action: 'search', query: longQuery }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUERY');
  });

  it('should handle response with missing results field', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
  });

  it('should handle response with null results', async () => {
    const ctx = mockContext({ results: null });
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.resultCount, 0);
  });

  it('should redact sensitive data in error messages', async () => {
    const ctx = {
      providerClient: {
        request: async () => {
          throw new Error('api_key: sk_secret_abc123 is invalid');
        },
      },
    };
    const result = await execute({ action: 'search', query: 'test' }, ctx);
    assert.ok(!result.result.includes('sk_secret_abc123'));
    assert.ok(result.result.includes('[REDACTED]'));
  });
});

// ---------------------------------------------------------------------------
// 23. Query trimming across actions
// ---------------------------------------------------------------------------
describe('tavily-search: query trimming', () => {
  beforeEach(() => {});

  it('should trim query in search', async () => {
    const { context, calls } = mockContextWithSpy(sampleSearchResponse);
    await execute({ action: 'search', query: '  hello world  ' }, context);
    assert.equal(calls[0].body.query, 'hello world');
  });

  it('should trim query in search_news', async () => {
    const { context, calls } = mockContextWithSpy(sampleNewsResponse);
    await execute({ action: 'search_news', query: '  news  ' }, context);
    assert.equal(calls[0].body.query, 'news');
  });

  it('should trim query in search_images', async () => {
    const { context, calls } = mockContextWithSpy(sampleImagesResponse);
    await execute({ action: 'search_images', query: '  cat  ' }, context);
    assert.equal(calls[0].body.query, 'cat');
  });

  it('should trim query in get_answer', async () => {
    const { context, calls } = mockContextWithSpy(sampleAnswerResponse);
    await execute({ action: 'get_answer', query: '  question  ' }, context);
    assert.equal(calls[0].body.query, 'question');
  });

  it('should trim query in search_academic', async () => {
    const { context, calls } = mockContextWithSpy(sampleAcademicResponse);
    await execute({ action: 'search_academic', query: '  paper  ' }, context);
    assert.equal(calls[0].body.query, 'paper');
  });

  it('should trim query in search_code', async () => {
    const { context, calls } = mockContextWithSpy(sampleCodeResponse);
    await execute({ action: 'search_code', query: '  code  ' }, context);
    assert.equal(calls[0].body.query, 'code');
  });
});
