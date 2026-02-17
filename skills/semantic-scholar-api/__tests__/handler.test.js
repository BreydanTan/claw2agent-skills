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

const sampleSearch = { data: [{ paperId: 'abc123', title: 'Attention Is All You Need', abstract: 'Transformer architecture', year: 2017, citationCount: 100000 }] };
const samplePaper = { paperId: 'abc123', title: 'Attention Is All You Need', abstract: 'The dominant model...', authors: [{ name: 'Vaswani' }], year: 2017, citationCount: 100000, url: 'https://semanticscholar.org/paper/abc123' };
const sampleCitations = { data: [{ citingPaper: { paperId: 'def456', title: 'BERT' } }, { citingPaper: { paperId: 'ghi789', title: 'GPT-2' } }] };
const sampleReferences = { data: [{ citedPaper: { paperId: 'jkl012', title: 'Sequence to Sequence' } }] };

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const r = await execute({ action: 'invalid' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });

  it('should reject missing action', async () => {
    const r = await execute({}, {});
    assert.equal(r.metadata.success, false);
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
describe('semantic-scholar-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail search_papers without client', async () => {
    const r = await execute({ action: 'search_papers', query: 'transformers' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_paper without client', async () => {
    const r = await execute({ action: 'get_paper', paperId: 'abc123' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_citations without client', async () => {
    const r = await execute({ action: 'get_citations', paperId: 'abc123' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_references without client', async () => {
    const r = await execute({ action: 'get_references', paperId: 'abc123' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. search_papers
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: search_papers', () => {
  beforeEach(() => {});

  it('should search papers successfully', async () => {
    const ctx = mockContext(sampleSearch);
    const r = await execute({ action: 'search_papers', query: 'transformers' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'search_papers');
    assert.equal(r.metadata.paperCount, 1);
    assert.ok(r.result.includes('Attention Is All You Need'));
  });

  it('should reject missing query', async () => {
    const r = await execute({ action: 'search_papers' }, mockContext(sampleSearch));
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string query', async () => {
    const r = await execute({ action: 'search_papers', query: 123 }, mockContext(sampleSearch));
    assert.equal(r.metadata.success, false);
  });

  it('should handle empty results', async () => {
    const r = await execute({ action: 'search_papers', query: 'zzz' }, mockContext({ data: [] }));
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.paperCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. get_paper
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: get_paper', () => {
  beforeEach(() => {});

  it('should get paper successfully', async () => {
    const ctx = mockContext(samplePaper);
    const r = await execute({ action: 'get_paper', paperId: 'abc123' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.ok(r.result.includes('Attention Is All You Need'));
    assert.ok(r.result.includes('Vaswani'));
  });

  it('should reject missing paperId', async () => {
    const r = await execute({ action: 'get_paper' }, mockContext(samplePaper));
    assert.equal(r.metadata.success, false);
  });

  it('should reject non-string paperId', async () => {
    const r = await execute({ action: 'get_paper', paperId: 42 }, mockContext(samplePaper));
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 5. get_citations
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: get_citations', () => {
  beforeEach(() => {});

  it('should get citations successfully', async () => {
    const ctx = mockContext(sampleCitations);
    const r = await execute({ action: 'get_citations', paperId: 'abc123' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.citationCount, 2);
    assert.ok(r.result.includes('BERT'));
  });

  it('should reject missing paperId', async () => {
    const r = await execute({ action: 'get_citations' }, mockContext(sampleCitations));
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 6. get_references
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: get_references', () => {
  beforeEach(() => {});

  it('should get references successfully', async () => {
    const ctx = mockContext(sampleReferences);
    const r = await execute({ action: 'get_references', paperId: 'abc123' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.referenceCount, 1);
    assert.ok(r.result.includes('Sequence to Sequence'));
  });

  it('should reject missing paperId', async () => {
    const r = await execute({ action: 'get_references' }, mockContext(sampleReferences));
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: timeout', () => {
  beforeEach(() => {});

  it('should timeout search_papers', async () => {
    const r = await execute({ action: 'search_papers', query: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout get_paper', async () => {
    const r = await execute({ action: 'get_paper', paperId: 'abc' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout get_citations', async () => {
    const r = await execute({ action: 'get_citations', paperId: 'abc' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout get_references', async () => {
    const r = await execute({ action: 'get_references', paperId: 'abc' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 8. Network errors
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: 'search_papers', query: 'test' }, mockContextError(new Error('Network down')));
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const r = await execute({ action: 'search_papers', query: 'test' }, mockContextError(new Error('Network down')));
    assert.ok(r.result.includes('Network down'));
  });
});

// ---------------------------------------------------------------------------
// 9. getClient
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: getClient', () => {
  beforeEach(() => {});

  it('should prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('should fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('should null for empty', () => { assert.equal(getClient({}), null); });
  it('should null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('should null for null', () => { assert.equal(getClient(null), null); });
});

// ---------------------------------------------------------------------------
// 10. redactSensitive
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('should redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('should redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('should not alter clean', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('should handle non-string', () => { assert.equal(redactSensitive(42), 42); });
});

// ---------------------------------------------------------------------------
// 11. resolveTimeout
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('default empty', () => { assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS); });
  it('default undefined', () => { assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS); });
  it('custom', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000); });
  it('cap', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS); });
  it('ignore 0', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS); });
  it('ignore neg', () => { assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS); });
  it('ignore non-num', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 'x' } }), DEFAULT_TIMEOUT_MS); });
  it('DEFAULT=30000', () => { assert.equal(DEFAULT_TIMEOUT_MS, 30000); });
  it('MAX=120000', () => { assert.equal(MAX_TIMEOUT_MS, 120000); });
});

// ---------------------------------------------------------------------------
// 12. validate()
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('should reject missing', () => { assert.equal(validate({}).valid, false); });
  it('should reject null', () => { assert.equal(validate(null).valid, false); });
  it('search_papers requires query', () => { assert.equal(validate({ action: 'search_papers' }).valid, false); assert.equal(validate({ action: 'search_papers', query: 'x' }).valid, true); });
  it('get_paper requires paperId', () => { assert.equal(validate({ action: 'get_paper' }).valid, false); assert.equal(validate({ action: 'get_paper', paperId: 'x' }).valid, true); });
  it('get_citations requires paperId', () => { assert.equal(validate({ action: 'get_citations' }).valid, false); assert.equal(validate({ action: 'get_citations', paperId: 'x' }).valid, true); });
  it('get_references requires paperId', () => { assert.equal(validate({ action: 'get_references' }).valid, false); assert.equal(validate({ action: 'get_references', paperId: 'x' }).valid, true); });
});

// ---------------------------------------------------------------------------
// 13. meta export
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => { assert.equal(meta.name, 'semantic-scholar-api'); });
  it('should have version', () => { assert.equal(meta.version, '1.0.0'); });
  it('should have description', () => { assert.ok(meta.description.includes('Semantic Scholar')); });
  it('should list all 4 actions', () => {
    assert.equal(meta.actions.length, 4);
    assert.ok(meta.actions.includes('search_papers'));
    assert.ok(meta.actions.includes('get_paper'));
    assert.ok(meta.actions.includes('get_citations'));
    assert.ok(meta.actions.includes('get_references'));
  });
});

// ---------------------------------------------------------------------------
// 14. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient absent', async () => {
    const ctx = { gatewayClient: { request: async () => sampleSearch }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'search_papers', query: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 15. providerNotConfiguredError
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should have correct code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('should have retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('should have success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('should include Error in result', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// ---------------------------------------------------------------------------
// 16. constants
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, ['search_papers', 'get_paper', 'get_citations', 'get_references']);
  });
});

// ---------------------------------------------------------------------------
// 17. request path verification
// ---------------------------------------------------------------------------
describe('semantic-scholar-api: request path verification', () => {
  beforeEach(() => {});

  it('should call /graph/v1/paper/search for search_papers', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleSearch; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'search_papers', query: 'test' }, ctx);
    assert.ok(calledPath.includes('/graph/v1/paper/search'));
  });

  it('should call /graph/v1/paper/{id} for get_paper', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return samplePaper; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_paper', paperId: 'abc123' }, ctx);
    assert.ok(calledPath.includes('/graph/v1/paper/abc123'));
  });

  it('should call /citations for get_citations', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleCitations; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_citations', paperId: 'abc123' }, ctx);
    assert.ok(calledPath.includes('/citations'));
  });

  it('should call /references for get_references', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sampleReferences; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'get_references', paperId: 'abc123' }, ctx);
    assert.ok(calledPath.includes('/references'));
  });
});
