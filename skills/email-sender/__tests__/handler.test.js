import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

/**
 * Create a mock fetch that returns a successful JSON response.
 */
function mockFetchJson(data, status = 200) {
  global.fetch = async (url, options) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => data,
  });
}

/**
 * Create a mock fetch that tracks calls and returns JSON data.
 */
function mockFetchWithSpy(data, status = 200) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: async () => data,
    };
  };
  return calls;
}

/**
 * Create a mock fetch that returns an API error response.
 */
function mockFetchApiError(status, errorData) {
  global.fetch = async () => ({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => errorData,
  });
}

/**
 * Create a mock fetch that throws a network error.
 */
function mockFetchNetworkError(message) {
  global.fetch = async () => { throw new Error(message); };
}

/**
 * Create a mock fetch where json() throws (e.g. invalid JSON from network error mid-response).
 */
function mockFetchJsonParseError() {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new Error('Unexpected token in JSON'); },
  });
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleSuccess = { id: 'email-id-abc123' };

const validParams = {
  to: 'user@example.com',
  subject: 'Test Subject',
  body: 'Hello, this is a test email.',
};

const validContext = { apiKey: 'resend-api-key-123' };

// ---------------------------------------------------------------------------
// 1. Successful send
// ---------------------------------------------------------------------------
describe('email-sender: successful send', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should send email successfully', async () => {
    const result = await execute(validParams, validContext);
    assert.ok(result.result.includes('Email sent to'));
  });

  it('should include recipient in result', async () => {
    const result = await execute(validParams, validContext);
    assert.ok(result.result.includes('user@example.com'));
  });

  it('should return metadata with id', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(result.metadata.id, 'email-id-abc123');
  });

  it('should return metadata with status sent', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(result.metadata.status, 'sent');
  });

  it('should POST to Resend API endpoint', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.method, 'POST');
  });

  it('should send Bearer token in Authorization header', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer resend-api-key-123');
  });

  it('should set Content-Type to application/json', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  });

  it('should send to as an array', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body.to, ['user@example.com']);
  });

  it('should send subject in body', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.subject, 'Test Subject');
  });

  it('should send body as text field', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.text, 'Hello, this is a test email.');
  });

  it('should use default from address', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.from, 'onboarding@resend.dev');
  });

  it('should return result as a string', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(typeof result.result, 'string');
  });

  it('should return metadata as an object', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(typeof result.metadata, 'object');
  });
});

// ---------------------------------------------------------------------------
// 2. Custom from address
// ---------------------------------------------------------------------------
describe('email-sender: custom from address', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should use custom from address when provided', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute({ ...validParams, from: 'noreply@mycompany.com' }, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.from, 'noreply@mycompany.com');
  });

  it('should override default from with custom from', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute({ ...validParams, from: 'custom@example.com' }, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.notEqual(body.from, 'onboarding@resend.dev');
    assert.equal(body.from, 'custom@example.com');
  });

  it('should still send successfully with custom from', async () => {
    const result = await execute({ ...validParams, from: 'alerts@mycompany.com' }, validContext);
    assert.ok(result.result.includes('Email sent to'));
  });

  it('should default from when from is undefined', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute({ ...validParams, from: undefined }, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.from, 'onboarding@resend.dev');
  });
});

