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
  validateUrl,
  validateSelector,
  validateLinkLimit,
  validateHeaders,
  validateSelectors,
  validateTableIndex,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LINK_LIMIT,
  MIN_LINK_LIMIT,
  MAX_LINK_LIMIT,
  MAX_SELECTOR_LENGTH,
  MAX_SELECTORS_COUNT,
  MAX_CONTENT_LENGTH,
  BLOCKED_PROTOCOLS,
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

/** Sample fetch_page response */
const sampleFetchPage = {
  html: '<html><head><title>Example</title></head><body><h1>Hello World</h1></body></html>',
  statusCode: 200,
};

/** Sample extract_text response */
const sampleText = {
  text: 'Hello World! This is the page content.',
};

/** Sample extract_links response */
const sampleLinks = {
  links: [
    { text: 'Home', href: 'https://example.com/' },
    { text: 'About', href: 'https://example.com/about' },
    { text: 'Contact', href: 'https://example.com/contact' },
  ],
};

/** Sample extract_metadata response */
const sampleMetadata = {
  metadata: {
    title: 'Example Domain',
    description: 'This domain is for use in illustrative examples.',
    ogTitle: 'Example OG Title',
    ogDescription: 'Example OG Description',
    ogImage: 'https://example.com/image.png',
    ogType: 'website',
    canonical: 'https://example.com/',
  },
};

/** Sample extract_structured response */
const sampleStructured = {
  data: {
    title: 'Product Name',
    price: '$29.99',
    image: 'https://example.com/product.jpg',
  },
};

