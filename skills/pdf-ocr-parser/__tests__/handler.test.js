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
  validateFile,
  validatePages,
  validateLanguage,
  VALID_ACTIONS,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  DEFAULT_PAGES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
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
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .request() triggers an AbortError (timeout).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      request: async (_method, _path, _body, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample PDF parse response */
const samplePdfResult = {
  text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  pageCount: 3,
};

/** Sample image OCR response */
const sampleImageResult = {
  text: 'Hello World from image OCR',
  confidence: 0.95,
};

/** Sample tables response */
const sampleTablesResult = {
  tables: [
    { title: 'Revenue Table', rows: [['Q1', '100'], ['Q2', '200']] },
    { title: 'Expense Table', rows: [['Q1', '50'], ['Q2', '75'], ['Q3', '80']] },
  ],
};

/** Sample metadata response */
const sampleMetadataResult = {
  metadata: {
    title: 'Annual Report 2024',
    author: 'John Doe',
    pages: 42,
    creator: 'LibreOffice',
    producer: 'PDF Generator',
    createdAt: '2024-01-15T10:00:00Z',
    modifiedAt: '2024-06-20T14:30:00Z',
    fileSize: '2.5MB',
  },
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: action validation', () => {
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

  it('should list valid actions in error message', async () => {
    const result = await execute({ action: 'bad' }, {});
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Error message should mention "${a}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail parse_pdf without client', async () => {
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail parse_image without client', async () => {
    const result = await execute({ action: 'parse_image', file: 'photo.png' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail extract_tables without client', async () => {
    const result = await execute({ action: 'extract_tables', file: 'report.pdf' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_metadata without client', async () => {
    const result = await execute({ action: 'get_metadata', file: 'report.pdf' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should NOT fail list_languages without client (no API call)', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 3. parse_pdf action
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: parse_pdf', () => {
  beforeEach(() => {});

  it('should parse a PDF with defaults', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute({ action: 'parse_pdf', file: 'document.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'parse_pdf');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.file, 'document.pdf');
    assert.equal(result.metadata.pages, 'all');
    assert.equal(result.metadata.language, 'eng');
    assert.ok(result.result.includes('Lorem ipsum'));
  });

  it('should parse with custom pages and language', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute(
      { action: 'parse_pdf', file: 'doc.pdf', pages: '1-5', language: 'fra' },
      ctx
    );
    assert.equal(result.metadata.pages, '1-5');
    assert.equal(result.metadata.language, 'fra');
  });

  it('should include page count in result', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, ctx);
    assert.ok(result.result.includes('Pages processed: 3'));
    assert.equal(result.metadata.pageCount, 3);
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing file', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute({ action: 'parse_pdf' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty file', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute({ action: 'parse_pdf', file: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only file', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute({ action: 'parse_pdf', file: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid pages format', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf', pages: 'abc' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid language', async () => {
    const ctx = mockContext(samplePdfResult);
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf', language: 'xyz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call POST /ocr/pdf', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return samplePdfResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'parse_pdf', file: 'test.pdf' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/ocr/pdf');
  });

  it('should pass body with file, pages, language', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return samplePdfResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'parse_pdf', file: 'test.pdf', pages: '2-4', language: 'deu' }, ctx);
    assert.deepEqual(capturedOpts.body, { file: 'test.pdf', pages: '2-4', language: 'deu' });
  });

  it('should handle content field in response', async () => {
    const ctx = mockContext({ content: 'alt text field' });
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.text, 'alt text field');
  });
});

// ---------------------------------------------------------------------------
// 4. parse_image action
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: parse_image', () => {
  beforeEach(() => {});

  it('should parse an image with defaults', async () => {
    const ctx = mockContext(sampleImageResult);
    const result = await execute({ action: 'parse_image', file: 'photo.png' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'parse_image');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.file, 'photo.png');
    assert.equal(result.metadata.language, 'eng');
    assert.ok(result.result.includes('Hello World from image OCR'));
  });

  it('should include confidence in output when present', async () => {
    const ctx = mockContext(sampleImageResult);
    const result = await execute({ action: 'parse_image', file: 'photo.png' }, ctx);
    assert.ok(result.result.includes('Confidence: 0.95'));
    assert.equal(result.metadata.confidence, 0.95);
  });

  it('should use custom language', async () => {
    const ctx = mockContext(sampleImageResult);
    const result = await execute({ action: 'parse_image', file: 'img.jpg', language: 'jpn' }, ctx);
    assert.equal(result.metadata.language, 'jpn');
  });

  it('should reject missing file', async () => {
    const ctx = mockContext(sampleImageResult);
    const result = await execute({ action: 'parse_image' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid language', async () => {
    const ctx = mockContext(sampleImageResult);
    const result = await execute({ action: 'parse_image', file: 'img.jpg', language: 'zzz' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call POST /ocr/image', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleImageResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'parse_image', file: 'scan.png' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/ocr/image');
  });

  it('should pass body with file and language', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleImageResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'parse_image', file: 'img.jpg', language: 'spa' }, ctx);
    assert.deepEqual(capturedOpts.body, { file: 'img.jpg', language: 'spa' });
  });

  it('should handle null confidence', async () => {
    const ctx = mockContext({ text: 'some text' });
    const result = await execute({ action: 'parse_image', file: 'img.jpg' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.confidence, null);
  });
});

// ---------------------------------------------------------------------------
// 5. extract_tables action
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: extract_tables', () => {
  beforeEach(() => {});

  it('should extract tables from PDF', async () => {
    const ctx = mockContext(sampleTablesResult);
    const result = await execute({ action: 'extract_tables', file: 'report.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'extract_tables');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.file, 'report.pdf');
    assert.equal(result.metadata.tableCount, 2);
    assert.ok(result.result.includes('Revenue Table'));
    assert.ok(result.result.includes('Expense Table'));
  });

  it('should use default pages when not specified', async () => {
    const ctx = mockContext(sampleTablesResult);
    const result = await execute({ action: 'extract_tables', file: 'report.pdf' }, ctx);
    assert.equal(result.metadata.pages, 'all');
  });

  it('should accept custom pages', async () => {
    const ctx = mockContext(sampleTablesResult);
    const result = await execute({ action: 'extract_tables', file: 'report.pdf', pages: '3-7' }, ctx);
    assert.equal(result.metadata.pages, '3-7');
  });

  it('should reject missing file', async () => {
    const ctx = mockContext(sampleTablesResult);
    const result = await execute({ action: 'extract_tables' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid pages', async () => {
    const ctx = mockContext(sampleTablesResult);
    const result = await execute({ action: 'extract_tables', file: 'r.pdf', pages: 'bad' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call POST /ocr/tables', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleTablesResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'extract_tables', file: 'doc.pdf' }, ctx);
    assert.equal(calledPath, '/ocr/tables');
  });

  it('should handle empty tables array', async () => {
    const ctx = mockContext({ tables: [] });
    const result = await execute({ action: 'extract_tables', file: 'empty.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.tableCount, 0);
    assert.ok(result.result.includes('Tables found: 0'));
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [{ name: 'Alt Table', data: [['a']] }] });
    const result = await execute({ action: 'extract_tables', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.tableCount, 1);
  });
});

// ---------------------------------------------------------------------------
// 6. get_metadata action
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: get_metadata', () => {
  beforeEach(() => {});

  it('should get PDF metadata', async () => {
    const ctx = mockContext(sampleMetadataResult);
    const result = await execute({ action: 'get_metadata', file: 'report.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_metadata');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.file, 'report.pdf');
    assert.ok(result.result.includes('Annual Report 2024'));
    assert.ok(result.result.includes('John Doe'));
    assert.ok(result.result.includes('Pages: 42'));
  });

  it('should include all metadata fields in result', async () => {
    const ctx = mockContext(sampleMetadataResult);
    const result = await execute({ action: 'get_metadata', file: 'report.pdf' }, ctx);
    assert.ok(result.result.includes('Creator: LibreOffice'));
    assert.ok(result.result.includes('Producer: PDF Generator'));
    assert.ok(result.result.includes('Size: 2.5MB'));
  });

  it('should reject missing file', async () => {
    const ctx = mockContext(sampleMetadataResult);
    const result = await execute({ action: 'get_metadata' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call POST /ocr/metadata', async () => {
    let calledPath = null;
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleMetadataResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_metadata', file: 'test.pdf' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/ocr/metadata');
  });

  it('should handle sparse metadata', async () => {
    const ctx = mockContext({ metadata: { title: 'Only Title' } });
    const result = await execute({ action: 'get_metadata', file: 'sparse.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Only Title'));
    assert.ok(!result.result.includes('Author'));
  });

  it('should handle raw response without metadata wrapper', async () => {
    const ctx = mockContext({ title: 'Direct Title', pages: 10 });
    const result = await execute({ action: 'get_metadata', file: 'raw.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Direct Title'));
  });
});

// ---------------------------------------------------------------------------
// 7. list_languages action
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: list_languages', () => {
  beforeEach(() => {});

  it('should list all supported languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_languages');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.languageCount, SUPPORTED_LANGUAGES.length);
    assert.deepEqual(result.metadata.languages, SUPPORTED_LANGUAGES);
  });

  it('should include all languages in result text', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    for (const lang of SUPPORTED_LANGUAGES) {
      assert.ok(result.result.includes(lang), `Should include language "${lang}"`);
    }
  });

  it('should not require a provider client', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should include timestamp', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.ok(result.metadata.timestamp);
  });

  it('should return 16 languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.languageCount, 16);
  });
});

