import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers for global.fetch
// ---------------------------------------------------------------------------

let originalFetch;

function mockFetch(handler) {
  global.fetch = handler;
}

function mockFetchJson(data, status = 200) {
  global.fetch = async (url, opts) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function mockFetchWithSpy(data, status = 200) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  };
  return calls;
}

// ---------------------------------------------------------------------------
// Sample response data
// ---------------------------------------------------------------------------

const sampleSendMessageResponse = {
  ok: true,
  result: {
    message_id: 42,
    date: 1700000000,
    chat: { id: 12345, type: 'private' },
    from: { id: 999, is_bot: true, first_name: 'TestBot', username: 'test_bot' },
    text: 'Hello world',
  },
};

const sampleGetMeResponse = {
  ok: true,
  result: {
    id: 999,
    is_bot: true,
    first_name: 'TestBot',
    username: 'test_bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: true,
  },
};

const sampleGetUpdatesResponse = {
  ok: true,
  result: [
    {
      update_id: 100,
      message: {
        message_id: 1,
        from: { id: 111, first_name: 'Alice', username: 'alice' },
        chat: { id: 222, type: 'private', username: 'alice' },
        text: 'Hello bot!',
        date: 1700000001,
      },
    },
    {
      update_id: 101,
      message: {
        message_id: 2,
        from: { id: 333, first_name: 'Bob' },
        chat: { id: 444, type: 'group', title: 'My Group' },
        text: 'Hey there',
        date: 1700000002,
      },
    },
  ],
};

const sampleApiError = {
  ok: false,
  error_code: 400,
  description: 'Bad Request: chat not found',
};

const validContext = { apiKey: 'test-token-12345' };

// ===========================================================================
// 1. Token validation
// ===========================================================================
describe('telegram-bot: token validation', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should throw when context is undefined', async () => {
    await assert.rejects(
      () => execute({ action: 'getMe' }, undefined),
      { message: /Telegram Bot Token is required/ }
    );
  });

  it('should throw when context is null', async () => {
    await assert.rejects(
      () => execute({ action: 'getMe' }, null),
      { message: /Telegram Bot Token is required/ }
    );
  });

  it('should throw when context is empty object', async () => {
    await assert.rejects(
      () => execute({ action: 'getMe' }, {}),
      { message: /Telegram Bot Token is required/ }
    );
  });

  it('should throw when apiKey is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'getMe' }, { apiKey: '' }),
      { message: /Telegram Bot Token is required/ }
    );
  });

  it('should throw when apiKey is null', async () => {
    await assert.rejects(
      () => execute({ action: 'getMe' }, { apiKey: null }),
      { message: /Telegram Bot Token is required/ }
    );
  });

  it('should throw when apiKey is undefined', async () => {
    await assert.rejects(
      () => execute({ action: 'getMe' }, { apiKey: undefined }),
      { message: /Telegram Bot Token is required/ }
    );
  });

  it('should throw error mentioning "configure"', async () => {
    await assert.rejects(
      () => execute({ action: 'getMe' }, {}),
      (err) => {
        assert.ok(err.message.includes('configure'));
        return true;
      }
    );
  });
});

// ===========================================================================
// 2. Unknown action validation
// ===========================================================================
describe('telegram-bot: action validation', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should throw for unknown action', async () => {
    await assert.rejects(
      () => execute({ action: 'deleteMessage' }, validContext),
      { message: /Unknown action.*deleteMessage/ }
    );
  });

  it('should throw for empty string action', async () => {
    await assert.rejects(
      () => execute({ action: '' }, validContext),
      { message: /Unknown action/ }
    );
  });

  it('should throw for null action', async () => {
    await assert.rejects(
      () => execute({ action: null }, validContext),
      { message: /Unknown action/ }
    );
  });

  it('should throw for undefined action', async () => {
    await assert.rejects(
      () => execute({ action: undefined }, validContext),
      { message: /Unknown action/ }
    );
  });

  it('should throw for numeric action', async () => {
    await assert.rejects(
      () => execute({ action: 123 }, validContext),
      { message: /Unknown action/ }
    );
  });

  it('should list supported actions in error message', async () => {
    await assert.rejects(
      () => execute({ action: 'invalid' }, validContext),
      (err) => {
        assert.ok(err.message.includes('sendMessage'));
        assert.ok(err.message.includes('getUpdates'));
        assert.ok(err.message.includes('getMe'));
        return true;
      }
    );
  });

  it('should be case-sensitive for action names', async () => {
    await assert.rejects(
      () => execute({ action: 'sendmessage' }, validContext),
      { message: /Unknown action/ }
    );
  });

  it('should reject SENDMESSAGE (wrong case)', async () => {
    await assert.rejects(
      () => execute({ action: 'SENDMESSAGE' }, validContext),
      { message: /Unknown action/ }
    );
  });

  it('should reject GetMe (wrong case)', async () => {
    await assert.rejects(
      () => execute({ action: 'GetMe' }, validContext),
      { message: /Unknown action/ }
    );
  });
});