/** Sample extract_tables response */
const sampleTables = {
  tables: [
    ['Header1', 'Header2'],
    ['Row1Col1', 'Row1Col2'],
    ['Row2Col1', 'Row2Col2'],
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('web-scraper: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const result = await execute({ action: 'invalid', url: 'https://example.com' }, {});
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

  it('should reject action as number', async () => {
    const result = await execute({ action: 123, url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });
});

// ---------------------------------------------------------------------------
// 2. URL validation (security - protocol blocking)
// ---------------------------------------------------------------------------
describe('web-scraper: URL validation security', () => {
  beforeEach(() => {});

  it('should accept http:// URL', () => {
    const result = validateUrl('http://example.com');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'http://example.com');
  });

  it('should accept https:// URL', () => {
    const result = validateUrl('https://example.com');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'https://example.com');
  });

  it('should block file:// protocol', () => {
    const result = validateUrl('file:///etc/passwd');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Blocked protocol'));
    assert.ok(result.error.includes('file:'));
  });

  it('should block javascript: protocol', () => {
    const result = validateUrl('javascript:alert(1)');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Blocked protocol'));
    assert.ok(result.error.includes('javascript:'));
  });

  it('should block data: protocol', () => {
    const result = validateUrl('data:text/html,<h1>hi</h1>');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Blocked protocol'));
    assert.ok(result.error.includes('data:'));
  });

  it('should block ftp: protocol', () => {
    const result = validateUrl('ftp://example.com/file');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Blocked protocol'));
    assert.ok(result.error.includes('ftp:'));
  });

  it('should block FILE:// (case-insensitive)', () => {
    const result = validateUrl('FILE:///etc/passwd');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Blocked protocol'));
  });

  it('should block JAVASCRIPT: (case-insensitive)', () => {
    const result = validateUrl('JAVASCRIPT:void(0)');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Blocked protocol'));
  });

  it('should block Data: (mixed case)', () => {
    const result = validateUrl('Data:text/plain,test');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Blocked protocol'));
  });

  it('should block FTP: (case-insensitive)', () => {
    const result = validateUrl('FTP://example.com/file');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Blocked protocol'));
  });

  it('should reject missing URL', () => {
    const result = validateUrl(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject null URL', () => {
    const result = validateUrl(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty URL', () => {
    const result = validateUrl('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only URL', () => {
    const result = validateUrl('   ');
    assert.equal(result.valid, false);
  });

  it('should reject non-string URL', () => {
    const result = validateUrl(123);
    assert.equal(result.valid, false);
  });

  it('should trim whitespace from URL', () => {
    const result = validateUrl('  https://example.com  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'https://example.com');
  });

  it('should reject ssh:// protocol', () => {
    const result = validateUrl('ssh://example.com');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('http://'));
  });

  it('should reject telnet:// protocol', () => {
    const result = validateUrl('telnet://example.com');
    assert.equal(result.valid, false);
  });

  it('should block file:// in execute fetch_page', async () => {
    const ctx = mockContext(sampleFetchPage);
    const result = await execute({ action: 'fetch_page', url: 'file:///etc/passwd' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should block javascript: in execute extract_text', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'extract_text', url: 'javascript:alert(1)' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should block data: in execute extract_links', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'extract_links', url: 'data:text/html,test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should block ftp: in execute extract_metadata', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata', url: 'ftp://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should block file: in execute extract_structured', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      url: 'file:///etc/shadow',
      selectors: [{ name: 'test', selector: 'div' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should block javascript: in execute extract_tables', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables', url: 'javascript:void(0)' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 3. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('web-scraper: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail fetch_page without client', async () => {
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail extract_text without client', async () => {
    const result = await execute({ action: 'extract_text', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail extract_links without client', async () => {
    const result = await execute({ action: 'extract_links', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail extract_metadata without client', async () => {
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail extract_structured without client', async () => {
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'title', selector: 'h1' }],
    }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail extract_tables without client', async () => {
    const result = await execute({ action: 'extract_tables', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 4. fetch_page action
// ---------------------------------------------------------------------------
describe('web-scraper: fetch_page', () => {
  beforeEach(() => {});

  it('should fetch a page', async () => {
    const ctx = mockContext(sampleFetchPage);
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'fetch_page');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.ok(result.result.includes('Fetched'));
  });

  it('should include content length in metadata', async () => {
    const ctx = mockContext(sampleFetchPage);
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.ok(result.metadata.contentLength > 0);
  });

  it('should include status code when present', async () => {
    const ctx = mockContext(sampleFetchPage);
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.statusCode, 200);
  });

  it('should handle custom headers', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedBody = opts?.body;
          return sampleFetchPage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({
      action: 'fetch_page',
      url: 'https://example.com',
      headers: { 'Accept': 'text/html' },
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.deepEqual(capturedBody.headers, { 'Accept': 'text/html' });
  });

  it('should reject invalid headers type', async () => {
    const ctx = mockContext(sampleFetchPage);
    const result = await execute({
      action: 'fetch_page',
      url: 'https://example.com',
      headers: 'not-an-object',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleFetchPage);
    const result = await execute({ action: 'fetch_page' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleFetchPage);
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    let calledMethod = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleFetchPage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/scraper/fetch');
  });

  it('should handle content field in response', async () => {
    const ctx = mockContext({ content: '<html>Alt content</html>' });
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Alt content'));
  });

  it('should handle body field in response', async () => {
    const ctx = mockContext({ body: '<html>Body content</html>' });
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Body content'));
  });

  it('should truncate long content in result text', async () => {
    const longHtml = 'x'.repeat(2000);
    const ctx = mockContext({ html: longHtml });
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('truncated'));
  });
});

// ---------------------------------------------------------------------------
// 5. extract_text action
// ---------------------------------------------------------------------------
describe('web-scraper: extract_text', () => {
  beforeEach(() => {});

  it('should extract text from page', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'extract_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'extract_text');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.equal(result.metadata.selector, null);
    assert.ok(result.result.includes('Hello World'));
  });

  it('should use optional selector', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'extract_text', url: 'https://example.com', selector: '.content' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.selector, '.content');
    assert.ok(result.result.includes('Selector: .content'));
  });

  it('should show full page when no selector', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'extract_text', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('(full page)'));
  });

  it('should reject selector with script tag', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'extract_text', url: 'https://example.com', selector: '<script>alert(1)</script>' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject selector exceeding max length', async () => {
    const ctx = mockContext(sampleText);
    const longSelector = 'a'.repeat(MAX_SELECTOR_LENGTH + 1);
    const result = await execute({ action: 'extract_text', url: 'https://example.com', selector: longSelector }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'extract_text' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleText;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'extract_text', url: 'https://example.com' }, ctx);
    assert.equal(calledPath, '/scraper/text');
  });

  it('should handle content field in response', async () => {
    const ctx = mockContext({ content: 'Alternate content field' });
    const result = await execute({ action: 'extract_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Alternate content field'));
  });

  it('should include textLength in metadata', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'extract_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.textLength, sampleText.text.length);
  });
});

// ---------------------------------------------------------------------------
// 6. extract_links action
// ---------------------------------------------------------------------------
describe('web-scraper: extract_links', () => {
  beforeEach(() => {});

  it('should extract links from page', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'extract_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'extract_links');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.equal(result.metadata.limit, DEFAULT_LINK_LIMIT);
    assert.equal(result.metadata.linkCount, 3);
    assert.ok(result.result.includes('Home'));
    assert.ok(result.result.includes('About'));
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'extract_links', url: 'https://example.com', limit: 10 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 10);
  });

  it('should clamp limit to MAX_LINK_LIMIT', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'extract_links', url: 'https://example.com', limit: 1000 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LINK_LIMIT);
  });

  it('should reject limit of 0', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'extract_links', url: 'https://example.com', limit: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject negative limit', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'extract_links', url: 'https://example.com', limit: -5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'extract_links' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleLinks;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'extract_links', url: 'https://example.com' }, ctx);
    assert.equal(calledPath, '/scraper/links');
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [{ href: 'https://example.com/alt' }] });
    const result = await execute({ action: 'extract_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.linkCount, 1);
  });

  it('should handle empty links list', async () => {
    const ctx = mockContext({ links: [] });
    const result = await execute({ action: 'extract_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.linkCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. extract_metadata action
// ---------------------------------------------------------------------------
describe('web-scraper: extract_metadata', () => {
  beforeEach(() => {});

  it('should extract metadata from page', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'extract_metadata');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.ok(result.result.includes('Example Domain'));
  });

  it('should include title in result', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('Title: Example Domain'));
  });

  it('should include description in result', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('Description:'));
  });

  it('should include OG tags in result', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('OG Title:'));
    assert.ok(result.result.includes('OG Description:'));
    assert.ok(result.result.includes('OG Image:'));
    assert.ok(result.result.includes('OG Type:'));
  });

  it('should include canonical in result', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('Canonical:'));
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleMetadata;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.equal(calledPath, '/scraper/metadata');
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should store pageMetadata in metadata', async () => {
    const ctx = mockContext(sampleMetadata);
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.ok(result.metadata.pageMetadata);
    assert.equal(result.metadata.pageMetadata.title, 'Example Domain');
  });

  it('should handle response without metadata wrapper', async () => {
    const ctx = mockContext({ title: 'Direct Title', description: 'Direct desc' });
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Direct Title'));
  });
});

// ---------------------------------------------------------------------------
// 8. extract_structured action
// ---------------------------------------------------------------------------
describe('web-scraper: extract_structured', () => {
  beforeEach(() => {});

  it('should extract structured data', async () => {
    const ctx = mockContext(sampleStructured);
    const selectors = [
      { name: 'title', selector: 'h1' },
      { name: 'price', selector: '.price' },
    ];
    const result = await execute({ action: 'extract_structured', url: 'https://example.com', selectors }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'extract_structured');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.equal(result.metadata.selectorCount, 2);
    assert.ok(result.result.includes('Structured data from'));
  });

  it('should reject missing selectors', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({ action: 'extract_structured', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty selectors array', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({ action: 'extract_structured', url: 'https://example.com', selectors: [] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-array selectors', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({ action: 'extract_structured', url: 'https://example.com', selectors: 'not-array' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject selector without name', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ selector: 'h1' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject selector without selector field', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'title' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject selector with script tag', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'bad', selector: '<script>alert(1)</script>' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject selectors exceeding MAX_SELECTORS_COUNT', async () => {
    const ctx = mockContext(sampleStructured);
    const selectors = Array.from({ length: MAX_SELECTORS_COUNT + 1 }, (_, i) => ({
      name: `sel${i}`,
      selector: `div.c${i}`,
    }));
    const result = await execute({ action: 'extract_structured', url: 'https://example.com', selectors }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      selectors: [{ name: 'title', selector: 'h1' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleStructured;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'title', selector: 'h1' }],
    }, ctx);
    assert.equal(calledPath, '/scraper/structured');
  });

  it('should handle results field in response', async () => {
    const ctx = mockContext({ results: { title: 'From results' } });
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'title', selector: 'h1' }],
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept selector with attribute', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'image', selector: 'img', attribute: 'src' }],
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should reject non-string attribute', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'image', selector: 'img', attribute: 123 }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject null selector entry', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [null],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 9. extract_tables action
// ---------------------------------------------------------------------------
describe('web-scraper: extract_tables', () => {
  beforeEach(() => {});

  it('should extract tables from page', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'extract_tables');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.equal(result.metadata.tableIndex, 0);
    assert.ok(result.result.includes('Tables from'));
  });

  it('should use custom tableIndex', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables', url: 'https://example.com', tableIndex: 2 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.tableIndex, 2);
  });

  it('should default tableIndex to 0', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.tableIndex, 0);
  });

  it('should reject negative tableIndex', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables', url: 'https://example.com', tableIndex: -1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer tableIndex', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables', url: 'https://example.com', tableIndex: 1.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleTables;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'extract_tables', url: 'https://example.com' }, ctx);
    assert.equal(calledPath, '/scraper/tables');
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [['A', 'B'], ['1', '2']] });
    const result = await execute({ action: 'extract_tables', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should include rowCount in metadata', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.rowCount, 3);
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleTables);
    const result = await execute({ action: 'extract_tables', url: 'https://example.com' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('web-scraper: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT on fetch_page abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on extract_text abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'extract_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on extract_links abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'extract_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on extract_metadata abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on extract_structured abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'x', selector: 'div' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on extract_tables abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'extract_tables', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('web-scraper: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on fetch_page failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on extract_text failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'extract_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on extract_links failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'extract_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on extract_metadata failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'extract_metadata', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on extract_structured failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'x', selector: 'div' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on extract_tables failure', async () => {
    const ctx = mockContextError(new Error('Service unavailable'));
    const result = await execute({ action: 'extract_tables', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('web-scraper: getClient', () => {
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

  it('should return client object with type provider', () => {
    const mockClient = { request: () => {} };
    const result = getClient({ providerClient: mockClient });
    assert.equal(result.client, mockClient);
    assert.equal(result.type, 'provider');
  });

  it('should return client object with type gateway', () => {
    const mockClient = { request: () => {} };
    const result = getClient({ gatewayClient: mockClient });
    assert.equal(result.client, mockClient);
    assert.equal(result.type, 'gateway');
  });
});

// ---------------------------------------------------------------------------
// 13. redactSensitive
// ---------------------------------------------------------------------------
describe('web-scraper: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: some_test_value_here data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('some_test_value_here'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: Bearer_mytoken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Bearer_mytoken123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact password patterns', () => {
    const input = 'password=secretpass123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('secretpass123'));
  });

  it('should redact api-key patterns (hyphenated)', () => {
    const input = 'api-key: test_val_xxx data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_val_xxx'));
  });

  it('should redact secret patterns', () => {
    const input = 'secret=mysecretvalue123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('mysecretvalue123'));
  });

  it('should not alter clean strings', () => {
    const input = 'Fetched https://example.com successfully';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should handle boolean input', () => {
    assert.equal(redactSensitive(true), true);
  });

  it('should handle empty string', () => {
    assert.equal(redactSensitive(''), '');
  });
});

// ---------------------------------------------------------------------------
// 14. validateSelector helper
// ---------------------------------------------------------------------------
describe('web-scraper: validateSelector', () => {
  beforeEach(() => {});

  it('should accept valid selector', () => {
    const result = validateSelector('.content');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, '.content');
  });

  it('should accept undefined selector', () => {
    const result = validateSelector(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, undefined);
  });

  it('should accept null selector', () => {
    const result = validateSelector(null);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, undefined);
  });

  it('should treat empty string as undefined', () => {
    const result = validateSelector('');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, undefined);
  });

  it('should treat whitespace-only as undefined', () => {
    const result = validateSelector('   ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, undefined);
  });

  it('should reject selector exceeding max length', () => {
    const result = validateSelector('a'.repeat(MAX_SELECTOR_LENGTH + 1));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('500'));
  });

  it('should accept selector at exactly max length', () => {
    const result = validateSelector('a'.repeat(MAX_SELECTOR_LENGTH));
    assert.equal(result.valid, true);
  });

  it('should reject selector with script tag', () => {
    const result = validateSelector('<script>alert(1)</script>');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('script'));
  });

  it('should reject selector with Script tag (case-insensitive)', () => {
    const result = validateSelector('<Script>alert(1)</Script>');
    assert.equal(result.valid, false);
  });

  it('should reject non-string selector', () => {
    const result = validateSelector(123);
    assert.equal(result.valid, false);
  });

  it('should trim whitespace', () => {
    const result = validateSelector('  .btn  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, '.btn');
  });

  it('should accept complex CSS selector', () => {
    const result = validateSelector('div.container > ul > li:first-child a[href]');
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// 15. validateLinkLimit helper
// ---------------------------------------------------------------------------
describe('web-scraper: validateLinkLimit', () => {
  beforeEach(() => {});

  it('should return default when limit is undefined', () => {
    const result = validateLinkLimit(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LINK_LIMIT);
  });

  it('should return default when limit is null', () => {
    const result = validateLinkLimit(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LINK_LIMIT);
  });

  it('should accept valid limit', () => {
    const result = validateLinkLimit(50);
    assert.equal(result.valid, true);
    assert.equal(result.value, 50);
  });

  it('should clamp limit to MAX_LINK_LIMIT', () => {
    const result = validateLinkLimit(1000);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_LINK_LIMIT);
  });

  it('should accept MIN_LINK_LIMIT', () => {
    const result = validateLinkLimit(MIN_LINK_LIMIT);
    assert.equal(result.valid, true);
    assert.equal(result.value, MIN_LINK_LIMIT);
  });

  it('should reject 0', () => {
    const result = validateLinkLimit(0);
    assert.equal(result.valid, false);
  });

  it('should reject negative number', () => {
    const result = validateLinkLimit(-5);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateLinkLimit(1.5);
    assert.equal(result.valid, false);
  });

  it('should accept MAX_LINK_LIMIT exactly', () => {
    const result = validateLinkLimit(MAX_LINK_LIMIT);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_LINK_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// 16. validateHeaders helper
// ---------------------------------------------------------------------------
describe('web-scraper: validateHeaders', () => {
  beforeEach(() => {});

  it('should accept valid headers', () => {
    const result = validateHeaders({ 'Content-Type': 'text/html' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.sanitized, { 'Content-Type': 'text/html' });
  });

  it('should accept undefined headers', () => {
    const result = validateHeaders(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, undefined);
  });

  it('should accept null headers', () => {
    const result = validateHeaders(null);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, undefined);
  });

  it('should reject non-object headers', () => {
    const result = validateHeaders('not-an-object');
    assert.equal(result.valid, false);
  });

  it('should reject array headers', () => {
    const result = validateHeaders(['header1', 'header2']);
    assert.equal(result.valid, false);
  });

  it('should reject headers with non-string values', () => {
    const result = validateHeaders({ 'Accept': 123 });
    assert.equal(result.valid, false);
  });

  it('should accept empty object', () => {
    const result = validateHeaders({});
    assert.equal(result.valid, true);
  });

  it('should accept multiple headers', () => {
    const result = validateHeaders({ 'Accept': 'text/html', 'User-Agent': 'TestBot' });
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// 17. validateSelectors helper
// ---------------------------------------------------------------------------
describe('web-scraper: validateSelectors', () => {
  beforeEach(() => {});

  it('should accept valid selectors', () => {
    const result = validateSelectors([{ name: 'title', selector: 'h1' }]);
    assert.equal(result.valid, true);
  });

  it('should reject null selectors', () => {
    const result = validateSelectors(null);
    assert.equal(result.valid, false);
  });

  it('should reject undefined selectors', () => {
    const result = validateSelectors(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject non-array selectors', () => {
    const result = validateSelectors('not-array');
    assert.equal(result.valid, false);
  });

  it('should reject empty array', () => {
    const result = validateSelectors([]);
    assert.equal(result.valid, false);
  });

  it('should reject exceeding MAX_SELECTORS_COUNT', () => {
    const selectors = Array.from({ length: MAX_SELECTORS_COUNT + 1 }, (_, i) => ({
      name: `s${i}`,
      selector: `div.c${i}`,
    }));
    const result = validateSelectors(selectors);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes(`${MAX_SELECTORS_COUNT}`));
  });

  it('should reject selector missing name', () => {
    const result = validateSelectors([{ selector: 'h1' }]);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('index 0'));
  });

  it('should reject selector missing selector field', () => {
    const result = validateSelectors([{ name: 'title' }]);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('index 0'));
  });

  it('should reject null selector entry', () => {
    const result = validateSelectors([null]);
    assert.equal(result.valid, false);
  });

  it('should reject selector with script tag in CSS', () => {
    const result = validateSelectors([{ name: 'bad', selector: '<script>x</script>' }]);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('script'));
  });

  it('should reject non-string attribute', () => {
    const result = validateSelectors([{ name: 'img', selector: 'img', attribute: 42 }]);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('attribute'));
  });

  it('should accept valid attribute', () => {
    const result = validateSelectors([{ name: 'img', selector: 'img', attribute: 'src' }]);
    assert.equal(result.valid, true);
  });

  it('should reject empty name string', () => {
    const result = validateSelectors([{ name: '', selector: 'h1' }]);
    assert.equal(result.valid, false);
  });

  it('should reject empty selector string', () => {
    const result = validateSelectors([{ name: 'title', selector: '' }]);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 18. validateTableIndex helper
// ---------------------------------------------------------------------------
describe('web-scraper: validateTableIndex', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateTableIndex(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 0);
  });

  it('should return default when null', () => {
    const result = validateTableIndex(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 0);
  });

  it('should accept valid index', () => {
    const result = validateTableIndex(3);
    assert.equal(result.valid, true);
    assert.equal(result.value, 3);
  });

  it('should accept 0', () => {
    const result = validateTableIndex(0);
    assert.equal(result.valid, true);
    assert.equal(result.value, 0);
  });

  it('should reject negative index', () => {
    const result = validateTableIndex(-1);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateTableIndex(1.5);
    assert.equal(result.valid, false);
  });

  it('should accept large valid index', () => {
    const result = validateTableIndex(100);
    assert.equal(result.valid, true);
    assert.equal(result.value, 100);
  });
});

// ---------------------------------------------------------------------------
// 19. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('web-scraper: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
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

  it('should return default for null context', () => {
    assert.equal(resolveTimeout(null), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 20. validate() export
// ---------------------------------------------------------------------------
describe('web-scraper: validate()', () => {
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

  it('should validate fetch_page requires url', () => {
    assert.equal(validate({ action: 'fetch_page' }).valid, false);
    assert.equal(validate({ action: 'fetch_page', url: 'file:///x' }).valid, false);
    assert.equal(validate({ action: 'fetch_page', url: 'https://example.com' }).valid, true);
  });

  it('should validate fetch_page rejects invalid headers', () => {
    assert.equal(validate({ action: 'fetch_page', url: 'https://example.com', headers: 'bad' }).valid, false);
    assert.equal(validate({ action: 'fetch_page', url: 'https://example.com', headers: { 'Accept': 'text/html' } }).valid, true);
  });

  it('should validate extract_text requires url', () => {
    assert.equal(validate({ action: 'extract_text' }).valid, false);
    assert.equal(validate({ action: 'extract_text', url: 'https://example.com' }).valid, true);
  });

  it('should validate extract_text rejects invalid selector', () => {
    const longSel = 'a'.repeat(MAX_SELECTOR_LENGTH + 1);
    assert.equal(validate({ action: 'extract_text', url: 'https://example.com', selector: longSel }).valid, false);
  });

  it('should validate extract_links requires url', () => {
    assert.equal(validate({ action: 'extract_links' }).valid, false);
    assert.equal(validate({ action: 'extract_links', url: 'https://example.com' }).valid, true);
  });

  it('should validate extract_links rejects invalid limit', () => {
    assert.equal(validate({ action: 'extract_links', url: 'https://example.com', limit: 0 }).valid, false);
    assert.equal(validate({ action: 'extract_links', url: 'https://example.com', limit: 50 }).valid, true);
  });

  it('should validate extract_metadata requires url', () => {
    assert.equal(validate({ action: 'extract_metadata' }).valid, false);
    assert.equal(validate({ action: 'extract_metadata', url: 'https://example.com' }).valid, true);
  });

  it('should validate extract_structured requires url and selectors', () => {
    assert.equal(validate({ action: 'extract_structured' }).valid, false);
    assert.equal(validate({ action: 'extract_structured', url: 'https://example.com' }).valid, false);
    assert.equal(validate({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'x', selector: 'div' }],
    }).valid, true);
  });

  it('should validate extract_tables requires url', () => {
    assert.equal(validate({ action: 'extract_tables' }).valid, false);
    assert.equal(validate({ action: 'extract_tables', url: 'https://example.com' }).valid, true);
  });

  it('should validate extract_tables rejects invalid tableIndex', () => {
    assert.equal(validate({ action: 'extract_tables', url: 'https://example.com', tableIndex: -1 }).valid, false);
    assert.equal(validate({ action: 'extract_tables', url: 'https://example.com', tableIndex: 0 }).valid, true);
  });

  it('should validate URL protocol blocking in validate()', () => {
    assert.equal(validate({ action: 'fetch_page', url: 'javascript:alert(1)' }).valid, false);
    assert.equal(validate({ action: 'fetch_page', url: 'data:text/html,test' }).valid, false);
    assert.equal(validate({ action: 'fetch_page', url: 'file:///etc/passwd' }).valid, false);
    assert.equal(validate({ action: 'fetch_page', url: 'ftp://example.com' }).valid, false);
  });
});

// ---------------------------------------------------------------------------
// 21. meta export
// ---------------------------------------------------------------------------
describe('web-scraper: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'web-scraper');
  });

  it('should have version', () => {
    assert.ok(meta.version);
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('scraping'));
  });

  it('should list all 6 actions', () => {
    assert.equal(meta.actions.length, 6);
    assert.ok(meta.actions.includes('fetch_page'));
    assert.ok(meta.actions.includes('extract_text'));
    assert.ok(meta.actions.includes('extract_links'));
    assert.ok(meta.actions.includes('extract_metadata'));
    assert.ok(meta.actions.includes('extract_structured'));
    assert.ok(meta.actions.includes('extract_tables'));
  });
});

// ---------------------------------------------------------------------------
// 22. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('web-scraper: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleFetchPage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/scraper/fetch');
  });

  it('should use gatewayClient for extract_text when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleText;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'extract_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/scraper/text');
  });
});

