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
 * Create a mock fetch that returns an error response.
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
 * Create a mock fetch that returns an error response where json() fails.
 */
function mockFetchApiErrorNoJson(status) {
  global.fetch = async () => ({
    ok: false,
    status,
    statusText: 'Internal Server Error',
    json: async () => { throw new Error('Not JSON'); },
  });
}

/**
 * Create a mock fetch that throws a network error.
 */
function mockFetchNetworkError(message) {
  global.fetch = async () => { throw new Error(message); };
}

/**
 * Create a mock fetch that returns different responses for sequential calls.
 */
function mockFetchSequential(responses) {
  let callIndex = 0;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    const resp = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok !== undefined ? resp.ok : true,
      status: resp.status || 200,
      statusText: resp.statusText || 'OK',
      json: async () => resp.data,
    };
  };
  return calls;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleMessage = {
  id: '111222333',
  channel_id: '444555666',
  content: 'Hello world',
  timestamp: '2025-01-15T10:30:00.000Z',
  author: { id: '999888777', username: 'testbot' },
};

const sampleChannel = {
  id: '444555666',
  name: 'general',
  type: 0,
  guild_id: '777888999',
  topic: 'General discussion',
  nsfw: false,
  position: 1,
};

const sampleDmChannel = {
  id: '444555666',
  name: null,
  type: 1,
  topic: null,
};

const sampleGuildChannels = [
  { id: '100', name: 'general', type: 0, position: 1 },
  { id: '101', name: 'announcements', type: 5, position: 0 },
  { id: '102', name: 'voice-chat', type: 2, position: 2 },
  { id: '103', name: 'CATEGORY', type: 4, position: 0 },
];

const validContext = { apiKey: 'test-bot-token-123' };

// ---------------------------------------------------------------------------
// 1. Token validation
// ---------------------------------------------------------------------------
describe('discord-bot: token validation', () => {
  beforeEach(() => {
    mockFetchJson(sampleMessage);
  });

  it('should throw if no token provided', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, {}),
      { message: /Discord Bot Token is required/i }
    );
  });

  it('should throw if context is undefined', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, undefined),
      { message: /Discord Bot Token is required/i }
    );
  });

  it('should throw if context is null', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, null),
      { message: /Discord Bot Token is required/i }
    );
  });

  it('should throw if apiKey is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, { apiKey: '' }),
      { message: /Discord Bot Token is required/i }
    );
  });

  it('should throw if apiKey is undefined', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, { apiKey: undefined }),
      { message: /Discord Bot Token is required/i }
    );
  });

  it('should accept valid token and proceed', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '123', content: 'hi' },
      validContext
    );
    assert.ok(result.result);
  });

  it('should use Bot prefix in Authorization header', async () => {
    const calls = mockFetchWithSpy(sampleMessage);
    await execute(
      { action: 'sendMessage', channelId: '123', content: 'hi' },
      validContext
    );
    assert.equal(calls[0].options.headers.Authorization, 'Bot test-bot-token-123');
  });

  it('should set Content-Type to application/json', async () => {
    const calls = mockFetchWithSpy(sampleMessage);
    await execute(
      { action: 'sendMessage', channelId: '123', content: 'hi' },
      validContext
    );
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  });
});