// ---------------------------------------------------------------------------
// 8. Timeout handling
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on parse_pdf abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on parse_image abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'parse_image', file: 'img.png' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on extract_tables abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'extract_tables', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_metadata abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_metadata', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 9. Network error handling
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on parse_pdf failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on parse_image failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'parse_image', file: 'img.png' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on extract_tables failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'extract_tables', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_metadata failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'get_metadata', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 10. getClient helper
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: getClient', () => {
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
// 11. redactSensitive
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: test_value_placeholder data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_value_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: sample_placeholder_value';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_placeholder_value'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: sample_auth_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_auth_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact password patterns', () => {
    const input = 'password=test_pass_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_pass_placeholder'));
  });

  it('should not alter clean strings', () => {
    const input = 'Parsed 5 pages from document.pdf';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('token: exposed_placeholder_val'));
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, ctx);
    assert.ok(!result.result.includes('exposed_placeholder_val'));
  });
});

// ---------------------------------------------------------------------------
// 12. validateFile helper
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: validateFile', () => {
  beforeEach(() => {});

  it('should accept valid file path', () => {
    const result = validateFile('/path/to/document.pdf');
    assert.equal(result.valid, true);
    assert.equal(result.value, '/path/to/document.pdf');
  });

  it('should accept URL', () => {
    const result = validateFile('https://example.com/doc.pdf');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'https://example.com/doc.pdf');
  });

  it('should trim whitespace', () => {
    const result = validateFile('  doc.pdf  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'doc.pdf');
  });

  it('should reject null', () => {
    const result = validateFile(null);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject undefined', () => {
    const result = validateFile(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateFile('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = validateFile('   ');
    assert.equal(result.valid, false);
  });

  it('should reject non-string', () => {
    const result = validateFile(123);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 13. validatePages helper
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: validatePages', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validatePages(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'all');
  });

  it('should return default when null', () => {
    const result = validatePages(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'all');
  });

  it('should accept "all"', () => {
    const result = validatePages('all');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'all');
  });

  it('should accept single page number', () => {
    const result = validatePages('3');
    assert.equal(result.valid, true);
    assert.equal(result.value, '3');
  });

  it('should accept page range', () => {
    const result = validatePages('1-5');
    assert.equal(result.valid, true);
    assert.equal(result.value, '1-5');
  });

  it('should accept large page range', () => {
    const result = validatePages('10-200');
    assert.equal(result.valid, true);
    assert.equal(result.value, '10-200');
  });

  it('should reject invalid format', () => {
    const result = validatePages('abc');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('abc'));
  });

  it('should reject reverse range', () => {
    const result = validatePages('5-1');
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validatePages('');
    assert.equal(result.valid, false);
  });

  it('should reject non-string type', () => {
    const result = validatePages(5);
    assert.equal(result.valid, false);
  });

  it('should reject range starting at 0', () => {
    const result = validatePages('0-5');
    assert.equal(result.valid, false);
  });

  it('should trim whitespace before validation', () => {
    const result = validatePages('  all  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'all');
  });

  it('should accept single page range (same start and end)', () => {
    const result = validatePages('3-3');
    assert.equal(result.valid, true);
    assert.equal(result.value, '3-3');
  });
});

