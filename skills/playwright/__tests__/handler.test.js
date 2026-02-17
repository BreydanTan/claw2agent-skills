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
  validateScript,
  validateLinkLimit,
  validateFields,
  VALID_ACTIONS,
  VALID_SCREENSHOT_FORMATS,
  DEFAULT_SCREENSHOT_FORMAT,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_LINK_LIMIT,
  MIN_LINK_LIMIT,
  MAX_LINK_LIMIT,
  MAX_FIELDS,
  MAX_SELECTOR_LENGTH,
  MAX_SCRIPT_LENGTH,
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

/** Sample navigate response */
const sampleNavigate = {
  page: {
    title: 'Example Domain',
    status: 200,
    loadTime: 450,
  },
};

/** Sample screenshot response */
const sampleScreenshot = {
  screenshot: {
    size: 45000,
    width: 1920,
    height: 1080,
    data: 'base64data...',
  },
};

/** Sample text response */
const sampleText = {
  text: 'Hello World! This is the page content.',
};

/** Sample links response */
const sampleLinks = {
  links: [
    { text: 'Home', href: 'https://example.com/' },
    { text: 'About', href: 'https://example.com/about' },
    { text: 'Contact', href: 'https://example.com/contact' },
  ],
};

/** Sample fill response */
const sampleFill = {
  result: {
    submitted: true,
    fieldsProcessed: 2,
  },
};

