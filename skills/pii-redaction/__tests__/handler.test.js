import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execute } from '../handler.js';

// ---------------------------------------------------------------------------
// Detect action
// ---------------------------------------------------------------------------
describe('pii-redaction: detect', () => {
  it('should detect email addresses', async () => {
    const result = await execute(
      { action: 'detect', text: 'Contact me at user@example.com for details.' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'detect');
    assert.equal(result.metadata.piiFound, true);
    assert.equal(result.metadata.count, 1);
    assert.equal(result.metadata.findings[0].type, 'EMAIL');
    assert.equal(result.metadata.findings[0].value, 'user@example.com');
  });

  it('should detect multiple email addresses', async () => {
    const result = await execute(
      { action: 'detect', text: 'alice@test.org and bob@company.co.uk' },
      {}
    );
    assert.equal(result.metadata.count, 2);
    assert.equal(result.metadata.findings[0].type, 'EMAIL');
    assert.equal(result.metadata.findings[1].type, 'EMAIL');
  });

  it('should detect US phone numbers', async () => {
    const result = await execute(
      { action: 'detect', text: 'Call me at (555) 123-4567 or +1-800-555-0199.' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.piiFound, true);
    const phoneFindings = result.metadata.findings.filter((f) => f.type === 'PHONE');
    assert.ok(phoneFindings.length >= 1, 'Should detect at least one phone number');
  });

  it('should detect SSNs', async () => {
    const result = await execute(
      { action: 'detect', text: 'My SSN is 123-45-6789.' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.piiFound, true);
    const ssnFindings = result.metadata.findings.filter((f) => f.type === 'SSN');
    assert.ok(ssnFindings.length >= 1, 'Should detect at least one SSN');
    assert.equal(ssnFindings[0].value, '123-45-6789');
  });

  it('should reject invalid SSNs (starting with 000)', async () => {
    const result = await execute(
      { action: 'detect', text: 'Invalid SSN: 000-12-3456', types: ['SSN'] },
      {}
    );
    assert.equal(result.metadata.piiFound, false);
    assert.equal(result.metadata.count, 0);
  });

  it('should detect credit card numbers with Luhn validation', async () => {
    // 4111 1111 1111 1111 is a well-known test card that passes Luhn
    const result = await execute(
      { action: 'detect', text: 'Card: 4111 1111 1111 1111' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.piiFound, true);
    const ccFindings = result.metadata.findings.filter((f) => f.type === 'CREDIT_CARD');
    assert.ok(ccFindings.length >= 1, 'Should detect at least one credit card');
  });

  it('should reject credit card numbers that fail Luhn check', async () => {
    const result = await execute(
      { action: 'detect', text: 'Card: 1234 5678 9012 3456', types: ['CREDIT_CARD'] },
      {}
    );
    // 1234567890123456 does not pass Luhn, so should not be detected
    const ccFindings = result.metadata.findings.filter((f) => f.type === 'CREDIT_CARD');
    assert.equal(ccFindings.length, 0, 'Should not detect invalid credit card');
  });

  it('should detect IP addresses', async () => {
    const result = await execute(
      { action: 'detect', text: 'Server at 192.168.1.100 responded.' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.piiFound, true);
    const ipFindings = result.metadata.findings.filter((f) => f.type === 'IP_ADDRESS');
    assert.ok(ipFindings.length >= 1, 'Should detect at least one IP address');
    assert.equal(ipFindings[0].value, '192.168.1.100');
  });

  it('should reject invalid IP addresses (octet > 255)', async () => {
    const result = await execute(
      { action: 'detect', text: 'Bad IP: 999.999.999.999', types: ['IP_ADDRESS'] },
      {}
    );
    assert.equal(result.metadata.count, 0);
  });

  it('should detect dates of birth', async () => {
    const result = await execute(
      { action: 'detect', text: 'DOB: 01/15/1990' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.piiFound, true);
    const dobFindings = result.metadata.findings.filter((f) => f.type === 'DATE_OF_BIRTH');
    assert.ok(dobFindings.length >= 1, 'Should detect at least one date');
  });

  it('should detect mixed PII in a single text', async () => {
    const text = 'Name: John Doe, Email: john@example.com, Phone: (555) 123-4567, IP: 10.0.0.1';
    const result = await execute({ action: 'detect', text }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.piiFound, true);
    assert.ok(result.metadata.count >= 3, 'Should detect at least 3 PII items');

    const types = result.metadata.findings.map((f) => f.type);
    assert.ok(types.includes('EMAIL'), 'Should include EMAIL');
    assert.ok(types.includes('IP_ADDRESS'), 'Should include IP_ADDRESS');
  });

  it('should return no PII found for clean text', async () => {
    const result = await execute(
      { action: 'detect', text: 'This is a perfectly clean sentence with no PII.' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.piiFound, false);
    assert.equal(result.metadata.count, 0);
    assert.deepEqual(result.metadata.findings, []);
  });
});

// ---------------------------------------------------------------------------
// Redact action
// ---------------------------------------------------------------------------
describe('pii-redaction: redact', () => {
  it('should redact email addresses with default placeholder', async () => {
    const result = await execute(
      { action: 'redact', text: 'Email me at user@example.com please.' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'redact');
    assert.equal(result.metadata.piiFound, true);
    assert.ok(result.result.includes('[REDACTED_EMAIL]'));
    assert.ok(!result.result.includes('user@example.com'));
  });

  it('should redact multiple PII types with default placeholders', async () => {
    const text = 'Email: test@test.com, IP: 10.20.30.40';
    const result = await execute({ action: 'redact', text }, {});
    assert.ok(result.result.includes('[REDACTED_EMAIL]'));
    assert.ok(result.result.includes('[REDACTED_IP_ADDRESS]'));
    assert.ok(!result.result.includes('test@test.com'));
    assert.ok(!result.result.includes('10.20.30.40'));
  });

  it('should use custom replacement string when provided', async () => {
    const result = await execute(
      { action: 'redact', text: 'My email is hello@world.org', replacement: '***' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('***'));
    assert.ok(!result.result.includes('hello@world.org'));
    assert.ok(!result.result.includes('[REDACTED_EMAIL]'));
  });

  it('should return original text when no PII is found', async () => {
    const text = 'Nothing sensitive here.';
    const result = await execute({ action: 'redact', text }, {});
    assert.equal(result.result, text);
    assert.equal(result.metadata.piiFound, false);
    assert.equal(result.metadata.redactedCount, 0);
  });

  it('should redact SSNs', async () => {
    const result = await execute(
      { action: 'redact', text: 'SSN: 123-45-6789' },
      {}
    );
    assert.ok(result.result.includes('[REDACTED_SSN]'));
    assert.ok(!result.result.includes('123-45-6789'));
  });

  it('should redact credit cards', async () => {
    const result = await execute(
      { action: 'redact', text: 'Card: 4111 1111 1111 1111' },
      {}
    );
    assert.ok(result.result.includes('[REDACTED_CREDIT_CARD]'));
    assert.ok(!result.result.includes('4111 1111 1111 1111'));
  });
});

// ---------------------------------------------------------------------------
// Report action
// ---------------------------------------------------------------------------
describe('pii-redaction: report', () => {
  it('should generate a full report with counts and risk level', async () => {
    const text = 'SSN: 123-45-6789, Email: test@test.com, Card: 4111 1111 1111 1111';
    const result = await execute({ action: 'report', text }, {});

    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'report');
    assert.equal(result.metadata.piiFound, true);
    assert.ok(result.metadata.totalCount >= 3);
    assert.equal(result.metadata.riskLevel, 'HIGH');
    assert.ok(result.metadata.countsByType.SSN >= 1);
    assert.ok(result.metadata.countsByType.EMAIL >= 1);
    assert.ok(result.metadata.countsByType.CREDIT_CARD >= 1);
    assert.ok(result.metadata.recommendations.length > 0);
    assert.ok(result.result.includes('PII Analysis Report'));
    assert.ok(result.result.includes('Risk level: HIGH'));
  });

  it('should report NONE risk for clean text', async () => {
    const result = await execute(
      { action: 'report', text: 'Nothing sensitive here at all.' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.riskLevel, 'NONE');
    assert.equal(result.metadata.totalCount, 0);
  });

  it('should report LOW risk for a single low-sensitivity PII item', async () => {
    const result = await execute(
      { action: 'report', text: 'Contact: user@example.com' },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.riskLevel, 'LOW');
  });

  it('should report HIGH risk when SSN is present', async () => {
    const result = await execute(
      { action: 'report', text: 'SSN: 123-45-6789' },
      {}
    );
    assert.equal(result.metadata.riskLevel, 'HIGH');
  });

  it('should include recommendations in the report', async () => {
    const result = await execute(
      { action: 'report', text: 'Card: 4111 1111 1111 1111, Email: a@b.com' },
      {}
    );
    assert.ok(result.metadata.recommendations.length >= 2);
    const recText = result.metadata.recommendations.join(' ');
    assert.ok(recText.includes('PCI-DSS'), 'Should include PCI-DSS recommendation for credit cards');
  });
});

// ---------------------------------------------------------------------------
// Edge cases and validation
// ---------------------------------------------------------------------------
describe('pii-redaction: edge cases', () => {
  it('should return error for empty text', async () => {
    const result = await execute({ action: 'detect', text: '' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'EMPTY_TEXT');
  });

  it('should return error for missing text', async () => {
    const result = await execute({ action: 'detect' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'EMPTY_TEXT');
  });

  it('should return error for whitespace-only text', async () => {
    const result = await execute({ action: 'detect', text: '   ' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'EMPTY_TEXT');
  });

  it('should return error for invalid action', async () => {
    const result = await execute({ action: 'purge', text: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('purge'));
  });

  it('should return error for missing action', async () => {
    const result = await execute({ text: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should filter by specific PII types when types param is provided', async () => {
    const text = 'Email: test@test.com, SSN: 123-45-6789, IP: 10.0.0.1';
    const result = await execute({ action: 'detect', text, types: ['EMAIL'] }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 1);
    assert.equal(result.metadata.findings[0].type, 'EMAIL');
  });

  it('should handle type filter with multiple types', async () => {
    const text = 'Email: test@test.com, SSN: 123-45-6789, IP: 10.0.0.1';
    const result = await execute(
      { action: 'detect', text, types: ['EMAIL', 'IP_ADDRESS'] },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 2);
    const types = result.metadata.findings.map((f) => f.type);
    assert.ok(types.includes('EMAIL'));
    assert.ok(types.includes('IP_ADDRESS'));
    assert.ok(!types.includes('SSN'));
  });

  it('should handle type filter case-insensitively', async () => {
    const text = 'Email: test@test.com';
    const result = await execute(
      { action: 'detect', text, types: ['email'] },
      {}
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.count, 1);
    assert.equal(result.metadata.findings[0].type, 'EMAIL');
  });

  it('should include position information in detect results', async () => {
    const text = 'Hi user@test.com bye';
    const result = await execute({ action: 'detect', text }, {});
    assert.equal(result.metadata.success, true);
    const finding = result.metadata.findings[0];
    assert.equal(typeof finding.start, 'number');
    assert.equal(typeof finding.end, 'number');
    assert.ok(finding.start >= 0);
    assert.ok(finding.end > finding.start);
    assert.equal(text.slice(finding.start, finding.end), finding.value);
  });

  it('should handle text with no matching types gracefully', async () => {
    const result = await execute(
      { action: 'detect', text: 'test@test.com', types: ['SSN'] },
      {}
    );
    assert.equal(result.metadata.piiFound, false);
    assert.equal(result.metadata.count, 0);
  });
});
