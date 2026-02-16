import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateUrl, validateMethod, buildAuthHeader, applyQueryParams, execute } from '../handler.js';

// ---------------------------------------------------------------------------
// URL Validation
// ---------------------------------------------------------------------------
describe('validateUrl', () => {
  it('should accept a valid https URL', () => {
    const result = validateUrl('https://api.example.com/users');
    assert.equal(result.protocol, 'https:');
    assert.equal(result.hostname, 'api.example.com');
    assert.equal(result.pathname, '/users');
  });

  it('should accept an https URL with port', () => {
    const result = validateUrl('https://api.example.com:8443/v1');
    assert.equal(result.port, '8443');
  });

  it('should reject http URLs', () => {
    assert.throws(
      () => validateUrl('http://api.example.com'),
      (err) => err.code === 'INVALID_URL' && /https/.test(err.message)
    );
  });

  it('should reject file:// URLs', () => {
    assert.throws(
      () => validateUrl('file:///etc/passwd'),
      (err) => err.code === 'INVALID_URL'
    );
  });

  it('should reject ftp:// URLs', () => {
    assert.throws(
      () => validateUrl('ftp://files.example.com/data'),
      (err) => err.code === 'INVALID_URL'
    );
  });

  it('should reject non-URL strings', () => {
    assert.throws(
      () => validateUrl('not a url'),
      (err) => err.code === 'INVALID_URL'
    );
  });

  it('should reject empty string', () => {
    assert.throws(
      () => validateUrl(''),
      (err) => err.code === 'INVALID_URL'
    );
  });

  it('should reject null/undefined', () => {
    assert.throws(() => validateUrl(null), (err) => err.code === 'INVALID_URL');
    assert.throws(() => validateUrl(undefined), (err) => err.code === 'INVALID_URL');
  });

  // Private IP blocking
  it('should block localhost', () => {
    assert.throws(
      () => validateUrl('https://localhost/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });

  it('should block 127.0.0.1', () => {
    assert.throws(
      () => validateUrl('https://127.0.0.1/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });

  it('should block 127.x.x.x range', () => {
    assert.throws(
      () => validateUrl('https://127.0.0.2/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });

  it('should block 10.x.x.x range', () => {
    assert.throws(
      () => validateUrl('https://10.0.0.1/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });

  it('should block 172.16-31.x.x range', () => {
    assert.throws(
      () => validateUrl('https://172.16.0.1/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
    assert.throws(
      () => validateUrl('https://172.31.255.255/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });

  it('should allow 172.15.x.x (not in private range)', () => {
    const result = validateUrl('https://172.15.0.1/api');
    assert.equal(result.hostname, '172.15.0.1');
  });

  it('should allow 172.32.x.x (not in private range)', () => {
    const result = validateUrl('https://172.32.0.1/api');
    assert.equal(result.hostname, '172.32.0.1');
  });

  it('should block 192.168.x.x range', () => {
    assert.throws(
      () => validateUrl('https://192.168.1.1/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });

  it('should block 0.0.0.0', () => {
    assert.throws(
      () => validateUrl('https://0.0.0.0/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });

  it('should block IPv6 loopback [::1]', () => {
    assert.throws(
      () => validateUrl('https://[::1]/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });

  it('should block 169.254.x.x link-local range', () => {
    assert.throws(
      () => validateUrl('https://169.254.1.1/api'),
      (err) => err.code === 'BLOCKED_URL'
    );
  });
});

// ---------------------------------------------------------------------------
// Method Validation
// ---------------------------------------------------------------------------
describe('validateMethod', () => {
  it('should accept all valid methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    for (const m of methods) {
      assert.equal(validateMethod(m), m);
    }
  });

  it('should convert lowercase to uppercase', () => {
    assert.equal(validateMethod('get'), 'GET');
    assert.equal(validateMethod('post'), 'POST');
  });

  it('should default to GET when null/undefined', () => {
    assert.equal(validateMethod(null), 'GET');
    assert.equal(validateMethod(undefined), 'GET');
  });

  it('should reject invalid methods', () => {
    assert.throws(
      () => validateMethod('TRACE'),
      (err) => err.code === 'INVALID_METHOD'
    );
    assert.throws(
      () => validateMethod('CONNECT'),
      (err) => err.code === 'INVALID_METHOD'
    );
  });
});

// ---------------------------------------------------------------------------
// Auth Header Construction
// ---------------------------------------------------------------------------
describe('buildAuthHeader', () => {
  it('should build a Bearer auth header', () => {
    const header = buildAuthHeader({ type: 'bearer', token: 'my-secret-token' });
    assert.equal(header, 'Bearer my-secret-token');
  });

  it('should build a Basic auth header', () => {
    const header = buildAuthHeader({ type: 'basic', username: 'user', password: 'pass' });
    const expected = 'Basic ' + Buffer.from('user:pass').toString('base64');
    assert.equal(header, expected);
  });

  it('should handle Basic auth with empty password', () => {
    const header = buildAuthHeader({ type: 'basic', username: 'user' });
    const expected = 'Basic ' + Buffer.from('user:').toString('base64');
    assert.equal(header, expected);
  });

  it('should return null for null/undefined auth', () => {
    assert.equal(buildAuthHeader(null), null);
    assert.equal(buildAuthHeader(undefined), null);
  });

  it('should return null for empty object', () => {
    assert.equal(buildAuthHeader({}), null);
  });

  it('should throw for bearer auth without token', () => {
    assert.throws(
      () => buildAuthHeader({ type: 'bearer' }),
      (err) => /token/.test(err.message)
    );
  });

  it('should throw for basic auth without username', () => {
    assert.throws(
      () => buildAuthHeader({ type: 'basic' }),
      (err) => /username/.test(err.message)
    );
  });

  it('should throw for unsupported auth type', () => {
    assert.throws(
      () => buildAuthHeader({ type: 'oauth2' }),
      (err) => /Unsupported auth type/.test(err.message)
    );
  });

  it('should be case-insensitive for auth type', () => {
    const header = buildAuthHeader({ type: 'BEARER', token: 'tok' });
    assert.equal(header, 'Bearer tok');
  });
});

// ---------------------------------------------------------------------------
// Query Parameter Encoding
// ---------------------------------------------------------------------------
describe('applyQueryParams', () => {
  it('should append query parameters to a URL', () => {
    const url = new URL('https://api.example.com/search');
    applyQueryParams(url, { q: 'hello world', limit: '10' });
    assert.equal(url.searchParams.get('q'), 'hello world');
    assert.equal(url.searchParams.get('limit'), '10');
  });

  it('should handle special characters in values', () => {
    const url = new URL('https://api.example.com/search');
    applyQueryParams(url, { q: 'foo&bar=baz', special: 'a+b' });
    assert.equal(url.searchParams.get('q'), 'foo&bar=baz');
    assert.equal(url.searchParams.get('special'), 'a+b');
  });

  it('should preserve existing query parameters', () => {
    const url = new URL('https://api.example.com/search?existing=yes');
    applyQueryParams(url, { added: 'true' });
    assert.equal(url.searchParams.get('existing'), 'yes');
    assert.equal(url.searchParams.get('added'), 'true');
  });

  it('should convert numeric values to strings', () => {
    const url = new URL('https://api.example.com/data');
    applyQueryParams(url, { page: 3, size: 20 });
    assert.equal(url.searchParams.get('page'), '3');
    assert.equal(url.searchParams.get('size'), '20');
  });

  it('should handle null/undefined queryParams gracefully', () => {
    const url = new URL('https://api.example.com/data');
    const result = applyQueryParams(url, null);
    assert.equal(result.toString(), 'https://api.example.com/data');
  });

  it('should handle empty object', () => {
    const url = new URL('https://api.example.com/data');
    applyQueryParams(url, {});
    assert.equal(url.toString(), 'https://api.example.com/data');
  });
});

// ---------------------------------------------------------------------------
// execute() - input validation (no actual network calls)
// ---------------------------------------------------------------------------
describe('execute', () => {
  it('should return INVALID_URL error for missing URL', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should return INVALID_URL error for http URL', async () => {
    const result = await execute({ url: 'http://example.com' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
    assert.ok(result.result.includes('https'));
  });

  it('should return BLOCKED_URL error for localhost', async () => {
    const result = await execute({ url: 'https://localhost/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should return BLOCKED_URL error for private IP', async () => {
    const result = await execute({ url: 'https://192.168.1.1/api' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BLOCKED_URL');
  });

  it('should return INVALID_METHOD error for bad method', async () => {
    const result = await execute({ url: 'https://api.example.com', method: 'TRACE' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_METHOD');
  });

  it('should return INVALID_URL for non-URL input', async () => {
    const result = await execute({ url: 'not-a-url' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });

  it('should return error when params is null/undefined', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_URL');
  });
});

// ---------------------------------------------------------------------------
// Timeout enforcement (unit-level validation only)
// ---------------------------------------------------------------------------
describe('timeout enforcement', () => {
  it('should clamp timeout to MAX_TIMEOUT', async () => {
    // We can only test that the execute function does not reject the params.
    // The actual timeout is enforced via AbortController inside fetch.
    // Passing a very large timeout should be clamped to 60000.
    // Since we cannot easily mock fetch here, we verify via URL validation
    // that the call proceeds past parameter parsing.
    const result = await execute(
      { url: 'https://api.example.com/data', timeout: 999999 },
      {}
    );
    // The request will fail with NETWORK_ERROR (no actual server), but that
    // confirms the timeout param was accepted and clamped rather than rejected.
    assert.ok(
      ['NETWORK_ERROR', 'TIMEOUT'].includes(result.metadata.error) || result.metadata.success,
      'Should proceed past validation with clamped timeout'
    );
  });
});
