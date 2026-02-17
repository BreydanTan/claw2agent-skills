import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

const context = {};

// Sample datasets
const sampleData = [
  { name: 'Alice', age: 30, city: 'NYC' },
  { name: 'Bob', age: 25, city: 'LA' },
  { name: 'Charlie', age: 35, city: 'NYC' },
  { name: 'Diana', age: 28, city: 'Chicago' },
];

const sampleJSON = JSON.stringify(sampleData);

// ===========================================================================
// Parameter validation
// ===========================================================================

describe('data-analyzer: parameter validation', () => {
  beforeEach(() => {});

  it('should throw when both data and operation are missing', async () => {
    await assert.rejects(() => execute({}, context), {
      message: "Parameters 'data' and 'operation' are required",
    });
  });

  it('should throw when data is missing', async () => {
    await assert.rejects(() => execute({ operation: 'count' }, context), {
      message: "Parameters 'data' and 'operation' are required",
    });
  });

  it('should throw when operation is missing', async () => {
    await assert.rejects(() => execute({ data: '[]' }, context), {
      message: "Parameters 'data' and 'operation' are required",
    });
  });

  it('should throw when data is null', async () => {
    await assert.rejects(
      () => execute({ data: null, operation: 'count' }, context),
      { message: "Parameters 'data' and 'operation' are required" }
    );
  });

  it('should throw when operation is null', async () => {
    await assert.rejects(
      () => execute({ data: '[]', operation: null }, context),
      { message: "Parameters 'data' and 'operation' are required" }
    );
  });

  it('should throw when data is empty string', async () => {
    await assert.rejects(
      () => execute({ data: '', operation: 'count' }, context),
      { message: "Parameters 'data' and 'operation' are required" }
    );
  });

  it('should throw when operation is empty string', async () => {
    await assert.rejects(
      () => execute({ data: '[]', operation: '' }, context),
      { message: "Parameters 'data' and 'operation' are required" }
    );
  });
});

// ===========================================================================
// Data parsing
// ===========================================================================

describe('data-analyzer: data parsing', () => {
  beforeEach(() => {});

  it('should accept data as a JSON string', async () => {
    const res = await execute({ data: '[{"a":1}]', operation: 'count' }, context);
    assert.equal(res.metadata.recordCount, 1);
  });

  it('should accept data as an array directly', async () => {
    const res = await execute({ data: [{ a: 1 }], operation: 'count' }, context);
    assert.equal(res.metadata.recordCount, 1);
  });

  it('should throw on invalid JSON string', async () => {
    await assert.rejects(
      () => execute({ data: '{not valid json', operation: 'count' }, context),
      /Failed to parse JSON data/
    );
  });

  it('should throw if parsed data is not an array (object)', async () => {
    await assert.rejects(
      () => execute({ data: '{"a":1}', operation: 'count' }, context),
      { message: 'Data must be a JSON array of objects' }
    );
  });

  it('should throw if parsed data is a string', async () => {
    await assert.rejects(
      () => execute({ data: '"hello"', operation: 'count' }, context),
      { message: 'Data must be a JSON array of objects' }
    );
  });

  it('should throw if data is a number (not array)', async () => {
    await assert.rejects(
      () => execute({ data: 42, operation: 'count' }, context),
      { message: 'Data must be a JSON array of objects' }
    );
  });

  it('should handle empty array', async () => {
    const res = await execute({ data: '[]', operation: 'count' }, context);
    assert.equal(res.metadata.recordCount, 0);
  });
});

// ===========================================================================
// Unknown operation
// ===========================================================================

describe('data-analyzer: unknown operation', () => {
  beforeEach(() => {});

  it('should throw on unknown operation', async () => {
    await assert.rejects(
      () => execute({ data: '[]', operation: 'transform' }, context),
      /Unknown operation: transform/
    );
  });

  it('should list supported operations in the error', async () => {
    await assert.rejects(
      () => execute({ data: '[]', operation: 'xxx' }, context),
      /summary, average, count, filter, sort, groupBy/
    );
  });

  it('should throw for case-mismatched operations', async () => {
    await assert.rejects(
      () => execute({ data: '[]', operation: 'Summary' }, context),
      /Unknown operation: Summary/
    );
  });

  it('should throw for partial operation name', async () => {
    await assert.rejects(
      () => execute({ data: '[]', operation: 'sum' }, context),
      /Unknown operation: sum/
    );
  });
});

