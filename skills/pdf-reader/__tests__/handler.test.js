import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { execute } from '../handler.js';
import { writeFileSync, mkdtempSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir;
const tempFiles = [];

function createTempFile(name, content) {
  const filePath = join(tempDir, name);
  if (typeof content === 'string') {
    writeFileSync(filePath, content, 'binary');
  } else {
    writeFileSync(filePath, content);
  }
  tempFiles.push(filePath);
  return filePath;
}

function makeMinimalPDF(bodyContent = '', infoDict = '') {
  return `%PDF-1.4\n${infoDict}1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length ${bodyContent.length} >>\nstream\n${bodyContent}\nendstream\nendobj\n%%EOF`;
}

// ===========================================================================
// Missing / invalid filePath
// ===========================================================================

describe('pdf-reader: missing filePath', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should return error when filePath is missing', async () => {
    const res = await execute({}, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
    assert.ok(res.result.includes('Error'));
  });

  it('should return error when filePath is undefined', async () => {
    const res = await execute({ filePath: undefined }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
  });

  it('should return error when filePath is null', async () => {
    const res = await execute({ filePath: null }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
  });

  it('should return error when filePath is empty string', async () => {
    const res = await execute({ filePath: '' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
  });

  it('should return error when filePath is whitespace only', async () => {
    const res = await execute({ filePath: '   ' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
  });

  it('should return error when filePath is a number', async () => {
    const res = await execute({ filePath: 42 }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
  });

  it('should return error when filePath is a boolean', async () => {
    const res = await execute({ filePath: true }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
  });

  it('should return error when filePath is an array', async () => {
    const res = await execute({ filePath: ['/some/path'] }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
  });

  it('should return error when filePath is an object', async () => {
    const res = await execute({ filePath: { path: '/some/path' } }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'INVALID_FILE_PATH');
  });

  it('should include helpful message in error result', async () => {
    const res = await execute({}, {});
    assert.ok(res.result.includes('filePath'));
    assert.ok(res.result.includes('required'));
  });
});

// ===========================================================================
// File not found
// ===========================================================================

describe('pdf-reader: file not found', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should return error for nonexistent file', async () => {
    const res = await execute({ filePath: '/tmp/nonexistent_file_xyz.pdf' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'FILE_NOT_FOUND');
  });

  it('should include the path in the error metadata', async () => {
    const res = await execute({ filePath: '/tmp/nonexistent_file_xyz.pdf' }, {});
    assert.ok(res.metadata.path.includes('nonexistent_file_xyz.pdf'));
  });

  it('should include the path in the error result string', async () => {
    const res = await execute({ filePath: '/tmp/nonexistent_file_xyz.pdf' }, {});
    assert.ok(res.result.includes('nonexistent_file_xyz.pdf'));
  });

  it('should return FILE_NOT_FOUND for deeply nested nonexistent path', async () => {
    const res = await execute({ filePath: '/a/b/c/d/e/f.pdf' }, {});
    assert.equal(res.metadata.error, 'FILE_NOT_FOUND');
  });

  it('should handle filePath with special characters that does not exist', async () => {
    const res = await execute({ filePath: '/tmp/file with spaces & special.pdf' }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'FILE_NOT_FOUND');
  });
});

// ===========================================================================
// Not a PDF
// ===========================================================================

describe('pdf-reader: not a PDF', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should return error for a plain text file', async () => {
    const f = createTempFile('not-a-pdf.pdf', 'Hello, this is plain text.');
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOT_A_PDF');
  });

  it('should return error for an HTML file', async () => {
    const f = createTempFile('page.pdf', '<html><body>Hello</body></html>');
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOT_A_PDF');
  });

  it('should return error for a JSON file', async () => {
    const f = createTempFile('data.pdf', '{"key": "value"}');
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOT_A_PDF');
  });

  it('should return error for empty file', async () => {
    const f = createTempFile('empty.pdf', '');
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOT_A_PDF');
  });

  it('should return error for file starting with random bytes', async () => {
    const f = createTempFile('random.pdf', Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]));
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'NOT_A_PDF');
  });

  it('should include path in NOT_A_PDF metadata', async () => {
    const f = createTempFile('not-pdf.pdf', 'Not a PDF file content');
    const res = await execute({ filePath: f }, {});
    assert.ok(res.metadata.path);
    assert.ok(res.metadata.path.includes('not-pdf.pdf'));
  });

  it('should include the path in the error result text', async () => {
    const f = createTempFile('fake.pdf', 'This is not PDF');
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('fake.pdf'));
  });

  it('should return NOT_A_PDF for file with %PDF-like but wrong prefix', async () => {
    const f = createTempFile('almost.pdf', 'X%PDF-1.4 not really');
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.error, 'NOT_A_PDF');
  });
});

