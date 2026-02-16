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

const sampleBoards = [
  { id: 'board1', name: 'Project Alpha', desc: 'Main project board', closed: false, url: 'https://trello.com/b/board1' },
  { id: 'board2', name: 'Sprint Planning', desc: 'Sprint board', closed: false, url: 'https://trello.com/b/board2' },
];

const sampleBoard = {
  id: 'board1',
  name: 'Project Alpha',
  desc: 'Main project board',
  closed: false,
  url: 'https://trello.com/b/board1',
};

const sampleLists = [
  { id: 'list1', name: 'To Do', closed: false },
  { id: 'list2', name: 'In Progress', closed: false },
  { id: 'list3', name: 'Done', closed: false },
];

const sampleCards = [
  { id: 'card1', name: 'Fix login bug', desc: 'Login fails', due: '2025-03-01T00:00:00.000Z', closed: false, url: 'https://trello.com/c/card1' },
  { id: 'card2', name: 'Add tests', desc: 'Unit tests needed', due: null, closed: false, url: 'https://trello.com/c/card2' },
];

const sampleCard = {
  id: 'card1',
  name: 'Fix login bug',
  desc: 'Login fails for SSO users',
  idList: 'list1',
  idBoard: 'board1',
  due: '2025-03-01T00:00:00.000Z',
  labels: [{ name: 'bug', id: 'lbl1' }, { name: 'urgent', id: 'lbl2' }],
  closed: false,
  url: 'https://trello.com/c/card1',
};

const sampleCreatedCard = {
  id: 'card99',
  name: 'New task',
  url: 'https://trello.com/c/card99',
};

const sampleUpdatedCard = {
  id: 'card1',
  name: 'Updated task',
  url: 'https://trello.com/c/card1',
};

const sampleMovedCard = {
  id: 'card1',
  name: 'Fix login bug',
  idList: 'list3',
  url: 'https://trello.com/c/card1',
};