// ---------------------------------------------------------------------------
// 14. validateLanguage helper
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: validateLanguage', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateLanguage(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'eng');
  });

  it('should return default when null', () => {
    const result = validateLanguage(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'eng');
  });

  it('should accept supported language', () => {
    const result = validateLanguage('fra');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'fra');
  });

  it('should accept case-insensitive language', () => {
    const result = validateLanguage('ENG');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'eng');
  });

  it('should accept all 16 supported languages', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const result = validateLanguage(lang);
      assert.equal(result.valid, true, `Should accept "${lang}"`);
      assert.equal(result.value, lang);
    }
  });

  it('should reject unsupported language code', () => {
    const result = validateLanguage('xyz');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('xyz'));
  });

  it('should reject empty string', () => {
    const result = validateLanguage('');
    assert.equal(result.valid, false);
  });

  it('should reject too-long code', () => {
    const result = validateLanguage('english');
    assert.equal(result.valid, false);
  });

  it('should reject single character', () => {
    const result = validateLanguage('e');
    assert.equal(result.valid, false);
  });

  it('should reject non-string type', () => {
    const result = validateLanguage(123);
    assert.equal(result.valid, false);
  });

  it('should reject code with numbers', () => {
    const result = validateLanguage('en1');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 15. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000);
  });

  it('should cap at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should ignore non-positive timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
    assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore non-number timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });

  it('should have default of 30000ms', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should have max of 120000ms', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });
});