/** Sample evaluate response */
const sampleEvaluate = {
  result: 'document has 42 elements',
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('playwright: action validation', () => {
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
});

// ---------------------------------------------------------------------------
// 2. URL validation (security - protocol blocking)
// ---------------------------------------------------------------------------
describe('playwright: URL validation security', () => {
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

  it('should reject ftp:// protocol', () => {
    const result = validateUrl('ftp://example.com/file');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('http://'));
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

  it('should block file:// in execute navigate', async () => {
    const ctx = mockContext(sampleNavigate);
    const result = await execute({ action: 'navigate', url: 'file:///etc/passwd' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should block javascript: in execute screenshot', async () => {
    const ctx = mockContext(sampleScreenshot);
    const result = await execute({ action: 'screenshot', url: 'javascript:alert(1)' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should block data: in execute get_text', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'get_text', url: 'data:text/html,test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 3. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('playwright: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail navigate without client', async () => {
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail screenshot without client', async () => {
    const result = await execute({ action: 'screenshot', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_text without client', async () => {
    const result = await execute({ action: 'get_text', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_links without client', async () => {
    const result = await execute({ action: 'get_links', url: 'https://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail fill_form without client', async () => {
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '#name', value: 'test' }],
    }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail evaluate without client', async () => {
    const result = await execute({
      action: 'evaluate',
      url: 'https://example.com',
      script: 'return 1',
    }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 4. navigate action
// ---------------------------------------------------------------------------
describe('playwright: navigate', () => {
  beforeEach(() => {});

  it('should navigate to a URL', async () => {
    const ctx = mockContext(sampleNavigate);
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'navigate');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.ok(result.result.includes('Navigated to'));
    assert.ok(result.result.includes('Example Domain'));
  });

  it('should include page details in result', async () => {
    const ctx = mockContext(sampleNavigate);
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('Status: 200'));
    assert.ok(result.result.includes('Load time: 450ms'));
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleNavigate);
    const result = await execute({ action: 'navigate' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleNavigate);
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
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
          return sampleNavigate;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/browser/navigate');
  });
});

// ---------------------------------------------------------------------------
// 5. screenshot action
// ---------------------------------------------------------------------------
describe('playwright: screenshot', () => {
  beforeEach(() => {});

  it('should take a screenshot', async () => {
    const ctx = mockContext(sampleScreenshot);
    const result = await execute({ action: 'screenshot', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'screenshot');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.equal(result.metadata.format, 'png');
    assert.equal(result.metadata.fullPage, false);
    assert.ok(result.result.includes('Screenshot taken'));
  });

  it('should support jpeg format', async () => {
    const ctx = mockContext(sampleScreenshot);
    const result = await execute({ action: 'screenshot', url: 'https://example.com', format: 'jpeg' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.format, 'jpeg');
    assert.ok(result.result.includes('Format: jpeg'));
  });

  it('should support fullPage option', async () => {
    const ctx = mockContext(sampleScreenshot);
    const result = await execute({ action: 'screenshot', url: 'https://example.com', fullPage: true }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.fullPage, true);
    assert.ok(result.result.includes('Full page: true'));
  });

  it('should reject invalid format', async () => {
    const ctx = mockContext(sampleScreenshot);
    const result = await execute({ action: 'screenshot', url: 'https://example.com', format: 'gif' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleScreenshot);
    const result = await execute({ action: 'screenshot' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should default fullPage to false', async () => {
    const ctx = mockContext(sampleScreenshot);
    const result = await execute({ action: 'screenshot', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.fullPage, false);
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleScreenshot;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'screenshot', url: 'https://example.com' }, ctx);
    assert.equal(calledPath, '/browser/screenshot');
  });

  it('should include dimensions in result', async () => {
    const ctx = mockContext(sampleScreenshot);
    const result = await execute({ action: 'screenshot', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('1920x1080'));
  });
});

// ---------------------------------------------------------------------------
// 6. get_text action
// ---------------------------------------------------------------------------
describe('playwright: get_text', () => {
  beforeEach(() => {});

  it('should extract text from page', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'get_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_text');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.equal(result.metadata.selector, null);
    assert.ok(result.result.includes('Hello World'));
  });

  it('should use optional selector', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'get_text', url: 'https://example.com', selector: '.content' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.selector, '.content');
    assert.ok(result.result.includes('Selector: .content'));
  });

  it('should show full page when no selector', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'get_text', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('(full page)'));
  });

  it('should reject selector with script tag', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'get_text', url: 'https://example.com', selector: '<script>alert(1)</script>' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject selector exceeding max length', async () => {
    const ctx = mockContext(sampleText);
    const longSelector = 'a'.repeat(MAX_SELECTOR_LENGTH + 1);
    const result = await execute({ action: 'get_text', url: 'https://example.com', selector: longSelector }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({ action: 'get_text' }, ctx);
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
    await execute({ action: 'get_text', url: 'https://example.com' }, ctx);
    assert.equal(calledPath, '/browser/text');
  });

  it('should handle content field in response', async () => {
    const ctx = mockContext({ content: 'Alternate content field' });
    const result = await execute({ action: 'get_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Alternate content field'));
  });
});

// ---------------------------------------------------------------------------
// 7. get_links action
// ---------------------------------------------------------------------------
describe('playwright: get_links', () => {
  beforeEach(() => {});

  it('should extract links from page', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'get_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_links');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.equal(result.metadata.limit, DEFAULT_LINK_LIMIT);
    assert.equal(result.metadata.linkCount, 3);
    assert.ok(result.result.includes('Home'));
    assert.ok(result.result.includes('About'));
  });

  it('should use custom limit', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'get_links', url: 'https://example.com', limit: 10 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 10);
  });

  it('should clamp limit to MAX_LINK_LIMIT', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'get_links', url: 'https://example.com', limit: 1000 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, MAX_LINK_LIMIT);
  });

  it('should reject limit of 0', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'get_links', url: 'https://example.com', limit: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject negative limit', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'get_links', url: 'https://example.com', limit: -5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleLinks);
    const result = await execute({ action: 'get_links' }, ctx);
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
    await execute({ action: 'get_links', url: 'https://example.com' }, ctx);
    assert.equal(calledPath, '/browser/links');
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [{ href: 'https://example.com/alt' }] });
    const result = await execute({ action: 'get_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.linkCount, 1);
  });

  it('should handle empty links list', async () => {
    const ctx = mockContext({ links: [] });
    const result = await execute({ action: 'get_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.linkCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 8. fill_form action
// ---------------------------------------------------------------------------
describe('playwright: fill_form', () => {
  beforeEach(() => {});

  it('should fill form fields', async () => {
    const ctx = mockContext(sampleFill);
    const fields = [
      { selector: '#name', value: 'John' },
      { selector: '#email', value: 'john@example.com' },
    ];
    const result = await execute({ action: 'fill_form', url: 'https://example.com', fields }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'fill_form');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.equal(result.metadata.fieldCount, 2);
    assert.ok(result.result.includes('Form filled'));
  });

  it('should reject missing fields', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({ action: 'fill_form', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty fields array', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({ action: 'fill_form', url: 'https://example.com', fields: [] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-array fields', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({ action: 'fill_form', url: 'https://example.com', fields: 'not-array' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject fields exceeding MAX_FIELDS', async () => {
    const ctx = mockContext(sampleFill);
    const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({ selector: `#f${i}`, value: 'v' }));
    const result = await execute({ action: 'fill_form', url: 'https://example.com', fields }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject field without selector', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ value: 'test' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject field without value', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '#name' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject field with script tag in selector', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '<script>alert(1)</script>', value: 'test' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({
      action: 'fill_form',
      fields: [{ selector: '#name', value: 'test' }],
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
          return sampleFill;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '#name', value: 'test' }],
    }, ctx);
    assert.equal(calledPath, '/browser/fill');
  });

  it('should show submitted status', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '#name', value: 'test' }],
    }, ctx);
    assert.ok(result.result.includes('Submitted'));
  });
});

// ---------------------------------------------------------------------------
// 9. evaluate action
// ---------------------------------------------------------------------------
describe('playwright: evaluate', () => {
  beforeEach(() => {});

  it('should evaluate script on page', async () => {
    const ctx = mockContext(sampleEvaluate);
    const result = await execute({
      action: 'evaluate',
      url: 'https://example.com',
      script: 'return document.title',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'evaluate');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.url, 'https://example.com');
    assert.ok(result.result.includes('Evaluate on'));
    assert.ok(result.result.includes('42 elements'));
  });

  it('should reject missing script', async () => {
    const ctx = mockContext(sampleEvaluate);
    const result = await execute({ action: 'evaluate', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty script', async () => {
    const ctx = mockContext(sampleEvaluate);
    const result = await execute({ action: 'evaluate', url: 'https://example.com', script: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only script', async () => {
    const ctx = mockContext(sampleEvaluate);
    const result = await execute({ action: 'evaluate', url: 'https://example.com', script: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject script exceeding MAX_SCRIPT_LENGTH', async () => {
    const ctx = mockContext(sampleEvaluate);
    const longScript = 'x'.repeat(MAX_SCRIPT_LENGTH + 1);
    const result = await execute({ action: 'evaluate', url: 'https://example.com', script: longScript }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept script at exactly MAX_SCRIPT_LENGTH', async () => {
    const ctx = mockContext(sampleEvaluate);
    const exactScript = 'x'.repeat(MAX_SCRIPT_LENGTH);
    const result = await execute({ action: 'evaluate', url: 'https://example.com', script: exactScript }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.scriptLength, MAX_SCRIPT_LENGTH);
  });

  it('should reject missing URL', async () => {
    const ctx = mockContext(sampleEvaluate);
    const result = await execute({ action: 'evaluate', script: 'return 1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include script length in metadata', async () => {
    const ctx = mockContext(sampleEvaluate);
    const result = await execute({
      action: 'evaluate',
      url: 'https://example.com',
      script: 'return document.title',
    }, ctx);
    assert.equal(result.metadata.scriptLength, 'return document.title'.length);
  });

  it('should call correct endpoint', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleEvaluate;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'evaluate', url: 'https://example.com', script: 'return 1' }, ctx);
    assert.equal(calledPath, '/browser/evaluate');
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout handling
// ---------------------------------------------------------------------------
describe('playwright: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT on navigate abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on screenshot abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'screenshot', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on get_text abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on get_links abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on fill_form abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '#x', value: 'y' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT on evaluate abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({
      action: 'evaluate',
      url: 'https://example.com',
      script: 'return 1',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 11. Network error handling
// ---------------------------------------------------------------------------
describe('playwright: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on navigate failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on screenshot failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'screenshot', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_text failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'get_text', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_links failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'get_links', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on fill_form failure', async () => {
    const ctx = mockContextError(new Error('Rate limited'));
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '#x', value: 'y' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on evaluate failure', async () => {
    const ctx = mockContextError(new Error('Service unavailable'));
    const result = await execute({
      action: 'evaluate',
      url: 'https://example.com',
      script: 'return 1',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 12. getClient helper
// ---------------------------------------------------------------------------
describe('playwright: getClient', () => {
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
// 13. redactSensitive
// ---------------------------------------------------------------------------
describe('playwright: redactSensitive', () => {
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

  it('should not alter clean strings', () => {
    const input = 'Navigated to https://example.com successfully';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 14. validateSelector helper
// ---------------------------------------------------------------------------
describe('playwright: validateSelector', () => {
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
    assert.ok(result.error.includes('200'));
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
});

// ---------------------------------------------------------------------------
// 15. validateScript helper
// ---------------------------------------------------------------------------
describe('playwright: validateScript', () => {
  beforeEach(() => {});

  it('should accept valid script', () => {
    const result = validateScript('return document.title');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'return document.title');
  });

  it('should reject missing script', () => {
    const result = validateScript(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject null script', () => {
    const result = validateScript(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty script', () => {
    const result = validateScript('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only script', () => {
    const result = validateScript('   ');
    assert.equal(result.valid, false);
  });

  it('should reject script exceeding max length', () => {
    const result = validateScript('x'.repeat(MAX_SCRIPT_LENGTH + 1));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('2000'));
  });

  it('should accept script at exactly max length', () => {
    const result = validateScript('x'.repeat(MAX_SCRIPT_LENGTH));
    assert.equal(result.valid, true);
  });

  it('should reject non-string script', () => {
    const result = validateScript(42);
    assert.equal(result.valid, false);
  });

  it('should trim whitespace', () => {
    const result = validateScript('  return 1  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'return 1');
  });
});

// ---------------------------------------------------------------------------
// 16. validateLinkLimit helper
// ---------------------------------------------------------------------------
describe('playwright: validateLinkLimit', () => {
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
});

// ---------------------------------------------------------------------------
// 17. validateFields helper
// ---------------------------------------------------------------------------
describe('playwright: validateFields', () => {
  beforeEach(() => {});

  it('should accept valid fields', () => {
    const result = validateFields([{ selector: '#name', value: 'test' }]);
    assert.equal(result.valid, true);
  });

  it('should reject null fields', () => {
    const result = validateFields(null);
    assert.equal(result.valid, false);
  });

  it('should reject undefined fields', () => {
    const result = validateFields(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject non-array fields', () => {
    const result = validateFields('not-array');
    assert.equal(result.valid, false);
  });

  it('should reject empty array', () => {
    const result = validateFields([]);
    assert.equal(result.valid, false);
  });

  it('should reject exceeding MAX_FIELDS', () => {
    const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({ selector: `#f${i}`, value: 'v' }));
    const result = validateFields(fields);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes(`${MAX_FIELDS}`));
  });

  it('should reject field missing selector', () => {
    const result = validateFields([{ value: 'test' }]);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('index 0'));
  });

  it('should reject field missing value', () => {
    const result = validateFields([{ selector: '#name' }]);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('index 0'));
  });

  it('should reject null field entry', () => {
    const result = validateFields([null]);
    assert.equal(result.valid, false);
  });

  it('should reject field with script tag in selector', () => {
    const result = validateFields([{ selector: '<script>x</script>', value: 'test' }]);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('script'));
  });
});

// ---------------------------------------------------------------------------
// 18. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('playwright: resolveTimeout', () => {
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
});

// ---------------------------------------------------------------------------
// 19. validate() export
// ---------------------------------------------------------------------------
describe('playwright: validate()', () => {
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

  it('should validate navigate requires url', () => {
    assert.equal(validate({ action: 'navigate' }).valid, false);
    assert.equal(validate({ action: 'navigate', url: 'file:///x' }).valid, false);
    assert.equal(validate({ action: 'navigate', url: 'https://example.com' }).valid, true);
  });

  it('should validate screenshot requires url', () => {
    assert.equal(validate({ action: 'screenshot' }).valid, false);
    assert.equal(validate({ action: 'screenshot', url: 'https://example.com' }).valid, true);
  });

  it('should validate screenshot rejects invalid format', () => {
    assert.equal(validate({ action: 'screenshot', url: 'https://example.com', format: 'gif' }).valid, false);
    assert.equal(validate({ action: 'screenshot', url: 'https://example.com', format: 'png' }).valid, true);
    assert.equal(validate({ action: 'screenshot', url: 'https://example.com', format: 'jpeg' }).valid, true);
  });

  it('should validate get_text requires url', () => {
    assert.equal(validate({ action: 'get_text' }).valid, false);
    assert.equal(validate({ action: 'get_text', url: 'https://example.com' }).valid, true);
  });

  it('should validate get_text rejects invalid selector', () => {
    const longSel = 'a'.repeat(MAX_SELECTOR_LENGTH + 1);
    assert.equal(validate({ action: 'get_text', url: 'https://example.com', selector: longSel }).valid, false);
  });

  it('should validate get_links requires url', () => {
    assert.equal(validate({ action: 'get_links' }).valid, false);
    assert.equal(validate({ action: 'get_links', url: 'https://example.com' }).valid, true);
  });

  it('should validate get_links rejects invalid limit', () => {
    assert.equal(validate({ action: 'get_links', url: 'https://example.com', limit: 0 }).valid, false);
    assert.equal(validate({ action: 'get_links', url: 'https://example.com', limit: 50 }).valid, true);
  });

  it('should validate fill_form requires url and fields', () => {
    assert.equal(validate({ action: 'fill_form' }).valid, false);
    assert.equal(validate({ action: 'fill_form', url: 'https://example.com' }).valid, false);
    assert.equal(validate({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '#x', value: 'y' }],
    }).valid, true);
  });

  it('should validate evaluate requires url and script', () => {
    assert.equal(validate({ action: 'evaluate' }).valid, false);
    assert.equal(validate({ action: 'evaluate', url: 'https://example.com' }).valid, false);
    assert.equal(validate({
      action: 'evaluate',
      url: 'https://example.com',
      script: 'return 1',
    }).valid, true);
  });

  it('should validate URL protocol blocking in validate()', () => {
    assert.equal(validate({ action: 'navigate', url: 'javascript:alert(1)' }).valid, false);
    assert.equal(validate({ action: 'navigate', url: 'data:text/html,test' }).valid, false);
    assert.equal(validate({ action: 'navigate', url: 'file:///etc/passwd' }).valid, false);
  });
});

// ---------------------------------------------------------------------------
// 20. meta export
// ---------------------------------------------------------------------------
describe('playwright: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'playwright');
  });

  it('should have version', () => {
    assert.ok(meta.version);
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('Browser'));
  });

  it('should list all 6 actions', () => {
    assert.equal(meta.actions.length, 6);
    assert.ok(meta.actions.includes('navigate'));
    assert.ok(meta.actions.includes('screenshot'));
    assert.ok(meta.actions.includes('get_text'));
    assert.ok(meta.actions.includes('get_links'));
    assert.ok(meta.actions.includes('fill_form'));
    assert.ok(meta.actions.includes('evaluate'));
  });
});

// ---------------------------------------------------------------------------
// 21. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('playwright: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleNavigate;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/browser/navigate');
  });
});

// ---------------------------------------------------------------------------
// 22. Security edge cases
// ---------------------------------------------------------------------------
describe('playwright: security edge cases', () => {
  beforeEach(() => {});

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('token: some_secret_test_value'));
    const result = await execute({ action: 'navigate', url: 'https://example.com' }, ctx);
    assert.ok(!result.result.includes('some_secret_test_value'));
  });

  it('should block file protocol in all actions', async () => {
    const ctx = mockContext(sampleNavigate);
    for (const action of ['navigate', 'screenshot', 'get_text', 'get_links']) {
      const result = await execute({ action, url: 'file:///etc/passwd' }, ctx);
      assert.equal(result.metadata.success, false, `${action} should block file://`);
    }
  });

  it('should block javascript protocol in all actions', async () => {
    const ctx = mockContext(sampleNavigate);
    for (const action of ['navigate', 'screenshot', 'get_text', 'get_links']) {
      const result = await execute({ action, url: 'javascript:void(0)' }, ctx);
      assert.equal(result.metadata.success, false, `${action} should block javascript:`);
    }
  });

  it('should block data protocol in all actions', async () => {
    const ctx = mockContext(sampleNavigate);
    for (const action of ['navigate', 'screenshot', 'get_text', 'get_links']) {
      const result = await execute({ action, url: 'data:text/html,<h1>x</h1>' }, ctx);
      assert.equal(result.metadata.success, false, `${action} should block data:`);
    }
  });

  it('should reject script tag in selector for fill_form fields', async () => {
    const ctx = mockContext(sampleFill);
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields: [{ selector: '<script>document.cookie</script>', value: 'test' }],
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should enforce max fields in fill_form', async () => {
    const ctx = mockContext(sampleFill);
    const fields = Array.from({ length: 51 }, (_, i) => ({ selector: `#field${i}`, value: `val${i}` }));
    const result = await execute({
      action: 'fill_form',
      url: 'https://example.com',
      fields,
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should enforce max script length in evaluate', async () => {
    const ctx = mockContext(sampleEvaluate);
    const result = await execute({
      action: 'evaluate',
      url: 'https://example.com',
      script: 'x'.repeat(2001),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should enforce max selector length in get_text', async () => {
    const ctx = mockContext(sampleText);
    const result = await execute({
      action: 'get_text',
      url: 'https://example.com',
      selector: 'a'.repeat(201),
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 23. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('playwright: providerNotConfiguredError', () => {
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
// 24. Constants validation
// ---------------------------------------------------------------------------
describe('playwright: constants', () => {
  beforeEach(() => {});

  it('should have correct default timeout', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should have correct max timeout', () => {
    assert.equal(MAX_TIMEOUT_MS, 60000);
  });

  it('should have correct default link limit', () => {
    assert.equal(DEFAULT_LINK_LIMIT, 100);
  });

  it('should have correct max link limit', () => {
    assert.equal(MAX_LINK_LIMIT, 500);
  });

  it('should have correct max selector length', () => {
    assert.equal(MAX_SELECTOR_LENGTH, 200);
  });

  it('should have correct max script length', () => {
    assert.equal(MAX_SCRIPT_LENGTH, 2000);
  });

  it('should have correct max fields', () => {
    assert.equal(MAX_FIELDS, 50);
  });

  it('should have 6 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 6);
  });

  it('should have correct blocked protocols', () => {
    assert.ok(BLOCKED_PROTOCOLS.includes('file:'));
    assert.ok(BLOCKED_PROTOCOLS.includes('javascript:'));
    assert.ok(BLOCKED_PROTOCOLS.includes('data:'));
  });

  it('should have correct screenshot formats', () => {
    assert.deepEqual(VALID_SCREENSHOT_FORMATS, ['png', 'jpeg']);
  });

  it('should have correct default screenshot format', () => {
    assert.equal(DEFAULT_SCREENSHOT_FORMAT, 'png');
  });
});