// ===========================================================================
// Summary operation
// ===========================================================================

describe('data-analyzer: summary operation', () => {
  beforeEach(() => {});

  it('should return summary for empty dataset', async () => {
    const res = await execute({ data: '[]', operation: 'summary' }, context);
    assert.ok(res.result.includes('empty'));
    assert.equal(res.metadata.operation, 'summary');
    assert.equal(res.metadata.recordCount, 0);
  });

  it('should include total record count', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.ok(res.result.includes('Total records: 4'));
  });

  it('should include field names', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.ok(res.result.includes('name'));
    assert.ok(res.result.includes('age'));
    assert.ok(res.result.includes('city'));
  });

  it('should include field types', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.ok(res.result.includes('string'));
    assert.ok(res.result.includes('number'));
  });

  it('should include a sample record', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.ok(res.result.includes('Sample record'));
    assert.ok(res.result.includes('Alice'));
  });

  it('should set metadata operation to summary', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.equal(res.metadata.operation, 'summary');
  });

  it('should set metadata recordCount', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.equal(res.metadata.recordCount, 4);
  });

  it('should include field count', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.ok(res.result.includes('Fields (3)'));
  });

  it('should include Dataset Summary header', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.ok(res.result.includes('Dataset Summary'));
  });

  it('should handle records with different fields', async () => {
    const data = [{ a: 1 }, { b: 2 }, { a: 3, c: 4 }];
    const res = await execute({ data, operation: 'summary' }, context);
    assert.ok(res.result.includes('a'));
    assert.ok(res.result.includes('b'));
    assert.ok(res.result.includes('c'));
  });

  it('should handle single record dataset', async () => {
    const res = await execute({ data: [{ x: 1 }], operation: 'summary' }, context);
    assert.equal(res.metadata.recordCount, 1);
    assert.ok(res.result.includes('Total records: 1'));
  });
});

// ===========================================================================
// Average operation
// ===========================================================================

describe('data-analyzer: average operation', () => {
  beforeEach(() => {});

  it('should throw if field is not provided', async () => {
    await assert.rejects(
      () => execute({ data: sampleJSON, operation: 'average' }, context),
      { message: "The 'field' parameter is required for the average operation" }
    );
  });

  it('should compute average correctly', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    // (30 + 25 + 35 + 28) / 4 = 29.5
    assert.ok(res.result.includes('29.5000'));
  });

  it('should compute sum', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    assert.ok(res.result.includes('Sum: 118'));
  });

  it('should compute min', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    assert.ok(res.result.includes('Min: 25'));
  });

  it('should compute max', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    assert.ok(res.result.includes('Max: 35'));
  });

  it('should include numeric count', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    assert.ok(res.result.includes('Count (numeric): 4'));
  });

  it('should include total count', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    assert.ok(res.result.includes('Count (total): 4'));
  });

  it('should throw if no numeric values found', async () => {
    await assert.rejects(
      () => execute({ data: sampleJSON, operation: 'average', field: 'name' }, context),
      /No numeric values found in field 'name'/
    );
  });

  it('should skip non-numeric values', async () => {
    const data = [{ val: 10 }, { val: 'skip' }, { val: 20 }, { val: null }];
    const res = await execute({ data, operation: 'average', field: 'val' }, context);
    assert.ok(res.result.includes('15.0000'));
    assert.ok(res.result.includes('Count (numeric): 2'));
  });

  it('should handle string numbers', async () => {
    const data = [{ v: '10' }, { v: '20' }];
    const res = await execute({ data, operation: 'average', field: 'v' }, context);
    assert.ok(res.result.includes('15.0000'));
  });

  it('should set metadata correctly', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    assert.equal(res.metadata.operation, 'average');
    assert.equal(res.metadata.recordCount, 4);
  });

  it('should throw for field with all null values', async () => {
    const data = [{ v: null }, { v: null }];
    await assert.rejects(
      () => execute({ data, operation: 'average', field: 'v' }, context),
      /No numeric values found/
    );
  });

  it('should include field name in result header', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    assert.ok(res.result.includes("Average of 'age'"));
  });
});