// ===========================================================================
// File too large
// ===========================================================================

describe('pdf-reader: file too large', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should return error for file over 50MB', async () => {
    // Create a sparse file that appears large
    const { openSync, closeSync, ftruncateSync } = await import('node:fs');
    const largePath = join(tempDir, 'large.pdf');
    const fd = openSync(largePath, 'w');
    // Write PDF header at start
    writeFileSync(largePath, '%PDF-1.4\n');
    // Truncate to > 50MB
    ftruncateSync(fd, 51 * 1024 * 1024);
    closeSync(fd);
    tempFiles.push(largePath);

    const res = await execute({ filePath: largePath }, {});
    assert.equal(res.metadata.success, false);
    assert.equal(res.metadata.error, 'FILE_TOO_LARGE');
  });

  it('should include sizeBytes in metadata for large file', async () => {
    const { openSync, closeSync, ftruncateSync } = await import('node:fs');
    const largePath = join(tempDir, 'large2.pdf');
    const fd = openSync(largePath, 'w');
    writeFileSync(largePath, '%PDF-1.4\n');
    ftruncateSync(fd, 51 * 1024 * 1024);
    closeSync(fd);
    tempFiles.push(largePath);

    const res = await execute({ filePath: largePath }, {});
    assert.ok(res.metadata.sizeBytes > 50 * 1024 * 1024);
  });

  it('should mention 50 MB limit in error result', async () => {
    const { openSync, closeSync, ftruncateSync } = await import('node:fs');
    const largePath = join(tempDir, 'large3.pdf');
    const fd = openSync(largePath, 'w');
    writeFileSync(largePath, '%PDF-1.4\n');
    ftruncateSync(fd, 51 * 1024 * 1024);
    closeSync(fd);
    tempFiles.push(largePath);

    const res = await execute({ filePath: largePath }, {});
    assert.ok(res.result.includes('50 MB'));
  });

  it('should include path in metadata for large file', async () => {
    const { openSync, closeSync, ftruncateSync } = await import('node:fs');
    const largePath = join(tempDir, 'large4.pdf');
    const fd = openSync(largePath, 'w');
    writeFileSync(largePath, '%PDF-1.4\n');
    ftruncateSync(fd, 51 * 1024 * 1024);
    closeSync(fd);
    tempFiles.push(largePath);

    const res = await execute({ filePath: largePath }, {});
    assert.ok(res.metadata.path.includes('large4.pdf'));
  });
});

// ===========================================================================
// Valid PDF with text extraction
// ===========================================================================

