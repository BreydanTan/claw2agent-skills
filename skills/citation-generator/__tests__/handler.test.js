import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  validate,
  meta,
  _clearStore,
  _storeSize,
  VALID_ACTIONS,
  VALID_TYPES,
  VALID_STYLES,
  validateNonEmptyString,
  validateCitationType,
  validateStyle,
  formatCitation,
  formatCitationApa,
  formatCitationMla,
  formatCitationChicago,
  formatCitationBibtex,
} from '../handler.js';

// ---------------------------------------------------------------------------
// 1. meta
// ---------------------------------------------------------------------------
describe('citation-generator: meta', () => {
  beforeEach(() => { _clearStore(); });

  it('should have correct name', () => { assert.equal(meta.name, 'citation-generator'); });
  it('should have version', () => { assert.equal(meta.version, '1.0.0'); });
  it('should have description', () => { assert.ok(meta.description.includes('citation')); });
  it('should list all 6 actions', () => {
    assert.equal(meta.actions.length, 6);
    assert.ok(meta.actions.includes('create_citation'));
    assert.ok(meta.actions.includes('format_citation'));
    assert.ok(meta.actions.includes('list_citations'));
    assert.ok(meta.actions.includes('get_citation'));
    assert.ok(meta.actions.includes('delete_citation'));
    assert.ok(meta.actions.includes('export_bibliography'));
  });
});