// ===========================================================================
// Count operation
// ===========================================================================

describe('data-analyzer: count operation', () => {
  beforeEach(() => {});

  it('should return count of records', async () => {
    const res = await execute({ data: sampleJSON, operation: 'count' }, context);
    assert.equal(res.result, 'Total records: 4');
  });

  it('should set metadata recordCount', async () => {
    const res = await execute({ data: sampleJSON, operation: 'count' }, context);
    assert.equal(res.metadata.recordCount, 4);
  });

  it('should set metadata operation to count', async () => {
    const res = await execute({ data: sampleJSON, operation: 'count' }, context);
    assert.equal(res.metadata.operation, 'count');
  });

  it('should return 0 for empty array', async () => {
    const res = await execute({ data: [], operation: 'count' }, context);
    assert.equal(res.result, 'Total records: 0');
    assert.equal(res.metadata.recordCount, 0);
  });

  it('should return 1 for single-element array', async () => {
    const res = await execute({ data: [{ a: 1 }], operation: 'count' }, context);
    assert.equal(res.result, 'Total records: 1');
    assert.equal(res.metadata.recordCount, 1);
  });
});

// ===========================================================================
// Filter operation
// ===========================================================================

describe('data-analyzer: filter operation', () => {
  beforeEach(() => {});

  it('should throw if field is missing', async () => {
    await assert.rejects(
      () => execute({ data: sampleJSON, operation: 'filter', value: 'NYC' }, context),
      { message: "The 'field' parameter is required for the filter operation" }
    );
  });

  it('should throw if value is missing (undefined)', async () => {
    await assert.rejects(
      () => execute({ data: sampleJSON, operation: 'filter', field: 'city' }, context),
      { message: "The 'value' parameter is required for the filter operation" }
    );
  });

  it('should throw if value is null', async () => {
    await assert.rejects(
      () => execute(
        { data: sampleJSON, operation: 'filter', field: 'city', value: null },
        context
      ),
      { message: "The 'value' parameter is required for the filter operation" }
    );
  });

  it('should filter records by string equality', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'filter', field: 'city', value: 'NYC' },
      context
    );
    assert.ok(res.result.includes('Matched 2 of 4'));
  });

  it('should return matching records in output', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'filter', field: 'city', value: 'NYC' },
      context
    );
    assert.ok(res.result.includes('Alice'));
    assert.ok(res.result.includes('Charlie'));
  });

  it('should return 0 matches for non-existent value', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'filter', field: 'city', value: 'Boston' },
      context
    );
    assert.ok(res.result.includes('Matched 0 of 4'));
    assert.equal(res.metadata.recordCount, 0);
  });

  it('should set metadata recordCount to number of matched records', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'filter', field: 'city', value: 'NYC' },
      context
    );
    assert.equal(res.metadata.recordCount, 2);
  });

  it('should set metadata operation to filter', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'filter', field: 'city', value: 'NYC' },
      context
    );
    assert.equal(res.metadata.operation, 'filter');
  });

  it('should filter by numeric value using string comparison', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'filter', field: 'age', value: '30' },
      context
    );
    assert.equal(res.metadata.recordCount, 1);
    assert.ok(res.result.includes('Alice'));
  });

  it('should include filter header in result', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'filter', field: 'city', value: 'LA' },
      context
    );
    assert.ok(res.result.includes('Filter: city = LA'));
  });

  it('should truncate output to first 20 records', async () => {
    const data = [];
    for (let i = 0; i < 25; i++) {
      data.push({ status: 'active', id: i });
    }
    const res = await execute(
      { data, operation: 'filter', field: 'status', value: 'active' },
      context
    );
    assert.ok(res.result.includes('and 5 more records'));
  });

  it('should handle value of 0 as valid filter value', async () => {
    const data = [{ x: 0 }, { x: 1 }, { x: 0 }];
    const res = await execute(
      { data, operation: 'filter', field: 'x', value: 0 },
      context
    );
    assert.equal(res.metadata.recordCount, 2);
  });

  it('should handle empty string value', async () => {
    const data = [{ name: '' }, { name: 'Bob' }];
    const res = await execute(
      { data, operation: 'filter', field: 'name', value: '' },
      context
    );
    assert.equal(res.metadata.recordCount, 1);
  });
});

