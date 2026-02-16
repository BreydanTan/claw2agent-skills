import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { execute } from '../handler.js';

// Helper to create a mock context
function createContext(overrides = {}) {
  return {
    apiKey: 'test-key',
    config: { baseUrl: 'https://libretranslate.test' },
    ...overrides,
  };
}

// Store original fetch so we can restore it
let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// --------------------------------------------------------------------------
// Invalid action
// --------------------------------------------------------------------------

describe('invalid action', () => {
  it('should return INVALID_ACTION when action is missing', async () => {
    const result = await execute({}, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should return INVALID_ACTION for an unknown action', async () => {
    const result = await execute({ action: 'unknown' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('unknown'));
  });
});

// --------------------------------------------------------------------------
// translate action
// --------------------------------------------------------------------------

describe('translate action', () => {
  it('should return MISSING_TEXT when text is missing', async () => {
    const result = await execute({ action: 'translate', to: 'es' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });

  it('should return MISSING_TEXT when text is empty', async () => {
    const result = await execute({ action: 'translate', text: '', to: 'es' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });

  it('should return MISSING_TARGET_LANG when "to" is missing', async () => {
    const result = await execute({ action: 'translate', text: 'Hello' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TARGET_LANG');
  });

  it('should return MISSING_TARGET_LANG when "to" is empty', async () => {
    const result = await execute({ action: 'translate', text: 'Hello', to: '' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TARGET_LANG');
  });

  it('should return TEXT_TOO_LONG when text exceeds 5000 characters', async () => {
    const longText = 'a'.repeat(5001);
    const result = await execute({ action: 'translate', text: longText, to: 'es' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TEXT_TOO_LONG');
    assert.equal(result.metadata.maxLength, 5000);
    assert.equal(result.metadata.actualLength, 5001);
  });
});

// --------------------------------------------------------------------------
// detect action
// --------------------------------------------------------------------------

describe('detect action', () => {
  it('should return MISSING_TEXT when text is missing', async () => {
    const result = await execute({ action: 'detect' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });

  it('should return MISSING_TEXT when text is empty', async () => {
    const result = await execute({ action: 'detect', text: '' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });
});

// --------------------------------------------------------------------------
// batch action
// --------------------------------------------------------------------------

describe('batch action', () => {
  it('should return MISSING_TEXT when texts is missing', async () => {
    const result = await execute({ action: 'batch', to: 'fr' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });

  it('should return MISSING_TEXT when texts is an empty array', async () => {
    const result = await execute({ action: 'batch', texts: [], to: 'fr' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TEXT');
  });

  it('should return BATCH_TOO_LARGE when texts exceeds 10 items', async () => {
    const texts = Array.from({ length: 11 }, (_, i) => `text ${i}`);
    const result = await execute({ action: 'batch', texts, to: 'fr' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'BATCH_TOO_LARGE');
    assert.equal(result.metadata.maxBatchSize, 10);
    assert.equal(result.metadata.actualSize, 11);
  });

  it('should return MISSING_TARGET_LANG when "to" is missing for batch', async () => {
    const result = await execute({ action: 'batch', texts: ['Hello'] }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TARGET_LANG');
  });

  it('should return MISSING_TARGET_LANG when "to" is empty for batch', async () => {
    const result = await execute({ action: 'batch', texts: ['Hello'], to: '' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'MISSING_TARGET_LANG');
  });
});

// --------------------------------------------------------------------------
// languages action (mock fetch)
// --------------------------------------------------------------------------

describe('languages action', () => {
  it('should return the list of supported languages', async () => {
    const mockLanguages = [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
    ];

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => mockLanguages,
    });

    const result = await execute({ action: 'languages' }, createContext());
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'languages');
    assert.equal(result.metadata.count, 3);
    assert.equal(result.metadata.languages.length, 3);
    assert.equal(result.metadata.languages[0].code, 'en');
    assert.equal(result.metadata.languages[1].code, 'es');
    assert.equal(result.metadata.languages[2].code, 'fr');
    assert.ok(result.result.includes('en - English'));
    assert.ok(result.result.includes('es - Spanish'));
    assert.ok(result.result.includes('fr - French'));
  });

  it('should return PROVIDER_ERROR when the API returns a non-ok response', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await execute({ action: 'languages' }, createContext());
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'PROVIDER_ERROR');
    assert.equal(result.metadata.statusCode, 500);
  });
});