// ===========================================================================
// 3. sendMessage - success paths
// ===========================================================================
describe('telegram-bot: sendMessage success', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should send a message successfully', async () => {
    mockFetchJson(sampleSendMessageResponse);
    const result = await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hello world' },
      validContext
    );
    assert.ok(result.result.includes('Message sent successfully'));
    assert.ok(result.result.includes('12345'));
    assert.equal(result.metadata.messageId, 42);
    assert.equal(result.metadata.chatId, 12345);
  });

  it('should include message ID in result text', async () => {
    mockFetchJson(sampleSendMessageResponse);
    const result = await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.ok(result.result.includes('42'));
  });

  it('should include date in metadata as ISO string', async () => {
    mockFetchJson(sampleSendMessageResponse);
    const result = await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.equal(result.metadata.date, new Date(1700000000 * 1000).toISOString());
  });

  it('should include from username in metadata', async () => {
    mockFetchJson(sampleSendMessageResponse);
    const result = await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.equal(result.metadata.from, 'test_bot');
  });

  it('should use first_name when username is missing', async () => {
    const response = {
      ok: true,
      result: {
        message_id: 50,
        date: 1700000000,
        chat: { id: 12345 },
        from: { id: 999, first_name: 'NoUserBot' },
        text: 'test',
      },
    };
    mockFetchJson(response);
    const result = await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.equal(result.metadata.from, 'NoUserBot');
  });

  it('should default to "bot" when from has no name', async () => {
    const response = {
      ok: true,
      result: {
        message_id: 50,
        date: 1700000000,
        chat: { id: 12345 },
        from: { id: 999 },
        text: 'test',
      },
    };
    mockFetchJson(response);
    const result = await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.equal(result.metadata.from, 'bot');
  });

  it('should call correct Telegram API URL', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('api.telegram.org'));
    assert.ok(calls[0].url.includes('test-token-12345'));
    assert.ok(calls[0].url.endsWith('/sendMessage'));
  });

  it('should use POST method', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should send JSON content type', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  });

  it('should send chatId and text in body', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hello world' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.chat_id, '12345');
    assert.equal(body.text, 'Hello world');
  });

  it('should return result and metadata keys', async () => {
    mockFetchJson(sampleSendMessageResponse);
    const result = await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hi' },
      validContext
    );
    assert.ok('result' in result);
    assert.ok('metadata' in result);
    assert.equal(typeof result.result, 'string');
    assert.equal(typeof result.metadata, 'object');
  });
});

// ===========================================================================
// 4. sendMessage - with parseMode
// ===========================================================================
describe('telegram-bot: sendMessage with parseMode', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should include parse_mode when parseMode is Markdown', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: '*bold*', parseMode: 'Markdown' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.parse_mode, 'Markdown');
  });

  it('should include parse_mode when parseMode is HTML', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: '<b>bold</b>', parseMode: 'HTML' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.parse_mode, 'HTML');
  });

  it('should include parse_mode when parseMode is MarkdownV2', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: '__underline__', parseMode: 'MarkdownV2' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.parse_mode, 'MarkdownV2');
  });

  it('should NOT include parse_mode when parseMode is undefined', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: 'plain text' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.parse_mode, undefined);
  });

  it('should NOT include parse_mode when parseMode is null', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: 'plain text', parseMode: null },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.parse_mode, undefined);
  });

  it('should NOT include parse_mode when parseMode is empty string', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: 'plain text', parseMode: '' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.parse_mode, undefined);
  });
});