// ---------------------------------------------------------------------------
// 2. validate
// ---------------------------------------------------------------------------
describe('citation-generator: validate', () => {
  beforeEach(() => { _clearStore(); });

  it('should reject invalid action', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('should reject missing action', () => { assert.equal(validate({}).valid, false); });
  it('should reject null params', () => { assert.equal(validate(null).valid, false); });
  it('should reject undefined params', () => { assert.equal(validate(undefined).valid, false); });

  it('should validate create_citation requires type', () => {
    assert.equal(validate({ action: 'create_citation', title: 'T', authors: 'A', year: '2023' }).valid, false);
  });

  it('should validate create_citation requires title', () => {
    assert.equal(validate({ action: 'create_citation', type: 'article', authors: 'A', year: '2023' }).valid, false);
  });

  it('should validate create_citation requires authors', () => {
    assert.equal(validate({ action: 'create_citation', type: 'article', title: 'T', year: '2023' }).valid, false);
  });

  it('should validate create_citation requires year', () => {
    assert.equal(validate({ action: 'create_citation', type: 'article', title: 'T', authors: 'A' }).valid, false);
  });

  it('should accept valid create_citation', () => {
    assert.equal(validate({ action: 'create_citation', type: 'article', title: 'T', authors: 'A', year: '2023' }).valid, true);
  });

  it('should validate format_citation requires citationId', () => {
    assert.equal(validate({ action: 'format_citation', style: 'apa' }).valid, false);
  });

  it('should validate format_citation requires style', () => {
    assert.equal(validate({ action: 'format_citation', citationId: 'abc' }).valid, false);
  });

  it('should reject invalid type', () => {
    assert.equal(validate({ action: 'create_citation', type: 'invalid', title: 'T', authors: 'A', year: '2023' }).valid, false);
  });

  it('should reject invalid style in format_citation', () => {
    assert.equal(validate({ action: 'format_citation', citationId: 'abc', style: 'invalid' }).valid, false);
  });

  it('should accept list_citations without params', () => {
    assert.equal(validate({ action: 'list_citations' }).valid, true);
  });

  it('should validate get_citation requires citationId', () => {
    assert.equal(validate({ action: 'get_citation' }).valid, false);
    assert.equal(validate({ action: 'get_citation', citationId: 'abc' }).valid, true);
  });

  it('should validate delete_citation requires citationId', () => {
    assert.equal(validate({ action: 'delete_citation' }).valid, false);
  });

  it('should validate export_bibliography requires style', () => {
    assert.equal(validate({ action: 'export_bibliography' }).valid, false);
    assert.equal(validate({ action: 'export_bibliography', style: 'apa' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 3. store helpers
// ---------------------------------------------------------------------------
describe('citation-generator: store helpers', () => {
  beforeEach(() => { _clearStore(); });

  it('should start with empty store', () => {
    assert.equal(_storeSize(), 0);
  });

  it('should track size after operations', async () => {
    await execute({ action: 'create_citation', type: 'article', title: 'T1', authors: 'A', year: '2023' });
    assert.equal(_storeSize(), 1);
    await execute({ action: 'create_citation', type: 'book', title: 'T2', authors: 'B', year: '2022' });
    assert.equal(_storeSize(), 2);
  });

  it('should clear store', async () => {
    await execute({ action: 'create_citation', type: 'article', title: 'T', authors: 'A', year: '2023' });
    assert.equal(_storeSize(), 1);
    _clearStore();
    assert.equal(_storeSize(), 0);
  });
});

// ---------------------------------------------------------------------------
// 4. action validation
// ---------------------------------------------------------------------------
describe('citation-generator: action validation', () => {
  beforeEach(() => { _clearStore(); });

  it('should reject missing action', async () => {
    const r = await execute({});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });

  it('should reject unknown action', async () => {
    const r = await execute({ action: 'unknown' });
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const r = await execute(null);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });

  it('should reject undefined params', async () => {
    const r = await execute(undefined);
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 5. create_citation
// ---------------------------------------------------------------------------
describe('citation-generator: create_citation', () => {
  beforeEach(() => { _clearStore(); });

  it('should create an article citation', async () => {
    const r = await execute({ action: 'create_citation', type: 'article', title: 'Deep Learning', authors: 'LeCun, Bengio', year: '2015', source: 'Nature' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'create_citation');
    assert.ok(r.metadata.id);
    assert.equal(r.metadata.type, 'article');
    assert.ok(r.result.includes('Deep Learning'));
  });

  it('should create a book citation', async () => {
    const r = await execute({ action: 'create_citation', type: 'book', title: 'Pattern Recognition', authors: 'Bishop', year: '2006' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.type, 'book');
  });

  it('should create a website citation', async () => {
    const r = await execute({ action: 'create_citation', type: 'website', title: 'Python Docs', authors: 'PSF', year: '2024', url: 'https://docs.python.org' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.type, 'website');
  });

  it('should create a conference citation', async () => {
    const r = await execute({ action: 'create_citation', type: 'conference', title: 'Attention Is All You Need', authors: 'Vaswani, Shazeer', year: '2017', source: 'NeurIPS' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.type, 'conference');
  });

  it('should reject missing type', async () => {
    const r = await execute({ action: 'create_citation', title: 'T', authors: 'A', year: '2023' });
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing title', async () => {
    const r = await execute({ action: 'create_citation', type: 'article', authors: 'A', year: '2023' });
    assert.equal(r.metadata.success, false);
  });

  it('should reject missing authors', async () => {
    const r = await execute({ action: 'create_citation', type: 'article', title: 'T', year: '2023' });
    assert.equal(r.metadata.success, false);
  });

  it('should reject missing year', async () => {
    const r = await execute({ action: 'create_citation', type: 'article', title: 'T', authors: 'A' });
    assert.equal(r.metadata.success, false);
  });

  it('should reject invalid type', async () => {
    const r = await execute({ action: 'create_citation', type: 'thesis', title: 'T', authors: 'A', year: '2023' });
    assert.equal(r.metadata.success, false);
  });

  it('should handle optional doi', async () => {
    const r = await execute({ action: 'create_citation', type: 'article', title: 'T', authors: 'A', year: '2023', doi: '10.1234/test' });
    assert.equal(r.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 6. format_citation
// ---------------------------------------------------------------------------
describe('citation-generator: format_citation', () => {
  beforeEach(() => { _clearStore(); });

  it('should format in APA', async () => {
    const c = await execute({ action: 'create_citation', type: 'article', title: 'Deep Learning', authors: 'LeCun, Bengio', year: '2015', source: 'Nature' });
    const r = await execute({ action: 'format_citation', citationId: c.metadata.id, style: 'apa' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.style, 'apa');
    assert.ok(r.result.includes('APA'));
  });

  it('should format in MLA', async () => {
    const c = await execute({ action: 'create_citation', type: 'article', title: 'Title', authors: 'Author', year: '2023' });
    const r = await execute({ action: 'format_citation', citationId: c.metadata.id, style: 'mla' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.style, 'mla');
  });

  it('should format in Chicago', async () => {
    const c = await execute({ action: 'create_citation', type: 'book', title: 'Title', authors: 'Author', year: '2023' });
    const r = await execute({ action: 'format_citation', citationId: c.metadata.id, style: 'chicago' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.style, 'chicago');
  });

  it('should format in BibTeX', async () => {
    const c = await execute({ action: 'create_citation', type: 'article', title: 'Title', authors: 'Author', year: '2023' });
    const r = await execute({ action: 'format_citation', citationId: c.metadata.id, style: 'bibtex' });
    assert.equal(r.metadata.success, true);
    assert.ok(r.result.includes('@article'));
  });

  it('should return NOT_FOUND for unknown id', async () => {
    const r = await execute({ action: 'format_citation', citationId: 'nonexistent', style: 'apa' });
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'NOT_FOUND');
  });

  it('should reject missing citationId', async () => {
    const r = await execute({ action: 'format_citation', style: 'apa' });
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid style', async () => {
    const c = await execute({ action: 'create_citation', type: 'article', title: 'T', authors: 'A', year: '2023' });
    const r = await execute({ action: 'format_citation', citationId: c.metadata.id, style: 'invalid' });
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 7. list_citations
// ---------------------------------------------------------------------------
describe('citation-generator: list_citations', () => {
  beforeEach(() => { _clearStore(); });

  it('should list all citations', async () => {
    await execute({ action: 'create_citation', type: 'article', title: 'A1', authors: 'Auth', year: '2023' });
    await execute({ action: 'create_citation', type: 'book', title: 'B1', authors: 'Auth', year: '2022' });
    const r = await execute({ action: 'list_citations' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 2);
  });

  it('should filter by type', async () => {
    await execute({ action: 'create_citation', type: 'article', title: 'A1', authors: 'Auth', year: '2023' });
    await execute({ action: 'create_citation', type: 'book', title: 'B1', authors: 'Auth', year: '2022' });
    const r = await execute({ action: 'list_citations', type: 'article' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 1);
  });

  it('should return empty for no citations', async () => {
    const r = await execute({ action: 'list_citations' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 0);
  });
});

// ---------------------------------------------------------------------------
// 8. get_citation
// ---------------------------------------------------------------------------
describe('citation-generator: get_citation', () => {
  beforeEach(() => { _clearStore(); });

  it('should get existing citation', async () => {
    const c = await execute({ action: 'create_citation', type: 'article', title: 'Title', authors: 'Auth', year: '2023' });
    const r = await execute({ action: 'get_citation', citationId: c.metadata.id });
    assert.equal(r.metadata.success, true);
    assert.ok(r.result.includes('Title'));
  });

  it('should return NOT_FOUND for unknown id', async () => {
    const r = await execute({ action: 'get_citation', citationId: 'nonexistent' });
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'NOT_FOUND');
  });

  it('should reject missing citationId', async () => {
    const r = await execute({ action: 'get_citation' });
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string citationId', async () => {
    const r = await execute({ action: 'get_citation', citationId: 42 });
    assert.equal(r.metadata.success, false);
  });

  it('should include all fields in result', async () => {
    const c = await execute({ action: 'create_citation', type: 'article', title: 'My Paper', authors: 'Alice', year: '2023', source: 'Nature', doi: '10.1234/test' });
    const r = await execute({ action: 'get_citation', citationId: c.metadata.id });
    assert.ok(r.result.includes('My Paper'));
    assert.ok(r.result.includes('Nature'));
    assert.ok(r.result.includes('10.1234/test'));
  });
});

// ---------------------------------------------------------------------------
// 9. delete_citation
// ---------------------------------------------------------------------------
describe('citation-generator: delete_citation', () => {
  beforeEach(() => { _clearStore(); });

  it('should delete existing citation', async () => {
    const c = await execute({ action: 'create_citation', type: 'article', title: 'T', authors: 'A', year: '2023' });
    const r = await execute({ action: 'delete_citation', citationId: c.metadata.id });
    assert.equal(r.metadata.success, true);
    assert.equal(_storeSize(), 0);
  });

  it('should return NOT_FOUND for unknown id', async () => {
    const r = await execute({ action: 'delete_citation', citationId: 'nonexistent' });
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'NOT_FOUND');
  });

  it('should reject missing citationId', async () => {
    const r = await execute({ action: 'delete_citation' });
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 10. export_bibliography
// ---------------------------------------------------------------------------
describe('citation-generator: export_bibliography', () => {
  beforeEach(() => { _clearStore(); });

  it('should export all citations in APA', async () => {
    await execute({ action: 'create_citation', type: 'article', title: 'T1', authors: 'A1', year: '2023' });
    await execute({ action: 'create_citation', type: 'book', title: 'T2', authors: 'A2', year: '2022' });
    const r = await execute({ action: 'export_bibliography', style: 'apa' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 2);
    assert.equal(r.metadata.style, 'apa');
  });

  it('should export in BibTeX', async () => {
    await execute({ action: 'create_citation', type: 'article', title: 'T1', authors: 'A1', year: '2023' });
    const r = await execute({ action: 'export_bibliography', style: 'bibtex' });
    assert.equal(r.metadata.success, true);
    assert.ok(r.result.includes('@article'));
  });

  it('should export specific citations by ids', async () => {
    const c1 = await execute({ action: 'create_citation', type: 'article', title: 'T1', authors: 'A1', year: '2023' });
    await execute({ action: 'create_citation', type: 'book', title: 'T2', authors: 'A2', year: '2022' });
    const r = await execute({ action: 'export_bibliography', style: 'apa', ids: c1.metadata.id });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 1);
  });

  it('should handle empty bibliography', async () => {
    const r = await execute({ action: 'export_bibliography', style: 'apa' });
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 0);
  });

  it('should reject missing style', async () => {
    const r = await execute({ action: 'export_bibliography' });
    assert.equal(r.metadata.success, false);
  });

  it('should reject invalid style', async () => {
    const r = await execute({ action: 'export_bibliography', style: 'invalid' });
    assert.equal(r.metadata.success, false);
  });
});

// ---------------------------------------------------------------------------
// 11. full workflow
// ---------------------------------------------------------------------------
describe('citation-generator: full workflow', () => {
  beforeEach(() => { _clearStore(); });

  it('should create → format → list → get → delete lifecycle', async () => {
    // Create
    const c1 = await execute({ action: 'create_citation', type: 'article', title: 'Paper A', authors: 'Alice, Bob', year: '2023', source: 'Journal A' });
    assert.equal(c1.metadata.success, true);
    const id1 = c1.metadata.id;

    // Format
    const f1 = await execute({ action: 'format_citation', citationId: id1, style: 'apa' });
    assert.equal(f1.metadata.success, true);
    assert.ok(f1.result.includes('Alice'));

    // List
    const l1 = await execute({ action: 'list_citations' });
    assert.equal(l1.metadata.count, 1);

    // Get
    const g1 = await execute({ action: 'get_citation', citationId: id1 });
    assert.equal(g1.metadata.success, true);
    assert.ok(g1.result.includes('Paper A'));

    // Delete
    const d1 = await execute({ action: 'delete_citation', citationId: id1 });
    assert.equal(d1.metadata.success, true);

    // Verify deletion
    const l2 = await execute({ action: 'list_citations' });
    assert.equal(l2.metadata.count, 0);
  });

  it('should create multiple → export bibliography', async () => {
    await execute({ action: 'create_citation', type: 'article', title: 'Paper A', authors: 'Alice', year: '2023' });
    await execute({ action: 'create_citation', type: 'book', title: 'Book B', authors: 'Bob', year: '2022' });
    await execute({ action: 'create_citation', type: 'conference', title: 'Conf C', authors: 'Charlie', year: '2021' });

    const bib = await execute({ action: 'export_bibliography', style: 'mla' });
    assert.equal(bib.metadata.success, true);
    assert.equal(bib.metadata.count, 3);
  });

  it('should handle create → delete → get returns NOT_FOUND', async () => {
    const c = await execute({ action: 'create_citation', type: 'article', title: 'X', authors: 'Y', year: '2023' });
    await execute({ action: 'delete_citation', citationId: c.metadata.id });
    const g = await execute({ action: 'get_citation', citationId: c.metadata.id });
    assert.equal(g.metadata.success, false);
    assert.equal(g.metadata.error, 'NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// 12. Format helpers
// ---------------------------------------------------------------------------
describe('citation-generator: format helpers', () => {
  beforeEach(() => { _clearStore(); });

  const testCitation = {
    id: 'test-id',
    type: 'article',
    title: 'Test Paper',
    authors: ['Alice Smith', 'Bob Jones'],
    year: '2023',
    source: 'Test Journal',
    url: null,
    doi: '10.1234/test',
  };

  it('formatCitationApa should produce APA format', () => {
    const apa = formatCitationApa(testCitation);
    assert.ok(apa.includes('Alice Smith'));
    assert.ok(apa.includes('(2023)'));
    assert.ok(apa.includes('Test Paper'));
  });

  it('formatCitationMla should produce MLA format', () => {
    const mla = formatCitationMla(testCitation);
    assert.ok(mla.includes('Alice Smith'));
    assert.ok(mla.includes('Test Paper'));
  });

  it('formatCitationChicago should produce Chicago format', () => {
    const chi = formatCitationChicago(testCitation);
    assert.ok(chi.includes('Alice Smith'));
    assert.ok(chi.includes('Test Paper'));
  });

  it('formatCitationBibtex should produce BibTeX format', () => {
    const bib = formatCitationBibtex(testCitation);
    assert.ok(bib.includes('@article'));
    assert.ok(bib.includes('title = {Test Paper}'));
    assert.ok(bib.includes('doi = {10.1234/test}'));
  });

  it('formatCitation should dispatch to correct formatter', () => {
    assert.ok(formatCitation(testCitation, 'apa').includes('(2023)'));
    assert.ok(formatCitation(testCitation, 'bibtex').includes('@article'));
  });
});

// ---------------------------------------------------------------------------
// 13. Validation helpers
// ---------------------------------------------------------------------------
describe('citation-generator: validation helpers', () => {
  beforeEach(() => { _clearStore(); });

  it('validateNonEmptyString should accept valid strings', () => {
    assert.equal(validateNonEmptyString('hello', 'field').valid, true);
  });

  it('validateNonEmptyString should reject empty string', () => {
    assert.equal(validateNonEmptyString('', 'field').valid, false);
  });

  it('validateNonEmptyString should reject null', () => {
    assert.equal(validateNonEmptyString(null, 'field').valid, false);
  });

  it('validateCitationType should accept valid types', () => {
    for (const t of VALID_TYPES) {
      assert.equal(validateCitationType(t).valid, true);
    }
  });

  it('validateCitationType should reject invalid type', () => {
    assert.equal(validateCitationType('thesis').valid, false);
  });

  it('validateStyle should accept valid styles', () => {
    for (const s of VALID_STYLES) {
      assert.equal(validateStyle(s).valid, true);
    }
  });

  it('validateStyle should reject invalid style', () => {
    assert.equal(validateStyle('vancouver').valid, false);
  });
});

// ---------------------------------------------------------------------------
// 14. Constants
// ---------------------------------------------------------------------------
describe('citation-generator: constants', () => {
  beforeEach(() => { _clearStore(); });

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, ['create_citation', 'format_citation', 'list_citations', 'get_citation', 'delete_citation', 'export_bibliography']);
  });

  it('should have correct VALID_TYPES', () => {
    assert.deepEqual(VALID_TYPES, ['article', 'book', 'website', 'conference']);
  });

  it('should have correct VALID_STYLES', () => {
    assert.deepEqual(VALID_STYLES, ['apa', 'mla', 'chicago', 'bibtex']);
  });
});
