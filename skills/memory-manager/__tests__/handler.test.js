import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute, _setMemoryFilePath } from '../handler.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let testDir;
let testFilePath;

function initTestDir() {
  testDir = mkdtempSync(join(tmpdir(), 'memory-manager-test-'));
  testFilePath = join(testDir, 'memory.json');
  _setMemoryFilePath(testFilePath);
}

function cleanTestDir() {
  if (testDir && existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

// ===========================================================================
// Parameter validation - unknown action
// ===========================================================================

describe('memory-manager: action validation', () => {
  beforeEach(() => {
    initTestDir();
  });

  it('should throw for unknown action', async () => {
    await assert.rejects(
      () => execute({ action: 'purge' }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        assert.ok(err.message.includes('purge'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should throw for null action', async () => {
    await assert.rejects(
      () => execute({ action: null }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should throw for undefined action', async () => {
    await assert.rejects(
      () => execute({ action: undefined }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should throw for empty string action', async () => {
    await assert.rejects(
      () => execute({ action: '' }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should throw for numeric action', async () => {
    await assert.rejects(
      () => execute({ action: 123 }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should throw for case-mismatch STORE', async () => {
    await assert.rejects(
      () => execute({ action: 'STORE' }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should include supported actions in error message', async () => {
    await assert.rejects(
      () => execute({ action: 'bad' }, {}),
      (err) => {
        assert.ok(err.message.includes('store'));
        assert.ok(err.message.includes('retrieve'));
        assert.ok(err.message.includes('search'));
        assert.ok(err.message.includes('list'));
        assert.ok(err.message.includes('delete'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should throw for boolean action', async () => {
    await assert.rejects(
      () => execute({ action: true }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should throw for object action', async () => {
    await assert.rejects(
      () => execute({ action: {} }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
    cleanTestDir();
  });

  it('should throw for array action', async () => {
    await assert.rejects(
      () => execute({ action: ['store'] }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
    cleanTestDir();
  });
});

// ===========================================================================
// store action
// ===========================================================================

describe('memory-manager: store action', () => {
  beforeEach(() => {
    initTestDir();
  });

  it('should store a new entry successfully', async () => {
    const res = await execute({ action: 'store', key: 'greeting', value: 'hello world' }, {});
    assert.ok(res.result.includes('Stored'));
    assert.ok(res.result.includes('greeting'));
    assert.equal(res.metadata.key, 'greeting');
    assert.equal(res.metadata.isUpdate, false);
    assert.equal(res.metadata.totalEntries, 1);
    cleanTestDir();
  });

  it('should update an existing entry', async () => {
    await execute({ action: 'store', key: 'item', value: 'original' }, {});
    const res = await execute({ action: 'store', key: 'item', value: 'updated' }, {});
    assert.ok(res.result.includes('Updated'));
    assert.equal(res.metadata.isUpdate, true);
    cleanTestDir();
  });

  it('should preserve createdAt on update', async () => {
    await execute({ action: 'store', key: 'ts-key', value: 'v1' }, {});
    const first = await execute({ action: 'retrieve', key: 'ts-key' }, {});
    const createdAt = first.metadata.createdAt;

    await execute({ action: 'store', key: 'ts-key', value: 'v2' }, {});
    const second = await execute({ action: 'retrieve', key: 'ts-key' }, {});
    assert.equal(second.metadata.createdAt, createdAt);
    cleanTestDir();
  });

  it('should update updatedAt on update', async () => {
    await execute({ action: 'store', key: 'ts-key2', value: 'v1' }, {});
    const first = await execute({ action: 'retrieve', key: 'ts-key2' }, {});

    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 10));

    await execute({ action: 'store', key: 'ts-key2', value: 'v2' }, {});
    const second = await execute({ action: 'retrieve', key: 'ts-key2' }, {});
    assert.ok(second.metadata.updatedAt >= first.metadata.updatedAt);
    cleanTestDir();
  });

  it('should include timestamp in metadata', async () => {
    const res = await execute({ action: 'store', key: 'ts', value: 'val' }, {});
    assert.ok(res.metadata.timestamp);
    assert.ok(!isNaN(Date.parse(res.metadata.timestamp)));
    cleanTestDir();
  });

  it('should throw when key is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'store', value: 'val' }, {}),
      { message: 'A key is required for the store action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'store', key: '', value: 'val' }, {}),
      { message: 'A key is required for the store action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is whitespace only', async () => {
    await assert.rejects(
      () => execute({ action: 'store', key: '   ', value: 'val' }, {}),
      { message: 'A key is required for the store action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is null', async () => {
    await assert.rejects(
      () => execute({ action: 'store', key: null, value: 'val' }, {}),
      { message: 'A key is required for the store action.' }
    );
    cleanTestDir();
  });

  it('should throw when value is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'store', key: 'k' }, {}),
      { message: 'A value is required for the store action.' }
    );
    cleanTestDir();
  });

  it('should throw when value is null', async () => {
    await assert.rejects(
      () => execute({ action: 'store', key: 'k', value: null }, {}),
      { message: 'A value is required for the store action.' }
    );
    cleanTestDir();
  });

  it('should store numeric values', async () => {
    const res = await execute({ action: 'store', key: 'num', value: 42 }, {});
    assert.ok(res.result.includes('Stored'));
    cleanTestDir();
  });

  it('should store boolean values', async () => {
    const res = await execute({ action: 'store', key: 'bool', value: true }, {});
    assert.ok(res.result.includes('Stored'));
    cleanTestDir();
  });

  it('should store empty string value', async () => {
    const res = await execute({ action: 'store', key: 'empty', value: '' }, {});
    assert.ok(res.result.includes('Stored'));
    cleanTestDir();
  });

  it('should store object values', async () => {
    const res = await execute({ action: 'store', key: 'obj', value: { nested: true } }, {});
    assert.ok(res.result.includes('Stored'));
    cleanTestDir();
  });

  it('should report total entries count', async () => {
    await execute({ action: 'store', key: 'a', value: '1' }, {});
    await execute({ action: 'store', key: 'b', value: '2' }, {});
    const res = await execute({ action: 'store', key: 'c', value: '3' }, {});
    assert.equal(res.metadata.totalEntries, 3);
    cleanTestDir();
  });

  it('should persist data to file', async () => {
    await execute({ action: 'store', key: 'persist', value: 'data' }, {});
    const raw = readFileSync(testFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.ok('persist' in parsed);
    assert.equal(parsed.persist.value, 'data');
    cleanTestDir();
  });

  it('should handle key with special characters', async () => {
    const res = await execute({ action: 'store', key: 'key-with.dots_and-dashes', value: 'val' }, {});
    assert.ok(res.result.includes('Stored'));
    cleanTestDir();
  });

  it('should handle very long values', async () => {
    const longVal = 'x'.repeat(10000);
    const res = await execute({ action: 'store', key: 'long', value: longVal }, {});
    assert.ok(res.result.includes('Stored'));
    cleanTestDir();
  });
});

// ===========================================================================
// retrieve action
// ===========================================================================

describe('memory-manager: retrieve action', () => {
  beforeEach(() => {
    initTestDir();
  });

  it('should retrieve an existing entry', async () => {
    await execute({ action: 'store', key: 'mykey', value: 'myvalue' }, {});
    const res = await execute({ action: 'retrieve', key: 'mykey' }, {});
    assert.equal(res.metadata.found, true);
    assert.equal(res.metadata.key, 'mykey');
    assert.equal(res.metadata.value, 'myvalue');
    assert.ok(res.result.includes('myvalue'));
    cleanTestDir();
  });

  it('should return not-found for missing key', async () => {
    const res = await execute({ action: 'retrieve', key: 'nonexistent' }, {});
    assert.equal(res.metadata.found, false);
    assert.ok(res.result.includes('No memory entry found'));
    cleanTestDir();
  });

  it('should throw when key is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'retrieve' }, {}),
      { message: 'A key is required for the retrieve action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'retrieve', key: '' }, {}),
      { message: 'A key is required for the retrieve action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is null', async () => {
    await assert.rejects(
      () => execute({ action: 'retrieve', key: null }, {}),
      { message: 'A key is required for the retrieve action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is whitespace only', async () => {
    await assert.rejects(
      () => execute({ action: 'retrieve', key: '   ' }, {}),
      { message: 'A key is required for the retrieve action.' }
    );
    cleanTestDir();
  });

  it('should include createdAt in metadata', async () => {
    await execute({ action: 'store', key: 'ts-ret', value: 'val' }, {});
    const res = await execute({ action: 'retrieve', key: 'ts-ret' }, {});
    assert.ok(res.metadata.createdAt);
    assert.ok(!isNaN(Date.parse(res.metadata.createdAt)));
    cleanTestDir();
  });

  it('should include updatedAt in metadata', async () => {
    await execute({ action: 'store', key: 'ts-upd', value: 'val' }, {});
    const res = await execute({ action: 'retrieve', key: 'ts-upd' }, {});
    assert.ok(res.metadata.updatedAt);
    cleanTestDir();
  });

  it('should include formatted result string with value, created, updated', async () => {
    await execute({ action: 'store', key: 'fmt', value: 'formatted' }, {});
    const res = await execute({ action: 'retrieve', key: 'fmt' }, {});
    assert.ok(res.result.includes('Value: formatted'));
    assert.ok(res.result.includes('Created:'));
    assert.ok(res.result.includes('Updated:'));
    cleanTestDir();
  });

  it('should retrieve updated value after store update', async () => {
    await execute({ action: 'store', key: 'upd', value: 'old' }, {});
    await execute({ action: 'store', key: 'upd', value: 'new' }, {});
    const res = await execute({ action: 'retrieve', key: 'upd' }, {});
    assert.equal(res.metadata.value, 'new');
    cleanTestDir();
  });

  it('should not find entry after deletion', async () => {
    await execute({ action: 'store', key: 'del-ret', value: 'val' }, {});
    await execute({ action: 'delete', key: 'del-ret' }, {});
    const res = await execute({ action: 'retrieve', key: 'del-ret' }, {});
    assert.equal(res.metadata.found, false);
    cleanTestDir();
  });
});

// ===========================================================================
// search action
// ===========================================================================

describe('memory-manager: search action', () => {
  beforeEach(() => {
    initTestDir();
  });

  it('should find entries by key substring', async () => {
    await execute({ action: 'store', key: 'javascript-notes', value: 'JS tips' }, {});
    const res = await execute({ action: 'search', query: 'javascript' }, {});
    assert.ok(res.metadata.matchCount > 0);
    assert.ok(res.result.includes('javascript-notes'));
    cleanTestDir();
  });

  it('should find entries by value substring', async () => {
    await execute({ action: 'store', key: 'recipe', value: 'chocolate cake with cream' }, {});
    const res = await execute({ action: 'search', query: 'chocolate' }, {});
    assert.ok(res.metadata.matchCount > 0);
    cleanTestDir();
  });

  it('should return no matches for unrelated query', async () => {
    await execute({ action: 'store', key: 'fruit', value: 'apple banana' }, {});
    const res = await execute({ action: 'search', query: 'zzznonexistent' }, {});
    assert.equal(res.metadata.matchCount, 0);
    assert.ok(res.result.includes('No memory entries match'));
    cleanTestDir();
  });

  it('should return no matches for empty store', async () => {
    const res = await execute({ action: 'search', query: 'anything' }, {});
    assert.equal(res.metadata.matchCount, 0);
    cleanTestDir();
  });

  it('should throw when query is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'search' }, {}),
      { message: 'A query is required for the search action.' }
    );
    cleanTestDir();
  });

  it('should throw when query is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'search', query: '' }, {}),
      { message: 'A query is required for the search action.' }
    );
    cleanTestDir();
  });

  it('should throw when query is null', async () => {
    await assert.rejects(
      () => execute({ action: 'search', query: null }, {}),
      { message: 'A query is required for the search action.' }
    );
    cleanTestDir();
  });

  it('should throw when query is whitespace only', async () => {
    await assert.rejects(
      () => execute({ action: 'search', query: '   ' }, {}),
      { message: 'A query is required for the search action.' }
    );
    cleanTestDir();
  });

  it('should rank exact key match highest', async () => {
    await execute({ action: 'store', key: 'python', value: 'a programming language' }, {});
    await execute({ action: 'store', key: 'python-tips', value: 'some tips' }, {});
    const res = await execute({ action: 'search', query: 'python' }, {});
    assert.ok(res.metadata.matchCount >= 2);
    assert.equal(res.metadata.topMatches[0].key, 'python');
    cleanTestDir();
  });

  it('should be case-insensitive', async () => {
    await execute({ action: 'store', key: 'CamelCase', value: 'Mixed case value' }, {});
    const res = await execute({ action: 'search', query: 'camelcase' }, {});
    assert.ok(res.metadata.matchCount > 0);
    cleanTestDir();
  });

  it('should support token-level matching', async () => {
    await execute({ action: 'store', key: 'multi-word', value: 'React and Node development' }, {});
    const res = await execute({ action: 'search', query: 'React Node' }, {});
    assert.ok(res.metadata.matchCount > 0);
    cleanTestDir();
  });

  it('should use Levenshtein similarity for short queries', async () => {
    await execute({ action: 'store', key: 'hello', value: 'greeting' }, {});
    const res = await execute({ action: 'search', query: 'helo' }, {});
    // Should match via similarity
    assert.ok(res.metadata.matchCount > 0);
    cleanTestDir();
  });

  it('should return at most 10 results', async () => {
    for (let i = 0; i < 15; i++) {
      await execute({ action: 'store', key: `item-${i}`, value: `common search term ${i}` }, {});
    }
    const res = await execute({ action: 'search', query: 'common search term' }, {});
    assert.ok(res.metadata.topMatches.length <= 10);
    cleanTestDir();
  });

  it('should include score in matches', async () => {
    await execute({ action: 'store', key: 'scored', value: 'test value' }, {});
    const res = await execute({ action: 'search', query: 'test' }, {});
    assert.ok(res.metadata.topMatches[0].score > 0);
    cleanTestDir();
  });

  it('should include formatted output', async () => {
    await execute({ action: 'store', key: 'fmt-search', value: 'formatted search result' }, {});
    const res = await execute({ action: 'search', query: 'formatted' }, {});
    assert.ok(res.result.includes('Found'));
    assert.ok(res.result.includes('match'));
    cleanTestDir();
  });

  it('should sort results by score descending', async () => {
    await execute({ action: 'store', key: 'exact-match', value: 'exact query here' }, {});
    await execute({ action: 'store', key: 'partial', value: 'something else entirely' }, {});
    const res = await execute({ action: 'search', query: 'exact-match' }, {});
    if (res.metadata.topMatches.length > 1) {
      assert.ok(res.metadata.topMatches[0].score >= res.metadata.topMatches[1].score);
    }
    cleanTestDir();
  });
});

// ===========================================================================
// list action
// ===========================================================================

describe('memory-manager: list action', () => {
  beforeEach(() => {
    initTestDir();
  });

  it('should return empty list when no entries', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.totalEntries, 0);
    assert.ok(res.result.includes('empty'));
    cleanTestDir();
  });

  it('should list all entries', async () => {
    await execute({ action: 'store', key: 'a', value: 'val-a' }, {});
    await execute({ action: 'store', key: 'b', value: 'val-b' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.totalEntries, 2);
    assert.ok(res.metadata.keys.includes('a'));
    assert.ok(res.metadata.keys.includes('b'));
    cleanTestDir();
  });

  it('should include formatted output for each entry', async () => {
    await execute({ action: 'store', key: 'list-fmt', value: 'formatted value' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('list-fmt'));
    assert.ok(res.result.includes('formatted value'));
    cleanTestDir();
  });

  it('should include updated timestamp in output', async () => {
    await execute({ action: 'store', key: 'ts-list', value: 'timestamped' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('updated:'));
    cleanTestDir();
  });

  it('should truncate long values in preview', async () => {
    const longVal = 'x'.repeat(200);
    await execute({ action: 'store', key: 'long-list', value: longVal }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('...'));
    cleanTestDir();
  });

  it('should report entry count in result', async () => {
    await execute({ action: 'store', key: 'c1', value: 'v1' }, {});
    await execute({ action: 'store', key: 'c2', value: 'v2' }, {});
    await execute({ action: 'store', key: 'c3', value: 'v3' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.result.includes('3'));
    cleanTestDir();
  });

  it('should include keys array in metadata', async () => {
    await execute({ action: 'store', key: 'k1', value: 'v1' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.ok(Array.isArray(res.metadata.keys));
    assert.ok(res.metadata.keys.includes('k1'));
    cleanTestDir();
  });

  it('should reflect deletions', async () => {
    await execute({ action: 'store', key: 'del1', value: 'v1' }, {});
    await execute({ action: 'store', key: 'del2', value: 'v2' }, {});
    await execute({ action: 'delete', key: 'del1' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.totalEntries, 1);
    assert.ok(res.metadata.keys.includes('del2'));
    cleanTestDir();
  });
});

// ===========================================================================
// delete action
// ===========================================================================

describe('memory-manager: delete action', () => {
  beforeEach(() => {
    initTestDir();
  });

  it('should delete an existing entry', async () => {
    await execute({ action: 'store', key: 'to-delete', value: 'bye' }, {});
    const res = await execute({ action: 'delete', key: 'to-delete' }, {});
    assert.equal(res.metadata.deleted, true);
    assert.equal(res.metadata.key, 'to-delete');
    assert.ok(res.result.includes('Deleted'));
    cleanTestDir();
  });

  it('should return not-deleted for missing key', async () => {
    const res = await execute({ action: 'delete', key: 'no-such-key' }, {});
    assert.equal(res.metadata.deleted, false);
    assert.ok(res.result.includes('No memory entry found'));
    cleanTestDir();
  });

  it('should throw when key is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'delete' }, {}),
      { message: 'A key is required for the delete action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'delete', key: '' }, {}),
      { message: 'A key is required for the delete action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is null', async () => {
    await assert.rejects(
      () => execute({ action: 'delete', key: null }, {}),
      { message: 'A key is required for the delete action.' }
    );
    cleanTestDir();
  });

  it('should throw when key is whitespace only', async () => {
    await assert.rejects(
      () => execute({ action: 'delete', key: '   ' }, {}),
      { message: 'A key is required for the delete action.' }
    );
    cleanTestDir();
  });

  it('should report remaining entries after deletion', async () => {
    await execute({ action: 'store', key: 'keep', value: 'v1' }, {});
    await execute({ action: 'store', key: 'remove', value: 'v2' }, {});
    const res = await execute({ action: 'delete', key: 'remove' }, {});
    assert.equal(res.metadata.remainingEntries, 1);
    cleanTestDir();
  });

  it('should include deleted value in metadata', async () => {
    await execute({ action: 'store', key: 'with-val', value: 'original-value' }, {});
    const res = await execute({ action: 'delete', key: 'with-val' }, {});
    assert.equal(res.metadata.deletedValue, 'original-value');
    cleanTestDir();
  });

  it('should persist deletion to file', async () => {
    await execute({ action: 'store', key: 'persist-del', value: 'val' }, {});
    await execute({ action: 'delete', key: 'persist-del' }, {});
    const raw = readFileSync(testFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.ok(!('persist-del' in parsed));
    cleanTestDir();
  });

  it('should not affect other entries', async () => {
    await execute({ action: 'store', key: 'keep-me', value: 'safe' }, {});
    await execute({ action: 'store', key: 'remove-me', value: 'gone' }, {});
    await execute({ action: 'delete', key: 'remove-me' }, {});
    const res = await execute({ action: 'retrieve', key: 'keep-me' }, {});
    assert.equal(res.metadata.found, true);
    assert.equal(res.metadata.value, 'safe');
    cleanTestDir();
  });
});

// ===========================================================================
// Context parameter
// ===========================================================================

describe('memory-manager: context parameter', () => {
  beforeEach(() => {
    initTestDir();
  });

  it('should accept empty context', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.ok(res.metadata);
    cleanTestDir();
  });

  it('should accept undefined context', async () => {
    const res = await execute({ action: 'list' }, undefined);
    assert.ok(res.metadata);
    cleanTestDir();
  });

  it('should accept context with extra properties', async () => {
    const res = await execute({ action: 'list' }, { userId: '123' });
    assert.ok(res.metadata);
    cleanTestDir();
  });
});

// ===========================================================================
// Integration / multi-step workflows
// ===========================================================================

describe('memory-manager: integration workflows', () => {
  beforeEach(() => {
    initTestDir();
  });

  it('should store, retrieve, and delete in sequence', async () => {
    await execute({ action: 'store', key: 'workflow', value: 'test-value' }, {});
    const retRes = await execute({ action: 'retrieve', key: 'workflow' }, {});
    assert.equal(retRes.metadata.value, 'test-value');

    await execute({ action: 'delete', key: 'workflow' }, {});
    const retRes2 = await execute({ action: 'retrieve', key: 'workflow' }, {});
    assert.equal(retRes2.metadata.found, false);
    cleanTestDir();
  });

  it('should store multiple entries and list them all', async () => {
    await execute({ action: 'store', key: 'a', value: '1' }, {});
    await execute({ action: 'store', key: 'b', value: '2' }, {});
    await execute({ action: 'store', key: 'c', value: '3' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.totalEntries, 3);
    cleanTestDir();
  });

  it('should store entries and search them', async () => {
    await execute({ action: 'store', key: 'recipe-pasta', value: 'Cook pasta in boiling water' }, {});
    await execute({ action: 'store', key: 'recipe-cake', value: 'Mix flour and sugar' }, {});
    const res = await execute({ action: 'search', query: 'pasta' }, {});
    assert.ok(res.metadata.matchCount >= 1);
    assert.ok(res.metadata.topMatches.some(m => m.key === 'recipe-pasta'));
    cleanTestDir();
  });

  it('should handle store-update-retrieve cycle', async () => {
    await execute({ action: 'store', key: 'version', value: '1.0' }, {});
    await execute({ action: 'store', key: 'version', value: '2.0' }, {});
    const res = await execute({ action: 'retrieve', key: 'version' }, {});
    assert.equal(res.metadata.value, '2.0');
    cleanTestDir();
  });

  it('should handle delete then re-store', async () => {
    await execute({ action: 'store', key: 'reborn', value: 'first' }, {});
    await execute({ action: 'delete', key: 'reborn' }, {});
    await execute({ action: 'store', key: 'reborn', value: 'second' }, {});
    const res = await execute({ action: 'retrieve', key: 'reborn' }, {});
    assert.equal(res.metadata.value, 'second');
    assert.equal(res.metadata.found, true);
    cleanTestDir();
  });

  it('should not find deleted entry via search', async () => {
    await execute({ action: 'store', key: 'searchable', value: 'unique-term-xyz' }, {});
    await execute({ action: 'delete', key: 'searchable' }, {});
    const res = await execute({ action: 'search', query: 'unique-term-xyz' }, {});
    assert.equal(res.metadata.matchCount, 0);
    cleanTestDir();
  });

  it('should handle many entries', async () => {
    for (let i = 0; i < 20; i++) {
      await execute({ action: 'store', key: `bulk-${i}`, value: `value ${i}` }, {});
    }
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.totalEntries, 20);
    cleanTestDir();
  });

  it('should delete all entries one by one', async () => {
    await execute({ action: 'store', key: 'x', value: '1' }, {});
    await execute({ action: 'store', key: 'y', value: '2' }, {});
    await execute({ action: 'store', key: 'z', value: '3' }, {});
    await execute({ action: 'delete', key: 'x' }, {});
    await execute({ action: 'delete', key: 'y' }, {});
    await execute({ action: 'delete', key: 'z' }, {});
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.totalEntries, 0);
    cleanTestDir();
  });
});