// ===========================================================================
// 5. sendMessage - missing parameters
// ===========================================================================
describe('telegram-bot: sendMessage missing params', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should throw when chatId is missing', async () => {
    mockFetchJson(sampleSendMessageResponse);
    await assert.rejects(
      () => execute({ action: 'sendMessage', text: 'Hi' }, validContext),
      { message: /chatId is required/ }
    );
  });

  it('should throw when chatId is empty string', async () => {
    mockFetchJson(sampleSendMessageResponse);
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '', text: 'Hi' }, validContext),
      { message: /chatId is required/ }
    );
  });

  it('should throw when chatId is null', async () => {
    mockFetchJson(sampleSendMessageResponse);
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: null, text: 'Hi' }, validContext),
      { message: /chatId is required/ }
    );
  });

  it('should throw when text is missing', async () => {
    mockFetchJson(sampleSendMessageResponse);
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345' }, validContext),
      { message: /text is required/ }
    );
  });

  it('should throw when text is empty string', async () => {
    mockFetchJson(sampleSendMessageResponse);
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: '' }, validContext),
      { message: /text is required/ }
    );
  });

  it('should throw when text is null', async () => {
    mockFetchJson(sampleSendMessageResponse);
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: null }, validContext),
      { message: /text is required/ }
    );
  });

  it('should throw when both chatId and text are missing', async () => {
    mockFetchJson(sampleSendMessageResponse);
    await assert.rejects(
      () => execute({ action: 'sendMessage' }, validContext),
      { message: /chatId is required/ }
    );
  });
});

// ===========================================================================
// 6. sendMessage - API errors
// ===========================================================================
describe('telegram-bot: sendMessage API errors', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should throw on Telegram API error (data.ok === false)', async () => {
    mockFetchJson(sampleApiError);
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      { message: /Telegram API error/ }
    );
  });

  it('should include error description in thrown error', async () => {
    mockFetchJson(sampleApiError);
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      (err) => {
        assert.ok(err.message.includes('Bad Request: chat not found'));
        return true;
      }
    );
  });

  it('should include error code in thrown error', async () => {
    mockFetchJson(sampleApiError);
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      (err) => {
        assert.ok(err.message.includes('400'));
        return true;
      }
    );
  });

  it('should handle API error without description', async () => {
    mockFetchJson({ ok: false, error_code: 500 });
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      (err) => {
        assert.ok(err.message.includes('Unknown error'));
        return true;
      }
    );
  });

  it('should handle API error without error_code', async () => {
    mockFetchJson({ ok: false, description: 'Something failed' });
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      (err) => {
        assert.ok(err.message.includes('N/A'));
        return true;
      }
    );
  });

  it('should handle API error with both fields missing', async () => {
    mockFetchJson({ ok: false });
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      (err) => {
        assert.ok(err.message.includes('Unknown error'));
        assert.ok(err.message.includes('N/A'));
        return true;
      }
    );
  });
});

// ===========================================================================
// 7. sendMessage - network errors
// ===========================================================================
describe('telegram-bot: sendMessage network errors', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should propagate fetch network error', async () => {
    global.fetch = async () => { throw new Error('Network error'); };
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      { message: /Network error/ }
    );
  });

  it('should propagate DNS resolution failure', async () => {
    global.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      { message: /ENOTFOUND/ }
    );
  });

  it('should propagate connection refused', async () => {
    global.fetch = async () => { throw new Error('Connection refused'); };
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      { message: /Connection refused/ }
    );
  });

  it('should propagate timeout error', async () => {
    global.fetch = async () => { throw new Error('Request timed out'); };
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      { message: /timed out/ }
    );
  });

  it('should propagate abort error', async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    global.fetch = async () => { throw err; };
    await assert.rejects(
      () => execute({ action: 'sendMessage', chatId: '12345', text: 'Hi' }, validContext),
      { message: /aborted/ }
    );
  });
});