// ---------------------------------------------------------------------------
// 23. Security edge cases
// ---------------------------------------------------------------------------
describe('web-scraper: security edge cases', () => {
  beforeEach(() => {});

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('token: some_secret_test_value'));
    const result = await execute({ action: 'fetch_page', url: 'https://example.com' }, ctx);
    assert.ok(!result.result.includes('some_secret_test_value'));
  });

  it('should block file protocol in all actions', async () => {
    const ctx = mockContext(sampleFetchPage);
    for (const action of ['fetch_page', 'extract_text', 'extract_links', 'extract_metadata']) {
      const result = await execute({ action, url: 'file:///etc/passwd' }, ctx);
      assert.equal(result.metadata.success, false, `${action} should block file://`);
    }
  });

  it('should block javascript protocol in all actions', async () => {
    const ctx = mockContext(sampleFetchPage);
    for (const action of ['fetch_page', 'extract_text', 'extract_links', 'extract_metadata']) {
      const result = await execute({ action, url: 'javascript:void(0)' }, ctx);
      assert.equal(result.metadata.success, false, `${action} should block javascript:`);
    }
  });

  it('should block data protocol in all actions', async () => {
    const ctx = mockContext(sampleFetchPage);
    for (const action of ['fetch_page', 'extract_text', 'extract_links', 'extract_metadata']) {
      const result = await execute({ action, url: 'data:text/html,<h1>x</h1>' }, ctx);
      assert.equal(result.metadata.success, false, `${action} should block data:`);
    }
  });

  it('should block ftp protocol in all actions', async () => {
    const ctx = mockContext(sampleFetchPage);
    for (const action of ['fetch_page', 'extract_text', 'extract_links', 'extract_metadata']) {
      const result = await execute({ action, url: 'ftp://example.com/file' }, ctx);
      assert.equal(result.metadata.success, false, `${action} should block ftp:`);
    }
  });

  it('should reject script tag in selector for extract_structured', async () => {
    const ctx = mockContext(sampleStructured);
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors: [{ name: 'bad', selector: '<script>document.cookie</script>' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should enforce max selectors in extract_structured', async () => {
    const ctx = mockContext(sampleStructured);
    const selectors = Array.from({ length: 51 }, (_, i) => ({
      name: `sel${i}`,
      selector: `div.c${i}`,
    }));
    const result = await execute({
      action: 'extract_structured',
      url: 'https://example.com',
      selectors,
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should enforce max selector length in extract_text', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({
      action: 'extract_text',
      url: 'https://example.com',
      selector: 'a'.repeat(501),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should block case-insensitive protocol variants', async () => {
    const ctx = mockContext(sampleFetchPage);
    const protocols = ['FILE:///x', 'JAVASCRIPT:void(0)', 'DATA:text/html,test', 'FTP://x.com'];
    for (const url of protocols) {
      const result = await execute({ action: 'fetch_page', url }, ctx);
      assert.equal(result.metadata.success, false, `Should block ${url}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 24. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('web-scraper: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });

  it('should mention web scraping in message', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.result.includes('web scraping'));
  });
});

// ---------------------------------------------------------------------------
// 25. Constants validation
// ---------------------------------------------------------------------------
describe('web-scraper: constants', () => {
  beforeEach(() => {});

  it('should have correct default timeout', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should have correct max timeout', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });

  it('should have correct default link limit', () => {
    assert.equal(DEFAULT_LINK_LIMIT, 100);
  });

  it('should have correct max link limit', () => {
    assert.equal(MAX_LINK_LIMIT, 500);
  });

  it('should have correct max selector length', () => {
    assert.equal(MAX_SELECTOR_LENGTH, 500);
  });

  it('should have correct max selectors count', () => {
    assert.equal(MAX_SELECTORS_COUNT, 50);
  });

  it('should have correct max content length', () => {
    assert.equal(MAX_CONTENT_LENGTH, 10 * 1024 * 1024);
  });

  it('should have 6 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 6);
  });

  it('should have correct blocked protocols', () => {
    assert.ok(BLOCKED_PROTOCOLS.includes('file:'));
    assert.ok(BLOCKED_PROTOCOLS.includes('javascript:'));
    assert.ok(BLOCKED_PROTOCOLS.includes('data:'));
    assert.ok(BLOCKED_PROTOCOLS.includes('ftp:'));
  });

  it('should have 4 blocked protocols', () => {
    assert.equal(BLOCKED_PROTOCOLS.length, 4);
  });

  it('should have min link limit of 1', () => {
    assert.equal(MIN_LINK_LIMIT, 1);
  });
});

// ---------------------------------------------------------------------------
// 26. requestWithTimeout helper
// ---------------------------------------------------------------------------
describe('web-scraper: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return response on success', async () => {
    const mockClient = {
      request: async () => ({ data: 'success' }),
    };
    const result = await requestWithTimeout(mockClient, 'POST', '/test', {}, 5000);
    assert.deepEqual(result, { data: 'success' });
  });

  it('should throw TIMEOUT on abort', async () => {
    const mockClient = {
      request: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    try {
      await requestWithTimeout(mockClient, 'POST', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'TIMEOUT');
      assert.ok(err.message.includes('5000'));
    }
  });

  it('should throw UPSTREAM_ERROR on other errors', async () => {
    const mockClient = {
      request: async () => { throw new Error('network down'); },
    };
    try {
      await requestWithTimeout(mockClient, 'POST', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('network down'));
    }
  });

  it('should handle error without message', async () => {
    const mockClient = {
      request: async () => { throw new Error(); },
    };
    try {
      await requestWithTimeout(mockClient, 'POST', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
    }
  });

  it('should pass signal in opts', async () => {
    let receivedOpts = null;
    const mockClient = {
      request: async (method, path, body, opts) => {
        receivedOpts = opts;
        return {};
      },
    };
    await requestWithTimeout(mockClient, 'POST', '/test', { body: { x: 1 } }, 5000);
    assert.ok(receivedOpts.signal);
    assert.ok(receivedOpts.body);
  });
});