// ---------------------------------------------------------------------------
// 2. Action validation
// ---------------------------------------------------------------------------
describe('discord-bot: action validation', () => {
  beforeEach(() => {
    mockFetchJson(sampleMessage);
  });

  it('should throw for unknown action', async () => {
    await assert.rejects(
      () => execute({ action: 'deleteMessage' }, validContext),
      { message: /Unknown action.*deleteMessage/i }
    );
  });

  it('should throw for empty action', async () => {
    await assert.rejects(
      () => execute({ action: '' }, validContext),
      { message: /Unknown action/i }
    );
  });

  it('should list supported actions in error', async () => {
    try {
      await execute({ action: 'invalid' }, validContext);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('sendMessage'));
      assert.ok(err.message.includes('getChannel'));
      assert.ok(err.message.includes('listChannels'));
    }
  });

  it('should throw for null action', async () => {
    await assert.rejects(
      () => execute({ action: null }, validContext),
      { message: /Unknown action/i }
    );
  });

  it('should throw for undefined action', async () => {
    await assert.rejects(
      () => execute({ action: undefined }, validContext),
      { message: /Unknown action/i }
    );
  });

  it('should throw for numeric action', async () => {
    await assert.rejects(
      () => execute({ action: 42 }, validContext),
      { message: /Unknown action/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 3. sendMessage action - success
// ---------------------------------------------------------------------------
describe('discord-bot: sendMessage success', () => {
  beforeEach(() => {
    mockFetchJson(sampleMessage);
  });

  it('should send a message successfully', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello world' },
      validContext
    );
    assert.ok(result.result.includes('Message sent successfully'));
  });

  it('should include channel ID in result', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello' },
      validContext
    );
    assert.ok(result.result.includes('444555666'));
  });

  it('should include message ID in result', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello' },
      validContext
    );
    assert.ok(result.result.includes('111222333'));
  });

  it('should include timestamp in result', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello' },
      validContext
    );
    assert.ok(result.result.includes('2025-01-15'));
  });

  it('should include content in result', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello world' },
      validContext
    );
    assert.ok(result.result.includes('Hello world'));
  });

  it('should return metadata with messageId', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello' },
      validContext
    );
    assert.equal(result.metadata.messageId, '111222333');
  });

  it('should return metadata with channelId', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello' },
      validContext
    );
    assert.equal(result.metadata.channelId, '444555666');
  });

  it('should return metadata with timestamp', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello' },
      validContext
    );
    assert.equal(result.metadata.timestamp, '2025-01-15T10:30:00.000Z');
  });

  it('should return metadata with author info', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello' },
      validContext
    );
    assert.equal(result.metadata.author.id, '999888777');
    assert.equal(result.metadata.author.username, 'testbot');
  });

  it('should POST to correct Discord API endpoint', async () => {
    const calls = mockFetchWithSpy(sampleMessage);
    await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Hello' },
      validContext
    );
    assert.ok(calls[0].url.includes('/channels/444555666/messages'));
    assert.equal(calls[0].options.method, 'POST');
  });

  it('should send content as JSON body', async () => {
    const calls = mockFetchWithSpy(sampleMessage);
    await execute(
      { action: 'sendMessage', channelId: '444555666', content: 'Test message' },
      validContext
    );
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.content, 'Test message');
  });
});

// ---------------------------------------------------------------------------
// 4. sendMessage action - validation
// ---------------------------------------------------------------------------
describe('discord-bot: sendMessage validation', () => {
  beforeEach(() => {
    mockFetchJson(sampleMessage);
  });

  it('should throw if channelId is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', content: 'hi' }, validContext),
      { message: /channelId is required/i }
    );
  });

  it('should throw if channelId is empty', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '', content: 'hi' }, validContext),
      { message: /channelId is required/i }
    );
  });

  it('should throw if content is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123' }, validContext),
      { message: /content is required/i }
    );
  });

  it('should throw if content is empty', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: '' }, validContext),
      { message: /content is required/i }
    );
  });

  it('should throw if both channelId and content are missing', async () => {
    await assert.rejects(
      () => execute({ action: 'sendMessage' }, validContext),
      { message: /channelId is required/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 5. sendMessage action - API errors
// ---------------------------------------------------------------------------
describe('discord-bot: sendMessage API errors', () => {
  beforeEach(() => {});

  it('should throw on 403 Forbidden', async () => {
    mockFetchApiError(403, { message: 'Missing Permissions' });
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, validContext),
      { message: /Discord API error \(403\).*Missing Permissions/i }
    );
  });

  it('should throw on 404 Not Found', async () => {
    mockFetchApiError(404, { message: 'Unknown Channel' });
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, validContext),
      { message: /Discord API error \(404\).*Unknown Channel/i }
    );
  });

  it('should throw on 429 Rate Limited', async () => {
    mockFetchApiError(429, { message: 'You are being rate limited.' });
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, validContext),
      { message: /Discord API error \(429\)/i }
    );
  });

  it('should handle error response where json() fails', async () => {
    mockFetchApiErrorNoJson(500);
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, validContext),
      { message: /Discord API error \(500\).*Internal Server Error/i }
    );
  });

  it('should throw on 401 Unauthorized', async () => {
    mockFetchApiError(401, { message: 'Unauthorized' });
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, validContext),
      { message: /Discord API error \(401\).*Unauthorized/i }
    );
  });

  it('should include status code in error', async () => {
    mockFetchApiError(400, { message: 'Bad Request' });
    try {
      await execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, validContext);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('400'));
    }
  });
});