// ===========================================================================
// 8. getUpdates - success with results
// ===========================================================================
describe('telegram-bot: getUpdates with results', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return formatted updates', async () => {
    mockFetchJson(sampleGetUpdatesResponse);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('2 update(s)'));
  });

  it('should include update count in metadata', async () => {
    mockFetchJson(sampleGetUpdatesResponse);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.equal(result.metadata.updateCount, 2);
  });

  it('should include latest update ID in metadata', async () => {
    mockFetchJson(sampleGetUpdatesResponse);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.equal(result.metadata.latestUpdateId, 101);
  });

  it('should format sender username in results', async () => {
    mockFetchJson(sampleGetUpdatesResponse);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('alice'));
  });

  it('should format sender first_name when no username', async () => {
    mockFetchJson(sampleGetUpdatesResponse);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('Bob'));
  });

  it('should include chat title for group chats', async () => {
    mockFetchJson(sampleGetUpdatesResponse);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('My Group'));
  });

  it('should include message text in formatted output', async () => {
    mockFetchJson(sampleGetUpdatesResponse);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('Hello bot!'));
    assert.ok(result.result.includes('Hey there'));
  });

  it('should include update IDs in formatted output', async () => {
    mockFetchJson(sampleGetUpdatesResponse);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('[100]'));
    assert.ok(result.result.includes('[101]'));
  });

  it('should call correct URL for getUpdates', async () => {
    const calls = mockFetchWithSpy(sampleGetUpdatesResponse);
    await execute({ action: 'getUpdates' }, validContext);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/getUpdates'));
  });

  it('should use GET method for getUpdates', async () => {
    const calls = mockFetchWithSpy(sampleGetUpdatesResponse);
    await execute({ action: 'getUpdates' }, validContext);
    assert.equal(calls[0].opts.method, 'GET');
  });

  it('should handle edited_message updates', async () => {
    const response = {
      ok: true,
      result: [
        {
          update_id: 200,
          edited_message: {
            message_id: 10,
            from: { id: 111, username: 'editor' },
            chat: { id: 222, username: 'editor' },
            text: 'Edited text',
            date: 1700000010,
          },
        },
      ],
    };
    mockFetchJson(response);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('editor'));
    assert.ok(result.result.includes('Edited text'));
    assert.equal(result.metadata.updateCount, 1);
  });

  it('should handle non-message updates', async () => {
    const response = {
      ok: true,
      result: [
        { update_id: 300, callback_query: { id: 'abc', data: 'click' } },
      ],
    };
    mockFetchJson(response);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('non-message update'));
    assert.equal(result.metadata.updateCount, 1);
  });

  it('should handle non-text message', async () => {
    const response = {
      ok: true,
      result: [
        {
          update_id: 400,
          message: {
            message_id: 20,
            from: { id: 111, username: 'photouser' },
            chat: { id: 222, username: 'photouser' },
            photo: [{ file_id: 'abc' }],
            date: 1700000020,
          },
        },
      ],
    };
    mockFetchJson(response);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('non-text message'));
  });

  it('should use chat.id when no title or username on chat', async () => {
    const response = {
      ok: true,
      result: [
        {
          update_id: 500,
          message: {
            message_id: 30,
            from: { id: 111, username: 'user1' },
            chat: { id: 999, type: 'private' },
            text: 'Test',
            date: 1700000030,
          },
        },
      ],
    };
    mockFetchJson(response);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('999'));
  });

  it('should handle sender with no username or first_name', async () => {
    const response = {
      ok: true,
      result: [
        {
          update_id: 600,
          message: {
            message_id: 40,
            from: { id: 111 },
            chat: { id: 222, username: 'chat1' },
            text: 'Anonymous',
            date: 1700000040,
          },
        },
      ],
    };
    mockFetchJson(response);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('unknown'));
  });
});

// ===========================================================================
// 9. getUpdates - empty results
// ===========================================================================
describe('telegram-bot: getUpdates empty', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return "No new updates" for empty result array', async () => {
    mockFetchJson({ ok: true, result: [] });
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('No new updates'));
    assert.equal(result.metadata.updateCount, 0);
  });

  it('should return "No new updates" when result is undefined', async () => {
    mockFetchJson({ ok: true });
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('No new updates'));
    assert.equal(result.metadata.updateCount, 0);
  });

  it('should return "No new updates" when result is null-ish', async () => {
    mockFetchJson({ ok: true, result: null });
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.ok(result.result.includes('No new updates'));
    assert.equal(result.metadata.updateCount, 0);
  });
});