// ---------------------------------------------------------------------------
// 16. validate() export
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('bad'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate parse_pdf requires file', () => {
    assert.equal(validate({ action: 'parse_pdf' }).valid, false);
    assert.equal(validate({ action: 'parse_pdf', file: '' }).valid, false);
    assert.equal(validate({ action: 'parse_pdf', file: 'doc.pdf' }).valid, true);
  });

  it('should validate parse_pdf rejects bad pages', () => {
    assert.equal(validate({ action: 'parse_pdf', file: 'doc.pdf', pages: 'bad' }).valid, false);
    assert.equal(validate({ action: 'parse_pdf', file: 'doc.pdf', pages: '1-5' }).valid, true);
  });

  it('should validate parse_pdf rejects bad language', () => {
    assert.equal(validate({ action: 'parse_pdf', file: 'doc.pdf', language: 'xyz' }).valid, false);
    assert.equal(validate({ action: 'parse_pdf', file: 'doc.pdf', language: 'eng' }).valid, true);
  });

  it('should validate parse_image requires file', () => {
    assert.equal(validate({ action: 'parse_image' }).valid, false);
    assert.equal(validate({ action: 'parse_image', file: 'img.png' }).valid, true);
  });

  it('should validate parse_image rejects bad language', () => {
    assert.equal(validate({ action: 'parse_image', file: 'img.png', language: 'xyz' }).valid, false);
  });

  it('should validate extract_tables requires file', () => {
    assert.equal(validate({ action: 'extract_tables' }).valid, false);
    assert.equal(validate({ action: 'extract_tables', file: 'doc.pdf' }).valid, true);
  });

  it('should validate extract_tables rejects bad pages', () => {
    assert.equal(validate({ action: 'extract_tables', file: 'doc.pdf', pages: 'bad' }).valid, false);
  });

  it('should validate get_metadata requires file', () => {
    assert.equal(validate({ action: 'get_metadata' }).valid, false);
    assert.equal(validate({ action: 'get_metadata', file: 'doc.pdf' }).valid, true);
  });

  it('should validate list_languages requires nothing', () => {
    assert.equal(validate({ action: 'list_languages' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 17. meta export
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'pdf-ocr-parser');
  });

  it('should have version', () => {
    assert.ok(meta.version);
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('OCR'));
  });

  it('should list all 5 actions', () => {
    assert.equal(meta.actions.length, 5);
    assert.ok(meta.actions.includes('parse_pdf'));
    assert.ok(meta.actions.includes('parse_image'));
    assert.ok(meta.actions.includes('extract_tables'));
    assert.ok(meta.actions.includes('get_metadata'));
    assert.ok(meta.actions.includes('list_languages'));
  });
});

// ---------------------------------------------------------------------------
// 18. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return samplePdfResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'parse_pdf', file: 'doc.pdf' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/ocr/pdf');
  });
});

// ---------------------------------------------------------------------------
// 19. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 20. Constants verification
// ---------------------------------------------------------------------------
describe('pdf-ocr-parser: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, [
      'parse_pdf', 'parse_image', 'extract_tables', 'get_metadata', 'list_languages',
    ]);
  });

  it('should have 16 supported languages', () => {
    assert.equal(SUPPORTED_LANGUAGES.length, 16);
  });

  it('should include eng in supported languages', () => {
    assert.ok(SUPPORTED_LANGUAGES.includes('eng'));
  });

  it('should include all required languages', () => {
    const required = ['eng', 'fra', 'deu', 'spa', 'ita', 'por', 'nld', 'pol', 'rus', 'jpn', 'kor', 'zho', 'ara', 'hin', 'tha', 'vie'];
    for (const lang of required) {
      assert.ok(SUPPORTED_LANGUAGES.includes(lang), `Missing language "${lang}"`);
    }
  });

  it('should have correct default language', () => {
    assert.equal(DEFAULT_LANGUAGE, 'eng');
  });

  it('should have correct default pages', () => {
    assert.equal(DEFAULT_PAGES, 'all');
  });
});