// ---------------------------------------------------------------------------
// 6. getChannel action - success
// ---------------------------------------------------------------------------
describe('discord-bot: getChannel success', () => {
  beforeEach(() => {
    mockFetchJson(sampleChannel);
  });

  it('should get channel info successfully', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Channel Information'));
  });

  it('should include channel name in result', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('#general'));
  });

  it('should include channel ID in result', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('444555666'));
  });

  it('should include channel type name in result', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Text'));
  });

  it('should include guild ID in result', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('777888999'));
  });

  it('should include topic in result', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('General discussion'));
  });

  it('should include NSFW status in result', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('NSFW: false'));
  });

  it('should include position in result', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Position: 1'));
  });

  it('should return metadata with channel info', async () => {
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.equal(result.metadata.id, '444555666');
    assert.equal(result.metadata.name, 'general');
    assert.equal(result.metadata.type, 0);
    assert.equal(result.metadata.typeName, 'Text');
    assert.equal(result.metadata.guildId, '777888999');
    assert.equal(result.metadata.topic, 'General discussion');
    assert.equal(result.metadata.nsfw, false);
    assert.equal(result.metadata.position, 1);
  });

  it('should GET from correct Discord API endpoint', async () => {
    const calls = mockFetchWithSpy(sampleChannel);
    await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(calls[0].url.includes('/channels/444555666'));
    assert.equal(calls[0].options.method, 'GET');
  });

  it('should handle channel with no topic', async () => {
    mockFetchJson({ ...sampleChannel, topic: null });
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('(no topic set)'));
  });

  it('should handle DM channel with no guild', async () => {
    mockFetchJson(sampleDmChannel);
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('N/A (DM)'));
  });

  it('should handle unnamed channel', async () => {
    mockFetchJson({ ...sampleChannel, name: null });
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('(unnamed)'));
  });

  it('should map channel type 2 to Voice', async () => {
    mockFetchJson({ ...sampleChannel, type: 2 });
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Voice'));
    assert.equal(result.metadata.typeName, 'Voice');
  });

  it('should map channel type 4 to Category', async () => {
    mockFetchJson({ ...sampleChannel, type: 4 });
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Category'));
  });

  it('should map channel type 5 to Announcement', async () => {
    mockFetchJson({ ...sampleChannel, type: 5 });
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Announcement'));
  });

  it('should map channel type 15 to Forum', async () => {
    mockFetchJson({ ...sampleChannel, type: 15 });
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Forum'));
  });

  it('should handle unknown channel type', async () => {
    mockFetchJson({ ...sampleChannel, type: 99 });
    const result = await execute(
      { action: 'getChannel', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Unknown (99)'));
  });
});