// ---------------------------------------------------------------------------
// 3. Missing required params - to
// ---------------------------------------------------------------------------
describe('email-sender: missing to parameter', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should throw if to is missing', async () => {
    await assert.rejects(
      () => execute({ subject: 'Test', body: 'Body' }, validContext),
      { message: /'to', 'subject', and 'body' are required/i }
    );
  });

  it('should throw if to is undefined', async () => {
    await assert.rejects(
      () => execute({ to: undefined, subject: 'Test', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw if to is null', async () => {
    await assert.rejects(
      () => execute({ to: null, subject: 'Test', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw if to is empty string', async () => {
    await assert.rejects(
      () => execute({ to: '', subject: 'Test', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Missing required params - subject
// ---------------------------------------------------------------------------
describe('email-sender: missing subject parameter', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should throw if subject is missing', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw if subject is undefined', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: undefined, body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw if subject is null', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: null, body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw if subject is empty string', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: '', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Missing required params - body
// ---------------------------------------------------------------------------
describe('email-sender: missing body parameter', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should throw if body is missing', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: 'Test' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw if body is undefined', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: 'Test', body: undefined }, validContext),
      { message: /required/i }
    );
  });

  it('should throw if body is null', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: 'Test', body: null }, validContext),
      { message: /required/i }
    );
  });

  it('should throw if body is empty string', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: 'Test', body: '' }, validContext),
      { message: /required/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Missing all params
// ---------------------------------------------------------------------------
describe('email-sender: missing all params', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should throw if all params are missing', async () => {
    await assert.rejects(
      () => execute({}, validContext),
      { message: /required/i }
    );
  });

  it('should throw if params is empty object', async () => {
    await assert.rejects(
      () => execute({}, validContext),
      { message: /required/i }
    );
  });

  it('should throw if only from is provided', async () => {
    await assert.rejects(
      () => execute({ from: 'a@b.com' }, validContext),
      { message: /required/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Missing API key
// ---------------------------------------------------------------------------
describe('email-sender: missing API key', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should throw if context has no apiKey', async () => {
    await assert.rejects(
      () => execute(validParams, {}),
      { message: /Resend API key is required/i }
    );
  });

  it('should throw if context is undefined', async () => {
    await assert.rejects(
      () => execute(validParams, undefined),
      { message: /Resend API key is required/i }
    );
  });

  it('should throw if context is null', async () => {
    await assert.rejects(
      () => execute(validParams, null),
      { message: /Resend API key is required/i }
    );
  });

  it('should throw if apiKey is empty string', async () => {
    await assert.rejects(
      () => execute(validParams, { apiKey: '' }),
      { message: /Resend API key is required/i }
    );
  });

  it('should throw if apiKey is undefined', async () => {
    await assert.rejects(
      () => execute(validParams, { apiKey: undefined }),
      { message: /Resend API key is required/i }
    );
  });

  it('should throw if apiKey is null', async () => {
    await assert.rejects(
      () => execute(validParams, { apiKey: null }),
      { message: /Resend API key is required/i }
    );
  });

  it('should accept apiKey from context.config.apiKey', async () => {
    const result = await execute(validParams, { config: { apiKey: 'config-key-123' } });
    assert.ok(result.result.includes('Email sent to'));
  });

  it('should use context.config.apiKey in Authorization header', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, { config: { apiKey: 'config-key-456' } });
    assert.equal(calls[0].options.headers.Authorization, 'Bearer config-key-456');
  });

  it('should prefer context.apiKey over context.config.apiKey', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, { apiKey: 'primary-key', config: { apiKey: 'secondary-key' } });
    assert.equal(calls[0].options.headers.Authorization, 'Bearer primary-key');
  });
});