const sampleComment = {
  id: 'comment1',
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('trello-manager: action validation', () => {
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
// 2. PROVIDER_NOT_CONFIGURED for all 9 actions
// ---------------------------------------------------------------------------
describe('trello-manager: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail list_boards without client', async () => {
    const result = await execute({ action: 'list_boards' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_board without client', async () => {
    const result = await execute({ action: 'get_board', boardId: 'b1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_lists without client', async () => {
    const result = await execute({ action: 'list_lists', boardId: 'b1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_cards without client', async () => {
    const result = await execute({ action: 'list_cards', listId: 'l1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_card without client', async () => {
    const result = await execute({ action: 'get_card', cardId: 'c1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail create_card without client', async () => {
    const result = await execute({ action: 'create_card', listId: 'l1', name: 'Test' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_card without client', async () => {
    const result = await execute({ action: 'update_card', cardId: 'c1' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail move_card without client', async () => {
    const result = await execute({ action: 'move_card', cardId: 'c1', listId: 'l2' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail add_comment without client', async () => {
    const result = await execute({ action: 'add_comment', cardId: 'c1', text: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. list_boards action
// ---------------------------------------------------------------------------
describe('trello-manager: list_boards', () => {
  beforeEach(() => {});

  it('should list boards successfully', async () => {
    const ctx = mockContext(sampleBoards);
    const result = await execute({ action: 'list_boards' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_boards');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Project Alpha'));
    assert.ok(result.result.includes('Sprint Planning'));
  });

  it('should handle empty boards list', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_boards' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No boards'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleBoards);
    await execute({ action: 'list_boards' }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, 'trello/members/me/boards');
  });
});

// ---------------------------------------------------------------------------
// 4. get_board action
// ---------------------------------------------------------------------------
describe('trello-manager: get_board', () => {
  beforeEach(() => {});

  it('should get board info successfully', async () => {
    const ctx = mockContext(sampleBoard);
    const result = await execute({ action: 'get_board', boardId: 'board1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_board');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.boardId, 'board1');
    assert.equal(result.metadata.name, 'Project Alpha');
    assert.ok(result.result.includes('Project Alpha'));
  });

  it('should reject missing boardId', async () => {
    const ctx = mockContext(sampleBoard);
    const result = await execute({ action: 'get_board' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BOARD_ID');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleBoard);
    await execute({ action: 'get_board', boardId: 'board1' }, context);
    assert.equal(calls[0].endpoint, 'trello/boards/board1');
  });
});

// ---------------------------------------------------------------------------
// 5. list_lists action
// ---------------------------------------------------------------------------
describe('trello-manager: list_lists', () => {
  beforeEach(() => {});

  it('should list lists successfully', async () => {
    const ctx = mockContext(sampleLists);
    const result = await execute({ action: 'list_lists', boardId: 'board1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_lists');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 3);
    assert.ok(result.result.includes('To Do'));
    assert.ok(result.result.includes('In Progress'));
    assert.ok(result.result.includes('Done'));
  });

  it('should reject missing boardId', async () => {
    const ctx = mockContext(sampleLists);
    const result = await execute({ action: 'list_lists' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_BOARD_ID');
  });

  it('should handle empty lists', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_lists', boardId: 'board1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No lists'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleLists);
    await execute({ action: 'list_lists', boardId: 'board1' }, context);
    assert.equal(calls[0].endpoint, 'trello/boards/board1/lists');
  });
});

// ---------------------------------------------------------------------------
// 6. list_cards action
// ---------------------------------------------------------------------------
describe('trello-manager: list_cards', () => {
  beforeEach(() => {});

  it('should list cards successfully', async () => {
    const ctx = mockContext(sampleCards);
    const result = await execute({ action: 'list_cards', listId: 'list1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_cards');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.count, 2);
    assert.ok(result.result.includes('Fix login bug'));
    assert.ok(result.result.includes('Add tests'));
  });

  it('should reject missing listId', async () => {
    const ctx = mockContext(sampleCards);
    const result = await execute({ action: 'list_cards' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_LIST_ID');
  });

  it('should handle empty cards list', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_cards', listId: 'list1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 0);
    assert.ok(result.result.includes('No cards'));
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleCards);
    await execute({ action: 'list_cards', listId: 'list1' }, context);
    assert.equal(calls[0].endpoint, 'trello/lists/list1/cards');
  });
});

// ---------------------------------------------------------------------------
// 7. get_card action
// ---------------------------------------------------------------------------
describe('trello-manager: get_card', () => {
  beforeEach(() => {});

  it('should get card details successfully', async () => {
    const ctx = mockContext(sampleCard);
    const result = await execute({ action: 'get_card', cardId: 'card1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_card');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.cardId, 'card1');
    assert.equal(result.metadata.name, 'Fix login bug');
    assert.equal(result.metadata.idList, 'list1');
    assert.equal(result.metadata.idBoard, 'board1');
    assert.ok(result.result.includes('Fix login bug'));
    assert.ok(result.result.includes('Login fails'));
  });

  it('should reject missing cardId', async () => {
    const ctx = mockContext(sampleCard);
    const result = await execute({ action: 'get_card' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CARD_ID');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleCard);
    await execute({ action: 'get_card', cardId: 'card1' }, context);
    assert.equal(calls[0].endpoint, 'trello/cards/card1');
  });

  it('should include labels in metadata', async () => {
    const ctx = mockContext(sampleCard);
    const result = await execute({ action: 'get_card', cardId: 'card1' }, ctx);
    assert.deepEqual(result.metadata.labels, ['bug', 'urgent']);
  });
});

// ---------------------------------------------------------------------------
// 8. create_card action
// ---------------------------------------------------------------------------
describe('trello-manager: create_card', () => {
  beforeEach(() => {});

  it('should create a card successfully', async () => {
    const ctx = mockContext(sampleCreatedCard);
    const result = await execute({
      action: 'create_card', listId: 'list1', name: 'New task',
      desc: 'Description', due: '2025-03-01T00:00:00.000Z', labels: ['lbl1'],
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'create_card');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.cardId, 'card99');
    assert.ok(result.result.includes('New task'));
    assert.ok(result.result.includes('card99'));
  });

  it('should reject missing listId', async () => {
    const ctx = mockContext(sampleCreatedCard);
    const result = await execute({ action: 'create_card', name: 'Task' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_LIST_ID');
  });

  it('should reject missing name', async () => {
    const ctx = mockContext(sampleCreatedCard);
    const result = await execute({ action: 'create_card', listId: 'list1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_NAME');
  });

  it('should use POST method for creating cards', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedCard);
    await execute({ action: 'create_card', listId: 'list1', name: 'Task' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedCard);
    await execute({ action: 'create_card', listId: 'list1', name: 'Task' }, context);
    assert.equal(calls[0].endpoint, 'trello/cards');
  });

  it('should pass listId and name in params', async () => {
    const { context, calls } = mockContextWithSpy(sampleCreatedCard);
    await execute({ action: 'create_card', listId: 'list1', name: 'Task' }, context);
    assert.equal(calls[0].opts.params.idList, 'list1');
    assert.equal(calls[0].opts.params.name, 'Task');
  });
});

// ---------------------------------------------------------------------------
// 9. update_card action
// ---------------------------------------------------------------------------
describe('trello-manager: update_card', () => {
  beforeEach(() => {});

  it('should update a card successfully', async () => {
    const ctx = mockContext(sampleUpdatedCard);
    const result = await execute({
      action: 'update_card', cardId: 'card1', name: 'Updated task',
    }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'update_card');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.cardId, 'card1');
    assert.ok(result.result.includes('Updated task'));
  });

  it('should reject missing cardId', async () => {
    const ctx = mockContext(sampleUpdatedCard);
    const result = await execute({ action: 'update_card', name: 'Task' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CARD_ID');
  });

  it('should use PUT method for updating cards', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedCard);
    await execute({ action: 'update_card', cardId: 'card1', name: 'New name' }, context);
    assert.equal(calls[0].opts.method, 'PUT');
  });

  it('should pass closed flag when specified', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedCard);
    await execute({ action: 'update_card', cardId: 'card1', closed: true }, context);
    assert.equal(calls[0].opts.params.closed, true);
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleUpdatedCard);
    await execute({ action: 'update_card', cardId: 'card1', name: 'X' }, context);
    assert.equal(calls[0].endpoint, 'trello/cards/card1');
  });
});

// ---------------------------------------------------------------------------
// 10. move_card action
// ---------------------------------------------------------------------------
describe('trello-manager: move_card', () => {
  beforeEach(() => {});

  it('should move a card successfully', async () => {
    const ctx = mockContext(sampleMovedCard);
    const result = await execute({ action: 'move_card', cardId: 'card1', listId: 'list3' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'move_card');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.cardId, 'card1');
    assert.equal(result.metadata.listId, 'list3');
    assert.ok(result.result.includes('moved'));
  });

  it('should reject missing cardId', async () => {
    const ctx = mockContext(sampleMovedCard);
    const result = await execute({ action: 'move_card', listId: 'list3' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CARD_ID');
  });

  it('should reject missing listId', async () => {
    const ctx = mockContext(sampleMovedCard);
    const result = await execute({ action: 'move_card', cardId: 'card1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_LIST_ID');
  });

  it('should use PUT method for moving cards', async () => {
    const { context, calls } = mockContextWithSpy(sampleMovedCard);
    await execute({ action: 'move_card', cardId: 'card1', listId: 'list3' }, context);
    assert.equal(calls[0].opts.method, 'PUT');
  });

  it('should pass idList in params', async () => {
    const { context, calls } = mockContextWithSpy(sampleMovedCard);
    await execute({ action: 'move_card', cardId: 'card1', listId: 'list3' }, context);
    assert.equal(calls[0].opts.params.idList, 'list3');
  });
});

// ---------------------------------------------------------------------------
// 11. add_comment action
// ---------------------------------------------------------------------------
describe('trello-manager: add_comment', () => {
  beforeEach(() => {});

  it('should add a comment successfully', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({ action: 'add_comment', cardId: 'card1', text: 'Great work!' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'add_comment');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.cardId, 'card1');
    assert.equal(result.metadata.commentId, 'comment1');
    assert.ok(result.result.includes('Comment added'));
  });

  it('should reject missing cardId', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({ action: 'add_comment', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_CARD_ID');
  });

  it('should reject missing text', async () => {
    const ctx = mockContext(sampleComment);
    const result = await execute({ action: 'add_comment', cardId: 'card1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });

  it('should use POST method for adding comments', async () => {
    const { context, calls } = mockContextWithSpy(sampleComment);
    await execute({ action: 'add_comment', cardId: 'card1', text: 'Hello' }, context);
    assert.equal(calls[0].opts.method, 'POST');
  });

  it('should call the correct endpoint', async () => {
    const { context, calls } = mockContextWithSpy(sampleComment);
    await execute({ action: 'add_comment', cardId: 'card1', text: 'Hello' }, context);
    assert.equal(calls[0].endpoint, 'trello/cards/card1/actions/comments');
  });

  it('should pass text in params', async () => {
    const { context, calls } = mockContextWithSpy(sampleComment);
    await execute({ action: 'add_comment', cardId: 'card1', text: 'Test comment' }, context);
    assert.equal(calls[0].opts.params.text, 'Test comment');
  });
});

// ---------------------------------------------------------------------------
// 12. Timeout handling
// ---------------------------------------------------------------------------
describe('trello-manager: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on abort for list_boards', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_boards' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for get_board', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_board', boardId: 'b1' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on abort for create_card', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'create_card', listId: 'l1', name: 'T' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 13. Network error handling
// ---------------------------------------------------------------------------
describe('trello-manager: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on network failure for list_boards', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'list_boards' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for create_card', async () => {
    const ctx = mockContextError(new Error('DNS lookup failed'));
    const result = await execute({ action: 'create_card', listId: 'l1', name: 'T' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on network failure for add_comment', async () => {
    const ctx = mockContextError(new Error('Network unreachable'));
    const result = await execute({ action: 'add_comment', cardId: 'c1', text: 'Hi' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 14. getClient helper
// ---------------------------------------------------------------------------
describe('trello-manager: getClient', () => {
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
// 15. redactSensitive
// ---------------------------------------------------------------------------
describe('trello-manager: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact token patterns', () => {
    const input = 'token=mySecretToken123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('mySecretToken123'));
  });

  it('should not alter clean strings', () => {
    const input = 'My Board has 5 cards';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 16. sanitizeString
// ---------------------------------------------------------------------------
describe('trello-manager: sanitizeString', () => {
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
// 17. L1 compliance - no hardcoded URLs, trello/ prefix
// ---------------------------------------------------------------------------
describe('trello-manager: L1 compliance', () => {
  beforeEach(() => {});

  it('should not use hardcoded trello.com URLs in fetch endpoints', async () => {
    const { context, calls } = mockContextWithSpy(sampleBoard);
    await execute({ action: 'get_board', boardId: 'b1' }, context);
    for (const call of calls) {
      assert.ok(!call.endpoint.includes('https://'), 'Endpoint must not contain https://');
      assert.ok(!call.endpoint.includes('api.trello.com'), 'Endpoint must not contain api.trello.com');
      assert.ok(call.endpoint.startsWith('trello/'), 'Endpoint must start with trello/');
    }
  });

  it('should use trello/ prefix for all API calls', async () => {
    const { context, calls } = mockContextWithSpy(sampleBoards);

    await execute({ action: 'list_boards' }, context);
    await execute({ action: 'get_board', boardId: 'b1' }, context);
    await execute({ action: 'list_lists', boardId: 'b1' }, context);
    await execute({ action: 'list_cards', listId: 'l1' }, context);
    await execute({ action: 'get_card', cardId: 'c1' }, context);
    await execute({ action: 'create_card', listId: 'l1', name: 'T' }, context);
    await execute({ action: 'update_card', cardId: 'c1', name: 'X' }, context);
    await execute({ action: 'move_card', cardId: 'c1', listId: 'l2' }, context);
    await execute({ action: 'add_comment', cardId: 'c1', text: 'Hi' }, context);

    assert.ok(calls.length >= 9, `Expected at least 9 calls, got ${calls.length}`);
    for (const call of calls) {
      assert.ok(call.endpoint.startsWith('trello/'), `Endpoint "${call.endpoint}" must start with trello/`);
    }
  });
});