// ===========================================================================
// 10. getUpdates - API errors
// ===========================================================================
describe('telegram-bot: getUpdates API errors', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should throw on API error for getUpdates', async () => {
    mockFetchJson({ ok: false, error_code: 401, description: 'Unauthorized' });
    await assert.rejects(
      () => execute({ action: 'getUpdates' }, validContext),
      { message: /Telegram API error.*Unauthorized/ }
    );
  });

  it('should throw on API error without description for getUpdates', async () => {
    mockFetchJson({ ok: false, error_code: 500 });
    await assert.rejects(
      () => execute({ action: 'getUpdates' }, validContext),
      { message: /Unknown error/ }
    );
  });

  it('should propagate network error for getUpdates', async () => {
    global.fetch = async () => { throw new Error('Network failure'); };
    await assert.rejects(
      () => execute({ action: 'getUpdates' }, validContext),
      { message: /Network failure/ }
    );
  });
});

// ===========================================================================
// 11. getMe - success
// ===========================================================================
describe('telegram-bot: getMe success', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return bot information', async () => {
    mockFetchJson(sampleGetMeResponse);
    const result = await execute({ action: 'getMe' }, validContext);
    assert.ok(result.result.includes('Bot Information'));
    assert.ok(result.result.includes('TestBot'));
    assert.ok(result.result.includes('@test_bot'));
  });

  it('should include bot ID in result', async () => {
    mockFetchJson(sampleGetMeResponse);
    const result = await execute({ action: 'getMe' }, validContext);
    assert.ok(result.result.includes('999'));
  });

  it('should include can_join_groups in result', async () => {
    mockFetchJson(sampleGetMeResponse);
    const result = await execute({ action: 'getMe' }, validContext);
    assert.ok(result.result.includes('Can Join Groups'));
    assert.ok(result.result.includes('true'));
  });

  it('should include supports_inline_queries in result', async () => {
    mockFetchJson(sampleGetMeResponse);
    const result = await execute({ action: 'getMe' }, validContext);
    assert.ok(result.result.includes('Supports Inline Queries'));
  });

  it('should return metadata with bot details', async () => {
    mockFetchJson(sampleGetMeResponse);
    const result = await execute({ action: 'getMe' }, validContext);
    assert.equal(result.metadata.botId, 999);
    assert.equal(result.metadata.username, 'test_bot');
    assert.equal(result.metadata.firstName, 'TestBot');
    assert.equal(result.metadata.canJoinGroups, true);
    assert.equal(result.metadata.canReadAllGroupMessages, false);
    assert.equal(result.metadata.supportsInlineQueries, true);
  });

  it('should handle N/A for missing optional fields', async () => {
    const response = {
      ok: true,
      result: {
        id: 888,
        is_bot: true,
        first_name: 'MinimalBot',
        username: 'minimal_bot',
      },
    };
    mockFetchJson(response);
    const result = await execute({ action: 'getMe' }, validContext);
    assert.ok(result.result.includes('N/A'));
  });

  it('should call correct URL for getMe', async () => {
    const calls = mockFetchWithSpy(sampleGetMeResponse);
    await execute({ action: 'getMe' }, validContext);
    assert.ok(calls[0].url.endsWith('/getMe'));
  });

  it('should use GET method for getMe', async () => {
    const calls = mockFetchWithSpy(sampleGetMeResponse);
    await execute({ action: 'getMe' }, validContext);
    assert.equal(calls[0].opts.method, 'GET');
  });

  it('should send JSON content type for getMe', async () => {
    const calls = mockFetchWithSpy(sampleGetMeResponse);
    await execute({ action: 'getMe' }, validContext);
    assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  });
});

