import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Invalid / missing action
// ---------------------------------------------------------------------------

describe('Action validation', () => {
  it('returns error for missing action', async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'INVALID_ACTION');
  });

  it('returns error for invalid action', async () => {
    const res = await execute({ action: 'unknown' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'INVALID_ACTION');
    assert.ok(res.result.includes('Error'));
  });
});

// ---------------------------------------------------------------------------
// create action
// ---------------------------------------------------------------------------

describe('create action', () => {
  it('creates a document with title and sections', async () => {
    const res = await execute({
      action: 'create',
      title: 'My Document',
      sections: [
        { heading: 'Intro', content: 'Welcome to the doc.' },
        { heading: 'Details', content: 'Here are the details.' }
      ]
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.startsWith('# My Document'));
    assert.ok(res.result.includes('## Intro'));
    assert.ok(res.result.includes('Welcome to the doc.'));
    assert.ok(res.result.includes('## Details'));
    assert.equal(res.metadata.data.sectionCount, 2);
  });

  it('returns error when title is missing', async () => {
    const res = await execute({ action: 'create', sections: [] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_TITLE');
  });

  it('returns error when sections is missing', async () => {
    const res = await execute({ action: 'create', title: 'T' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_SECTIONS');
  });

  it('handles empty sections array', async () => {
    const res = await execute({
      action: 'create',
      title: 'Empty Doc',
      sections: []
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('# Empty Doc'));
    assert.equal(res.metadata.data.sectionCount, 0);
  });

  it('skips sections without heading or content', async () => {
    const res = await execute({
      action: 'create',
      title: 'Sparse',
      sections: [null, {}, { heading: 'Only Heading' }, { content: 'Only content' }]
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('## Only Heading'));
    assert.ok(res.result.includes('Only content'));
  });
});

// ---------------------------------------------------------------------------
// table action
// ---------------------------------------------------------------------------

describe('table action', () => {
  it('generates a markdown table', async () => {
    const res = await execute({
      action: 'table',
      headers: ['Name', 'Age'],
      rows: [['Alice', '30'], ['Bob', '25']]
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('| Name | Age |'));
    assert.ok(res.result.includes('| --- | --- |'));
    assert.ok(res.result.includes('| Alice | 30 |'));
    assert.equal(res.metadata.data.columnCount, 2);
    assert.equal(res.metadata.data.rowCount, 2);
  });

  it('returns error when headers missing', async () => {
    const res = await execute({ action: 'table', rows: [] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_HEADERS');
  });

  it('returns error when headers is empty', async () => {
    const res = await execute({ action: 'table', headers: [], rows: [] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_HEADERS');
  });

  it('returns error when rows missing', async () => {
    const res = await execute({ action: 'table', headers: ['A'] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_ROWS');
  });

  it('handles empty rows array', async () => {
    const res = await execute({
      action: 'table',
      headers: ['Col'],
      rows: []
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('| Col |'));
    assert.equal(res.metadata.data.rowCount, 0);
  });

  it('escapes pipe characters', async () => {
    const res = await execute({
      action: 'table',
      headers: ['A|B'],
      rows: [['x|y']]
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('A\\|B'));
    assert.ok(res.result.includes('x\\|y'));
  });

  it('handles rows with fewer cells than headers', async () => {
    const res = await execute({
      action: 'table',
      headers: ['A', 'B', 'C'],
      rows: [['only one']]
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('| only one |'));
  });
});

// ---------------------------------------------------------------------------
// list action
// ---------------------------------------------------------------------------

describe('list action', () => {
  it('generates an unordered list', async () => {
    const res = await execute({
      action: 'list',
      items: ['Alpha', 'Beta', 'Gamma']
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('- Alpha'));
    assert.ok(res.result.includes('- Beta'));
    assert.equal(res.metadata.data.ordered, false);
    assert.equal(res.metadata.data.itemCount, 3);
  });

  it('generates an ordered list', async () => {
    const res = await execute({
      action: 'list',
      items: ['First', 'Second'],
      ordered: true
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('1. First'));
    assert.ok(res.result.includes('2. Second'));
    assert.equal(res.metadata.data.ordered, true);
  });

  it('returns error when items is missing', async () => {
    const res = await execute({ action: 'list' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_ITEMS');
  });

  it('returns error for empty items array', async () => {
    const res = await execute({ action: 'list', items: [] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'EMPTY_ITEMS');
  });
});

// ---------------------------------------------------------------------------
// codeblock action
// ---------------------------------------------------------------------------

describe('codeblock action', () => {
  it('wraps code in a fenced block with language', async () => {
    const res = await execute({
      action: 'codeblock',
      code: 'console.log("hi");',
      language: 'javascript'
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.startsWith('```javascript\n'));
    assert.ok(res.result.includes('console.log("hi");'));
    assert.ok(res.result.endsWith('```\n'));
    assert.equal(res.metadata.data.language, 'javascript');
  });

  it('wraps code without language', async () => {
    const res = await execute({
      action: 'codeblock',
      code: 'hello'
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.startsWith('```\n'));
    assert.equal(res.metadata.data.language, null);
  });

  it('returns error when code is missing', async () => {
    const res = await execute({ action: 'codeblock' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_CODE');
  });

  it('handles empty string code', async () => {
    const res = await execute({ action: 'codeblock', code: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_CODE');
  });
});

// ---------------------------------------------------------------------------
// toc action
// ---------------------------------------------------------------------------

describe('toc action', () => {
  it('generates table of contents from headings', async () => {
    const content = '# Title\n## Section A\n### Subsection\n## Section B';
    const res = await execute({ action: 'toc', content }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('## Table of Contents'));
    assert.ok(res.result.includes('[Title](#title)'));
    assert.ok(res.result.includes('[Section A](#section-a)'));
    assert.ok(res.result.includes('[Subsection](#subsection)'));
    assert.ok(res.result.includes('[Section B](#section-b)'));
    assert.equal(res.metadata.data.headingCount, 4);
  });

  it('indents nested headings', async () => {
    const content = '## Top\n### Nested\n#### Deep';
    const res = await execute({ action: 'toc', content }, {});
    assert.equal(res.metadata.success, true);
    // Top is at level 2 (min), Nested at level 3 (indent 1), Deep at level 4 (indent 2)
    const lines = res.result.split('\n').filter(l => l.includes('['));
    assert.ok(lines[0].startsWith('- '));
    assert.ok(lines[1].startsWith('  - '));
    assert.ok(lines[2].startsWith('    - '));
  });

  it('returns error when content is missing', async () => {
    const res = await execute({ action: 'toc' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_CONTENT');
  });

  it('returns error when no headings are found', async () => {
    const res = await execute({ action: 'toc', content: 'Just a paragraph.' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'NO_HEADINGS');
  });
});

// ---------------------------------------------------------------------------
// format action
// ---------------------------------------------------------------------------

describe('format action', () => {
  it('normalizes heading spacing', async () => {
    const res = await execute({
      action: 'format',
      content: '#  Too many spaces\n##No space'
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('# Too many spaces'));
    assert.ok(res.result.includes('## No space'));
  });

  it('trims trailing whitespace', async () => {
    const res = await execute({
      action: 'format',
      content: 'Hello   \nWorld  '
    }, {});
    assert.equal(res.metadata.success, true);
    const lines = res.result.split('\n');
    assert.equal(lines[0], 'Hello');
    assert.equal(lines[1], 'World');
  });

  it('collapses excessive blank lines', async () => {
    const res = await execute({
      action: 'format',
      content: 'A\n\n\n\n\nB'
    }, {});
    assert.equal(res.metadata.success, true);
    // Should collapse to at most 2 consecutive newlines
    assert.ok(!res.result.includes('\n\n\n'));
  });

  it('ensures trailing newline', async () => {
    const res = await execute({
      action: 'format',
      content: 'No trailing newline'
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.endsWith('\n'));
    assert.ok(!res.result.endsWith('\n\n'));
  });

  it('returns error when content is missing', async () => {
    const res = await execute({ action: 'format' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error.code, 'MISSING_CONTENT');
  });
});

// ---------------------------------------------------------------------------
// Metadata validation
// ---------------------------------------------------------------------------

describe('metadata validation', () => {
  it('success responses include durationMs', async () => {
    const res = await execute({
      action: 'list',
      items: ['a']
    }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(typeof res.metadata.meta.durationMs === 'number');
    assert.ok(res.metadata.meta.durationMs >= 0);
  });

  it('error responses include retriable field', async () => {
    const res = await execute({ action: 'bad' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(typeof res.metadata.error.retriable, 'boolean');
  });
});