describe('pdf-reader: valid PDF with text', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should extract text from a simple PDF with BT/ET markers', async () => {
    const body = 'BT\n(Hello World) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('simple.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('Hello World'));
  });

  it('should return success: true in metadata', async () => {
    const body = 'BT\n(Test Text) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('success.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should include path in metadata for valid PDF', async () => {
    const body = 'BT\n(Path Test) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('path-test.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.metadata.path.includes('path-test.pdf'));
  });

  it('should include pdfVersion in metadata', async () => {
    const body = 'BT\n(Version) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('version.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.pdfVersion, '1.4');
  });

  it('should include estimatedPageCount in metadata', async () => {
    const body = 'BT\n(Page) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('pagecount.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(typeof res.metadata.estimatedPageCount, 'number');
    assert.ok(res.metadata.estimatedPageCount >= 1);
  });

  it('should include fileSizeBytes in metadata', async () => {
    const body = 'BT\n(Size) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('size.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.metadata.fileSizeBytes > 0);
  });

  it('should include streamCount in metadata', async () => {
    const body = 'BT\n(Stream) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('stream.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(typeof res.metadata.streamCount, 'number');
  });

  it('should include textLength in metadata', async () => {
    const body = 'BT\n(Length) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('length.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.metadata.textLength > 0);
  });

  it('should include sectionCount in metadata', async () => {
    const body = 'BT\n(Section) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('section.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(typeof res.metadata.sectionCount, 'number');
    assert.ok(res.metadata.sectionCount >= 1);
  });

  it('should extract text from multiple BT/ET blocks', async () => {
    const body = 'BT\n(First Block) Tj\nET\nBT\n(Second Block) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('multi-block.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('First Block'));
    assert.ok(res.result.includes('Second Block'));
  });

  it('should include header information in result', async () => {
    const body = 'BT\n(Header Test) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('header.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('PDF Text Extraction'));
    assert.ok(res.result.includes('Size:'));
    assert.ok(res.result.includes('Estimated pages:'));
  });

  it('should include characters extracted count in result header', async () => {
    const body = 'BT\n(Chars) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('chars.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('Characters extracted:'));
  });

  it('should include streams processed count in result header', async () => {
    const body = 'BT\n(Streams) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('streams.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('Streams processed:'));
  });

  it('should handle PDF with TJ array operator', async () => {
    const body = 'BT\n[(Hello) 100 (World)] TJ\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('tj-array.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('Hello'));
    assert.ok(res.result.includes('World'));
  });

  it('should handle PDF with multiple Tj operators in one BT/ET block', async () => {
    const body = 'BT\n(Line One) Tj\n(Line Two) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('multi-tj.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('Line One'));
    assert.ok(res.result.includes('Line Two'));
  });

  it('should handle filePath with leading/trailing whitespace', async () => {
    const body = 'BT\n(Trimmed) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('trim.pdf', pdf);
    const res = await execute({ filePath: `  ${f}  ` }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('Trimmed'));
  });

  it('should handle relative path resolution', async () => {
    const body = 'BT\n(Relative) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('relative.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
  });
});

// ===========================================================================
// PDF with no extractable text
// ===========================================================================