// ---------------------------------------------------------------------------
// 7. getChannel action - validation and errors
// ---------------------------------------------------------------------------
describe('discord-bot: getChannel validation', () => {
  beforeEach(() => {
    mockFetchJson(sampleChannel);
  });

  it('should throw if channelId is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'getChannel' }, validContext),
      { message: /channelId is required/i }
    );
  });

  it('should throw if channelId is empty', async () => {
    await assert.rejects(
      () => execute({ action: 'getChannel', channelId: '' }, validContext),
      { message: /channelId is required/i }
    );
  });

  it('should throw on API error for getChannel', async () => {
    mockFetchApiError(404, { message: 'Unknown Channel' });
    await assert.rejects(
      () => execute({ action: 'getChannel', channelId: '123' }, validContext),
      { message: /Discord API error \(404\)/i }
    );
  });

  it('should handle API error with empty JSON for getChannel', async () => {
    mockFetchApiErrorNoJson(500);
    await assert.rejects(
      () => execute({ action: 'getChannel', channelId: '123' }, validContext),
      { message: /Discord API error \(500\)/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 8. listChannels action - success
// ---------------------------------------------------------------------------
describe('discord-bot: listChannels success', () => {
  beforeEach(() => {
    // First call returns channel info, second returns guild channels
    mockFetchSequential([
      { data: sampleChannel },
      { data: sampleGuildChannels },
    ]);
  });

  it('should list channels successfully', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Channels in guild'));
  });

  it('should include guild ID in result', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('777888999'));
  });

  it('should include channel names in result', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('#general'));
    assert.ok(result.result.includes('#announcements'));
  });

  it('should uppercase category names', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('CATEGORY'));
  });

  it('should return metadata with guildId', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.equal(result.metadata.guildId, '777888999');
  });

  it('should return metadata with channelCount', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.equal(result.metadata.channelCount, 4);
  });

  it('should return metadata with channels array', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.ok(Array.isArray(result.metadata.channels));
    assert.equal(result.metadata.channels.length, 4);
  });

  it('should include channel type info in formatted output', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('Text'));
    assert.ok(result.result.includes('Voice'));
  });

  it('should make two API calls: channel then guild channels', async () => {
    const calls = mockFetchSequential([
      { data: sampleChannel },
      { data: sampleGuildChannels },
    ]);
    await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes('/channels/444555666'));
    assert.ok(calls[1].url.includes('/guilds/777888999/channels'));
  });

  it('should sort channels by position', async () => {
    mockFetchSequential([
      { data: sampleChannel },
      { data: [
        { id: '1', name: 'last', type: 0, position: 3 },
        { id: '2', name: 'first', type: 0, position: 0 },
        { id: '3', name: 'middle', type: 0, position: 1 },
      ] },
    ]);
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    const lines = result.result.split('\n');
    const channelLines = lines.filter(l => l.includes('#'));
    assert.ok(channelLines[0].includes('first'));
  });

  it('should include channel IDs in formatted output', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.ok(result.result.includes('ID: 100'));
    assert.ok(result.result.includes('ID: 101'));
  });

  it('should include metadata channels with id, name, and type', async () => {
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    const ch = result.metadata.channels[0];
    assert.ok('id' in ch);
    assert.ok('name' in ch);
    assert.ok('type' in ch);
  });
});

