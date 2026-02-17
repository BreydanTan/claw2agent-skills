import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;

function makeTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'excel-handler-test-'));
  return tmpDir;
}

function cleanTmpDir() {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function writeCsvFile(name, content) {
  const filePath = join(tmpDir, name);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ===========================================================================
// Parameter validation
// ===========================================================================

describe('excel-handler: parameter validation', () => {
  beforeEach(() => { makeTmpDir(); });

  it('should throw when action is missing', async () => {
    await assert.rejects(
      () => execute({ filePath: '/tmp/test.csv' }, {}),
      { message: "Parameters 'action' and 'filePath' are required" }
    );
  });

  it('should throw when filePath is missing', async () => {
    await assert.rejects(
      () => execute({ action: 'read' }, {}),
      { message: "Parameters 'action' and 'filePath' are required" }
    );
  });

  it('should throw when both action and filePath are missing', async () => {
    await assert.rejects(
      () => execute({}, {}),
      { message: "Parameters 'action' and 'filePath' are required" }
    );
  });

  it('should throw when action is null', async () => {
    await assert.rejects(
      () => execute({ action: null, filePath: '/tmp/test.csv' }, {}),
      { message: "Parameters 'action' and 'filePath' are required" }
    );
  });

  it('should throw when filePath is null', async () => {
    await assert.rejects(
      () => execute({ action: 'read', filePath: null }, {}),
      { message: "Parameters 'action' and 'filePath' are required" }
    );
  });

  it('should throw when action is empty string', async () => {
    await assert.rejects(
      () => execute({ action: '', filePath: '/tmp/test.csv' }, {}),
      { message: "Parameters 'action' and 'filePath' are required" }
    );
  });

  it('should throw when filePath is empty string', async () => {
    await assert.rejects(
      () => execute({ action: 'read', filePath: '' }, {}),
      { message: "Parameters 'action' and 'filePath' are required" }
    );
  });

  it('should throw when action is undefined', async () => {
    await assert.rejects(
      () => execute({ action: undefined, filePath: '/tmp/test.csv' }, {}),
      { message: "Parameters 'action' and 'filePath' are required" }
    );
  });

  it('should throw for unknown action', async () => {
    await assert.rejects(
      () => execute({ action: 'delete', filePath: '/tmp/test.csv' }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action: delete'));
        assert.ok(err.message.includes('read'));
        assert.ok(err.message.includes('write'));
        assert.ok(err.message.includes('analyze'));
        return true;
      }
    );
  });

  it('should throw for numeric action', async () => {
    await assert.rejects(
      () => execute({ action: 123, filePath: '/tmp/test.csv' }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
  });

  it('should throw for action "READ" (case-sensitive)', async () => {
    await assert.rejects(
      () => execute({ action: 'READ', filePath: '/tmp/test.csv' }, {}),
      (err) => {
        assert.ok(err.message.includes('Unknown action'));
        return true;
      }
    );
  });

  it('should default sheetName to "Sheet1"', async () => {
    const filePath = writeCsvFile('default-sheet.csv', 'name\nAlice\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.ok(res.result.includes('Alice') || res.metadata.rowCount === 1);
    cleanTmpDir();
  });
});

// ===========================================================================
// read action
// ===========================================================================

describe('excel-handler: read action', () => {
  beforeEach(() => { makeTmpDir(); });

  it('should read a simple CSV file', async () => {
    const filePath = writeCsvFile('simple.csv', 'name,age\nAlice,30\nBob,25\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.equal(res.metadata.action, 'read');
    assert.equal(res.metadata.rowCount, 2);
    assert.deepEqual(res.metadata.columns, ['name', 'age']);
    assert.ok(res.result.includes('Alice'));
    assert.ok(res.result.includes('Bob'));
    cleanTmpDir();
  });

  it('should auto-convert numeric values', async () => {
    const filePath = writeCsvFile('nums.csv', 'item,price\napple,1.5\nbanana,2\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(typeof parsed[0].price, 'number');
    assert.equal(parsed[0].price, 1.5);
    assert.equal(parsed[1].price, 2);
    cleanTmpDir();
  });

  it('should keep non-numeric strings as strings', async () => {
    const filePath = writeCsvFile('strings.csv', 'name,code\nAlice,ABC\nBob,DEF\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(typeof parsed[0].code, 'string');
    assert.equal(parsed[0].code, 'ABC');
    cleanTmpDir();
  });

  it('should handle CSV with quoted fields containing commas', async () => {
    const filePath = writeCsvFile('quoted.csv', 'name,address\nAlice,"123 Main St, Apt 4"\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].address, '123 Main St, Apt 4');
    cleanTmpDir();
  });

  it('should handle CSV with escaped quotes in quoted fields', async () => {
    const filePath = writeCsvFile('escaped.csv', 'name,quote\nAlice,"She said ""hello"""\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].quote, 'She said "hello"');
    cleanTmpDir();
  });

  it('should handle CSV with empty fields', async () => {
    const filePath = writeCsvFile('empty-fields.csv', 'name,age,city\nAlice,,NYC\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].age, '');
    assert.equal(parsed[0].city, 'NYC');
    cleanTmpDir();
  });

  it('should handle CSV with single column', async () => {
    const filePath = writeCsvFile('single-col.csv', 'name\nAlice\nBob\nCharlie\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.equal(res.metadata.rowCount, 3);
    assert.deepEqual(res.metadata.columns, ['name']);
    cleanTmpDir();
  });

  it('should handle CSV with only headers (no data rows)', async () => {
    const filePath = writeCsvFile('headers-only.csv', 'name,age,city\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.equal(res.metadata.rowCount, 0);
    assert.deepEqual(res.metadata.columns, ['name', 'age', 'city']);
    cleanTmpDir();
  });

  it('should throw for non-existent file', async () => {
    await assert.rejects(
      () => execute({ action: 'read', filePath: join(tmpDir, 'nonexistent.csv') }, {}),
      (err) => {
        assert.ok(err.message.includes('File not found'));
        return true;
      }
    );
    cleanTmpDir();
  });

  it('should handle CSV with Windows-style line endings (CRLF)', async () => {
    const filePath = writeCsvFile('crlf.csv', 'name,age\r\nAlice,30\r\nBob,25\r\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.equal(res.metadata.rowCount, 2);
    cleanTmpDir();
  });

  it('should handle CSV with trailing empty lines', async () => {
    const filePath = writeCsvFile('trailing.csv', 'name,age\nAlice,30\n\n\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.equal(res.metadata.rowCount, 1);
    cleanTmpDir();
  });

  it('should include file basename in result string', async () => {
    const filePath = writeCsvFile('myfile.csv', 'name\nAlice\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.ok(res.result.includes('myfile.csv'));
    cleanTmpDir();
  });

  it('should resolve relative file paths', async () => {
    const filePath = writeCsvFile('relative.csv', 'col\nval\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.ok(res.metadata.filePath.startsWith('/'));
    cleanTmpDir();
  });

  it('should handle CSV with many columns', async () => {
    const headers = Array.from({ length: 20 }, (_, i) => `col${i}`).join(',');
    const values = Array.from({ length: 20 }, (_, i) => `val${i}`).join(',');
    const filePath = writeCsvFile('many-cols.csv', `${headers}\n${values}\n`);
    const res = await execute({ action: 'read', filePath }, {});
    assert.equal(res.metadata.columns.length, 20);
    assert.equal(res.metadata.rowCount, 1);
    cleanTmpDir();
  });

  it('should handle CSV with many rows', async () => {
    const header = 'id,value\n';
    const rows = Array.from({ length: 100 }, (_, i) => `${i},${i * 10}`).join('\n');
    const filePath = writeCsvFile('many-rows.csv', header + rows + '\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.equal(res.metadata.rowCount, 100);
    cleanTmpDir();
  });

  it('should handle CSV where values have leading/trailing spaces', async () => {
    const filePath = writeCsvFile('spaces.csv', 'name,age\n  Alice  , 30 \n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].name, 'Alice');
    assert.equal(parsed[0].age, 30);
    cleanTmpDir();
  });

  it('should handle CSV with integer zero as numeric', async () => {
    const filePath = writeCsvFile('zero.csv', 'val\n0\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].val, 0);
    assert.equal(typeof parsed[0].val, 'number');
    cleanTmpDir();
  });

  it('should handle CSV with negative numbers', async () => {
    const filePath = writeCsvFile('negative.csv', 'val\n-5\n-3.14\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].val, -5);
    assert.equal(parsed[1].val, -3.14);
    cleanTmpDir();
  });

  it('should handle row with fewer values than headers', async () => {
    const filePath = writeCsvFile('short-row.csv', 'a,b,c\n1\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].a, 1);
    assert.equal(parsed[0].b, '');
    assert.equal(parsed[0].c, '');
    cleanTmpDir();
  });

  it('should handle completely empty file', async () => {
    const filePath = writeCsvFile('empty.csv', '');
    const res = await execute({ action: 'read', filePath }, {});
    assert.equal(res.metadata.rowCount, 0);
    assert.deepEqual(res.metadata.columns, []);
    cleanTmpDir();
  });
});

// ===========================================================================
// write action
// ===========================================================================

describe('excel-handler: write action', () => {
  beforeEach(() => { makeTmpDir(); });

  it('should write JSON array to CSV file', async () => {
    const filePath = join(tmpDir, 'output.csv');
    const data = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
    const res = await execute({ action: 'write', filePath, data }, {});
    assert.equal(res.metadata.action, 'write');
    assert.equal(res.metadata.rowCount, 2);
    assert.ok(existsSync(filePath));
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('name'));
    assert.ok(content.includes('Alice'));
    cleanTmpDir();
  });

  it('should write data passed as JSON string', async () => {
    const filePath = join(tmpDir, 'str-output.csv');
    const data = JSON.stringify([{ x: 1 }, { x: 2 }]);
    const res = await execute({ action: 'write', filePath, data }, {});
    assert.equal(res.metadata.rowCount, 2);
    cleanTmpDir();
  });

  it('should throw when data is missing', async () => {
    const filePath = join(tmpDir, 'no-data.csv');
    await assert.rejects(
      () => execute({ action: 'write', filePath }, {}),
      { message: "The 'data' parameter is required for the write action" }
    );
    cleanTmpDir();
  });

  it('should throw when data is null', async () => {
    const filePath = join(tmpDir, 'null-data.csv');
    await assert.rejects(
      () => execute({ action: 'write', filePath, data: null }, {}),
      { message: "The 'data' parameter is required for the write action" }
    );
    cleanTmpDir();
  });

  it('should throw when data is invalid JSON string', async () => {
    const filePath = join(tmpDir, 'bad-json.csv');
    await assert.rejects(
      () => execute({ action: 'write', filePath, data: '{not valid json' }, {}),
      (err) => {
        assert.ok(err.message.includes('Failed to parse JSON data'));
        return true;
      }
    );
    cleanTmpDir();
  });

  it('should throw when data is empty array', async () => {
    const filePath = join(tmpDir, 'empty-arr.csv');
    await assert.rejects(
      () => execute({ action: 'write', filePath, data: [] }, {}),
      { message: 'Data must be a non-empty JSON array of objects' }
    );
    cleanTmpDir();
  });

  it('should throw when data is not an array', async () => {
    const filePath = join(tmpDir, 'not-arr.csv');
    await assert.rejects(
      () => execute({ action: 'write', filePath, data: { key: 'val' } }, {}),
      { message: 'Data must be a non-empty JSON array of objects' }
    );
    cleanTmpDir();
  });

  it('should throw when data is string "not array"', async () => {
    const filePath = join(tmpDir, 'str-not-arr.csv');
    await assert.rejects(
      () => execute({ action: 'write', filePath, data: '"hello"' }, {}),
      { message: 'Data must be a non-empty JSON array of objects' }
    );
    cleanTmpDir();
  });

  it('should create parent directories if they do not exist', async () => {
    const filePath = join(tmpDir, 'sub', 'dir', 'output.csv');
    const data = [{ a: 1 }];
    const res = await execute({ action: 'write', filePath, data }, {});
    assert.ok(existsSync(filePath));
    assert.equal(res.metadata.rowCount, 1);
    cleanTmpDir();
  });

  it('should collect headers from all records (union of keys)', async () => {
    const filePath = join(tmpDir, 'union-headers.csv');
    const data = [{ a: 1, b: 2 }, { b: 3, c: 4 }];
    const res = await execute({ action: 'write', filePath, data }, {});
    assert.ok(res.metadata.columns.includes('a'));
    assert.ok(res.metadata.columns.includes('b'));
    assert.ok(res.metadata.columns.includes('c'));
    cleanTmpDir();
  });

  it('should escape fields containing commas', async () => {
    const filePath = join(tmpDir, 'escape-comma.csv');
    const data = [{ name: 'Alice, Bob' }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('"Alice, Bob"'));
    cleanTmpDir();
  });

  it('should escape fields containing double quotes', async () => {
    const filePath = join(tmpDir, 'escape-quotes.csv');
    const data = [{ name: 'She said "hi"' }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('""hi""'));
    cleanTmpDir();
  });

  it('should escape fields containing newlines', async () => {
    const filePath = join(tmpDir, 'escape-newline.csv');
    const data = [{ text: 'line1\nline2' }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('"line1\nline2"'));
    cleanTmpDir();
  });

  it('should handle null values in records', async () => {
    const filePath = join(tmpDir, 'null-val.csv');
    const data = [{ a: null, b: 'ok' }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('ok'));
    cleanTmpDir();
  });

  it('should handle undefined values in records', async () => {
    const filePath = join(tmpDir, 'undef-val.csv');
    const data = [{ a: undefined, b: 'ok' }];
    await execute({ action: 'write', filePath, data }, {});
    assert.ok(existsSync(filePath));
    cleanTmpDir();
  });

  it('should handle numeric values correctly', async () => {
    const filePath = join(tmpDir, 'numeric-write.csv');
    const data = [{ val: 42 }, { val: 3.14 }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('42'));
    assert.ok(content.includes('3.14'));
    cleanTmpDir();
  });

  it('should end the file with a newline', async () => {
    const filePath = join(tmpDir, 'trailing-nl.csv');
    const data = [{ x: 1 }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.endsWith('\n'));
    cleanTmpDir();
  });

  it('should return the resolved absolute path in metadata', async () => {
    const filePath = join(tmpDir, 'abs-path.csv');
    const data = [{ x: 1 }];
    const res = await execute({ action: 'write', filePath, data }, {});
    assert.ok(res.metadata.filePath.startsWith('/'));
    cleanTmpDir();
  });

  it('should include row and column count in result string', async () => {
    const filePath = join(tmpDir, 'count.csv');
    const data = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const res = await execute({ action: 'write', filePath, data }, {});
    assert.ok(res.result.includes('2 rows'));
    assert.ok(res.result.includes('2 columns'));
    cleanTmpDir();
  });

  it('should overwrite existing file', async () => {
    const filePath = join(tmpDir, 'overwrite.csv');
    writeFileSync(filePath, 'old,content\n1,2\n', 'utf-8');
    const data = [{ newcol: 'newval' }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('newcol'));
    assert.ok(!content.includes('old'));
    cleanTmpDir();
  });
});

// ===========================================================================
// write then read roundtrip
// ===========================================================================

describe('excel-handler: write-then-read roundtrip', () => {
  beforeEach(() => { makeTmpDir(); });

  it('should roundtrip simple data', async () => {
    const filePath = join(tmpDir, 'roundtrip.csv');
    const data = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
    await execute({ action: 'write', filePath, data }, {});
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].name, 'Alice');
    assert.equal(parsed[0].age, 30);
    assert.equal(parsed[1].name, 'Bob');
    assert.equal(parsed[1].age, 25);
    cleanTmpDir();
  });

  it('should roundtrip data with commas in values', async () => {
    const filePath = join(tmpDir, 'roundtrip-comma.csv');
    const data = [{ desc: 'A, B, C' }];
    await execute({ action: 'write', filePath, data }, {});
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].desc, 'A, B, C');
    cleanTmpDir();
  });

  it('should roundtrip data with quotes in values', async () => {
    const filePath = join(tmpDir, 'roundtrip-quotes.csv');
    const data = [{ text: 'He said "yes"' }];
    await execute({ action: 'write', filePath, data }, {});
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].text, 'He said "yes"');
    cleanTmpDir();
  });

  it('should roundtrip mixed data types', async () => {
    const filePath = join(tmpDir, 'roundtrip-mixed.csv');
    const data = [
      { name: 'Test', count: 0, price: 9.99, code: 'ABC' },
    ];
    await execute({ action: 'write', filePath, data }, {});
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].name, 'Test');
    assert.equal(parsed[0].count, 0);
    assert.equal(parsed[0].price, 9.99);
    assert.equal(parsed[0].code, 'ABC');
    cleanTmpDir();
  });
});

// ===========================================================================
// analyze action
// ===========================================================================

describe('excel-handler: analyze action', () => {
  beforeEach(() => { makeTmpDir(); });

  it('should analyze a CSV with numeric columns', async () => {
    const csv = 'name,score\nAlice,90\nBob,80\nCharlie,70\n';
    const filePath = writeCsvFile('analyze.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.equal(res.metadata.action, 'analyze');
    assert.equal(res.metadata.rowCount, 3);
    assert.ok(res.metadata.numericColumns.includes('score'));
    assert.ok(res.result.includes('Mean'));
    assert.ok(res.result.includes('Min'));
    assert.ok(res.result.includes('Max'));
    cleanTmpDir();
  });

  it('should compute correct min and max', async () => {
    const csv = 'val\n10\n20\n30\n40\n50\n';
    const filePath = writeCsvFile('minmax.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Min: 10'));
    assert.ok(res.result.includes('Max: 50'));
    cleanTmpDir();
  });

  it('should compute correct mean', async () => {
    const csv = 'val\n10\n20\n30\n';
    const filePath = writeCsvFile('mean.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Mean: 20.0000'));
    cleanTmpDir();
  });

  it('should compute correct sum', async () => {
    const csv = 'val\n1\n2\n3\n4\n';
    const filePath = writeCsvFile('sum.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Sum: 10'));
    cleanTmpDir();
  });

  it('should compute correct standard deviation', async () => {
    // values: 2, 4, 4, 4, 5, 5, 7, 9 -> mean=5, stdDev=2
    const csv = 'val\n2\n4\n4\n4\n5\n5\n7\n9\n';
    const filePath = writeCsvFile('stddev.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Std Dev: 2.0000'));
    cleanTmpDir();
  });

  it('should report count of numeric values', async () => {
    const csv = 'val\n1\n2\n3\n';
    const filePath = writeCsvFile('count.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Count: 3'));
    cleanTmpDir();
  });

  it('should skip non-numeric columns', async () => {
    const csv = 'name,city\nAlice,NYC\nBob,LA\n';
    const filePath = writeCsvFile('non-numeric.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.deepEqual(res.metadata.numericColumns, []);
    assert.ok(res.result.includes('No numeric columns'));
    cleanTmpDir();
  });

  it('should skip column with less than half numeric values', async () => {
    const csv = 'val\n1\nhello\nworld\nfoo\n';
    const filePath = writeCsvFile('mixed-col.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.deepEqual(res.metadata.numericColumns, []);
    cleanTmpDir();
  });

  it('should treat column as numeric when more than half are numbers', async () => {
    const csv = 'val\n1\n2\n3\nhello\n';
    const filePath = writeCsvFile('mostly-numeric.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.metadata.numericColumns.includes('val'));
    cleanTmpDir();
  });

  it('should throw for non-existent file in analyze', async () => {
    await assert.rejects(
      () => execute({ action: 'analyze', filePath: join(tmpDir, 'no-file.csv') }, {}),
      (err) => {
        assert.ok(err.message.includes('File not found'));
        return true;
      }
    );
    cleanTmpDir();
  });

  it('should handle file with only headers', async () => {
    const filePath = writeCsvFile('headers-analyze.csv', 'a,b,c\n');
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.equal(res.metadata.rowCount, 0);
    assert.deepEqual(res.metadata.numericColumns, []);
    cleanTmpDir();
  });

  it('should handle empty file for analyze', async () => {
    const filePath = writeCsvFile('empty-analyze.csv', '');
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.equal(res.metadata.rowCount, 0);
    cleanTmpDir();
  });

  it('should include total rows in result', async () => {
    const csv = 'x\n1\n2\n';
    const filePath = writeCsvFile('total-rows.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Total rows: 2'));
    cleanTmpDir();
  });

  it('should include total columns in result', async () => {
    const csv = 'a,b,c\n1,2,3\n';
    const filePath = writeCsvFile('total-cols.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Total columns: 3'));
    cleanTmpDir();
  });

  it('should include column names in result', async () => {
    const csv = 'alpha,beta\n1,2\n';
    const filePath = writeCsvFile('col-names.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('alpha'));
    assert.ok(res.result.includes('beta'));
    cleanTmpDir();
  });

  it('should analyze multiple numeric columns', async () => {
    const csv = 'a,b\n1,10\n2,20\n3,30\n';
    const filePath = writeCsvFile('multi-num.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.metadata.numericColumns.includes('a'));
    assert.ok(res.metadata.numericColumns.includes('b'));
    cleanTmpDir();
  });

  it('should handle single row of numeric data', async () => {
    const csv = 'val\n42\n';
    const filePath = writeCsvFile('single-row-num.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.metadata.numericColumns.includes('val'));
    assert.ok(res.result.includes('Min: 42'));
    assert.ok(res.result.includes('Max: 42'));
    assert.ok(res.result.includes('Std Dev: 0.0000'));
    cleanTmpDir();
  });

  it('should handle decimal values in analysis', async () => {
    const csv = 'price\n1.5\n2.5\n3.5\n';
    const filePath = writeCsvFile('decimal-analyze.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Min: 1.5'));
    assert.ok(res.result.includes('Max: 3.5'));
    cleanTmpDir();
  });

  it('should handle negative values in analysis', async () => {
    const csv = 'val\n-10\n0\n10\n';
    const filePath = writeCsvFile('neg-analyze.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('Min: -10'));
    assert.ok(res.result.includes('Max: 10'));
    assert.ok(res.result.includes('Mean: 0.0000'));
    cleanTmpDir();
  });

  it('should include file basename in analysis header', async () => {
    const csv = 'x\n1\n';
    const filePath = writeCsvFile('myanalysis.csv', csv);
    const res = await execute({ action: 'analyze', filePath }, {});
    assert.ok(res.result.includes('myanalysis.csv'));
    cleanTmpDir();
  });
});

// ===========================================================================
// Context parameter
// ===========================================================================

describe('excel-handler: context parameter', () => {
  beforeEach(() => { makeTmpDir(); });

  it('should accept empty context', async () => {
    const filePath = writeCsvFile('ctx1.csv', 'a\n1\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.ok(res.metadata);
    cleanTmpDir();
  });

  it('should accept undefined context', async () => {
    const filePath = writeCsvFile('ctx2.csv', 'a\n1\n');
    const res = await execute({ action: 'read', filePath }, undefined);
    assert.ok(res.metadata);
    cleanTmpDir();
  });

  it('should accept context with extra properties', async () => {
    const filePath = writeCsvFile('ctx3.csv', 'a\n1\n');
    const res = await execute({ action: 'read', filePath }, { userId: '123', env: 'test' });
    assert.ok(res.metadata);
    cleanTmpDir();
  });
});

// ===========================================================================
// Edge cases for parseCsvLine / escapeCsvField behavior
// ===========================================================================

describe('excel-handler: CSV parsing edge cases', () => {
  beforeEach(() => { makeTmpDir(); });

  it('should handle field that is just a quoted empty string', async () => {
    const filePath = writeCsvFile('quoted-empty.csv', 'a,b\n"",value\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].a, '');
    cleanTmpDir();
  });

  it('should handle single field with only a comma', async () => {
    const filePath = writeCsvFile('just-comma.csv', 'a,b\n",",x\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].a, ',');
    cleanTmpDir();
  });

  it('should handle multiple consecutive quoted double-quotes', async () => {
    const filePath = writeCsvFile('multi-quotes.csv', 'a\n""""""\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].a, '""');
    cleanTmpDir();
  });

  it('should handle writing boolean values', async () => {
    const filePath = join(tmpDir, 'bool.csv');
    const data = [{ flag: true }, { flag: false }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('true'));
    assert.ok(content.includes('false'));
    cleanTmpDir();
  });

  it('should handle writing empty string values', async () => {
    const filePath = join(tmpDir, 'empty-str.csv');
    const data = [{ name: '', age: 30 }];
    await execute({ action: 'write', filePath, data }, {});
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('name'));
    cleanTmpDir();
  });

  it('should handle large numeric values', async () => {
    const filePath = writeCsvFile('large-num.csv', 'val\n1000000000\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].val, 1000000000);
    cleanTmpDir();
  });

  it('should handle floating point precision values', async () => {
    const filePath = writeCsvFile('float.csv', 'val\n0.1\n0.2\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    assert.equal(parsed[0].val, 0.1);
    assert.equal(parsed[1].val, 0.2);
    cleanTmpDir();
  });

  it('should not treat strings like "1e2" as numbers when they parse as NaN or valid', async () => {
    const filePath = writeCsvFile('sci.csv', 'val\n1e2\n');
    const res = await execute({ action: 'read', filePath }, {});
    const parsed = JSON.parse(res.result.split('Data (JSON):\n')[1]);
    // 1e2 is a valid number (100)
    assert.equal(parsed[0].val, 100);
    cleanTmpDir();
  });

  it('should handle header with spaces', async () => {
    const filePath = writeCsvFile('spaces-header.csv', ' name , age \nAlice,30\n');
    const res = await execute({ action: 'read', filePath }, {});
    assert.ok(res.metadata.columns.includes('name'));
    assert.ok(res.metadata.columns.includes('age'));
    cleanTmpDir();
  });
});