// ===========================================================================
// Sort operation
// ===========================================================================

describe('data-analyzer: sort operation', () => {
  beforeEach(() => {});

  it('should throw if field is missing', async () => {
    await assert.rejects(
      () => execute({ data: sampleJSON, operation: 'sort' }, context),
      { message: "The 'field' parameter is required for the sort operation" }
    );
  });

  it('should sort ascending by default', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'age' },
      context
    );
    const lines = res.result.split('\n').filter((l) => l.startsWith('['));
    const firstRecord = JSON.parse(lines[0].replace(/^\[\d+\]\s*/, ''));
    assert.equal(firstRecord.age, 25);
  });

  it('should sort descending when order is desc', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'age', order: 'desc' },
      context
    );
    const lines = res.result.split('\n').filter((l) => l.startsWith('['));
    const firstRecord = JSON.parse(lines[0].replace(/^\[\d+\]\s*/, ''));
    assert.equal(firstRecord.age, 35);
  });

  it('should sort strings alphabetically ascending', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'name' },
      context
    );
    const lines = res.result.split('\n').filter((l) => l.startsWith('['));
    const firstRecord = JSON.parse(lines[0].replace(/^\[\d+\]\s*/, ''));
    assert.equal(firstRecord.name, 'Alice');
  });

  it('should sort strings alphabetically descending', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'name', order: 'desc' },
      context
    );
    const lines = res.result.split('\n').filter((l) => l.startsWith('['));
    const firstRecord = JSON.parse(lines[0].replace(/^\[\d+\]\s*/, ''));
    assert.equal(firstRecord.name, 'Diana');
  });

  it('should set metadata recordCount', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'age' },
      context
    );
    assert.equal(res.metadata.recordCount, 4);
  });

  it('should set metadata operation to sort', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'age' },
      context
    );
    assert.equal(res.metadata.operation, 'sort');
  });

  it('should include sort header with field and order', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'age', order: 'desc' },
      context
    );
    assert.ok(res.result.includes("Sort by 'age' (desc)"));
  });

  it('should include default asc in header', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'age' },
      context
    );
    assert.ok(res.result.includes("Sort by 'age' (asc)"));
  });

  it('should handle null values (push to end)', async () => {
    const data = [{ v: null }, { v: 1 }, { v: 3 }, { v: 2 }];
    const res = await execute(
      { data, operation: 'sort', field: 'v' },
      context
    );
    const lines = res.result.split('\n').filter((l) => l.startsWith('['));
    const lastRecord = JSON.parse(lines[lines.length - 1].replace(/^\[\d+\]\s*/, ''));
    assert.equal(lastRecord.v, null);
  });

  it('should handle undefined values (push to end)', async () => {
    const data = [{ v: undefined }, { v: 1 }, { v: 3 }];
    const res = await execute(
      { data, operation: 'sort', field: 'v' },
      context
    );
    const lines = res.result.split('\n').filter((l) => l.startsWith('['));
    const firstRecord = JSON.parse(lines[0].replace(/^\[\d+\]\s*/, ''));
    assert.equal(firstRecord.v, 1);
  });

  it('should truncate output to first 20 records', async () => {
    const data = [];
    for (let i = 0; i < 25; i++) {
      data.push({ n: i });
    }
    const res = await execute(
      { data, operation: 'sort', field: 'n' },
      context
    );
    assert.ok(res.result.includes('and 5 more records'));
  });

  it('should not mutate the original data array', async () => {
    const data = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const copy = JSON.parse(JSON.stringify(data));
    await execute({ data, operation: 'sort', field: 'v' }, context);
    assert.deepEqual(data, copy);
  });

  it('should handle empty array', async () => {
    const res = await execute(
      { data: [], operation: 'sort', field: 'v' },
      context
    );
    assert.equal(res.metadata.recordCount, 0);
    assert.ok(res.result.includes('0 records sorted'));
  });
});

// ===========================================================================
// GroupBy operation
// ===========================================================================