// ===========================================================================
// 12. getMe - API errors
// ===========================================================================
describe('telegram-bot: getMe API errors', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should throw on API error for getMe', async () => {
    mockFetchJson({ ok: false, error_code: 401, description: 'Unauthorized' });
    await assert.rejects(
      () => execute({ action: 'getMe' }, validContext),
      { message: /Telegram API error.*Unauthorized/ }
    );
  });

  it('should throw on API error without description for getMe', async () => {
    mockFetchJson({ ok: false });
    await assert.rejects(
      () => execute({ action: 'getMe' }, validContext),
      { message: /Unknown error/ }
    );
  });

  it('should propagate network error for getMe', async () => {
    global.fetch = async () => { throw new Error('Connection reset'); };
    await assert.rejects(
      () => execute({ action: 'getMe' }, validContext),
      { message: /Connection reset/ }
    );
  });
});

// ===========================================================================
// 13. Token used in URL construction
// ===========================================================================
describe('telegram-bot: token in URL', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should embed token in URL for sendMessage', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '1', text: 'x' },
      { apiKey: 'my-special-token' }
    );
    assert.ok(calls[0].url.includes('/botmy-special-token/'));
  });

  it('should embed token in URL for getUpdates', async () => {
    const calls = mockFetchWithSpy({ ok: true, result: [] });
    await execute({ action: 'getUpdates' }, { apiKey: 'token-abc' });
    assert.ok(calls[0].url.includes('/bottoken-abc/'));
  });

  it('should embed token in URL for getMe', async () => {
    const calls = mockFetchWithSpy(sampleGetMeResponse);
    await execute({ action: 'getMe' }, { apiKey: 'token-xyz' });
    assert.ok(calls[0].url.includes('/bottoken-xyz/'));
  });

  it('should use correct base URL format', async () => {
    const calls = mockFetchWithSpy(sampleGetMeResponse);
    await execute({ action: 'getMe' }, { apiKey: 'testtoken' });
    assert.ok(calls[0].url.startsWith('https://api.telegram.org/bottesttoken/'));
  });
});

// ===========================================================================
// 14. Edge cases
// ===========================================================================
describe('telegram-bot: edge cases', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should handle very long text in sendMessage', async () => {
    const longText = 'x'.repeat(10000);
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: longText },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.text.length, 10000);
  });

  it('should handle special characters in text', async () => {
    const specialText = 'Hello <b>world</b> & "friends" \'everyone\'';
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: specialText },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.text, specialText);
  });

  it('should handle unicode text', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '12345', text: 'Hello from JS! Some unicode chars here.' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.ok(body.text.includes('Hello'));
  });

  it('should handle numeric chatId', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: 12345, text: 'test' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.chat_id, 12345);
  });

  it('should handle negative chatId (group chat)', async () => {
    const calls = mockFetchWithSpy(sampleSendMessageResponse);
    await execute(
      { action: 'sendMessage', chatId: '-100123456', text: 'group msg' },
      validContext
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.chat_id, '-100123456');
  });

  it('should handle single update in getUpdates', async () => {
    const response = {
      ok: true,
      result: [
        {
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 1, username: 'solo' },
            chat: { id: 1, username: 'solo' },
            text: 'Only one',
            date: 1700000000,
          },
        },
      ],
    };
    mockFetchJson(response);
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.equal(result.metadata.updateCount, 1);
    assert.equal(result.metadata.latestUpdateId, 1);
    assert.ok(result.result.includes('1 update(s)'));
  });

  it('should handle many updates in getUpdates', async () => {
    const updates = Array.from({ length: 50 }, (_, i) => ({
      update_id: i + 1,
      message: {
        message_id: i + 1,
        from: { id: 1, username: `user${i}` },
        chat: { id: 1, username: `user${i}` },
        text: `Message ${i}`,
        date: 1700000000 + i,
      },
    }));
    mockFetchJson({ ok: true, result: updates });
    const result = await execute({ action: 'getUpdates' }, validContext);
    assert.equal(result.metadata.updateCount, 50);
    assert.equal(result.metadata.latestUpdateId, 50);
    assert.ok(result.result.includes('50 update(s)'));
  });

  it('should handle json() rejection from fetch', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => { throw new Error('Invalid JSON'); },
    });
    await assert.rejects(
      () => execute({ action: 'getMe' }, validContext),
      { message: /Invalid JSON/ }
    );
  });
});