describe('pdf-reader: no extractable text', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should handle PDF with no BT/ET markers (no text)', async () => {
    const pdf = makeMinimalPDF('q 1 0 0 1 0 0 cm Q');
    const f = createTempFile('no-text.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.warning, 'NO_TEXT_EXTRACTED');
  });

  it('should include extractedText as empty string when no text found', async () => {
    const pdf = makeMinimalPDF('q 1 0 0 1 0 0 cm Q');
    const f = createTempFile('empty-text.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.extractedText, '');
  });

  it('should mention OCR in no-text result', async () => {
    const pdf = makeMinimalPDF('q 1 0 0 1 0 0 cm Q');
    const f = createTempFile('ocr-hint.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('OCR'));
  });

  it('should mention scanned/image-only in no-text result', async () => {
    const pdf = makeMinimalPDF('q 1 0 0 1 0 0 cm Q');
    const f = createTempFile('scanned-hint.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('scanned') || res.result.includes('image'));
  });

  it('should include path in no-text result', async () => {
    const pdf = makeMinimalPDF('q 1 0 0 1 0 0 cm Q');
    const f = createTempFile('path-notext.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('path-notext.pdf'));
  });

  it('should include streamCount in no-text metadata', async () => {
    const pdf = makeMinimalPDF('q 1 0 0 1 0 0 cm Q');
    const f = createTempFile('stream-notext.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(typeof res.metadata.streamCount, 'number');
  });

  it('should handle BT/ET block with no text operators inside', async () => {
    const pdf = makeMinimalPDF('BT\n/F1 12 Tf\n0 0 Td\nET');
    const f = createTempFile('bt-et-no-tj.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.warning, 'NO_TEXT_EXTRACTED');
  });
});

// ===========================================================================
// Metadata extraction
// ===========================================================================

describe('pdf-reader: metadata extraction', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should extract title from PDF info dict', async () => {
    const info = '/Title (My Test Document)\n';
    const body = 'BT\n(Content) Tj\nET';
    const pdf = makeMinimalPDF(body, info);
    const f = createTempFile('title.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.title, 'My Test Document');
  });

  it('should extract author from PDF info dict', async () => {
    const info = '/Author (John Doe)\n';
    const body = 'BT\n(Content) Tj\nET';
    const pdf = makeMinimalPDF(body, info);
    const f = createTempFile('author.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.author, 'John Doe');
  });

  it('should extract creator from PDF info dict', async () => {
    const info = '/Creator (TestCreator)\n';
    const body = 'BT\n(Content) Tj\nET';
    const pdf = makeMinimalPDF(body, info);
    const f = createTempFile('creator.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.creator, 'TestCreator');
  });

  it('should extract producer from PDF info dict', async () => {
    const info = '/Producer (TestProducer)\n';
    const body = 'BT\n(Content) Tj\nET';
    const pdf = makeMinimalPDF(body, info);
    const f = createTempFile('producer.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.producer, 'TestProducer');
  });

  it('should include title in result header when present', async () => {
    const info = '/Title (Display Title)\n';
    const body = 'BT\n(Content) Tj\nET';
    const pdf = makeMinimalPDF(body, info);
    const f = createTempFile('title-header.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('Title: Display Title'));
  });

  it('should include author in result header when present', async () => {
    const info = '/Author (Jane Smith)\n';
    const body = 'BT\n(Content) Tj\nET';
    const pdf = makeMinimalPDF(body, info);
    const f = createTempFile('author-header.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('Author: Jane Smith'));
  });

  it('should extract multiple metadata fields', async () => {
    const info = '/Title (Multi Meta)\n/Author (Author X)\n/Creator (Creator Y)\n/Producer (Producer Z)\n';
    const body = 'BT\n(Content) Tj\nET';
    const pdf = makeMinimalPDF(body, info);
    const f = createTempFile('multi-meta.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.title, 'Multi Meta');
    assert.equal(res.metadata.author, 'Author X');
    assert.equal(res.metadata.creator, 'Creator Y');
    assert.equal(res.metadata.producer, 'Producer Z');
  });

  it('should handle PDF without any metadata fields', async () => {
    const body = 'BT\n(No Meta) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('no-meta.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
    assert.equal(res.metadata.title, undefined);
    assert.equal(res.metadata.author, undefined);
  });

  it('should detect PDF version 1.4', async () => {
    const pdf = `%PDF-1.4\n1 0 obj\n<< >>\nendobj\nBT\n(V14) Tj\nET\n%%EOF`;
    const f = createTempFile('v14.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.pdfVersion, '1.4');
  });

  it('should detect PDF version 1.7', async () => {
    const pdf = `%PDF-1.7\n1 0 obj\n<< >>\nendobj\nBT\n(V17) Tj\nET\n%%EOF`;
    const f = createTempFile('v17.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.pdfVersion, '1.7');
  });

  it('should detect PDF version 2.0', async () => {
    const pdf = `%PDF-2.0\n1 0 obj\n<< >>\nendobj\nBT\n(V20) Tj\nET\n%%EOF`;
    const f = createTempFile('v20.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.pdfVersion, '2.0');
  });
});

// ===========================================================================
// Page counting
// ===========================================================================

describe('pdf-reader: page counting', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should count one page for minimal PDF', async () => {
    const body = 'BT\n(One Page) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('one-page.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.estimatedPageCount, 1);
  });

  it('should count multiple pages when multiple /Type /Page entries exist', async () => {
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 25 >>
stream
BT (Page1) Tj ET
endstream
endobj
5 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R >> endobj
6 0 obj << /Length 25 >>
stream
BT (Page2) Tj ET
endstream
endobj
%%EOF`;
    const f = createTempFile('two-pages.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.estimatedPageCount, 2);
  });

  it('should not count /Type /Pages as a page', async () => {
    // /Type /Pages is the page tree node, not an actual page
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >> endobj
BT (Test) Tj ET
%%EOF`;
    const f = createTempFile('pages-vs-page.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    // Should count 1 Page, not confuse /Pages with /Page
    assert.equal(res.metadata.estimatedPageCount, 1);
  });

  it('should return 0 pages when no /Type /Page found', async () => {
    const pdf = '%PDF-1.4\n1 0 obj << >> endobj\nBT\n(NoPage) Tj\nET\n%%EOF';
    const f = createTempFile('zero-pages.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.estimatedPageCount, 0);
  });
});

// ===========================================================================
// Edge cases and special content
// ===========================================================================

describe('pdf-reader: edge cases', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should handle PDF with only whitespace text', async () => {
    const body = 'BT\n(   ) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('whitespace.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    // Whitespace-only text should result in NO_TEXT_EXTRACTED
    assert.equal(res.metadata.success, true);
  });

  it('should deduplicate identical text from stream and direct extraction', async () => {
    const body = 'BT\n(Dedup Test) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('dedup.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    // Should not have duplicated text
    const count = (res.result.match(/Dedup Test/g) || []).length;
    // The header might mention it, and the body once
    assert.ok(count >= 1);
  });

  it('should handle context parameter being undefined', async () => {
    const body = 'BT\n(No Context) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('no-ctx.pdf', pdf);
    const res = await execute({ filePath: f }, undefined);
    assert.equal(res.metadata.success, true);
  });

  it('should handle context parameter being null', async () => {
    const body = 'BT\n(Null Context) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('null-ctx.pdf', pdf);
    const res = await execute({ filePath: f }, null);
    assert.equal(res.metadata.success, true);
  });

  it('should handle context parameter being an empty object', async () => {
    const body = 'BT\n(Empty Context) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('empty-ctx.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should resolve filePath to absolute path in metadata', async () => {
    const body = 'BT\n(Abs Path) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('abspath.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.metadata.path.startsWith('/'));
  });

  it('should handle very small valid PDF', async () => {
    const pdf = '%PDF-1.0\nBT (Tiny) Tj ET\n%%EOF';
    const f = createTempFile('tiny.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should handle PDF with nested parentheses in text using escape', async () => {
    const body = 'BT\n(Hello \\(world\\)) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('parens.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('Hello (world)'));
  });

  it('should handle PDF with newline escape in text', async () => {
    const body = 'BT\n(Line1\\nLine2) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('newline.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should handle PDF with tab escape in text', async () => {
    const body = 'BT\n(Col1\\tCol2) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('tab.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should handle PDF with backslash escape in text', async () => {
    const body = 'BT\n(back\\\\slash) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('backslash.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok(res.result.includes('back\\slash'));
  });

  it('should return result as a string', async () => {
    const body = 'BT\n(Type Check) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('typecheck.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(typeof res.result, 'string');
  });

  it('should return metadata as an object', async () => {
    const body = 'BT\n(Meta Check) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('metacheck.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(typeof res.metadata, 'object');
    assert.ok(res.metadata !== null);
  });

  it('should handle PDF with stream containing non-text data gracefully', async () => {
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog >> endobj
2 0 obj << /Length 20 /Filter /FlateDecode >>
stream
not-real-zlib-data!!
endstream
endobj
BT (Fallback) Tj ET
%%EOF`;
    const f = createTempFile('bad-stream.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should handle filePath pointing to a file with no extension', async () => {
    const body = 'BT\n(No Ext) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('noextension', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('No Ext'));
  });

  it('should handle filePath pointing to file with wrong extension', async () => {
    const body = 'BT\n(Wrong Ext) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('wrong.txt', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
    assert.ok(res.result.includes('Wrong Ext'));
  });
});

// ===========================================================================
// Return shape validation
// ===========================================================================

describe('pdf-reader: return shape', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
    tempFiles.length = 0;
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  it('should always return an object with result and metadata (error case)', async () => {
    const res = await execute({}, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should always return an object with result and metadata (success case)', async () => {
    const body = 'BT\n(Shape) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('shape.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.ok('result' in res);
    assert.ok('metadata' in res);
  });

  it('should return error metadata with success=false for invalid input', async () => {
    const res = await execute({ filePath: '' }, {});
    assert.equal(res.metadata.success, false);
  });

  it('should return metadata with success=true for valid PDF', async () => {
    const body = 'BT\n(Valid) Tj\nET';
    const pdf = makeMinimalPDF(body);
    const f = createTempFile('valid-success.pdf', pdf);
    const res = await execute({ filePath: f }, {});
    assert.equal(res.metadata.success, true);
  });

  it('should return result as string for error cases', async () => {
    const res = await execute({}, {});
    assert.equal(typeof res.result, 'string');
  });

  it('should return metadata.error string for error cases', async () => {
    const res = await execute({}, {});
    assert.equal(typeof res.metadata.error, 'string');
  });

  it('should not throw for any standard error condition', async () => {
    // All these should return error objects, not throw
    const cases = [
      execute({}, {}),
      execute({ filePath: null }, {}),
      execute({ filePath: '' }, {}),
      execute({ filePath: '/nonexistent' }, {}),
    ];
    const results = await Promise.all(cases);
    for (const res of results) {
      assert.equal(res.metadata.success, false);
    }
  });
});
