const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const results = { passed: 0, failed: 0, errors: [] };

async function test(name, fn) {
  try {
    await fn();
    results.passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.failed++;
    results.errors.push({ name, message: err.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function summary() {
  console.log('');
  console.log(`Results: ${results.passed} passed, ${results.failed} failed, ${results.passed + results.failed} total`);
  if (results.failed > 0) {
    console.log('');
    console.log('Failures:');
    for (const err of results.errors) {
      console.log(`  - ${err.name}: ${err.message}`);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Dynamic import of the ES module handler
  const handlerPath = path.resolve(__dirname, '..', 'handler.js');
  const handlerUrl = pathToFileURL(handlerPath).href;
  const { execute } = await import(handlerUrl);

  console.log('Markdown Writer Skill - Handler Tests');
  console.log('=====================================');
  console.log('');

  // -----------------------------------------------------------------------
  // Invalid / missing action
  // -----------------------------------------------------------------------

  console.log('Action validation');

  await test('returns error for missing action', async () => {
    const res = await execute({}, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'INVALID_ACTION');
  });

  await test('returns error for invalid action', async () => {
    const res = await execute({ action: 'unknown' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'INVALID_ACTION');
    assert.ok(res.result.includes('Error'));
  });

  // -----------------------------------------------------------------------
  // create action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('create action');

  await test('creates a document with title and sections', async () => {
    const res = await execute({
      action: 'create',
      title: 'My Document',
      sections: [
        { heading: 'Intro', content: 'Welcome to the doc.' },
        { heading: 'Details', content: 'Here are the details.' }
      ]
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.startsWith('# My Document'));
    assert.ok(res.result.includes('## Intro'));
    assert.ok(res.result.includes('Welcome to the doc.'));
    assert.ok(res.result.includes('## Details'));
    assert.strictEqual(res.metadata.data.sectionCount, 2);
  });

  await test('create: returns error when title is missing', async () => {
    const res = await execute({ action: 'create', sections: [] }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_TITLE');
  });

  await test('create: returns error when sections is missing', async () => {
    const res = await execute({ action: 'create', title: 'T' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_SECTIONS');
  });

  await test('create: handles empty sections array', async () => {
    const res = await execute({
      action: 'create',
      title: 'Empty Doc',
      sections: []
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('# Empty Doc'));
    assert.strictEqual(res.metadata.data.sectionCount, 0);
  });

  await test('create: skips sections without heading or content', async () => {
    const res = await execute({
      action: 'create',
      title: 'Sparse',
      sections: [null, {}, { heading: 'Only Heading' }, { content: 'Only content' }]
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('## Only Heading'));
    assert.ok(res.result.includes('Only content'));
  });

  // -----------------------------------------------------------------------
  // table action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('table action');

  await test('generates a markdown table', async () => {
    const res = await execute({
      action: 'table',
      headers: ['Name', 'Age'],
      rows: [['Alice', '30'], ['Bob', '25']]
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('| Name | Age |'));
    assert.ok(res.result.includes('| --- | --- |'));
    assert.ok(res.result.includes('| Alice | 30 |'));
    assert.strictEqual(res.metadata.data.columnCount, 2);
    assert.strictEqual(res.metadata.data.rowCount, 2);
  });

  await test('table: returns error when headers missing', async () => {
    const res = await execute({ action: 'table', rows: [] }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_HEADERS');
  });

  await test('table: returns error when headers is empty', async () => {
    const res = await execute({ action: 'table', headers: [], rows: [] }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_HEADERS');
  });

  await test('table: returns error when rows missing', async () => {
    const res = await execute({ action: 'table', headers: ['A'] }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_ROWS');
  });

  await test('table: handles empty rows array', async () => {
    const res = await execute({
      action: 'table',
      headers: ['Col'],
      rows: []
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('| Col |'));
    assert.strictEqual(res.metadata.data.rowCount, 0);
  });

  await test('table: escapes pipe characters', async () => {
    const res = await execute({
      action: 'table',
      headers: ['A|B'],
      rows: [['x|y']]
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('A\\|B'));
    assert.ok(res.result.includes('x\\|y'));
  });

  await test('table: handles rows with fewer cells than headers', async () => {
    const res = await execute({
      action: 'table',
      headers: ['A', 'B', 'C'],
      rows: [['only one']]
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('| only one |'));
  });

  // -----------------------------------------------------------------------
  // list action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('list action');

  await test('generates an unordered list', async () => {
    const res = await execute({
      action: 'list',
      items: ['Alpha', 'Beta', 'Gamma']
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('- Alpha'));
    assert.ok(res.result.includes('- Beta'));
    assert.strictEqual(res.metadata.data.ordered, false);
    assert.strictEqual(res.metadata.data.itemCount, 3);
  });

  await test('generates an ordered list', async () => {
    const res = await execute({
      action: 'list',
      items: ['First', 'Second'],
      ordered: true
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('1. First'));
    assert.ok(res.result.includes('2. Second'));
    assert.strictEqual(res.metadata.data.ordered, true);
  });

  await test('list: returns error when items is missing', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_ITEMS');
  });

  await test('list: returns error for empty items array', async () => {
    const res = await execute({ action: 'list', items: [] }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'EMPTY_ITEMS');
  });

  // -----------------------------------------------------------------------
  // codeblock action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('codeblock action');

  await test('wraps code in a fenced block with language', async () => {
    const res = await execute({
      action: 'codeblock',
      code: 'console.log("hi");',
      language: 'javascript'
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.startsWith('```javascript\n'));
    assert.ok(res.result.includes('console.log("hi");'));
    assert.ok(res.result.endsWith('```\n'));
    assert.strictEqual(res.metadata.data.language, 'javascript');
  });

  await test('wraps code without language', async () => {
    const res = await execute({
      action: 'codeblock',
      code: 'hello'
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.startsWith('```\n'));
    assert.strictEqual(res.metadata.data.language, null);
  });

  await test('codeblock: returns error when code is missing', async () => {
    const res = await execute({ action: 'codeblock' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_CODE');
  });

  await test('codeblock: handles empty string code', async () => {
    const res = await execute({ action: 'codeblock', code: '' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_CODE');
  });

  // -----------------------------------------------------------------------
  // toc action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('toc action');

  await test('generates table of contents from headings', async () => {
    const content = '# Title\n## Section A\n### Subsection\n## Section B';
    const res = await execute({ action: 'toc', content }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('## Table of Contents'));
    assert.ok(res.result.includes('[Title](#title)'));
    assert.ok(res.result.includes('[Section A](#section-a)'));
    assert.ok(res.result.includes('[Subsection](#subsection)'));
    assert.ok(res.result.includes('[Section B](#section-b)'));
    assert.strictEqual(res.metadata.data.headingCount, 4);
  });

  await test('toc: indents nested headings', async () => {
    const content = '## Top\n### Nested\n#### Deep';
    const res = await execute({ action: 'toc', content }, {});
    assert.strictEqual(res.metadata.success, true);
    // Top is at level 2 (min), Nested at level 3 (indent 1), Deep at level 4 (indent 2)
    const lines = res.result.split('\n').filter(l => l.includes('['));
    assert.ok(lines[0].startsWith('- '));
    assert.ok(lines[1].startsWith('  - '));
    assert.ok(lines[2].startsWith('    - '));
  });

  await test('toc: returns error when content is missing', async () => {
    const res = await execute({ action: 'toc' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_CONTENT');
  });

  await test('toc: returns error when no headings are found', async () => {
    const res = await execute({ action: 'toc', content: 'Just a paragraph.' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'NO_HEADINGS');
  });

  // -----------------------------------------------------------------------
  // format action
  // -----------------------------------------------------------------------

  console.log('');
  console.log('format action');

  await test('normalizes heading spacing', async () => {
    const res = await execute({
      action: 'format',
      content: '#  Too many spaces\n##No space'
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.includes('# Too many spaces'));
    assert.ok(res.result.includes('## No space'));
  });

  await test('trims trailing whitespace', async () => {
    const res = await execute({
      action: 'format',
      content: 'Hello   \nWorld  '
    }, {});
    assert.strictEqual(res.metadata.success, true);
    const lines = res.result.split('\n');
    assert.strictEqual(lines[0], 'Hello');
    assert.strictEqual(lines[1], 'World');
  });

  await test('collapses excessive blank lines', async () => {
    const res = await execute({
      action: 'format',
      content: 'A\n\n\n\n\nB'
    }, {});
    assert.strictEqual(res.metadata.success, true);
    // Should collapse to at most 2 consecutive newlines
    assert.ok(!res.result.includes('\n\n\n'));
  });

  await test('ensures trailing newline', async () => {
    const res = await execute({
      action: 'format',
      content: 'No trailing newline'
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(res.result.endsWith('\n'));
    assert.ok(!res.result.endsWith('\n\n'));
  });

  await test('format: returns error when content is missing', async () => {
    const res = await execute({ action: 'format' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(res.metadata.error.code, 'MISSING_CONTENT');
  });

  // -----------------------------------------------------------------------
  // Metadata validation
  // -----------------------------------------------------------------------

  console.log('');
  console.log('metadata validation');

  await test('success responses include durationMs', async () => {
    const res = await execute({
      action: 'list',
      items: ['a']
    }, {});
    assert.strictEqual(res.metadata.success, true);
    assert.ok(typeof res.metadata.meta.durationMs === 'number');
    assert.ok(res.metadata.meta.durationMs >= 0);
  });

  await test('error responses include retriable field', async () => {
    const res = await execute({ action: 'bad' }, {});
    assert.strictEqual(res.metadata.success, false);
    assert.strictEqual(typeof res.metadata.error.retriable, 'boolean');
  });

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------

  summary();
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
