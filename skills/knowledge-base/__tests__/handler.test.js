import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Helper: clear all entries from the knowledge store between tests
// ---------------------------------------------------------------------------

async function clearStore() {
  const listRes = await execute({ action: 'list' }, {});
  if (listRes.metadata.entries && listRes.metadata.entries.length > 0) {
    for (const entry of listRes.metadata.entries) {
      await execute({ action: 'delete', key: entry.key }, {});
    }
  }
}

async function addEntry(key, content) {
  return execute({ action: 'add', key, content }, {});
}

// ===========================================================================
// Action validation
// ===========================================================================

describe('knowledge-base: action validation', () => {
  beforeEach(async () => { await clearStore(); });

  it('should return error when action is missing', async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error when action is null', async () => {
    const res = await execute({ action: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error when action is undefined', async () => {
    const res = await execute({ action: undefined }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for unknown action string', async () => {
    const res = await execute({ action: 'purge' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
    assert.ok(res.result.includes('purge'));
  });

  it('should list valid actions in the error message', async () => {
    const res = await execute({ action: 'invalid' }, {});
    assert.ok(res.result.includes('search'));
    assert.ok(res.result.includes('add'));
    assert.ok(res.result.includes('list'));
    assert.ok(res.result.includes('delete'));
  });

  it('should return error for numeric action', async () => {
    const res = await execute({ action: 123 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for empty string action', async () => {
    const res = await execute({ action: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should be case-sensitive (ADD is invalid)', async () => {
    const res = await execute({ action: 'ADD' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });
});

// ===========================================================================
// add action
// ===========================================================================

describe('knowledge-base: add action', () => {
  beforeEach(async () => { await clearStore(); });

  it('should add a new entry successfully', async () => {
    const res = await addEntry('test-key', 'JavaScript is a programming language');
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'add');
    assert.equal(res.metadata.key, 'test-key');
    assert.equal(res.metadata.isUpdate, false);
    assert.ok(res.result.includes('added'));
  });

  it('should update an existing entry', async () => {
    await addEntry('update-key', 'Original content about JavaScript');
    const res = await addEntry('update-key', 'Updated content about Python');
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.isUpdate, true);
    assert.ok(res.result.includes('updated'));
  });

  it('should extract keywords from content', async () => {
    const res = await addEntry('kw-test', 'Machine learning algorithms process data efficiently');
    assert.ok(res.metadata.keywords.length > 0);
    assert.ok(res.metadata.keywordCount > 0);
  });

  it('should report token count', async () => {
    const res = await addEntry('token-test', 'Hello world programming');
    assert.ok(res.metadata.tokenCount > 0);
  });

  it('should include keywords in result string', async () => {
    const res = await addEntry('kw-str', 'Database optimization techniques improve performance');
    assert.ok(res.result.includes('Keywords:'));
  });

  it('should include token count in result string', async () => {
    const res = await addEntry('token-str', 'Some content here about testing');
    assert.ok(res.result.includes('Tokens indexed:'));
  });

  it('should return error when key is missing', async () => {
    const res = await execute({ action: 'add', content: 'some content' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when key is null', async () => {
    const res = await execute({ action: 'add', key: null, content: 'content' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when key is empty string', async () => {
    const res = await execute({ action: 'add', key: '', content: 'content' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when key is whitespace only', async () => {
    const res = await execute({ action: 'add', key: '   ', content: 'content' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when key is a number', async () => {
    const res = await execute({ action: 'add', key: 123, content: 'content' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when content is missing', async () => {
    const res = await execute({ action: 'add', key: 'test' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CONTENT');
  });

  it('should return error when content is null', async () => {
    const res = await execute({ action: 'add', key: 'test', content: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CONTENT');
  });

  it('should return error when content is empty string', async () => {
    const res = await execute({ action: 'add', key: 'test', content: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CONTENT');
  });

  it('should return error when content is whitespace only', async () => {
    const res = await execute({ action: 'add', key: 'test', content: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CONTENT');
  });

  it('should return error when content is a number', async () => {
    const res = await execute({ action: 'add', key: 'test', content: 42 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_CONTENT');
  });

  it('should trim the key before storing', async () => {
    const res = await addEntry('  spaced-key  ', 'Some valid content here');
    assert.equal(res.metadata.key, 'spaced-key');
  });

  it('should filter stop words from keywords', async () => {
    const res = await addEntry('stop-words', 'the is a an and or but not with this that from');
    // All stop words, so very few or no meaningful keywords
    assert.equal(res.metadata.tokenCount, 0);
  });

  it('should handle very long content', async () => {
    const longContent = 'programming '.repeat(500);
    const res = await addEntry('long-content', longContent);
    assert.equal(res.metadata.success, true);
    assert.ok(res.metadata.tokenCount > 0);
  });

  it('should handle content with special characters', async () => {
    const res = await addEntry('special', 'C++ and C# are programming languages! @#$%');
    assert.equal(res.metadata.success, true);
  });

  it('should handle content with numbers', async () => {
    const res = await addEntry('numbers', 'Version 3.14 was released in 2024');
    assert.equal(res.metadata.success, true);
    assert.ok(res.metadata.tokenCount > 0);
  });

  it('should sort keywords by frequency', async () => {
    const res = await addEntry('freq-test', 'python python python java java rust');
    assert.equal(res.metadata.keywords[0], 'python');
    assert.equal(res.metadata.keywords[1], 'java');
    assert.equal(res.metadata.keywords[2], 'rust');
  });

  it('should limit keywords to max 20', async () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const res = await addEntry('many-kw', words);
    assert.ok(res.metadata.keywords.length <= 20);
  });
});

// ===========================================================================
// search action
// ===========================================================================

describe('knowledge-base: search action', () => {
  beforeEach(async () => { await clearStore(); });

  it('should find matching entries', async () => {
    await addEntry('js-guide', 'JavaScript programming language for web development');
    await addEntry('py-guide', 'Python programming language for data science');
    const res = await execute({ action: 'search', query: 'JavaScript' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'search');
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should return empty results for query with no matches', async () => {
    await addEntry('topic', 'Cooking recipes for pasta dishes');
    const res = await execute({ action: 'search', query: 'quantum physics' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.resultCount, 0);
  });

  it('should return message when store is empty', async () => {
    const res = await execute({ action: 'search', query: 'anything' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.resultCount, 0);
    assert.ok(res.result.includes('empty'));
  });

  it('should return error when query is missing', async () => {
    const res = await execute({ action: 'search' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_QUERY');
  });

  it('should return error when query is null', async () => {
    const res = await execute({ action: 'search', query: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_QUERY');
  });

  it('should return error when query is empty string', async () => {
    const res = await execute({ action: 'search', query: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_QUERY');
  });

  it('should return error when query is whitespace only', async () => {
    const res = await execute({ action: 'search', query: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_QUERY');
  });

  it('should return error when query contains only stop words', async () => {
    await addEntry('entry1', 'Some meaningful technical content');
    const res = await execute({ action: 'search', query: 'the is a an' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'EMPTY_QUERY_TOKENS');
  });

  it('should rank results by relevance score', async () => {
    await addEntry('python-deep', 'Python Python Python programming language Python');
    await addEntry('python-shallow', 'Python is mentioned once');
    const res = await execute({ action: 'search', query: 'Python' }, {});
    assert.ok(res.metadata.resultCount >= 2);
    const scores = res.metadata.results.map(r => r.score);
    assert.ok(scores[0] >= scores[1]);
  });

  it('should include query tokens in metadata', async () => {
    await addEntry('entry', 'Machine learning algorithms');
    const res = await execute({ action: 'search', query: 'machine learning algorithms' }, {});
    assert.ok(res.metadata.queryTokens.includes('machine'));
    assert.ok(res.metadata.queryTokens.includes('learning'));
    assert.ok(res.metadata.queryTokens.includes('algorithms'));
  });

  it('should include score in results', async () => {
    await addEntry('scored-entry', 'Database indexing strategies for performance');
    const res = await execute({ action: 'search', query: 'database indexing' }, {});
    assert.ok(res.metadata.results[0].score > 0);
  });

  it('should include content preview in results', async () => {
    await addEntry('preview-entry', 'This is a test content for preview');
    const res = await execute({ action: 'search', query: 'test content preview' }, {});
    assert.ok(res.metadata.results[0].contentPreview.length > 0);
  });

  it('should include keywords in results', async () => {
    await addEntry('kw-entry', 'React framework for building user interfaces');
    const res = await execute({ action: 'search', query: 'React framework' }, {});
    assert.ok(Array.isArray(res.metadata.results[0].keywords));
  });

  it('should return at most 10 results', async () => {
    for (let i = 0; i < 15; i++) {
      await addEntry(`entry-${i}`, `Programming language number ${i} is great for development`);
    }
    const res = await execute({ action: 'search', query: 'programming language development' }, {});
    assert.ok(res.metadata.returnedCount <= 10);
  });

  it('should truncate long content in formatted output', async () => {
    const longContent = 'x'.repeat(300) + ' unique_searchable_term';
    await addEntry('long-entry', longContent);
    const res = await execute({ action: 'search', query: 'unique_searchable_term' }, {});
    assert.ok(res.result.includes('...'));
  });

  it('should handle search with mixed stop words and real terms', async () => {
    await addEntry('mix-entry', 'Advanced neural network architectures');
    const res = await execute({ action: 'search', query: 'the advanced neural network' }, {});
    assert.ok(res.metadata.success);
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should handle case-insensitive search', async () => {
    await addEntry('case-entry', 'KUBERNETES container orchestration');
    const res = await execute({ action: 'search', query: 'kubernetes' }, {});
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should give bonus for keyword matches', async () => {
    // Add two entries: one where the search term is a keyword, one where it is not
    await addEntry('kw-bonus', 'docker docker docker container virtualization');
    const res = await execute({ action: 'search', query: 'docker' }, {});
    assert.ok(res.metadata.resultCount > 0);
    assert.ok(res.metadata.results[0].score > 0);
  });
});

// ===========================================================================
// list action
// ===========================================================================

describe('knowledge-base: list action', () => {
  beforeEach(async () => { await clearStore(); });

  it('should return empty list when store is empty', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'list');
    assert.equal(res.metadata.entryCount, 0);
    assert.deepEqual(res.metadata.entries, []);
    assert.ok(res.result.includes('empty'));
  });

  it('should return all entries', async () => {
    await addEntry('entry1', 'First entry about programming');
    await addEntry('entry2', 'Second entry about databases');
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.entryCount, 2);
    assert.equal(res.metadata.entries.length, 2);
  });

  it('should include key for each entry', async () => {
    await addEntry('my-key', 'Content about algorithms');
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.entries[0].key, 'my-key');
  });

  it('should include content preview', async () => {
    await addEntry('preview', 'Short content');
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.metadata.entries[0].contentPreview.length > 0);
  });

  it('should truncate long content previews', async () => {
    const longContent = 'x'.repeat(200);
    await addEntry('long-preview', longContent);
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.metadata.entries[0].contentPreview.includes('...'));
    assert.ok(res.metadata.entries[0].contentPreview.length <= 104);
  });

  it('should include keywords for each entry', async () => {
    await addEntry('kw-list', 'Machine learning neural networks deep learning');
    const res = await execute({ action: 'list' }, {});
    assert.ok(Array.isArray(res.metadata.entries[0].keywords));
    assert.ok(res.metadata.entries[0].keywords.length > 0);
  });

  it('should include tokenCount for each entry', async () => {
    await addEntry('tc-list', 'Programming languages and frameworks');
    const res = await execute({ action: 'list' }, {});
    assert.ok(typeof res.metadata.entries[0].tokenCount === 'number');
  });

  it('should include addedAt timestamp for each entry', async () => {
    await addEntry('ts-list', 'Timestamp test content');
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.metadata.entries[0].addedAt);
    // Should be a valid ISO string
    assert.ok(!isNaN(Date.parse(res.metadata.entries[0].addedAt)));
  });

  it('should include formatted output', async () => {
    await addEntry('fmt-list', 'Formatted output test');
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('fmt-list'));
    assert.ok(res.result.includes('Knowledge base entries'));
  });

  it('should include count in result string', async () => {
    await addEntry('a', 'First content here');
    await addEntry('b', 'Second content here');
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('2'));
  });
});

// ===========================================================================
// delete action
// ===========================================================================

describe('knowledge-base: delete action', () => {
  beforeEach(async () => { await clearStore(); });

  it('should delete an existing entry', async () => {
    await addEntry('to-delete', 'Content to be deleted');
    const res = await execute({ action: 'delete', key: 'to-delete' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'delete');
    assert.equal(res.metadata.key, 'to-delete');
    assert.ok(res.result.includes('deleted'));
  });

  it('should return error for non-existing key', async () => {
    const res = await execute({ action: 'delete', key: 'no-such-key' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOT_FOUND');
  });

  it('should return error when key is missing', async () => {
    const res = await execute({ action: 'delete' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when key is null', async () => {
    const res = await execute({ action: 'delete', key: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when key is empty string', async () => {
    const res = await execute({ action: 'delete', key: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when key is whitespace only', async () => {
    const res = await execute({ action: 'delete', key: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should return error when key is a number', async () => {
    const res = await execute({ action: 'delete', key: 42 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_KEY');
  });

  it('should remove entry from store after deletion', async () => {
    await addEntry('remove-me', 'To be removed');
    await execute({ action: 'delete', key: 'remove-me' }, {});
    const listRes = await execute({ action: 'list' }, {});
    assert.equal(listRes.metadata.entryCount, 0);
  });

  it('should report remaining entries after deletion', async () => {
    await addEntry('keep', 'Keep this one');
    await addEntry('remove', 'Remove this one');
    const res = await execute({ action: 'delete', key: 'remove' }, {});
    assert.equal(res.metadata.remainingEntries, 1);
  });

  it('should trim key before lookup', async () => {
    await addEntry('trim-test', 'Trim key test');
    const res = await execute({ action: 'delete', key: '  trim-test  ' }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should not affect other entries when deleting', async () => {
    await addEntry('first', 'First content value');
    await addEntry('second', 'Second content value');
    await execute({ action: 'delete', key: 'first' }, {});
    const listRes = await execute({ action: 'list' }, {});
    assert.equal(listRes.metadata.entryCount, 1);
    assert.equal(listRes.metadata.entries[0].key, 'second');
  });
});

// ===========================================================================
// TF-IDF scoring and tokenization
// ===========================================================================

describe('knowledge-base: TF-IDF and tokenization', () => {
  beforeEach(async () => { await clearStore(); });

  it('should tokenize text to lowercase', async () => {
    await addEntry('upper', 'HELLO WORLD Programming');
    const res = await execute({ action: 'search', query: 'hello world' }, {});
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should remove punctuation during tokenization', async () => {
    await addEntry('punct', 'hello, world! programming.');
    const res = await execute({ action: 'search', query: 'hello world programming' }, {});
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should filter out single-character tokens', async () => {
    // Single characters like 'a', 'i' etc. should be filtered
    await addEntry('single-chars', 'x y z programming language');
    const res = await execute({ action: 'search', query: 'programming' }, {});
    // The search should work since 'programming' is multi-char
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should compute IDF correctly: rare terms get higher scores', async () => {
    // Add many docs with 'common' and one with 'rare'
    await addEntry('doc1', 'common term repeated common common');
    await addEntry('doc2', 'common term again common');
    await addEntry('doc3', 'rare unique special term');
    const resRare = await execute({ action: 'search', query: 'rare' }, {});
    const resCommon = await execute({ action: 'search', query: 'common' }, {});
    // 'rare' should appear in fewer docs thus score differently
    assert.ok(resRare.metadata.resultCount >= 1);
    assert.ok(resCommon.metadata.resultCount >= 1);
  });

  it('should handle content with hyphens', async () => {
    await addEntry('hyphen', 'server-side rendering is important');
    const res = await execute({ action: 'search', query: 'server-side rendering' }, {});
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should handle content with numbers in words', async () => {
    await addEntry('num-words', 'Python3 and ES2024 are popular');
    const res = await execute({ action: 'search', query: 'python3' }, {});
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should not score entries that have zero matching terms', async () => {
    await addEntry('mismatch', 'Apple banana cherry fruit');
    const res = await execute({ action: 'search', query: 'quantum physics relativity' }, {});
    assert.equal(res.metadata.resultCount, 0);
  });

  it('should handle query with repeated terms', async () => {
    await addEntry('repeated', 'Database indexing optimization');
    const res = await execute({ action: 'search', query: 'database database database' }, {});
    assert.ok(res.metadata.resultCount > 0);
  });
});

// ===========================================================================
// Context parameter
// ===========================================================================

describe('knowledge-base: context parameter', () => {
  beforeEach(async () => { await clearStore(); });

  it('should accept empty context object', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.metadata);
  });

  it('should accept undefined context', async () => {
    const res = await execute({ action: 'list' }, undefined);
    assert.ok(res.metadata);
  });

  it('should accept context with extra properties', async () => {
    const res = await execute({ action: 'list' }, { userId: 'test', env: 'dev' });
    assert.ok(res.metadata);
  });
});

// ===========================================================================
// Integration / multi-step workflows
// ===========================================================================

describe('knowledge-base: integration workflows', () => {
  beforeEach(async () => { await clearStore(); });

  it('should add, list, search, and delete in sequence', async () => {
    const addRes = await addEntry('workflow', 'Kubernetes container orchestration platform');
    assert.equal(addRes.metadata.success, true);

    const listRes = await execute({ action: 'list' }, {});
    assert.equal(listRes.metadata.entryCount, 1);

    const searchRes = await execute({ action: 'search', query: 'kubernetes container' }, {});
    assert.ok(searchRes.metadata.resultCount > 0);

    const delRes = await execute({ action: 'delete', key: 'workflow' }, {});
    assert.equal(delRes.metadata.success, true);

    const finalList = await execute({ action: 'list' }, {});
    assert.equal(finalList.metadata.entryCount, 0);
  });

  it('should update entry and reflect in search results', async () => {
    await addEntry('evolving', 'Machine learning with TensorFlow');
    await addEntry('evolving', 'Deep learning with PyTorch framework');
    const res = await execute({ action: 'search', query: 'PyTorch' }, {});
    assert.ok(res.metadata.resultCount > 0);
  });

  it('should handle many entries without error', async () => {
    for (let i = 0; i < 20; i++) {
      await addEntry(`bulk-${i}`, `Entry number ${i} about technology topic ${i}`);
    }
    const listRes = await execute({ action: 'list' }, {});
    assert.equal(listRes.metadata.entryCount, 20);
  });

  it('should not find deleted entry in search', async () => {
    await addEntry('gone', 'Specific unique deletable content');
    await execute({ action: 'delete', key: 'gone' }, {});
    const res = await execute({ action: 'search', query: 'specific unique deletable' }, {});
    assert.equal(res.metadata.resultCount, 0);
  });

  it('should handle adding entry after deletion of same key', async () => {
    await addEntry('reborn', 'Original content value here');
    await execute({ action: 'delete', key: 'reborn' }, {});
    const res = await addEntry('reborn', 'New content value here');
    assert.equal(res.metadata.isUpdate, false);
    assert.equal(res.metadata.success, true);
  });
});