// ---------------------------------------------------------------------------
// 8. API error responses
// ---------------------------------------------------------------------------
describe('email-sender: API error responses', () => {
  beforeEach(() => {});

  it('should throw on 401 Unauthorized with message', async () => {
    mockFetchApiError(401, { message: 'Invalid API key' });
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Resend API error: Invalid API key/i }
    );
  });

  it('should throw on 422 with error field', async () => {
    mockFetchApiError(422, { error: 'Validation failed' });
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Resend API error: Validation failed/i }
    );
  });

  it('should throw on 400 with message field', async () => {
    mockFetchApiError(400, { message: 'Missing required fields' });
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Resend API error: Missing required fields/i }
    );
  });

  it('should throw on 403 Forbidden', async () => {
    mockFetchApiError(403, { message: 'Domain not verified' });
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Resend API error: Domain not verified/i }
    );
  });

  it('should throw on 429 Rate Limited', async () => {
    mockFetchApiError(429, { message: 'Rate limit exceeded' });
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Resend API error: Rate limit exceeded/i }
    );
  });

  it('should fall back to HTTP status when no message or error field', async () => {
    mockFetchApiError(500, {});
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Resend API error: HTTP 500/i }
    );
  });

  it('should throw with Resend API error prefix', async () => {
    mockFetchApiError(400, { message: 'Bad Request' });
    try {
      await execute(validParams, validContext);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.startsWith('Resend API error:'));
    }
  });

  it('should use error field when message is absent', async () => {
    mockFetchApiError(422, { error: 'Invalid recipient' });
    try {
      await execute(validParams, validContext);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('Invalid recipient'));
    }
  });

  it('should prefer message over error when both exist', async () => {
    mockFetchApiError(400, { message: 'From message', error: 'From error' });
    try {
      await execute(validParams, validContext);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('From message'));
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Network errors
// ---------------------------------------------------------------------------
describe('email-sender: network errors', () => {
  beforeEach(() => {});

  it('should wrap network error with Failed to send email prefix', async () => {
    mockFetchNetworkError('ECONNREFUSED');
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Failed to send email: ECONNREFUSED/i }
    );
  });

  it('should wrap DNS resolution failure', async () => {
    mockFetchNetworkError('getaddrinfo ENOTFOUND api.resend.com');
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Failed to send email/i }
    );
  });

  it('should wrap timeout error', async () => {
    mockFetchNetworkError('Request timed out');
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Failed to send email: Request timed out/i }
    );
  });

  it('should wrap connection reset error', async () => {
    mockFetchNetworkError('socket hang up');
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Failed to send email: socket hang up/i }
    );
  });

  it('should not double-wrap Resend API errors', async () => {
    mockFetchApiError(400, { message: 'Invalid sender' });
    try {
      await execute(validParams, validContext);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.startsWith('Resend API error:'));
      assert.ok(!err.message.includes('Failed to send email'));
    }
  });

  it('should handle JSON parse error from response', async () => {
    mockFetchJsonParseError();
    await assert.rejects(
      () => execute(validParams, validContext),
      { message: /Failed to send email/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 10. Response format
// ---------------------------------------------------------------------------
describe('email-sender: response format', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should return object with result and metadata keys', async () => {
    const result = await execute(validParams, validContext);
    assert.ok('result' in result);
    assert.ok('metadata' in result);
  });

  it('should have result as a string', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(typeof result.result, 'string');
  });

  it('should have metadata as an object', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(typeof result.metadata, 'object');
    assert.notEqual(result.metadata, null);
  });

  it('should have metadata.id as a string', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(typeof result.metadata.id, 'string');
  });

  it('should have metadata.status as "sent"', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(result.metadata.status, 'sent');
  });

  it('should format result as "Email sent to {address}"', async () => {
    const result = await execute(validParams, validContext);
    assert.equal(result.result, 'Email sent to user@example.com');
  });

  it('should return the email id from the API response', async () => {
    mockFetchJson({ id: 'custom-id-xyz' });
    const result = await execute(validParams, validContext);
    assert.equal(result.metadata.id, 'custom-id-xyz');
  });
});

// ---------------------------------------------------------------------------
// 11. Request body format
// ---------------------------------------------------------------------------
describe('email-sender: request body format', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should wrap to address in array', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.ok(Array.isArray(body.to));
    assert.equal(body.to.length, 1);
    assert.equal(body.to[0], 'user@example.com');
  });

  it('should use text field for email body', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.text, validParams.body);
    assert.equal(body.html, undefined);
  });

  it('should include from in request body', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.ok(body.from);
  });

  it('should include subject in request body', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.subject, 'Test Subject');
  });

  it('should send valid JSON body', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    assert.doesNotThrow(() => JSON.parse(calls[0].options.body));
  });
});

