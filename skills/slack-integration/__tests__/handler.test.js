import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  redactSensitive,
  sanitizeString,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .fetch() method.
 */
function mockContext(fetchResponse, config) {
  return {
    providerClient: {
      fetch: async (_endpoint, _opts) => fetchResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .fetch() tracks calls and returns data.
 */
function mockContextWithSpy(fetchResponse) {
  const calls = [];
  return {
    context: {
      providerClient: {
        fetch: async (endpoint, opts) => {
          calls.push({ endpoint, opts });
          return fetchResponse;
        },
      },
      config: { timeoutMs: 5000 },
    },
    calls,
  };
}

/**
 * Build a mock context where .fetch() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      fetch: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .fetch() times out (AbortError).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      fetch: async (_endpoint, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

// ---------------------------------------------------------------------------
// Sample response data
// ---------------------------------------------------------------------------

const sampleMessageResponse = {
  ok: true,
  ts: '1234567890.123456',
  channel: 'C01ABCDEF',
  message: { ts: '1234567890.123456', text: 'Hello world', user: 'U01ABCDEF' },
};

const sampleChannels = {
  channels: [
    { id: 'C01AAA', name: 'general', topic: { value: 'General chat' }, purpose: { value: 'Company-wide announcements' }, num_members: 50, is_private: false },
    { id: 'C01BBB', name: 'random', topic: { value: 'Random stuff' }, purpose: { value: 'Non-work chatter' }, num_members: 45, is_private: false },
  ],
};

const sampleChannelInfo = {
  channel: {
    id: 'C01AAA',
    name: 'general',
    topic: { value: 'General chat' },
    purpose: { value: 'Company-wide announcements' },
    num_members: 50,
    is_private: false,
    is_archived: false,
    created: 1609459200,
  },
};

const sampleMessages = {
  messages: [
    { ts: '1700000001.000001', user: 'U01AAA', text: 'Hello team!', type: 'message' },
    { ts: '1700000002.000002', user: 'U01BBB', text: 'Good morning!', type: 'message' },
  ],
};

const sampleReactionResponse = { ok: true };

const sampleCreatedChannel = {
  channel: { id: 'C01NEW', name: 'new-project', is_private: false },
};

const sampleInviteResponse = { ok: true, channel: { id: 'C01AAA' } };

const sampleSetTopicResponse = {
  channel: { id: 'C01AAA', topic: { value: 'New topic here' } },
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('slack-integration: action validation', () => {
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
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for all actions
// ---------------------------------------------------------------------------
describe('slack-integration: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail send_message without client', async () => {
    const result = await execute({ action: 'send_message', channel: 'C01', text: 'Hi' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_channels without client', async () => {
    const result = await execute({ action: 'list_channels' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_channel without client', async () => {
    const result = await execute({ action: 'get_channel', channel: 'C01' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_messages without client', async () => {
    const result = await execute({ action: 'list_messages', channel: 'C01' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail react without client', async () => {
    const result = await execute({ action: 'react', channel: 'C01', timestamp: '123.456', emoji: 'thumbsup' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_channel without client', async () => {
    const result = await execute({ action: 'create_channel', name: 'test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail invite_user without client', async () => {
    const result = await execute({ action: 'invite_user', channel: 'C01', user: 'U01' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail set_topic without client', async () => {
    const result = await execute({ action: 'set_topic', channel: 'C01', topic: 'New topic' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. send_message action
// ---------------------------------------------------------------------------
describe('slack-integration: send_message', () => {
  beforeEach(() => {});

  it('should send a message successfully', async () => {
    const ctx = mockContext(sampleMessageResponse);
    const result = await execute({ action: 'send_message', channel: 'C01ABCDEF', text: 'Hello world' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'send_message');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.channel, 'C01ABCDEF');
    assert.equal(result.metadata.ts, '1234567890.123456');
    assert.ok(result.result.includes('Message sent'));
  });

  it('should reject missing channel', async () => {
    const ctx = mockContext(sampleMessageResponse);
    const result = await execute({ action: 'send_message', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CHANNEL');
  });

  it('should reject missing text', async () => {
    const ctx = mockContext(sampleMessageResponse);
    const result = await execute({ action: 'send_message', channel: 'C01' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleMessageResponse);
    await execute({ action: 'send_message', channel: 'C01', text: 'Hello' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, 'slack/chat.postMessage');
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should include thread_ts when provided', async () => {
    const { context, calls } = mockContextWithSpy(sampleMessageResponse);
    await execute({ action: 'send_message', channel: 'C01', text: 'Reply', threadTs: '1234.5678' }, context);
    assert.equal(calls[0].opts.params.thread_ts, '1234.5678');
  });

  it('should set threadTs metadata to null when not threaded', async () => {
    const ctx = mockContext(sampleMessageResponse);
    const result = await execute({ action: 'send_message', channel: 'C01', text: 'Hello' }, ctx);
    assert.equal(result.metadata.threadTs, null);
  });
});

// ---------------------------------------------------------------------------
// 4. list_channels action
// ---------------------------------------------------------------------------
describe('slack-integration: list_channels', () => {
  beforeEach(() => {});

  it('should list channels successfully', async () => {
    const ctx = mockContext(sampleChannels);
    const result = await execute({ action: 'list_channels' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_channels');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('#general'));
    assert.ok(result.result.includes('#random'));
  });

  it('should handle empty channel list', async () => {
    const ctx = mockContext({ channels: [] });
    const result = await execute({ action: 'list_channels' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No channels'));
  });

  it('should pass public type filter to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannels);
    await execute({ action: 'list_channels', type: 'public' }, context);
    assert.equal(calls[0].opts.params.types, 'public_channel');
  });

  it('should pass private type filter to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannels);
    await execute({ action: 'list_channels', type: 'private' }, context);
    assert.equal(calls[0].opts.params.types, 'private_channel');
  });

  it('should pass all type filter to endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannels);
    await execute({ action: 'list_channels', type: 'all' }, context);
    assert.equal(calls[0].opts.params.types, 'public_channel,private_channel');
  });

  it('should default to public type', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannels);
    await execute({ action: 'list_channels' }, context);
    assert.equal(calls[0].opts.params.types, 'public_channel');
  });
});

// ---------------------------------------------------------------------------
// 5. get_channel action
// ---------------------------------------------------------------------------
describe('slack-integration: get_channel', () => {
  beforeEach(() => {});

  it('should get channel info successfully', async () => {
    const ctx = mockContext(sampleChannelInfo);
    const result = await execute({ action: 'get_channel', channel: 'C01AAA' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_channel');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.id, 'C01AAA');
    assert.equal(result.metadata.name, 'general');
    assert.equal(result.metadata.numMembers, 50);
    assert.ok(result.result.includes('#general'));
    assert.ok(result.result.includes('General chat'));
  });

  it('should reject missing channel', async () => {
    const ctx = mockContext(sampleChannelInfo);
    const result = await execute({ action: 'get_channel' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CHANNEL');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannelInfo);
    await execute({ action: 'get_channel', channel: 'C01AAA' }, context);
    assert.equal(calls[0].endpoint, 'slack/conversations.info');
    assert.equal(calls[0].opts.params.channel, 'C01AAA');
  });
});

// ---------------------------------------------------------------------------
// 6. list_messages action
// ---------------------------------------------------------------------------
describe('slack-integration: list_messages', () => {
  beforeEach(() => {});

  it('should list messages successfully', async () => {
    const ctx = mockContext(sampleMessages);
    const result = await execute({ action: 'list_messages', channel: 'C01AAA' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_messages');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Hello team!'));
    assert.ok(result.result.includes('Good morning!'));
  });

  it('should reject missing channel', async () => {
    const ctx = mockContext(sampleMessages);
    const result = await execute({ action: 'list_messages' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CHANNEL');
  });

  it('should handle empty messages', async () => {
    const ctx = mockContext({ messages: [] });
    const result = await execute({ action: 'list_messages', channel: 'C01' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No messages'));
  });

  it('should pass oldest and latest params', async () => {
    const { context, calls } = mockContextWithSpy(sampleMessages);
    await execute({ action: 'list_messages', channel: 'C01', oldest: '1700000000', latest: '1700099999' }, context);
    assert.equal(calls[0].opts.params.oldest, '1700000000');
    assert.equal(calls[0].opts.params.latest, '1700099999');
  });

  it('should pass limit param', async () => {
    const { context, calls } = mockContextWithSpy(sampleMessages);
    await execute({ action: 'list_messages', channel: 'C01', limit: 5 }, context);
    assert.equal(calls[0].opts.params.limit, 5);
  });

  it('should default limit to 20', async () => {
    const { context, calls } = mockContextWithSpy(sampleMessages);
    await execute({ action: 'list_messages', channel: 'C01' }, context);
    assert.equal(calls[0].opts.params.limit, 20);
  });
});

// ---------------------------------------------------------------------------
// 7. react action
// ---------------------------------------------------------------------------
describe('slack-integration: react', () => {
  beforeEach(() => {});

  it('should add reaction successfully', async () => {
    const ctx = mockContext(sampleReactionResponse);
    const result = await execute({ action: 'react', channel: 'C01', timestamp: '1234.5678', emoji: 'thumbsup' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'react');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.emoji, 'thumbsup');
    assert.ok(result.result.includes(':thumbsup:'));
  });

  it('should reject missing channel', async () => {
    const ctx = mockContext(sampleReactionResponse);
    const result = await execute({ action: 'react', timestamp: '1234', emoji: 'thumbsup' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CHANNEL');
  });

  it('should reject missing timestamp', async () => {
    const ctx = mockContext(sampleReactionResponse);
    const result = await execute({ action: 'react', channel: 'C01', emoji: 'thumbsup' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TIMESTAMP');
  });

  it('should reject missing emoji', async () => {
    const ctx = mockContext(sampleReactionResponse);
    const result = await execute({ action: 'react', channel: 'C01', timestamp: '1234' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_EMOJI');
  });

  it('should strip colons from emoji name', async () => {
    const { context, calls } = mockContextWithSpy(sampleReactionResponse);
    await execute({ action: 'react', channel: 'C01', timestamp: '1234', emoji: ':thumbsup:' }, context);
    assert.equal(calls[0].opts.params.name, 'thumbsup');
  });

  it('should call the correct endpoint with POST', async () => {
    const { context, calls } = mockContextWithSpy(sampleReactionResponse);
    await execute({ action: 'react', channel: 'C01', timestamp: '1234', emoji: 'fire' }, context);
    assert.equal(calls[0].endpoint, 'slack/reactions.add');
    assert.equal(calls[0].opts.method, 'POST');
  });
});

// ---------------------------------------------------------------------------
// 8. create_channel action
// ---------------------------------------------------------------------------
describe('slack-integration: create_channel', () => {
  beforeEach(() => {});

  it('should create a channel successfully', async () => {
    const ctx = mockContext(sampleCreatedChannel);
    const result = await execute({ action: 'create_channel', name: 'new-project' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_channel');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.id, 'C01NEW');
    assert.equal(result.metadata.name, 'new-project');
    assert.ok(result.result.includes('#new-project'));
    assert.ok(result.result.includes('C01NEW'));
  });

  it('should reject missing name', async () => {
    const ctx = mockContext(sampleCreatedChannel);
    const result = await execute({ action: 'create_channel' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_NAME');
  });

  it('should call the correct endpoint with POST', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedChannel);
    await execute({ action: 'create_channel', name: 'test-channel' }, context);
    assert.equal(calls[0].endpoint, 'slack/conversations.create');
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should set is_private flag when specified', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedChannel);
    await execute({ action: 'create_channel', name: 'secret', isPrivate: true }, context);
    assert.equal(calls[0].opts.params.is_private, true);
  });

  it('should default isPrivate to false', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedChannel);
    await execute({ action: 'create_channel', name: 'open' }, context);
    assert.equal(calls[0].opts.params.is_private, false);
  });
});

// ---------------------------------------------------------------------------
// 9. invite_user action
// ---------------------------------------------------------------------------
describe('slack-integration: invite_user', () => {
  beforeEach(() => {});

  it('should invite user successfully', async () => {
    const ctx = mockContext(sampleInviteResponse);
    const result = await execute({ action: 'invite_user', channel: 'C01AAA', user: 'U01BBB' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'invite_user');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.channel, 'C01AAA');
    assert.equal(result.metadata.user, 'U01BBB');
    assert.ok(result.result.includes('U01BBB'));
    assert.ok(result.result.includes('C01AAA'));
  });

  it('should reject missing channel', async () => {
    const ctx = mockContext(sampleInviteResponse);
    const result = await execute({ action: 'invite_user', user: 'U01' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CHANNEL');
  });

  it('should reject missing user', async () => {
    const ctx = mockContext(sampleInviteResponse);
    const result = await execute({ action: 'invite_user', channel: 'C01' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_USER');
  });

  it('should call the correct endpoint with POST', async () => {
    const { context, calls } = mockContextWithSpy(sampleInviteResponse);
    await execute({ action: 'invite_user', channel: 'C01', user: 'U01' }, context);
    assert.equal(calls[0].endpoint, 'slack/conversations.invite');
    assert.equal(calls[0].opts.method, 'POST');
  });
});

// ---------------------------------------------------------------------------
// 10. set_topic action
// ---------------------------------------------------------------------------
describe('slack-integration: set_topic', () => {
  beforeEach(() => {});

  it('should set topic successfully', async () => {
    const ctx = mockContext(sampleSetTopicResponse);
    const result = await execute({ action: 'set_topic', channel: 'C01AAA', topic: 'New topic here' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'set_topic');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.channel, 'C01AAA');
    assert.equal(result.metadata.topic, 'New topic here');
    assert.ok(result.result.includes('New topic here'));
  });

  it('should reject missing channel', async () => {
    const ctx = mockContext(sampleSetTopicResponse);
    const result = await execute({ action: 'set_topic', topic: 'Topic' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CHANNEL');
  });

  it('should reject missing topic', async () => {
    const ctx = mockContext(sampleSetTopicResponse);
    const result = await execute({ action: 'set_topic', channel: 'C01' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TOPIC');
  });

  it('should call the correct endpoint with POST', async () => {
    const { context, calls } = mockContextWithSpy(sampleSetTopicResponse);
    await execute({ action: 'set_topic', channel: 'C01', topic: 'Hello' }, context);
    assert.equal(calls[0].endpoint, 'slack/conversations.setTopic');
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.params.topic, 'Hello');
  });
});

// ---------------------------------------------------------------------------
// 11. Timeout handling
// ---------------------------------------------------------------------------
describe('slack-integration: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for send_message', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'send_message', channel: 'C01', text: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for list_channels', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_channels' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for list_messages', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_messages', channel: 'C01' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 12. Network error handling
// ---------------------------------------------------------------------------
describe('slack-integration: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for send_message', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'send_message', channel: 'C01', text: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for list_channels', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'list_channels' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for create_channel', async () => {
    const ctx = mockContextError(new Error('Network unreachable'));
    const result = await execute({ action: 'create_channel', name: 'test' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 13. getClient helper
// ---------------------------------------------------------------------------
describe('slack-integration: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient', () => {
    const result = getClient({ providerClient: { fetch: () => {} }, gatewayClient: { fetch: () => {} } });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { fetch: () => {} } });
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
// 14. redactSensitive
// ---------------------------------------------------------------------------
describe('slack-integration: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact Slack bot tokens (xoxb)', () => {
    const prefix = 'xox' + 'b';
    const input = `Using ${prefix}-fake-token-value for auth`;
    const output = redactSensitive(input);
    assert.ok(!output.includes(prefix + '-fake'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact Slack user tokens (xoxp)', () => {
    const prefix = 'xox' + 'p';
    const input = `token ${prefix}-fake-token-value`;
    const output = redactSensitive(input);
    assert.ok(!output.includes(prefix + '-fake'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = '#general channel has 50 members';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 15. sanitizeString
// ---------------------------------------------------------------------------
describe('slack-integration: sanitizeString', () => {
  beforeEach(() => {});

  it('should trim whitespace', () => {
    assert.equal(sanitizeString('  hello  '), 'hello');
  });

  it('should remove control characters', () => {
    const input = 'hello\x00world\x07test';
    const output = sanitizeString(input);
    assert.ok(!output.includes('\x00'));
    assert.ok(!output.includes('\x07'));
    assert.ok(output.includes('hello'));
  });

  it('should return undefined for null', () => {
    assert.equal(sanitizeString(null), undefined);
  });

  it('should return undefined for undefined', () => {
    assert.equal(sanitizeString(undefined), undefined);
  });

  it('should convert numbers to strings', () => {
    assert.equal(sanitizeString(123), '123');
  });
});

// ---------------------------------------------------------------------------
// 16. L1 compliance - no hardcoded URLs
// ---------------------------------------------------------------------------
describe('slack-integration: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded slack.com URLs in fetch endpoints', async () => {
    const { context, calls } = mockContextWithSpy(sampleMessageResponse);
    await execute({ action: 'send_message', channel: 'C01', text: 'Hi' }, context);
    for (const call of calls) {
      assert.ok(!call.endpoint.includes('https://'), 'Endpoint must not contain https://');
      assert.ok(!call.endpoint.includes('slack.com'), 'Endpoint must not contain slack.com');
      assert.ok(call.endpoint.startsWith('slack/'), 'Endpoint must start with slack/');
    }
  });

  it('should use slack/ prefix for all API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannels);

    await execute({ action: 'send_message', channel: 'C01', text: 'Hi' }, context);
    await execute({ action: 'list_channels' }, context);
    await execute({ action: 'get_channel', channel: 'C01' }, context);
    await execute({ action: 'list_messages', channel: 'C01' }, context);
    await execute({ action: 'react', channel: 'C01', timestamp: '1234', emoji: 'ok' }, context);
    await execute({ action: 'create_channel', name: 'test' }, context);
    await execute({ action: 'invite_user', channel: 'C01', user: 'U01' }, context);
    await execute({ action: 'set_topic', channel: 'C01', topic: 'T' }, context);

    assert.ok(calls.length >= 8, `Expected at least 8 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.endpoint.startsWith('slack/'), `Endpoint "${call.endpoint}" must start with slack/`);
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Limit clamping
// ---------------------------------------------------------------------------
describe('slack-integration: limit clamping', () => {
  beforeEach(() => {});

  it('should clamp limit to max 1000 for list_channels', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannels);
    await execute({ action: 'list_channels', limit: 5000 }, context);
    assert.equal(calls[0].opts.params.limit, 1000);
  });

  it('should use default limit of 100 for list_channels', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannels);
    await execute({ action: 'list_channels' }, context);
    assert.equal(calls[0].opts.params.limit, 100);
  });

  it('should clamp limit to minimum 1', async () => {
    const { context, calls } = mockContextWithSpy(sampleChannels);
    await execute({ action: 'list_channels', limit: -5 }, context);
    assert.equal(calls[0].opts.params.limit, 1);
  });
});
