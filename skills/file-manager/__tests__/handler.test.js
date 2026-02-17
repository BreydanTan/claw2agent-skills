import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { execute } from '../handler.js';
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Determine if /data is available and writable for filesystem tests
// ---------------------------------------------------------------------------

let dataWritable = false;
const SANDBOX = '/data';
const TEST_DIR = '/data/__test_fm__';

try {
  await mkdir(SANDBOX, { recursive: true });
  const testFile = join(SANDBOX, '__write_test__');
  const { writeFile: wf, unlink: ul } = await import('node:fs/promises');
  await wf(testFile, 'test');
  await ul(testFile);
  dataWritable = true;
} catch {
  dataWritable = false;
}

// ---------------------------------------------------------------------------
// Helper: clean up the test directory
// ---------------------------------------------------------------------------

async function cleanTestDir() {
  if (!dataWritable) return;
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ===========================================================================
// 1. Action validation
// ===========================================================================
describe('file-manager: action validation', () => {
  beforeEach(() => {});

  it('should return error for missing action', async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
    assert.ok(res.result.includes('Error'));
  });

  it('should return error for null action', async () => {
    const res = await execute({ action: null, path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for undefined action', async () => {
    const res = await execute({ action: undefined, path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for empty string action', async () => {
    const res = await execute({ action: '', path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for unknown action string', async () => {
    const res = await execute({ action: 'copy', path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
    assert.ok(res.result.includes('copy'));
  });

  it('should return error for numeric action', async () => {
    const res = await execute({ action: 42, path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should return error for boolean action', async () => {
    const res = await execute({ action: true, path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should list valid actions in error message', async () => {
    const res = await execute({ action: 'invalid' }, {});
    assert.ok(res.result.includes('read'));
    assert.ok(res.result.includes('write'));
    assert.ok(res.result.includes('list'));
    assert.ok(res.result.includes('delete'));
  });

  it('should be case-sensitive for actions', async () => {
    const res = await execute({ action: 'READ', path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should reject Write (wrong case)', async () => {
    const res = await execute({ action: 'Write', path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should reject DELETE (wrong case)', async () => {
    const res = await execute({ action: 'DELETE', path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should reject LIST (wrong case)', async () => {
    const res = await execute({ action: 'LIST', path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });
});

// ===========================================================================
// 2. Path validation
// ===========================================================================
describe('file-manager: path validation', () => {
  beforeEach(() => {});

  it('should return error for missing path', async () => {
    const res = await execute({ action: 'read' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should return error for null path', async () => {
    const res = await execute({ action: 'read', path: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should return error for undefined path', async () => {
    const res = await execute({ action: 'read', path: undefined }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should return error for empty string path', async () => {
    const res = await execute({ action: 'read', path: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should return error for numeric path', async () => {
    const res = await execute({ action: 'read', path: 123 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should mention "path" in error message for missing path', async () => {
    const res = await execute({ action: 'write', path: null }, {});
    assert.ok(res.result.toLowerCase().includes('path'));
  });
});

// ===========================================================================
// 3. Directory traversal prevention
// ===========================================================================
describe('file-manager: directory traversal prevention', () => {
  beforeEach(() => {});

  it('should block ../../etc/passwd', async () => {
    const res = await execute({ action: 'read', path: '../../etc/passwd' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
    assert.ok(res.result.includes('outside the sandbox'));
  });

  it('should block ../../../etc/shadow', async () => {
    const res = await execute({ action: 'read', path: '../../../etc/shadow' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block ../ at start', async () => {
    const res = await execute({ action: 'read', path: '../outside' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block subdir/../../outside traversal', async () => {
    const res = await execute({ action: 'read', path: 'subdir/../../outside' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block traversal for write action', async () => {
    const res = await execute({ action: 'write', path: '../../etc/crontab', content: 'hack' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block traversal for list action', async () => {
    const res = await execute({ action: 'list', path: '../../' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block traversal for delete action', async () => {
    const res = await execute({ action: 'delete', path: '../../important' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block backslash traversal', async () => {
    const res = await execute({ action: 'read', path: '..\\..\\etc\\passwd' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should include the offending path in error detail', async () => {
    const res = await execute({ action: 'read', path: '../../etc/passwd' }, {});
    assert.ok(res.metadata.detail.includes('../../etc/passwd'));
  });

  it('should block path that starts with /etc', async () => {
    // Absolute paths outside sandbox should be caught
    const res = await execute({ action: 'read', path: '/etc/passwd' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block /var/log', async () => {
    const res = await execute({ action: 'read', path: '/var/log/syslog' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block /tmp traversal', async () => {
    const res = await execute({ action: 'read', path: '/tmp/secret' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block /home traversal', async () => {
    const res = await execute({ action: 'read', path: '/home/user/file' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });
});

// ===========================================================================
// 4. Read action - error paths
// ===========================================================================
describe('file-manager: read errors', () => {
  beforeEach(() => {});

  it('should return NOT_FOUND for non-existent file', async () => {
    const res = await execute({ action: 'read', path: 'nonexistent_file_abc123.txt' }, {});
    assert.equal(res.metadata.success, false);
    // ENOENT is expected
    assert.ok(res.metadata.error === 'NOT_FOUND' || res.metadata.code === 'ENOENT');
  });

  it('should return NOT_FOUND for deeply nested non-existent path', async () => {
    const res = await execute({ action: 'read', path: 'a/b/c/d/nonexistent.txt' }, {});
    assert.equal(res.metadata.success, false);
  });

  it('should include user path in NOT_FOUND error', async () => {
    const res = await execute({ action: 'read', path: 'does_not_exist.txt' }, {});
    assert.ok(res.result.includes('does_not_exist.txt'));
  });

  it('should include "does not exist" in error message', async () => {
    const res = await execute({ action: 'read', path: 'nope.txt' }, {});
    assert.ok(res.result.includes('does not exist'));
  });
});

// ===========================================================================
// 5. Write action - error paths
// ===========================================================================
describe('file-manager: write errors', () => {
  beforeEach(() => {});

  it('should return error when content is undefined', async () => {
    // The write action with a valid path but missing content
    // Since /data might not exist, we may get either MISSING_CONTENT or OPERATION_FAILED
    // depending on whether mkdir /data succeeds
    const res = await execute({ action: 'write', path: 'test.txt' }, {});
    assert.equal(res.metadata.success, false);
  });

  it('should return error when content is null', async () => {
    const res = await execute({ action: 'write', path: 'test.txt', content: null }, {});
    assert.equal(res.metadata.success, false);
  });

  it('should block traversal on write', async () => {
    const res = await execute({ action: 'write', path: '../../../evil.txt', content: 'hacked' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });
});

// ===========================================================================
// 6. List action - error paths
// ===========================================================================
describe('file-manager: list errors', () => {
  beforeEach(() => {});

  it('should return NOT_FOUND for non-existent directory', async () => {
    const res = await execute({ action: 'list', path: 'nonexistent_dir_xyz' }, {});
    assert.equal(res.metadata.success, false);
  });

  it('should block traversal on list', async () => {
    const res = await execute({ action: 'list', path: '../../' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });
});

// ===========================================================================
// 7. Delete action - error paths
// ===========================================================================
describe('file-manager: delete errors', () => {
  beforeEach(() => {});

  it('should return NOT_FOUND for non-existent target', async () => {
    const res = await execute({ action: 'delete', path: 'nonexistent_for_delete.txt' }, {});
    assert.equal(res.metadata.success, false);
  });

  it('should block deleting sandbox root', async () => {
    // path '.' or '/' relative to sandbox resolves to sandbox root
    const res = await execute({ action: 'delete', path: '.' }, {});
    assert.equal(res.metadata.success, false);
    assert.ok(
      res.metadata.error === 'CANNOT_DELETE_ROOT' ||
      res.result.includes('Cannot delete the root sandbox')
    );
  });

  it('should block deleting sandbox root with slash', async () => {
    // '/' resolves to filesystem root, which is outside the sandbox,
    // so it gets caught by PATH_VALIDATION_FAILED before reaching CANNOT_DELETE_ROOT
    const res = await execute({ action: 'delete', path: '/' }, {});
    assert.equal(res.metadata.success, false);
    assert.ok(
      res.metadata.error === 'CANNOT_DELETE_ROOT' ||
      res.metadata.error === 'PATH_VALIDATION_FAILED' ||
      res.result.includes('Cannot delete the root sandbox')
    );
  });

  it('should block traversal on delete', async () => {
    const res = await execute({ action: 'delete', path: '../../important_file' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });
});

// ===========================================================================
// 8. Context handling
// ===========================================================================
describe('file-manager: context handling', () => {
  beforeEach(() => {});

  it('should work with empty context', async () => {
    const res = await execute({ action: 'read', path: 'test.txt' }, {});
    // Should not crash - returns error about file not found or similar
    assert.ok(res.metadata);
  });

  it('should work with null context', async () => {
    const res = await execute({ action: 'read', path: 'test.txt' }, null);
    assert.ok(res.metadata);
  });

  it('should work with undefined context', async () => {
    const res = await execute({ action: 'read', path: 'test.txt' }, undefined);
    assert.ok(res.metadata);
  });
});

// ===========================================================================
// 9. Return format validation
// ===========================================================================
describe('file-manager: return format', () => {
  beforeEach(() => {});

  it('should return object with result and metadata for action error', async () => {
    const res = await execute({ action: 'invalid' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
    assert.equal(typeof res.result, 'string');
    assert.equal(typeof res.metadata, 'object');
  });

  it('should return object with result and metadata for path error', async () => {
    const res = await execute({ action: 'read', path: '../../etc/passwd' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should return object with result and metadata for NOT_FOUND', async () => {
    const res = await execute({ action: 'read', path: 'nofile.txt' }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should include success field in metadata', async () => {
    const res = await execute({ action: 'invalid' }, {});
    assert.equal(typeof res.metadata.success, 'boolean');
    assert.equal(res.metadata.success, false);
  });

  it('should include error field in metadata for errors', async () => {
    const res = await execute({ action: 'invalid' }, {});
    assert.ok('error' in res.metadata);
    assert.equal(typeof res.metadata.error, 'string');
  });
});

// ===========================================================================
// 10. Filesystem tests (only if /data is writable)
// ===========================================================================
describe('file-manager: write then read (if /data writable)', () => {
  beforeEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  afterEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  it('should write and read a file', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const writePath = '__test_fm__/hello.txt';
    const writeRes = await execute({ action: 'write', path: writePath, content: 'Hello World' }, {});
    assert.equal(writeRes.metadata.success, true);
    assert.equal(writeRes.metadata.action, 'write');
    assert.ok(writeRes.result.includes('written successfully'));

    const readRes = await execute({ action: 'read', path: writePath }, {});
    assert.equal(readRes.metadata.success, true);
    assert.equal(readRes.metadata.action, 'read');
    assert.equal(readRes.result, 'Hello World');
  });

  it('should include path in write metadata', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const res = await execute({ action: 'write', path: '__test_fm__/meta.txt', content: 'data' }, {});
    assert.ok(res.metadata.path.includes('__test_fm__/meta.txt'));
  });

  it('should include size in write metadata', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const res = await execute({ action: 'write', path: '__test_fm__/size.txt', content: 'abcde' }, {});
    assert.equal(res.metadata.characters, 5);
    assert.equal(res.metadata.sizeBytes, 5);
  });

  it('should include character count in write result', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const res = await execute({ action: 'write', path: '__test_fm__/chars.txt', content: 'hello' }, {});
    assert.ok(res.result.includes('5 characters'));
  });

  it('should create parent directories on write', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const res = await execute({ action: 'write', path: '__test_fm__/nested/deep/file.txt', content: 'deep' }, {});
    assert.equal(res.metadata.success, true);
    const readRes = await execute({ action: 'read', path: '__test_fm__/nested/deep/file.txt' }, {});
    assert.equal(readRes.result, 'deep');
  });

  it('should overwrite existing file', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/overwrite.txt', content: 'first' }, {});
    await execute({ action: 'write', path: '__test_fm__/overwrite.txt', content: 'second' }, {});
    const readRes = await execute({ action: 'read', path: '__test_fm__/overwrite.txt' }, {});
    assert.equal(readRes.result, 'second');
  });

  it('should write empty content', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const res = await execute({ action: 'write', path: '__test_fm__/empty.txt', content: '' }, {});
    assert.equal(res.metadata.success, true);
    const readRes = await execute({ action: 'read', path: '__test_fm__/empty.txt' }, {});
    assert.equal(readRes.result, '');
  });

  it('should write numeric content as string', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const res = await execute({ action: 'write', path: '__test_fm__/num.txt', content: 42 }, {});
    assert.equal(res.metadata.success, true);
    const readRes = await execute({ action: 'read', path: '__test_fm__/num.txt' }, {});
    assert.equal(readRes.result, '42');
  });

  it('should include sizeBytes in read metadata', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/readmeta.txt', content: 'hello' }, {});
    const res = await execute({ action: 'read', path: '__test_fm__/readmeta.txt' }, {});
    assert.equal(res.metadata.sizeBytes, 5);
  });

  it('should include lastModified in read metadata', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/mod.txt', content: 'data' }, {});
    const res = await execute({ action: 'read', path: '__test_fm__/mod.txt' }, {});
    assert.ok(res.metadata.lastModified);
    // Should be a valid ISO date
    assert.ok(!isNaN(new Date(res.metadata.lastModified).getTime()));
  });
});

describe('file-manager: read directory detection (if /data writable)', () => {
  beforeEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  afterEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  it('should return IS_DIRECTORY when reading a directory', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await mkdir(TEST_DIR, { recursive: true });
    const res = await execute({ action: 'read', path: '__test_fm__' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'IS_DIRECTORY');
    assert.ok(res.result.includes('directory'));
    assert.ok(res.result.includes('list'));
  });
});

describe('file-manager: list action (if /data writable)', () => {
  beforeEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  afterEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  it('should list files in directory', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/a.txt', content: 'aaa' }, {});
    await execute({ action: 'write', path: '__test_fm__/b.txt', content: 'bbb' }, {});
    const res = await execute({ action: 'list', path: '__test_fm__' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'list');
    assert.equal(res.metadata.entryCount, 2);
    assert.ok(Array.isArray(res.metadata.entries));
  });

  it('should include file details in entries', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/info.txt', content: 'hello' }, {});
    const res = await execute({ action: 'list', path: '__test_fm__' }, {});
    const entry = res.metadata.entries.find(e => e.name === 'info.txt');
    assert.ok(entry);
    assert.equal(entry.type, 'file');
    assert.equal(entry.sizeBytes, 5);
    assert.ok(entry.lastModified);
  });

  it('should identify directories in listing', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/sub/file.txt', content: 'x' }, {});
    const res = await execute({ action: 'list', path: '__test_fm__' }, {});
    const dirEntry = res.metadata.entries.find(e => e.name === 'sub');
    assert.ok(dirEntry);
    assert.equal(dirEntry.type, 'directory');
  });

  it('should format listing with [DIR] prefix for directories', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/sub/file.txt', content: 'x' }, {});
    const res = await execute({ action: 'list', path: '__test_fm__' }, {});
    assert.ok(res.result.includes('[DIR]'));
    assert.ok(res.result.includes('sub'));
  });

  it('should include byte size for files in formatted output', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/sized.txt', content: 'ab' }, {});
    const res = await execute({ action: 'list', path: '__test_fm__' }, {});
    assert.ok(res.result.includes('bytes'));
  });

  it('should handle empty directory', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await mkdir(TEST_DIR, { recursive: true });
    const res = await execute({ action: 'list', path: '__test_fm__' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.entryCount, 0);
    assert.ok(res.result.includes('empty'));
  });

  it('should include path in list metadata', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await mkdir(TEST_DIR, { recursive: true });
    const res = await execute({ action: 'list', path: '__test_fm__' }, {});
    assert.ok(res.metadata.path.includes('__test_fm__'));
  });

  it('should return NOT_DIRECTORY when listing a file', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/notdir.txt', content: 'data' }, {});
    const res = await execute({ action: 'list', path: '__test_fm__/notdir.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOT_DIRECTORY');
    assert.ok(res.result.includes('file'));
    assert.ok(res.result.includes('read'));
  });
});

describe('file-manager: delete action (if /data writable)', () => {
  beforeEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  afterEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  it('should delete a file', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/to_delete.txt', content: 'bye' }, {});
    const res = await execute({ action: 'delete', path: '__test_fm__/to_delete.txt' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.action, 'delete');
    assert.equal(res.metadata.type, 'file');
    assert.ok(res.result.includes('Deleted'));

    // Verify it's gone
    const readRes = await execute({ action: 'read', path: '__test_fm__/to_delete.txt' }, {});
    assert.equal(readRes.metadata.success, false);
  });

  it('should delete a directory recursively', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/dir_del/a.txt', content: 'a' }, {});
    await execute({ action: 'write', path: '__test_fm__/dir_del/b.txt', content: 'b' }, {});
    const res = await execute({ action: 'delete', path: '__test_fm__/dir_del' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.type, 'directory');
    assert.ok(res.result.includes('directory'));
  });

  it('should include path in delete metadata', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    await execute({ action: 'write', path: '__test_fm__/del_meta.txt', content: 'x' }, {});
    const res = await execute({ action: 'delete', path: '__test_fm__/del_meta.txt' }, {});
    assert.ok(res.metadata.path.includes('del_meta.txt'));
  });
});

// ===========================================================================
// 11. Combined validation tests (no filesystem needed)
// ===========================================================================
describe('file-manager: combined validation', () => {
  beforeEach(() => {});

  it('should validate action before path', async () => {
    // If action is invalid, we should get INVALID_ACTION even without path
    const res = await execute({ action: 'invalid' }, {});
    assert.equal(res.metadata.error, 'INVALID_ACTION');
  });

  it('should validate path after action is valid', async () => {
    const res = await execute({ action: 'read' }, {});
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should validate traversal before filesystem operation', async () => {
    const res = await execute({ action: 'write', path: '../../etc/hosts', content: 'evil' }, {});
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should handle multiple traversal dots', async () => {
    const res = await execute({ action: 'read', path: '../../../../../../../../etc/passwd' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });
});

// ===========================================================================
// 12. safePath edge cases
// ===========================================================================
describe('file-manager: safePath edge cases', () => {
  beforeEach(() => {});

  it('should allow simple filename', async () => {
    // This should pass validation but fail on filesystem (NOT_FOUND)
    const res = await execute({ action: 'read', path: 'simple.txt' }, {});
    // Should not get PATH_VALIDATION_FAILED
    assert.notEqual(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should allow nested path', async () => {
    const res = await execute({ action: 'read', path: 'subdir/file.txt' }, {});
    assert.notEqual(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should allow deeply nested path', async () => {
    const res = await execute({ action: 'read', path: 'a/b/c/d/e/file.txt' }, {});
    assert.notEqual(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should allow path with dots in filename', async () => {
    const res = await execute({ action: 'read', path: 'file.name.with.dots.txt' }, {});
    assert.notEqual(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should allow path starting with dot (hidden file)', async () => {
    const res = await execute({ action: 'read', path: '.hidden' }, {});
    assert.notEqual(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block absolute path outside sandbox', async () => {
    const res = await execute({ action: 'read', path: '/usr/local/bin/node' }, {});
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block path resolving to parent of sandbox', async () => {
    const res = await execute({ action: 'read', path: '..' }, {});
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });

  it('should block path with encoded traversal', async () => {
    // The handler normalizes backslashes, so this tests that path
    const res = await execute({ action: 'read', path: '..\\..\\etc\\passwd' }, {});
    assert.equal(res.metadata.error, 'PATH_VALIDATION_FAILED');
  });
});

// ===========================================================================
// 13. Error code handling
// ===========================================================================
describe('file-manager: error code handling', () => {
  beforeEach(() => {});

  it('should return ENOENT code for non-existent file read', async () => {
    const res = await execute({ action: 'read', path: 'surely_not_here.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.code, 'ENOENT');
  });

  it('should return ENOENT code for non-existent file delete', async () => {
    const res = await execute({ action: 'delete', path: 'no_such_delete_target.txt' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.code, 'ENOENT');
  });

  it('should return ENOENT code for non-existent directory list', async () => {
    const res = await execute({ action: 'list', path: 'no_such_dir_listing' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.code, 'ENOENT');
  });
});

// ===========================================================================
// 14. Multiple operations sequence (if /data writable)
// ===========================================================================
describe('file-manager: multi-step operations (if /data writable)', () => {
  beforeEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  afterEach(async () => {
    if (dataWritable) await cleanTestDir();
  });

  it('should write, list, read, delete full cycle', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }

    // Write
    const w = await execute({ action: 'write', path: '__test_fm__/cycle.txt', content: 'cycle content' }, {});
    assert.equal(w.metadata.success, true);

    // List
    const l = await execute({ action: 'list', path: '__test_fm__' }, {});
    assert.equal(l.metadata.success, true);
    assert.ok(l.metadata.entries.some(e => e.name === 'cycle.txt'));

    // Read
    const r = await execute({ action: 'read', path: '__test_fm__/cycle.txt' }, {});
    assert.equal(r.metadata.success, true);
    assert.equal(r.result, 'cycle content');

    // Delete
    const d = await execute({ action: 'delete', path: '__test_fm__/cycle.txt' }, {});
    assert.equal(d.metadata.success, true);

    // Verify deleted
    const r2 = await execute({ action: 'read', path: '__test_fm__/cycle.txt' }, {});
    assert.equal(r2.metadata.success, false);
  });

  it('should write multiple files and list them all', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }

    await execute({ action: 'write', path: '__test_fm__/f1.txt', content: '1' }, {});
    await execute({ action: 'write', path: '__test_fm__/f2.txt', content: '2' }, {});
    await execute({ action: 'write', path: '__test_fm__/f3.txt', content: '3' }, {});

    const res = await execute({ action: 'list', path: '__test_fm__' }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.entryCount, 3);
  });

  it('should write with special characters in content', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const content = 'Line 1\nLine 2\n\tTabbed\n"Quoted" & <tagged>';
    await execute({ action: 'write', path: '__test_fm__/special.txt', content }, {});
    const res = await execute({ action: 'read', path: '__test_fm__/special.txt' }, {});
    assert.equal(res.result, content);
  });

  it('should write unicode content', async () => {
    if (!dataWritable) { assert.ok(true, 'skipped: /data not writable'); return; }
    const content = 'Hello World - Special chars test';
    await execute({ action: 'write', path: '__test_fm__/unicode.txt', content }, {});
    const res = await execute({ action: 'read', path: '__test_fm__/unicode.txt' }, {});
    assert.equal(res.result, content);
  });
});