// ---------------------------------------------------------------------------
// 12. Edge cases
// ---------------------------------------------------------------------------
describe('email-sender: edge cases', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should handle email with long body', async () => {
    const longBody = 'x'.repeat(10000);
    const result = await execute({ ...validParams, body: longBody }, validContext);
    assert.ok(result.result.includes('Email sent to'));
  });

  it('should handle email with special characters in subject', async () => {
    const result = await execute(
      { ...validParams, subject: 'Hello! @#$%^&*() <script>alert("xss")</script>' },
      validContext
    );
    assert.ok(result.result.includes('Email sent to'));
  });

  it('should handle email with unicode characters', async () => {
    const result = await execute(
      { ...validParams, body: 'Hello 你好 こんにちは مرحبا' },
      validContext
    );
    assert.ok(result.result.includes('Email sent to'));
  });

  it('should handle email with multiline body', async () => {
    const result = await execute(
      { ...validParams, body: 'Line 1\nLine 2\nLine 3' },
      validContext
    );
    assert.ok(result.result.includes('Email sent to'));
  });

  it('should handle different recipient addresses', async () => {
    const result = await execute(
      { ...validParams, to: 'someone-else@different.org' },
      validContext
    );
    assert.ok(result.result.includes('someone-else@different.org'));
  });

  it('should handle subject with newlines', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(
      { ...validParams, subject: 'Subject\nwith\nnewlines' },
      validContext
    );
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.subject, 'Subject\nwith\nnewlines');
  });
});

// ---------------------------------------------------------------------------
// 13. Validation order and combinations
// ---------------------------------------------------------------------------
describe('email-sender: validation order and combinations', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should validate params before checking API key', async () => {
    await assert.rejects(
      () => execute({}, {}),
      { message: /required/i }
    );
  });

  it('should throw for missing to even with valid subject and body', async () => {
    await assert.rejects(
      () => execute({ subject: 'Test', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw for missing subject even with valid to and body', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw for missing body even with valid to and subject', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: 'Subject' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw for zero as to value', async () => {
    await assert.rejects(
      () => execute({ to: 0, subject: 'Test', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw for zero as subject value', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: 0, body: 'Body' }, validContext),
      { message: /required/i }
    );
  });

  it('should throw for zero as body value', async () => {
    await assert.rejects(
      () => execute({ to: 'a@b.com', subject: 'Test', body: 0 }, validContext),
      { message: /required/i }
    );
  });

  it('should throw for false as to value', async () => {
    await assert.rejects(
      () => execute({ to: false, subject: 'Test', body: 'Body' }, validContext),
      { message: /required/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 14. API key retrieval paths
// ---------------------------------------------------------------------------
describe('email-sender: API key retrieval paths', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should work with only context.apiKey', async () => {
    const result = await execute(validParams, { apiKey: 'key-only' });
    assert.ok(result.result);
  });

  it('should work with only context.config.apiKey', async () => {
    const result = await execute(validParams, { config: { apiKey: 'config-only' } });
    assert.ok(result.result);
  });

  it('should fail when context.config exists but apiKey is missing', async () => {
    await assert.rejects(
      () => execute(validParams, { config: {} }),
      { message: /Resend API key is required/i }
    );
  });

  it('should fail when context.config is null', async () => {
    await assert.rejects(
      () => execute(validParams, { config: null }),
      { message: /Resend API key is required/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 15. Fetch call verification
// ---------------------------------------------------------------------------
describe('email-sender: fetch call verification', () => {
  beforeEach(() => {
    mockFetchJson(sampleSuccess);
  });

  it('should make exactly one fetch call', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    assert.equal(calls.length, 1);
  });

  it('should not include html field in request body', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.html, undefined);
  });

  it('should not include extra fields in request body', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const body = JSON.parse(calls[0].options.body);
    const keys = Object.keys(body).sort();
    assert.deepEqual(keys, ['from', 'subject', 'text', 'to']);
  });

  it('should use the correct method (POST)', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    assert.equal(calls[0].options.method, 'POST');
  });

  it('should use the correct API URL', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
  });

  it('should have exactly two headers', async () => {
    const calls = mockFetchWithSpy(sampleSuccess);
    await execute(validParams, validContext);
    const headerKeys = Object.keys(calls[0].options.headers);
    assert.equal(headerKeys.length, 2);
    assert.ok(headerKeys.includes('Authorization'));
    assert.ok(headerKeys.includes('Content-Type'));
  });
});

// ---------------------------------------------------------------------------
// 13. Cleanup
// ---------------------------------------------------------------------------
describe('email-sender: cleanup', () => {
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  it('should restore global.fetch', () => {
    assert.equal(global.fetch, originalFetch);
  });
});
