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
  VALID_ACTIONS,
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

/** Sample send response */
const sampleSendResult = {
  messages: [{ id: 'wamid_test_abc123' }],
};

/** Sample mark_read response */
const sampleMarkReadResult = {
  success: true,
};

/** Sample send_template response */
const sampleTemplateResult = {
  messages: [{ id: 'wamid_test_tpl456' }],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('whatsapp-integration: action validation', () => {
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
describe('whatsapp-integration: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail send_message without client', async () => {
    const result = await execute({ action: 'send_message', to: '+1234567890', content: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail mark_read without client', async () => {
    const result = await execute({ action: 'mark_read', messageId: 'wamid_test_123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail send_template without client', async () => {
    const result = await execute({ action: 'send_template', to: '+1234567890', templateName: 'hello_world' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should NOT fail get_messages without client (no API call)', async () => {
    const result = await execute({ action: 'get_messages' }, {});
    assert.equal(result.metadata.error, 'NOT_SUPPORTED');
    // get_messages never needs a client since it returns NOT_SUPPORTED
  });
});

// ---------------------------------------------------------------------------
// 3. send_message
// ---------------------------------------------------------------------------
describe('whatsapp-integration: send_message', () => {
  beforeEach(() => {});

  it('should send a message successfully', async () => {
    const ctx = mockContext(sampleSendResult);
    const result = await execute({ action: 'send_message', to: '+1234567890', content: 'Hello there' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'send_message');
    assert.equal(result.metadata.to, '+1234567890');
    assert.ok(result.metadata.timestamp);
    assert.ok(result.result.includes('+1234567890'));
  });

  it('should return messageId from response', async () => {
    const ctx = mockContext(sampleSendResult);
    const result = await execute({ action: 'send_message', to: '+1234567890', content: 'Hi' }, ctx);
    assert.equal(result.metadata.messageId, 'wamid_test_abc123');
    assert.ok(result.result.includes('wamid_test_abc123'));
  });

  it('should reject missing to', async () => {
    const ctx = mockContext(sampleSendResult);
    const result = await execute({ action: 'send_message', content: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing content', async () => {
    const ctx = mockContext(sampleSendResult);
    const result = await execute({ action: 'send_message', to: '+1234567890' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject to not string', async () => {
    const ctx = mockContext(sampleSendResult);
    const result = await execute({ action: 'send_message', to: 12345, content: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject content not string', async () => {
    const ctx = mockContext(sampleSendResult);
    const result = await execute({ action: 'send_message', to: '+1234567890', content: 42 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 4. mark_read
// ---------------------------------------------------------------------------
describe('whatsapp-integration: mark_read', () => {
  beforeEach(() => {});

  it('should mark a message as read successfully', async () => {
    const ctx = mockContext(sampleMarkReadResult);
    const result = await execute({ action: 'mark_read', messageId: 'wamid_test_read789' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'mark_read');
    assert.equal(result.metadata.messageId, 'wamid_test_read789');
    assert.ok(result.metadata.timestamp);
    assert.ok(result.result.includes('wamid_test_read789'));
  });

  it('should reject missing messageId', async () => {
    const ctx = mockContext(sampleMarkReadResult);
    const result = await execute({ action: 'mark_read' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject messageId not string', async () => {
    const ctx = mockContext(sampleMarkReadResult);
    const result = await execute({ action: 'mark_read', messageId: 123 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 5. get_messages
// ---------------------------------------------------------------------------
describe('whatsapp-integration: get_messages', () => {
  beforeEach(() => {});

  it('should return NOT_SUPPORTED error code', async () => {
    const result = await execute({ action: 'get_messages' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'NOT_SUPPORTED');
    assert.equal(result.metadata.action, 'get_messages');
    assert.ok(result.result.includes('not supported'));
  });

  it('should not need a client', async () => {
    const result = await execute({ action: 'get_messages' }, {});
    // Should return NOT_SUPPORTED, not PROVIDER_NOT_CONFIGURED
    assert.equal(result.metadata.error, 'NOT_SUPPORTED');
    assert.notEqual(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 6. send_template
// ---------------------------------------------------------------------------
describe('whatsapp-integration: send_template', () => {
  beforeEach(() => {});

  it('should send a template successfully', async () => {
    const ctx = mockContext(sampleTemplateResult);
    const result = await execute({ action: 'send_template', to: '+9876543210', templateName: 'hello_world' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'send_template');
    assert.equal(result.metadata.to, '+9876543210');
    assert.equal(result.metadata.templateName, 'hello_world');
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing to', async () => {
    const ctx = mockContext(sampleTemplateResult);
    const result = await execute({ action: 'send_template', templateName: 'hello_world' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing templateName', async () => {
    const ctx = mockContext(sampleTemplateResult);
    const result = await execute({ action: 'send_template', to: '+1234567890' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should use default language en', async () => {
    const ctx = mockContext(sampleTemplateResult);
    const result = await execute({ action: 'send_template', to: '+1234567890', templateName: 'hello_world' }, ctx);
    assert.equal(result.metadata.language, 'en');
  });

  it('should use custom language', async () => {
    const ctx = mockContext(sampleTemplateResult);
    const result = await execute({ action: 'send_template', to: '+1234567890', templateName: 'hello_world', language: 'es' }, ctx);
    assert.equal(result.metadata.language, 'es');
  });

  it('should return messageId from response', async () => {
    const ctx = mockContext(sampleTemplateResult);
    const result = await execute({ action: 'send_template', to: '+1234567890', templateName: 'hello_world' }, ctx);
    assert.equal(result.metadata.messageId, 'wamid_test_tpl456');
    assert.ok(result.result.includes('wamid_test_tpl456'));
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout
// ---------------------------------------------------------------------------
describe('whatsapp-integration: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on send_message abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'send_message', to: '+1234567890', content: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on mark_read abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'mark_read', messageId: 'wamid_test_timeout' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on send_template abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'send_template', to: '+1234567890', templateName: 'hello_world' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 8. Network errors
// ---------------------------------------------------------------------------
describe('whatsapp-integration: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on send_message failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'send_message', to: '+1234567890', content: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
    assert.ok(result.result.includes('Connection refused'));
  });

  it('should return UPSTREAM_ERROR on mark_read failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'mark_read', messageId: 'wamid_test_err' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
    assert.ok(result.result.includes('Network down'));
  });

  it('should return UPSTREAM_ERROR on send_template failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'send_template', to: '+1234567890', templateName: 'hello_world' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
    assert.ok(result.result.includes('Server error'));
  });
});

// ---------------------------------------------------------------------------
// 9. getClient
// ---------------------------------------------------------------------------
describe('whatsapp-integration: getClient', () => {
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
// 10. redactSensitive
// ---------------------------------------------------------------------------
describe('whatsapp-integration: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: test_placeholder_token data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_placeholder_token'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer patterns', () => {
    const input = 'bearer: sample_api_key_for_testing';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_api_key_for_testing'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: sample_auth_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_auth_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Message sent to +1234567890 successfully';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 11. resolveTimeout
// ---------------------------------------------------------------------------
describe('whatsapp-integration: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use custom configured timeout', () => {
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

  it('should verify DEFAULT_TIMEOUT_MS is 30000', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should verify MAX_TIMEOUT_MS is 120000', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });
});

// ---------------------------------------------------------------------------
// 12. validate()
// ---------------------------------------------------------------------------
describe('whatsapp-integration: validate()', () => {
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

  it('should validate send_message requires to and content', () => {
    assert.equal(validate({ action: 'send_message' }).valid, false);
    assert.equal(validate({ action: 'send_message', to: '+1234567890' }).valid, false);
    assert.equal(validate({ action: 'send_message', content: 'Hi' }).valid, false);
    assert.equal(validate({ action: 'send_message', to: '+1234567890', content: 'Hi' }).valid, true);
  });

  it('should validate mark_read requires messageId', () => {
    assert.equal(validate({ action: 'mark_read' }).valid, false);
    assert.equal(validate({ action: 'mark_read', messageId: 'wamid_test_val' }).valid, true);
  });

  it('should validate get_messages requires nothing', () => {
    assert.equal(validate({ action: 'get_messages' }).valid, true);
  });

  it('should validate send_template requires to and templateName', () => {
    assert.equal(validate({ action: 'send_template' }).valid, false);
    assert.equal(validate({ action: 'send_template', to: '+1234567890' }).valid, false);
    assert.equal(validate({ action: 'send_template', templateName: 'hello' }).valid, false);
    assert.equal(validate({ action: 'send_template', to: '+1234567890', templateName: 'hello' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 13. meta export
// ---------------------------------------------------------------------------
describe('whatsapp-integration: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'whatsapp-integration');
  });

  it('should have version', () => {
    assert.ok(meta.version);
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('WhatsApp'));
  });

  it('should list all 4 actions', () => {
    assert.equal(meta.actions.length, 4);
    assert.ok(meta.actions.includes('send_message'));
    assert.ok(meta.actions.includes('mark_read'));
    assert.ok(meta.actions.includes('get_messages'));
    assert.ok(meta.actions.includes('send_template'));
  });
});

// ---------------------------------------------------------------------------
// 14. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('whatsapp-integration: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent for send_message', async () => {
    let calledPath = null;
    let calledMethod = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleSendResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'send_message', to: '+1234567890', content: 'Hi' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/messages');
  });
});

// ---------------------------------------------------------------------------
// 15. providerNotConfiguredError
// ---------------------------------------------------------------------------
describe('whatsapp-integration: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });

  it('should include Error in result', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.result.includes('Error'));
  });
});

// ---------------------------------------------------------------------------
// 16. constants
// ---------------------------------------------------------------------------
describe('whatsapp-integration: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, [
      'send_message', 'mark_read', 'get_messages', 'send_template',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 17. request body verification
// ---------------------------------------------------------------------------
describe('whatsapp-integration: request body verification', () => {
  beforeEach(() => {});

  it('should send correct body for send_message', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleSendResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'send_message', to: '+1234567890', content: 'Hello World' }, ctx);
    assert.ok(capturedOpts.body);
    assert.equal(capturedOpts.body.messaging_product, 'whatsapp');
    assert.equal(capturedOpts.body.to, '+1234567890');
    assert.equal(capturedOpts.body.type, 'text');
    assert.deepEqual(capturedOpts.body.text, { body: 'Hello World' });
  });

  it('should send correct body for mark_read', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleMarkReadResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'mark_read', messageId: 'wamid_test_body_check' }, ctx);
    assert.ok(capturedOpts.body);
    assert.equal(capturedOpts.body.messaging_product, 'whatsapp');
    assert.equal(capturedOpts.body.status, 'read');
    assert.equal(capturedOpts.body.message_id, 'wamid_test_body_check');
  });

  it('should send correct body for send_template with default language', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleTemplateResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'send_template', to: '+1234567890', templateName: 'hello_world' }, ctx);
    assert.ok(capturedOpts.body);
    assert.equal(capturedOpts.body.messaging_product, 'whatsapp');
    assert.equal(capturedOpts.body.to, '+1234567890');
    assert.equal(capturedOpts.body.type, 'template');
    assert.deepEqual(capturedOpts.body.template, {
      name: 'hello_world',
      language: { code: 'en' },
    });
  });

  it('should send correct body for send_template with custom language', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleTemplateResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'send_template', to: '+1234567890', templateName: 'promo', language: 'pt_BR' }, ctx);
    assert.deepEqual(capturedOpts.body.template, {
      name: 'promo',
      language: { code: 'pt_BR' },
    });
  });

  it('should POST to /messages for all API actions', async () => {
    const paths = [];
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          paths.push(path);
          return sampleSendResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'send_message', to: '+1', content: 'Hi' }, ctx);
    await execute({ action: 'mark_read', messageId: 'wamid_test_path' }, ctx);
    await execute({ action: 'send_template', to: '+1', templateName: 'tpl' }, ctx);
    assert.equal(paths.length, 3);
    for (const p of paths) {
      assert.equal(p, '/messages');
    }
  });
});
