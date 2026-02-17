import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  validate,
  meta,
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  validateQuery,
  validatePaperId,
  validateCategory,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

function mockContextTimeout() {
  return {
    providerClient: {
      request: async (_m, _p, _b, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleSearchPapers = {
  papers: [
    { id: '2301.12345', title: 'Deep Learning Methods', summary: 'A survey of deep learning', authors: ['Alice', 'Bob'], published: '2023-01-15', categories: ['cs.AI'] },
    { id: '2301.12346', title: 'Neural Networks', summary: 'Modern neural architectures', authors: ['Charlie'], published: '2023-02-20', categories: ['cs.LG'] },
  ],
};

const samplePaper = { id: '2301.12345', title: 'Deep Learning Methods', summary: 'A comprehensive survey', authors: ['Alice', 'Bob'], published: '2023-01-15', pdf_url: 'https://arxiv.org/pdf/2301.12345' };

const sampleRecent = {
  papers: [
    { id: '2312.00001', title: 'Recent Advances I', published: '2023-12-01' },
    { id: '2312.00002', title: 'Recent Advances II', published: '2023-12-02' },
  ],
};

const sampleCategories = {
  categories: [
    { id: 'cs.AI', name: 'Artificial Intelligence' },
    { id: 'cs.LG', name: 'Machine Learning' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('arxiv-api: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const r = await execute({ action: 'invalid' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_ACTION');
    assert.ok(r.result.includes('invalid'));
  });

  it('should reject missing action', async () => {
    const r = await execute({}, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const r = await execute(null, {});
    assert.equal(r.metadata.success, false);
  });

  it('should reject undefined params', async () => {
    const r = await execute(undefined, {});
    assert.equal(r.metadata.success, false);
  });

  it('should list valid actions in error message', async () => {
    const r = await execute({ action: 'bad' }, {});
    for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a));
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('arxiv-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail search_papers without client', async () => {
    const r = await execute({ action: 'search_papers', query: 'deep learning' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(r.metadata.error.retriable, false);
  });

  it('should fail get_paper without client', async () => {
    const r = await execute({ action: 'get_paper', paperId: '2301.12345' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_recent without client', async () => {
    const r = await execute({ action: 'list_recent', category: 'cs.AI' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_categories without client', async () => {
    const r = await execute({ action: 'get_categories' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. search_papers
// ---------------------------------------------------------------------------
describe('arxiv-api: search_papers', () => {
  beforeEach(() => {});

  it('should search papers successfully', async () => {
    const ctx = mockContext(sampleSearchPapers);
    const r = await execute({ action: 'search_papers', query: 'deep learning' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'search_papers');
    assert.equal(r.metadata.paperCount, 2);
    assert.ok(r.result.includes('Deep Learning Methods'));
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing query', async () => {
    const ctx = mockContext(sampleSearchPapers);
    const r = await execute({ action: 'search_papers' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string query', async () => {
    const ctx = mockContext(sampleSearchPapers);
    const r = await execute({ action: 'search_papers', query: 123 }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should handle empty results', async () => {
    const ctx = mockContext({ papers: [] });
    const r = await execute({ action: 'search_papers', query: 'xyznonexist' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.paperCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. get_paper
// ---------------------------------------------------------------------------
describe('arxiv-api: get_paper', () => {
  beforeEach(() => {});

  it('should get paper successfully', async () => {
    const ctx = mockContext(samplePaper);
    const r = await execute({ action: 'get_paper', paperId: '2301.12345' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_paper');
    assert.ok(r.result.includes('Deep Learning Methods'));
    assert.ok(r.result.includes('pdf'));
  });

  it('should reject missing paperId', async () => {
    const ctx = mockContext(samplePaper);
    const r = await execute({ action: 'get_paper' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string paperId', async () => {
    const ctx = mockContext(samplePaper);
    const r = await execute({ action: 'get_paper', paperId: 12345 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 5. list_recent
// ---------------------------------------------------------------------------
describe('arxiv-api: list_recent', () => {
  beforeEach(() => {});

  it('should list recent papers successfully', async () => {
    const ctx = mockContext(sampleRecent);
    const r = await execute({ action: 'list_recent', category: 'cs.AI' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'list_recent');
    assert.equal(r.metadata.category, 'cs.AI');
    assert.equal(r.metadata.paperCount, 2);
  });

  it('should reject missing category', async () => {
    const ctx = mockContext(sampleRecent);
    const r = await execute({ action: 'list_recent' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string category', async () => {
    const ctx = mockContext(sampleRecent);
    const r = await execute({ action: 'list_recent', category: 42 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 6. get_categories
// ---------------------------------------------------------------------------
describe('arxiv-api: get_categories', () => {
  beforeEach(() => {});

  it('should get categories successfully', async () => {
    const ctx = mockContext(sampleCategories);
    const r = await execute({ action: 'get_categories' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_categories');
    assert.equal(r.metadata.categoryCount, 2);
    assert.ok(r.result.includes('cs.AI'));
  });

  it('should handle empty categories', async () => {
    const ctx = mockContext({ categories: [] });
    const r = await execute({ action: 'get_categories' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.categoryCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout
// ---------------------------------------------------------------------------
describe('arxiv-api: timeout', () => {
  beforeEach(() => {});

  it('should timeout on search_papers', async () => {
    const r = await execute({ action: 'search_papers', query: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_paper', async () => {
    const r = await execute({ action: 'get_paper', paperId: '2301.12345' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on list_recent', async () => {
    const r = await execute({ action: 'list_recent', category: 'cs.AI' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on get_categories', async () => {
    const r = await execute({ action: 'get_categories' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 8. Network errors
// ---------------------------------------------------------------------------
describe('arxiv-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on failure', async () => {
    const r = await execute({ action: 'search_papers', query: 'test' }, mockContextError(new Error('Connection failed')));
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const r = await execute({ action: 'search_papers', query: 'test' }, mockContextError(new Error('Connection failed')));
    assert.ok(r.result.includes('Connection failed'));
  });
});

// ---------------------------------------------------------------------------
// 9. getClient
// ---------------------------------------------------------------------------
describe('arxiv-api: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('should fall back to gatewayClient', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('should return null for empty object', () => { assert.equal(getClient({}), null); });
  it('should return null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('should return null for null', () => { assert.equal(getClient(null), null); });
});

// ---------------------------------------------------------------------------
// 10. redactSensitive
// ---------------------------------------------------------------------------
describe('arxiv-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('should redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('should redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('should not alter clean strings', () => { assert.equal(redactSensitive('clean data'), 'clean data'); });
  it('should handle non-string', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// ---------------------------------------------------------------------------
// 11. resolveTimeout
// ---------------------------------------------------------------------------
describe('arxiv-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default for empty', () => { assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS); });
  it('should return default for undefined', () => { assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS); });
  it('should use configured value', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000); });
  it('should cap at max', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS); });
  it('should ignore 0', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS); });
  it('should ignore negative', () => { assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS); });
  it('should ignore non-number', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS); });
  it('DEFAULT=30000', () => { assert.equal(DEFAULT_TIMEOUT_MS, 30000); });
  it('MAX=120000', () => { assert.equal(MAX_TIMEOUT_MS, 120000); });
});

// ---------------------------------------------------------------------------
// 12. validate()
// ---------------------------------------------------------------------------
describe('arxiv-api: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('should reject missing action', () => { assert.equal(validate({}).valid, false); });
  it('should reject null', () => { assert.equal(validate(null).valid, false); });
  it('search_papers requires query', () => { assert.equal(validate({ action: 'search_papers' }).valid, false); assert.equal(validate({ action: 'search_papers', query: 'dl' }).valid, true); });
  it('get_paper requires paperId', () => { assert.equal(validate({ action: 'get_paper' }).valid, false); assert.equal(validate({ action: 'get_paper', paperId: '123' }).valid, true); });
  it('list_recent requires category', () => { assert.equal(validate({ action: 'list_recent' }).valid, false); assert.equal(validate({ action: 'list_recent', category: 'cs.AI' }).valid, true); });
  it('get_categories needs nothing', () => { assert.equal(validate({ action: 'get_categories' }).valid, true); });
});

// ---------------------------------------------------------------------------
// 13. meta export
// ---------------------------------------------------------------------------
describe('arxiv-api: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => { assert.equal(meta.name, 'arxiv-api'); });
  it('should have version', () => { assert.equal(meta.version, '1.0.0'); });
  it('should have description', () => { assert.ok(meta.description.includes('arXiv')); });
  it('should list all 4 actions', () => {
    assert.equal(meta.actions.length, 4);
    assert.ok(meta.actions.includes('search_papers'));
    assert.ok(meta.actions.includes('get_paper'));
    assert.ok(meta.actions.includes('list_recent'));
    assert.ok(meta.actions.includes('get_categories'));
  });
});

// ---------------------------------------------------------------------------
// 14. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('arxiv-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient absent', async () => {
    const ctx = { gatewayClient: { request: async () => sampleSearchPapers }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'search_papers', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 15. providerNotConfiguredError
// ---------------------------------------------------------------------------
describe('arxiv-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should have correct code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('should have retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('should have success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('should include Error in result', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// ---------------------------------------------------------------------------
// 16. constants
// ---------------------------------------------------------------------------
describe('arxiv-api: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, ['search_papers', 'get_paper', 'list_recent', 'get_categories']);
  });
});

// ---------------------------------------------------------------------------
// 17. request path verification
// ---------------------------------------------------------------------------
describe('arxiv-api: request path verification', () => {
  beforeEach(() => {});

  it('should call /search for search_papers', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleSearchPapers; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'search_papers', query: 'deep learning' }, ctx);
    assert.ok(calledPath.includes('/search?query='));
  });

  it('should call /paper/{paperId} for get_paper', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return samplePaper; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_paper', paperId: '2301.12345' }, ctx);
    assert.ok(calledPath.includes('/paper/2301.12345'));
  });

  it('should call /recent for list_recent', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleRecent; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'list_recent', category: 'cs.AI' }, ctx);
    assert.ok(calledPath.includes('/recent?category='));
  });

  it('should call /categories for get_categories', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleCategories; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_categories' }, ctx);
    assert.equal(calledPath, '/categories');
  });
});
