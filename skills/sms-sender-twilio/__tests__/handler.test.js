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
  redactPhone,
  validateE164,
  validateMessageSid,
  validateBody,
  isValidUrl,
  validateLimit,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_BODY_LENGTH,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(response, config) {
  return {
    providerClient: {
      request: async (_method, _path, _body, _opts) => response,
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

/** Sample successful SMS send response. */
const sampleSmsResponse = {
  sid: 'SM1234567890abcdef1234567890abcdef',
  status: 'queued',
  to: '+15551234567',
  from: '+15559876543',
  body: 'Hello World',
};

/** Sample message details response. */
const sampleMessageDetails = {
  sid: 'SM1234567890abcdef1234567890abcdef',
  status: 'delivered',
  direction: 'outbound-api',
  to: '+15551234567',
  from: '+15559876543',
  body: 'Hello World',
  dateSent: '2025-01-15T12:00:00Z',
};

/** Sample list messages response. */
const sampleListResponse = {
  messages: [
    { sid: 'SM1234567890abcdef1234567890abcdef', status: 'delivered', to: '+15551234567' },
    { sid: 'SMabcdef1234567890abcdef1234567890', status: 'sent', to: '+15559999999' },
  ],
};

/** Sample account response. */
const sampleAccountResponse = {
  sid: 'ACTEST00000000000000000000000000',
  friendlyName: 'My Twilio Account',
  status: 'active',
  type: 'Full',
};

/** Sample phone lookup response. */
const sampleLookupResponse = {
  countryCode: 'US',
  carrier: { name: 'T-Mobile', type: 'mobile' },
  type: 'mobile',
};

/** Sample MMS response. */
const sampleMmsResponse = {
  sid: 'MM1234567890abcdef1234567890abcdef',
  status: 'queued',
  to: '+15551234567',
  from: '+15559876543',
};

// Valid phone numbers for tests
const VALID_TO = '+15551234567';
const VALID_FROM = '+15559876543';
const VALID_SID = 'SM1234567890abcdef1234567890abcdef';
const VALID_MM_SID = 'MM1234567890abcdef1234567890abcdef';

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const result = await execute({ action: 'invalid' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_ACTION');
    assert.ok(result.result.includes('invalid'));
  });

  it('should reject missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_ACTION');
  });

  it('should reject undefined params', async () => {
    const result = await execute(undefined, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_ACTION');
  });

  it('should list valid actions in error message', async () => {
    const result = await execute({ action: 'bad' }, {});
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Should include action "${a}" in error`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all actions requiring client
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail send_sms without client', async () => {
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail get_message without client', async () => {
    const result = await execute({ action: 'get_message', messageSid: VALID_SID }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_messages without client', async () => {
    const result = await execute({ action: 'list_messages' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail send_mms without client', async () => {
    const result = await execute({ action: 'send_mms', to: VALID_TO, from: VALID_FROM, mediaUrl: 'https://example.com/img.png' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_account without client', async () => {
    const result = await execute({ action: 'get_account' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail check_number without client', async () => {
    const result = await execute({ action: 'check_number', number: VALID_TO }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. send_sms action
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: send_sms', () => {
  beforeEach(() => {});

  it('should send SMS with valid params', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hello World' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'send_sms');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.sid, sampleSmsResponse.sid);
    assert.equal(result.metadata.status, 'queued');
    assert.ok(result.result.includes('SMS sent successfully'));
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hi' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should redact phone numbers in result text', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hi' }, ctx);
    assert.ok(!result.result.includes(VALID_TO));
    assert.ok(!result.result.includes(VALID_FROM));
    assert.ok(result.result.includes('***4567'));
    assert.ok(result.result.includes('***6543'));
  });

  it('should store raw phone numbers in metadata', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hi' }, ctx);
    assert.equal(result.metadata.to, VALID_TO);
    assert.equal(result.metadata.from, VALID_FROM);
  });

  it('should reject missing to', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', from: VALID_FROM, body: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject invalid to format', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', to: '5551234567', from: VALID_FROM, body: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject missing from', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', to: VALID_TO, body: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject missing body', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject empty body', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject body exceeding max length', async () => {
    const ctx = mockContext(sampleSmsResponse);
    const longBody = 'x'.repeat(MAX_BODY_LENGTH + 1);
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: longBody }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should call POST /messages with correct body', async () => {
    let capturedMethod, capturedPath, capturedBody;
    const ctx = {
      providerClient: {
        request: async (method, path, body) => {
          capturedMethod = method;
          capturedPath = path;
          capturedBody = body;
          return sampleSmsResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Test message' }, ctx);
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedPath, '/messages');
    assert.equal(capturedBody.to, VALID_TO);
    assert.equal(capturedBody.from, VALID_FROM);
    assert.equal(capturedBody.body, 'Test message');
  });
});

// ---------------------------------------------------------------------------
// 4. get_message action
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: get_message', () => {
  beforeEach(() => {});

  it('should get message details with valid SID', async () => {
    const ctx = mockContext(sampleMessageDetails);
    const result = await execute({ action: 'get_message', messageSid: VALID_SID }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_message');
    assert.equal(result.metadata.layer, 'L1');
    assert.ok(result.result.includes('Message details'));
    assert.ok(result.result.includes('delivered'));
  });

  it('should accept MM-prefixed SID', async () => {
    const ctx = mockContext(sampleMessageDetails);
    const result = await execute({ action: 'get_message', messageSid: VALID_MM_SID }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should reject missing messageSid', async () => {
    const ctx = mockContext(sampleMessageDetails);
    const result = await execute({ action: 'get_message' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject invalid SID format', async () => {
    const ctx = mockContext(sampleMessageDetails);
    const result = await execute({ action: 'get_message', messageSid: 'INVALID123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject SID with wrong prefix', async () => {
    const ctx = mockContext(sampleMessageDetails);
    const result = await execute({ action: 'get_message', messageSid: 'AB1234567890abcdef1234567890abcdef' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject SID with wrong length', async () => {
    const ctx = mockContext(sampleMessageDetails);
    const result = await execute({ action: 'get_message', messageSid: 'SM1234' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should call GET /messages/{sid}', async () => {
    let capturedMethod, capturedPath;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          capturedMethod = method;
          capturedPath = path;
          return sampleMessageDetails;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_message', messageSid: VALID_SID }, ctx);
    assert.equal(capturedMethod, 'GET');
    assert.equal(capturedPath, `/messages/${VALID_SID}`);
  });

  it('should redact phone numbers in result', async () => {
    const ctx = mockContext(sampleMessageDetails);
    const result = await execute({ action: 'get_message', messageSid: VALID_SID }, ctx);
    assert.ok(!result.result.includes('+15551234567'));
    assert.ok(!result.result.includes('+15559876543'));
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleMessageDetails);
    const result = await execute({ action: 'get_message', messageSid: VALID_SID }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 5. list_messages action
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: list_messages', () => {
  beforeEach(() => {});

  it('should list messages with no filters', async () => {
    const ctx = mockContext(sampleListResponse);
    const result = await execute({ action: 'list_messages' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_messages');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.limit, DEFAULT_LIMIT);
  });

  it('should list messages with to filter', async () => {
    const ctx = mockContext(sampleListResponse);
    const result = await execute({ action: 'list_messages', to: VALID_TO }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Filter To'));
  });

  it('should list messages with from filter', async () => {
    const ctx = mockContext(sampleListResponse);
    const result = await execute({ action: 'list_messages', from: VALID_FROM }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Filter From'));
  });

  it('should accept custom limit', async () => {
    const ctx = mockContext(sampleListResponse);
    const result = await execute({ action: 'list_messages', limit: 50 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.limit, 50);
  });

  it('should reject invalid to filter', async () => {
    const ctx = mockContext(sampleListResponse);
    const result = await execute({ action: 'list_messages', to: 'bad-number' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject invalid from filter', async () => {
    const ctx = mockContext(sampleListResponse);
    const result = await execute({ action: 'list_messages', from: 'bad-number' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject limit below minimum', async () => {
    const ctx = mockContext(sampleListResponse);
    const result = await execute({ action: 'list_messages', limit: 0 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject limit above maximum', async () => {
    const ctx = mockContext(sampleListResponse);
    const result = await execute({ action: 'list_messages', limit: 101 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should build correct query path with both filters', async () => {
    let capturedPath;
    const ctx = {
      providerClient: {
        request: async (_m, path) => {
          capturedPath = path;
          return sampleListResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_messages', to: VALID_TO, from: VALID_FROM, limit: 10 }, ctx);
    assert.ok(capturedPath.includes('/messages?'));
    assert.ok(capturedPath.includes('to='));
    assert.ok(capturedPath.includes('from='));
    assert.ok(capturedPath.includes('limit=10'));
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext({ data: [{ sid: 'SM123', status: 'sent', to: '+1555' }] });
    const result = await execute({ action: 'list_messages' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 1);
  });

  it('should handle empty message list', async () => {
    const ctx = mockContext({ messages: [] });
    const result = await execute({ action: 'list_messages' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('0 message(s)'));
  });
});

// ---------------------------------------------------------------------------
// 6. send_mms action
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: send_mms', () => {
  beforeEach(() => {});

  it('should send MMS with valid params', async () => {
    const ctx = mockContext(sampleMmsResponse);
    const result = await execute({
      action: 'send_mms',
      to: VALID_TO,
      from: VALID_FROM,
      body: 'Check this out',
      mediaUrl: 'https://example.com/image.jpg',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'send_mms');
    assert.equal(result.metadata.layer, 'L1');
    assert.ok(result.result.includes('MMS sent successfully'));
  });

  it('should send MMS without body (body is optional)', async () => {
    const ctx = mockContext(sampleMmsResponse);
    const result = await execute({
      action: 'send_mms',
      to: VALID_TO,
      from: VALID_FROM,
      mediaUrl: 'https://example.com/image.jpg',
    }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should include mediaUrl in metadata', async () => {
    const ctx = mockContext(sampleMmsResponse);
    const result = await execute({
      action: 'send_mms',
      to: VALID_TO,
      from: VALID_FROM,
      mediaUrl: 'https://example.com/image.jpg',
    }, ctx);
    assert.equal(result.metadata.mediaUrl, 'https://example.com/image.jpg');
  });

  it('should reject missing mediaUrl', async () => {
    const ctx = mockContext(sampleMmsResponse);
    const result = await execute({
      action: 'send_mms',
      to: VALID_TO,
      from: VALID_FROM,
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
    assert.ok(result.result.includes('mediaUrl'));
  });

  it('should reject invalid mediaUrl', async () => {
    const ctx = mockContext(sampleMmsResponse);
    const result = await execute({
      action: 'send_mms',
      to: VALID_TO,
      from: VALID_FROM,
      mediaUrl: 'not-a-url',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject ftp mediaUrl', async () => {
    const ctx = mockContext(sampleMmsResponse);
    const result = await execute({
      action: 'send_mms',
      to: VALID_TO,
      from: VALID_FROM,
      mediaUrl: 'ftp://example.com/file.jpg',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject missing to for MMS', async () => {
    const ctx = mockContext(sampleMmsResponse);
    const result = await execute({
      action: 'send_mms',
      from: VALID_FROM,
      mediaUrl: 'https://example.com/img.jpg',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject missing from for MMS', async () => {
    const ctx = mockContext(sampleMmsResponse);
    const result = await execute({
      action: 'send_mms',
      to: VALID_TO,
      mediaUrl: 'https://example.com/img.jpg',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should call POST /messages with mediaUrl in body', async () => {
    let capturedBody;
    const ctx = {
      providerClient: {
        request: async (_m, _p, body) => {
          capturedBody = body;
          return sampleMmsResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({
      action: 'send_mms',
      to: VALID_TO,
      from: VALID_FROM,
      mediaUrl: 'https://example.com/image.jpg',
    }, ctx);
    assert.equal(capturedBody.mediaUrl, 'https://example.com/image.jpg');
    assert.equal(capturedBody.to, VALID_TO);
    assert.equal(capturedBody.from, VALID_FROM);
  });
});

// ---------------------------------------------------------------------------
// 7. get_account action
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: get_account', () => {
  beforeEach(() => {});

  it('should get account info', async () => {
    const ctx = mockContext(sampleAccountResponse);
    const result = await execute({ action: 'get_account' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_account');
    assert.equal(result.metadata.layer, 'L1');
    assert.ok(result.result.includes('Account Information'));
    assert.ok(result.result.includes('My Twilio Account'));
  });

  it('should call GET /account', async () => {
    let capturedMethod, capturedPath;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          capturedMethod = method;
          capturedPath = path;
          return sampleAccountResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_account' }, ctx);
    assert.equal(capturedMethod, 'GET');
    assert.equal(capturedPath, '/account');
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleAccountResponse);
    const result = await execute({ action: 'get_account' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should handle friendly_name field', async () => {
    const ctx = mockContext({ sid: 'AC123', friendly_name: 'Snake Case Account', status: 'active' });
    const result = await execute({ action: 'get_account' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Snake Case Account'));
  });
});

// ---------------------------------------------------------------------------
// 8. check_number action
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: check_number', () => {
  beforeEach(() => {});

  it('should look up phone number', async () => {
    const ctx = mockContext(sampleLookupResponse);
    const result = await execute({ action: 'check_number', number: VALID_TO }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'check_number');
    assert.equal(result.metadata.layer, 'L1');
    assert.ok(result.result.includes('Phone Number Lookup'));
    assert.ok(result.result.includes('US'));
  });

  it('should reject missing number', async () => {
    const ctx = mockContext(sampleLookupResponse);
    const result = await execute({ action: 'check_number' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should reject invalid number format', async () => {
    const ctx = mockContext(sampleLookupResponse);
    const result = await execute({ action: 'check_number', number: '5551234567' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'INVALID_INPUT');
  });

  it('should call GET /phone-numbers/{number}/lookup', async () => {
    let capturedPath;
    const ctx = {
      providerClient: {
        request: async (_m, path) => {
          capturedPath = path;
          return sampleLookupResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'check_number', number: VALID_TO }, ctx);
    assert.equal(capturedPath, `/phone-numbers/${VALID_TO}/lookup`);
  });

  it('should redact phone number in result', async () => {
    const ctx = mockContext(sampleLookupResponse);
    const result = await execute({ action: 'check_number', number: VALID_TO }, ctx);
    assert.ok(!result.result.includes(VALID_TO));
    assert.ok(result.result.includes('***4567'));
  });

  it('should store raw number in metadata', async () => {
    const ctx = mockContext(sampleLookupResponse);
    const result = await execute({ action: 'check_number', number: VALID_TO }, ctx);
    assert.equal(result.metadata.number, VALID_TO);
  });
});

// ---------------------------------------------------------------------------
// 9. Timeout handling
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on send_sms abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_message abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_message', messageSid: VALID_SID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_messages abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_messages' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'TIMEOUT');
  });

  it('should return TIMEOUT error on send_mms abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({
      action: 'send_mms', to: VALID_TO, from: VALID_FROM, mediaUrl: 'https://example.com/img.jpg',
    }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_account abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_account' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'TIMEOUT');
  });

  it('should return TIMEOUT error on check_number abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'check_number', number: VALID_TO }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 10. Network error handling
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on send_sms failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_message failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'get_message', messageSid: VALID_SID }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_messages failure', async () => {
    const ctx = mockContextError(new Error('Network error'));
    const result = await execute({ action: 'list_messages' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_account failure', async () => {
    const ctx = mockContextError(new Error('503 Service Unavailable'));
    const result = await execute({ action: 'get_account' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'UPSTREAM_ERROR');
  });

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('api_key: sk_test_12345 forbidden'));
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hi' }, ctx);
    assert.ok(!result.result.includes('sk_test_12345'));
    assert.ok(result.result.includes('[REDACTED]'));
  });
});

// ---------------------------------------------------------------------------
// 11. getClient helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: getClient', () => {
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
// 12. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return standard error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 13. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should return configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 10000 } }), 10000);
  });

  it('should cap timeout at max', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), MAX_TIMEOUT_MS);
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
// 14. redactSensitive helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization=Basic_dXNlcjpwYXNz rest';
    const output = redactSensitive(input);
    assert.ok(!output.includes('Basic_dXNlcjpwYXNz'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'SMS sent successfully to recipient';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 15. redactPhone helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: redactPhone', () => {
  beforeEach(() => {});

  it('should show last 4 digits', () => {
    assert.equal(redactPhone('+15551234567'), '***4567');
  });

  it('should handle short input', () => {
    assert.equal(redactPhone('+1'), '****');
  });

  it('should handle non-string input', () => {
    assert.equal(redactPhone(null), '****');
    assert.equal(redactPhone(undefined), '****');
  });

  it('should handle empty string', () => {
    assert.equal(redactPhone(''), '****');
  });

  it('should handle exactly 4 chars', () => {
    assert.equal(redactPhone('+123'), '***+123');
  });
});

// ---------------------------------------------------------------------------
// 16. validateE164 helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: validateE164', () => {
  beforeEach(() => {});

  it('should accept valid US number', () => {
    const result = validateE164('+15551234567');
    assert.equal(result.valid, true);
    assert.equal(result.value, '+15551234567');
  });

  it('should accept valid international number', () => {
    const result = validateE164('+442071234567');
    assert.equal(result.valid, true);
  });

  it('should reject number without +', () => {
    const result = validateE164('15551234567');
    assert.equal(result.valid, false);
  });

  it('should reject number starting with +0', () => {
    const result = validateE164('+05551234567');
    assert.equal(result.valid, false);
  });

  it('should reject too short number', () => {
    const result = validateE164('+12345');
    assert.equal(result.valid, false);
  });

  it('should reject too long number', () => {
    const result = validateE164('+123456789012345678');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateE164(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateE164('');
    assert.equal(result.valid, false);
  });

  it('should reject non-digit characters', () => {
    const result = validateE164('+1555abc4567');
    assert.equal(result.valid, false);
  });

  it('should trim whitespace', () => {
    const result = validateE164('  +15551234567  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, '+15551234567');
  });
});

// ---------------------------------------------------------------------------
// 17. validateMessageSid helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: validateMessageSid', () => {
  beforeEach(() => {});

  it('should accept valid SM SID', () => {
    const result = validateMessageSid(VALID_SID);
    assert.equal(result.valid, true);
    assert.equal(result.value, VALID_SID);
  });

  it('should accept valid MM SID', () => {
    const result = validateMessageSid(VALID_MM_SID);
    assert.equal(result.valid, true);
  });

  it('should reject wrong prefix', () => {
    const result = validateMessageSid('AB1234567890abcdef1234567890abcdef');
    assert.equal(result.valid, false);
  });

  it('should reject too short SID', () => {
    const result = validateMessageSid('SM1234');
    assert.equal(result.valid, false);
  });

  it('should reject null', () => {
    const result = validateMessageSid(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateMessageSid('');
    assert.equal(result.valid, false);
  });

  it('should trim whitespace', () => {
    const result = validateMessageSid(`  ${VALID_SID}  `);
    assert.equal(result.valid, true);
    assert.equal(result.value, VALID_SID);
  });
});

// ---------------------------------------------------------------------------
// 18. validateBody helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: validateBody', () => {
  beforeEach(() => {});

  it('should accept valid body', () => {
    const result = validateBody('Hello World');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'Hello World');
  });

  it('should trim whitespace', () => {
    const result = validateBody('  Hello  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'Hello');
  });

  it('should reject null when required', () => {
    const result = validateBody(null, true);
    assert.equal(result.valid, false);
  });

  it('should accept null when not required', () => {
    const result = validateBody(null, false);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, undefined);
  });

  it('should accept undefined when not required', () => {
    const result = validateBody(undefined, false);
    assert.equal(result.valid, true);
  });

  it('should reject empty string when required', () => {
    const result = validateBody('   ', true);
    assert.equal(result.valid, false);
  });

  it('should reject non-string body', () => {
    const result = validateBody(12345);
    assert.equal(result.valid, false);
  });

  it('should reject body exceeding max length', () => {
    const result = validateBody('x'.repeat(MAX_BODY_LENGTH + 1));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
  });

  it('should accept body at max length', () => {
    const result = validateBody('x'.repeat(MAX_BODY_LENGTH));
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// 19. isValidUrl helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: isValidUrl', () => {
  beforeEach(() => {});

  it('should accept valid https URL', () => {
    assert.equal(isValidUrl('https://example.com/img.png'), true);
  });

  it('should accept valid http URL', () => {
    assert.equal(isValidUrl('http://example.com/img.png'), true);
  });

  it('should reject ftp URL', () => {
    assert.equal(isValidUrl('ftp://example.com/img.png'), false);
  });

  it('should reject empty string', () => {
    assert.equal(isValidUrl(''), false);
  });

  it('should reject non-URL string', () => {
    assert.equal(isValidUrl('not a url'), false);
  });

  it('should reject null', () => {
    assert.equal(isValidUrl(null), false);
  });

  it('should reject undefined', () => {
    assert.equal(isValidUrl(undefined), false);
  });

  it('should reject whitespace-only string', () => {
    assert.equal(isValidUrl('   '), false);
  });
});

// ---------------------------------------------------------------------------
// 20. validateLimit helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: validateLimit', () => {
  beforeEach(() => {});

  it('should default to DEFAULT_LIMIT for undefined', () => {
    const result = validateLimit(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should default to DEFAULT_LIMIT for null', () => {
    const result = validateLimit(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, DEFAULT_LIMIT);
  });

  it('should accept valid limit', () => {
    const result = validateLimit(50);
    assert.equal(result.valid, true);
    assert.equal(result.value, 50);
  });

  it('should accept min limit', () => {
    const result = validateLimit(MIN_LIMIT);
    assert.equal(result.valid, true);
    assert.equal(result.value, MIN_LIMIT);
  });

  it('should accept max limit', () => {
    const result = validateLimit(MAX_LIMIT);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_LIMIT);
  });

  it('should reject limit below min', () => {
    const result = validateLimit(0);
    assert.equal(result.valid, false);
  });

  it('should reject limit above max', () => {
    const result = validateLimit(MAX_LIMIT + 1);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer limit', () => {
    const result = validateLimit(25.5);
    assert.equal(result.valid, false);
  });

  it('should reject negative limit', () => {
    const result = validateLimit(-5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 21. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (_method, path, _body, _opts) => {
          calledPath = path;
          return sampleSmsResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hi' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/messages');
  });
});

// ---------------------------------------------------------------------------
// 22. validate() export
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Invalid action'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate send_sms with valid params', () => {
    const result = validate({ action: 'send_sms', to: VALID_TO, from: VALID_FROM, body: 'Hi' });
    assert.equal(result.valid, true);
  });

  it('should reject send_sms with missing to', () => {
    const result = validate({ action: 'send_sms', from: VALID_FROM, body: 'Hi' });
    assert.equal(result.valid, false);
  });

  it('should validate get_message with valid SID', () => {
    const result = validate({ action: 'get_message', messageSid: VALID_SID });
    assert.equal(result.valid, true);
  });

  it('should reject get_message with invalid SID', () => {
    const result = validate({ action: 'get_message', messageSid: 'bad' });
    assert.equal(result.valid, false);
  });

  it('should validate list_messages with no params', () => {
    const result = validate({ action: 'list_messages' });
    assert.equal(result.valid, true);
  });

  it('should reject list_messages with invalid to', () => {
    const result = validate({ action: 'list_messages', to: 'bad' });
    assert.equal(result.valid, false);
  });

  it('should validate send_mms with valid params', () => {
    const result = validate({ action: 'send_mms', to: VALID_TO, from: VALID_FROM, mediaUrl: 'https://example.com/img.jpg' });
    assert.equal(result.valid, true);
  });

  it('should reject send_mms without mediaUrl', () => {
    const result = validate({ action: 'send_mms', to: VALID_TO, from: VALID_FROM });
    assert.equal(result.valid, false);
  });

  it('should validate get_account', () => {
    const result = validate({ action: 'get_account' });
    assert.equal(result.valid, true);
  });

  it('should validate check_number with valid number', () => {
    const result = validate({ action: 'check_number', number: VALID_TO });
    assert.equal(result.valid, true);
  });

  it('should reject check_number without number', () => {
    const result = validate({ action: 'check_number' });
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 23. meta export
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: meta export', () => {
  beforeEach(() => {});

  it('should export meta object', () => {
    assert.ok(meta);
    assert.equal(meta.name, 'sms-sender-twilio');
    assert.equal(meta.version, '1.0.0');
    assert.ok(meta.description.length > 0);
    assert.deepEqual(meta.actions, VALID_ACTIONS);
  });

  it('should include all 6 actions in meta', () => {
    assert.equal(meta.actions.length, 6);
    assert.ok(meta.actions.includes('send_sms'));
    assert.ok(meta.actions.includes('get_message'));
    assert.ok(meta.actions.includes('list_messages'));
    assert.ok(meta.actions.includes('send_mms'));
    assert.ok(meta.actions.includes('get_account'));
    assert.ok(meta.actions.includes('check_number'));
  });
});

// ---------------------------------------------------------------------------
// 24. requestWithTimeout helper
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return response on success', async () => {
    const client = { request: async () => ({ ok: true }) };
    const result = await requestWithTimeout(client, 'GET', '/test', null, 5000);
    assert.deepEqual(result, { ok: true });
  });

  it('should throw TIMEOUT on abort', async () => {
    const client = {
      request: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'TIMEOUT');
    }
  });

  it('should throw UPSTREAM_ERROR on other errors', async () => {
    const client = {
      request: async () => { throw new Error('Network failure'); },
    };
    try {
      await requestWithTimeout(client, 'GET', '/test', null, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('Network failure'));
    }
  });

  it('should pass method and path to client', async () => {
    let capturedMethod, capturedPath;
    const client = {
      request: async (method, path) => {
        capturedMethod = method;
        capturedPath = path;
        return {};
      },
    };
    await requestWithTimeout(client, 'POST', '/messages', { test: true }, 5000);
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedPath, '/messages');
  });
});

// ---------------------------------------------------------------------------
// 25. Constants verification
// ---------------------------------------------------------------------------
describe('sms-sender-twilio: constants', () => {
  beforeEach(() => {});

  it('should have correct default timeout', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 15000);
  });

  it('should have correct max timeout', () => {
    assert.equal(MAX_TIMEOUT_MS, 30000);
  });

  it('should have correct max body length', () => {
    assert.equal(MAX_BODY_LENGTH, 1600);
  });

  it('should have correct default limit', () => {
    assert.equal(DEFAULT_LIMIT, 25);
  });

  it('should have correct limit range', () => {
    assert.equal(MIN_LIMIT, 1);
    assert.equal(MAX_LIMIT, 100);
  });

  it('should have 6 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 6);
  });
});