// ---------------------------------------------------------------------------
// 9. listChannels action - validation and errors
// ---------------------------------------------------------------------------
describe('discord-bot: listChannels validation', () => {
  beforeEach(() => {
    mockFetchSequential([
      { data: sampleChannel },
      { data: sampleGuildChannels },
    ]);
  });

  it('should throw if channelId is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'listChannels' }, validContext),
      { message: /channelId is required/i }
    );
  });

  it('should throw if channelId is empty', async () => {
    await assert.rejects(
      () => execute({ action: 'listChannels', channelId: '' }, validContext),
      { message: /channelId is required/i }
    );
  });

  it('should throw for DM channel (no guild_id)', async () => {
    mockFetchSequential([
      { data: sampleDmChannel },
    ]);
    await assert.rejects(
      () => execute({ action: 'listChannels', channelId: '444555666' }, validContext),
      { message: /does not belong to a guild/i }
    );
  });

  it('should throw on channel fetch API error', async () => {
    mockFetchSequential([
      { ok: false, status: 404, data: { message: 'Unknown Channel' }, statusText: 'Not Found' },
    ]);
    await assert.rejects(
      () => execute({ action: 'listChannels', channelId: '123' }, validContext),
      { message: /Discord API error fetching channel \(404\)/i }
    );
  });

  it('should throw on guild channels fetch API error', async () => {
    mockFetchSequential([
      { data: sampleChannel },
      { ok: false, status: 403, data: { message: 'Missing Access' }, statusText: 'Forbidden' },
    ]);
    await assert.rejects(
      () => execute({ action: 'listChannels', channelId: '444555666' }, validContext),
      { message: /Discord API error listing channels \(403\)/i }
    );
  });

  it('should throw on guild channels fetch with empty json error', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, status: 200, json: async () => sampleChannel };
      }
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Not JSON'); },
      };
    };
    await assert.rejects(
      () => execute({ action: 'listChannels', channelId: '444555666' }, validContext),
      { message: /Discord API error listing channels \(500\)/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 10. Network errors
// ---------------------------------------------------------------------------
describe('discord-bot: network errors', () => {
  beforeEach(() => {});

  it('should propagate network error for sendMessage', async () => {
    mockFetchNetworkError('ECONNREFUSED');
    await assert.rejects(
      () => execute({ action: 'sendMessage', channelId: '123', content: 'hi' }, validContext),
      { message: /ECONNREFUSED/i }
    );
  });

  it('should propagate network error for getChannel', async () => {
    mockFetchNetworkError('DNS lookup failed');
    await assert.rejects(
      () => execute({ action: 'getChannel', channelId: '123' }, validContext),
      { message: /DNS lookup failed/i }
    );
  });

  it('should propagate network error for listChannels', async () => {
    mockFetchNetworkError('Connection timeout');
    await assert.rejects(
      () => execute({ action: 'listChannels', channelId: '123' }, validContext),
      { message: /Connection timeout/i }
    );
  });
});

// ---------------------------------------------------------------------------
// 11. Edge cases for author metadata
// ---------------------------------------------------------------------------
describe('discord-bot: author metadata edge cases', () => {
  beforeEach(() => {});

  it('should handle message with no author', async () => {
    mockFetchJson({ ...sampleMessage, author: undefined });
    const result = await execute(
      { action: 'sendMessage', channelId: '123', content: 'hi' },
      validContext
    );
    assert.equal(result.metadata.author.id, undefined);
    assert.equal(result.metadata.author.username, undefined);
  });

  it('should handle message with null author', async () => {
    mockFetchJson({ ...sampleMessage, author: null });
    const result = await execute(
      { action: 'sendMessage', channelId: '123', content: 'hi' },
      validContext
    );
    assert.equal(result.metadata.author.id, undefined);
    assert.equal(result.metadata.author.username, undefined);
  });
});

// ---------------------------------------------------------------------------
// 12. API URL construction
// ---------------------------------------------------------------------------
describe('discord-bot: API URL construction', () => {
  beforeEach(() => {});

  it('should use Discord API v10 base URL for sendMessage', async () => {
    const calls = mockFetchWithSpy(sampleMessage);
    await execute(
      { action: 'sendMessage', channelId: '123', content: 'hi' },
      validContext
    );
    assert.ok(calls[0].url.startsWith('https://discord.com/api/v10'));
  });

  it('should use Discord API v10 base URL for getChannel', async () => {
    const calls = mockFetchWithSpy(sampleChannel);
    await execute(
      { action: 'getChannel', channelId: '123' },
      validContext
    );
    assert.ok(calls[0].url.startsWith('https://discord.com/api/v10'));
  });

  it('should use correct channel messages path', async () => {
    const calls = mockFetchWithSpy(sampleMessage);
    await execute(
      { action: 'sendMessage', channelId: 'abc', content: 'test' },
      validContext
    );
    assert.equal(calls[0].url, 'https://discord.com/api/v10/channels/abc/messages');
  });

  it('should use correct channel path for getChannel', async () => {
    const calls = mockFetchWithSpy(sampleChannel);
    await execute(
      { action: 'getChannel', channelId: 'def' },
      validContext
    );
    assert.equal(calls[0].url, 'https://discord.com/api/v10/channels/def');
  });

  it('should use correct guild channels path for listChannels', async () => {
    const calls = mockFetchSequential([
      { data: sampleChannel },
      { data: sampleGuildChannels },
    ]);
    await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.equal(calls[1].url, 'https://discord.com/api/v10/guilds/777888999/channels');
  });
});

// ---------------------------------------------------------------------------
// 13. Return value structure
// ---------------------------------------------------------------------------
describe('discord-bot: return value structure', () => {
  beforeEach(() => {
    mockFetchJson(sampleMessage);
  });

  it('should return object with result and metadata for sendMessage', async () => {
    const result = await execute(
      { action: 'sendMessage', channelId: '123', content: 'hi' },
      validContext
    );
    assert.ok(typeof result.result === 'string');
    assert.ok(typeof result.metadata === 'object');
  });

  it('should return object with result and metadata for getChannel', async () => {
    mockFetchJson(sampleChannel);
    const result = await execute(
      { action: 'getChannel', channelId: '123' },
      validContext
    );
    assert.ok(typeof result.result === 'string');
    assert.ok(typeof result.metadata === 'object');
  });

  it('should return object with result and metadata for listChannels', async () => {
    mockFetchSequential([
      { data: sampleChannel },
      { data: sampleGuildChannels },
    ]);
    const result = await execute(
      { action: 'listChannels', channelId: '444555666' },
      validContext
    );
    assert.ok(typeof result.result === 'string');
    assert.ok(typeof result.metadata === 'object');
  });
});

// ---------------------------------------------------------------------------
// 14. Cleanup
// ---------------------------------------------------------------------------
describe('discord-bot: cleanup', () => {
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  it('should restore global.fetch', () => {
    assert.equal(global.fetch, originalFetch);
  });
});