describe('data-analyzer: groupBy operation', () => {
  beforeEach(() => {});

  it('should throw if field is missing', async () => {
    await assert.rejects(
      () => execute({ data: sampleJSON, operation: 'groupBy' }, context),
      { message: "The 'field' parameter is required for the groupBy operation" }
    );
  });

  it('should group records by field', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.ok(res.result.includes('NYC: 2 records'));
    assert.ok(res.result.includes('LA: 1 record'));
    assert.ok(res.result.includes('Chicago: 1 record'));
  });

  it('should report number of unique groups', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.ok(res.result.includes('3 unique groups'));
  });

  it('should report total records from groupBy', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.ok(res.result.includes('from 4 records'));
  });

  it('should set metadata operation to groupBy', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.equal(res.metadata.operation, 'groupBy');
  });

  it('should set metadata recordCount to total records', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.equal(res.metadata.recordCount, 4);
  });

  it('should sort groups by count descending', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    const groupLines = res.result
      .split('\n')
      .filter((l) => l.trim().match(/^\w+.*:\s\d+\srecord/));
    assert.ok(groupLines[0].includes('NYC'));
  });

  it('should handle null values as "(null)"', async () => {
    const data = [{ cat: 'A' }, { cat: null }, { cat: 'A' }];
    const res = await execute(
      { data, operation: 'groupBy', field: 'cat' },
      context
    );
    assert.ok(res.result.includes('(null)'));
  });

  it('should handle undefined field values as "(null)"', async () => {
    const data = [{ a: 1 }, { a: 1, b: 2 }];
    const res = await execute(
      { data, operation: 'groupBy', field: 'b' },
      context
    );
    assert.ok(res.result.includes('(null)'));
  });

  it('should use singular "record" for count of 1', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.ok(res.result.includes('LA: 1 record'));
    assert.ok(!res.result.includes('LA: 1 records'));
  });

  it('should use plural "records" for count > 1', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.ok(res.result.includes('NYC: 2 records'));
  });

  it('should include header', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.ok(res.result.includes("Group by 'city'"));
  });

  it('should handle empty array', async () => {
    const res = await execute(
      { data: [], operation: 'groupBy', field: 'x' },
      context
    );
    assert.equal(res.metadata.recordCount, 0);
    assert.ok(res.result.includes('0 unique groups'));
  });

  it('should handle all records with same value', async () => {
    const data = [{ x: 'A' }, { x: 'A' }, { x: 'A' }];
    const res = await execute(
      { data, operation: 'groupBy', field: 'x' },
      context
    );
    assert.ok(res.result.includes('1 unique groups'));
    assert.ok(res.result.includes('A: 3 records'));
  });
});

// ===========================================================================
// Return structure consistency
// ===========================================================================

describe('data-analyzer: return structure', () => {
  beforeEach(() => {});

  it('should have result and metadata for summary', async () => {
    const res = await execute({ data: sampleJSON, operation: 'summary' }, context);
    assert.ok('result' in res);
    assert.ok('metadata' in res);
    assert.equal(typeof res.result, 'string');
  });

  it('should have result and metadata for average', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'average', field: 'age' },
      context
    );
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should have result and metadata for count', async () => {
    const res = await execute({ data: sampleJSON, operation: 'count' }, context);
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should have result and metadata for filter', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'filter', field: 'city', value: 'NYC' },
      context
    );
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should have result and metadata for sort', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'sort', field: 'age' },
      context
    );
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should have result and metadata for groupBy', async () => {
    const res = await execute(
      { data: sampleJSON, operation: 'groupBy', field: 'city' },
      context
    );
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should always have operation in metadata', async () => {
    for (const op of ['summary', 'count']) {
      const res = await execute({ data: sampleJSON, operation: op }, context);
      assert.equal(res.metadata.operation, op);
    }
  });

  it('should always have recordCount in metadata', async () => {
    const res = await execute({ data: sampleJSON, operation: 'count' }, context);
    assert.equal(typeof res.metadata.recordCount, 'number');
  });
});

// ===========================================================================
// Async behavior
// ===========================================================================

describe('data-analyzer: async behavior', () => {
  beforeEach(() => {});

  it('should return a promise', () => {
    const result = execute({ data: '[]', operation: 'count' }, context);
    assert.ok(result instanceof Promise);
  });

  it('should resolve to an object', async () => {
    const res = await execute({ data: '[]', operation: 'count' }, context);
    assert.equal(typeof res, 'object');
  });
});
