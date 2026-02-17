import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  validate,
  meta,
  getClient,
  providerNotConfiguredError,
  resolveTimeout,
  requestWithTimeout,
  redactSensitive,
  validateText,
  validateTexts,
  validateLangCode,
  validateFormality,
  VALID_ACTIONS,
  SUPPORTED_LANGUAGES,
  VALID_FORMALITY,
  MAX_TEXT_LENGTH,
  MAX_DETECT_TEXT_LENGTH,
  MAX_BATCH_ITEMS,
  MAX_BATCH_ITEM_LENGTH,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .request() method.
 */
function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .request() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .request() triggers an AbortError (timeout).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      request: async (_method, _path, _body, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample translate response */
const sampleTranslateResult = {
  translated_text: 'Hallo Welt',
  detected_language: 'en',
  character_count: 11,
};

/** Sample detect response */
const sampleDetectResult = {
  language: 'fr',
  confidence: 0.98,
  alternatives: [
    { language: 'it', confidence: 0.02 },
  ],
};

/** Sample batch response */
const sampleBatchResult = {
  translations: [
    { translated_text: 'Bonjour' },
    { translated_text: 'Au revoir' },
  ],
};

/** Sample usage response */
const sampleUsageResult = {
  character_count: 45000,
  character_limit: 500000,
};

/** Sample glossaries response */
const sampleGlossariesResult = {
  glossaries: [
    { name: 'Tech Terms', source_lang: 'en', target_lang: 'de', entry_count: 150 },
    { name: 'Legal Terms', source_lang: 'en', target_lang: 'fr', entry_count: 75 },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('translator-deepl-google: action validation', () => {
  beforeEach(() => {});

  it('should reject invalid action', async () => {
    const result = await execute({ action: 'invalid' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
    assert.ok(result.result.includes('invalid'));
  });

  it('should reject missing action', async () => {
    const result = await execute({}, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject null params', async () => {
    const result = await execute(null, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should reject undefined params', async () => {
    const result = await execute(undefined, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_ACTION');
  });

  it('should list valid actions in error message', async () => {
    const result = await execute({ action: 'bad' }, {});
    for (const a of VALID_ACTIONS) {
      assert.ok(result.result.includes(a), `Error message should mention "${a}"`);
    }
  });

  it('should have 6 valid actions', () => {
    assert.equal(VALID_ACTIONS.length, 6);
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('translator-deepl-google: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail translate without client', async () => {
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail detect_language without client', async () => {
    const result = await execute({ action: 'detect_language', text: 'Hello' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail translate_batch without client', async () => {
    const result = await execute({ action: 'translate_batch', texts: ['Hello'], target_lang: 'de' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_usage without client', async () => {
    const result = await execute({ action: 'get_usage' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_glossaries without client', async () => {
    const result = await execute({ action: 'get_glossaries' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should NOT fail list_languages without client (no API call)', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 3. translate action
// ---------------------------------------------------------------------------
describe('translator-deepl-google: translate', () => {
  beforeEach(() => {});

  it('should translate text with defaults', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello world', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'translate');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.target_lang, 'de');
    assert.equal(result.metadata.translated_text, 'Hallo Welt');
    assert.ok(result.result.includes('Hallo Welt'));
  });

  it('should use provided source_lang', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello', source_lang: 'en', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should accept formality parameter', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de', formality: 'more' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.formality, 'more');
    assert.ok(result.result.includes('Formality: more'));
  });

  it('should default formality to "default" in metadata', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.formality, 'default');
  });

  it('should include character count', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello world', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.character_count, 11);
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hi', target_lang: 'fr' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing text', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty text', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: '', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only text', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: '   ', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject text exceeding max length', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const longText = 'a'.repeat(MAX_TEXT_LENGTH + 1);
    const result = await execute({ action: 'translate', text: longText, target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject missing target_lang', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid source_lang format', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de', source_lang: '123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid formality', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de', formality: 'ultra' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call POST /translate', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleTranslateResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'translate', text: 'Test', target_lang: 'fr' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/translate');
  });

  it('should pass body with text and target_lang', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body) => {
          capturedBody = body;
          return sampleTranslateResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'translate', text: 'Hello', target_lang: 'fr' }, ctx);
    assert.equal(capturedBody.text, 'Hello');
    assert.equal(capturedBody.target_lang, 'fr');
  });

  it('should handle alt response field "text"', async () => {
    const ctx = mockContext({ text: 'Alt translated' });
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.translated_text, 'Alt translated');
  });

  it('should handle alt response field "translation"', async () => {
    const ctx = mockContext({ translation: 'Third alt' });
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.translated_text, 'Third alt');
  });

  it('should lowercase target_lang', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'DE' }, ctx);
    assert.equal(result.metadata.target_lang, 'de');
  });

  it('should accept case-insensitive formality', async () => {
    const ctx = mockContext(sampleTranslateResult);
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de', formality: 'MORE' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.formality, 'more');
  });
});

// ---------------------------------------------------------------------------
// 4. detect_language action
// ---------------------------------------------------------------------------
describe('translator-deepl-google: detect_language', () => {
  beforeEach(() => {});

  it('should detect language with confidence', async () => {
    const ctx = mockContext(sampleDetectResult);
    const result = await execute({ action: 'detect_language', text: 'Bonjour le monde' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'detect_language');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.detected_language, 'fr');
    assert.equal(result.metadata.confidence, 0.98);
    assert.ok(result.result.includes('fr'));
  });

  it('should include alternatives', async () => {
    const ctx = mockContext(sampleDetectResult);
    const result = await execute({ action: 'detect_language', text: 'Bonjour' }, ctx);
    assert.ok(result.metadata.alternatives.length > 0);
    assert.ok(result.result.includes('Alternatives'));
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleDetectResult);
    const result = await execute({ action: 'detect_language', text: 'Hello' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing text', async () => {
    const ctx = mockContext(sampleDetectResult);
    const result = await execute({ action: 'detect_language' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty text', async () => {
    const ctx = mockContext(sampleDetectResult);
    const result = await execute({ action: 'detect_language', text: '' }, ctx);
    assert.equal(result.metadata.success, false);
  });

  it('should reject text exceeding detect max length', async () => {
    const ctx = mockContext(sampleDetectResult);
    const longText = 'x'.repeat(MAX_DETECT_TEXT_LENGTH + 1);
    const result = await execute({ action: 'detect_language', text: longText }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call POST /detect', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleDetectResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'detect_language', text: 'test' }, ctx);
    assert.equal(calledPath, '/detect');
  });

  it('should handle detected_language alt field', async () => {
    const ctx = mockContext({ detected_language: 'es' });
    const result = await execute({ action: 'detect_language', text: 'Hola' }, ctx);
    assert.equal(result.metadata.detected_language, 'es');
  });

  it('should handle null confidence', async () => {
    const ctx = mockContext({ language: 'en' });
    const result = await execute({ action: 'detect_language', text: 'Hello' }, ctx);
    assert.equal(result.metadata.confidence, null);
  });

  it('should handle empty alternatives', async () => {
    const ctx = mockContext({ language: 'en', confidence: 0.99 });
    const result = await execute({ action: 'detect_language', text: 'Hello' }, ctx);
    assert.deepEqual(result.metadata.alternatives, []);
  });
});

// ---------------------------------------------------------------------------
// 5. translate_batch action
// ---------------------------------------------------------------------------
describe('translator-deepl-google: translate_batch', () => {
  beforeEach(() => {});

  it('should batch translate texts', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: ['Hello', 'Goodbye'], target_lang: 'fr' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'translate_batch');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.item_count, 2);
    assert.equal(result.metadata.target_lang, 'fr');
  });

  it('should include total characters', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: ['Hello', 'Goodbye'], target_lang: 'fr' }, ctx);
    assert.equal(result.metadata.total_characters, 12); // 5 + 7
  });

  it('should accept source_lang', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: ['Hi'], source_lang: 'en', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.source_lang, 'en');
  });

  it('should default source_lang to auto', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: ['Hi'], target_lang: 'de' }, ctx);
    assert.equal(result.metadata.source_lang, 'auto');
  });

  it('should reject non-array texts', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: 'not an array', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty texts array', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: [], target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject texts with non-string items', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: ['hello', 123], target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject texts with empty string items', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: ['hello', ''], target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
  });

  it('should reject texts exceeding max batch items', async () => {
    const ctx = mockContext(sampleBatchResult);
    const tooMany = Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_, i) => `text ${i}`);
    const result = await execute({ action: 'translate_batch', texts: tooMany, target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject texts item exceeding max length', async () => {
    const ctx = mockContext(sampleBatchResult);
    const longItem = 'a'.repeat(MAX_BATCH_ITEM_LENGTH + 1);
    const result = await execute({ action: 'translate_batch', texts: [longItem], target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
  });

  it('should reject missing target_lang', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: ['Hello'] }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call POST /translate/batch', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleBatchResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'translate_batch', texts: ['Hi'], target_lang: 'fr' }, ctx);
    assert.equal(calledPath, '/translate/batch');
  });

  it('should handle "results" alt field', async () => {
    const ctx = mockContext({ results: ['Salut', 'Adieu'] });
    const result = await execute({ action: 'translate_batch', texts: ['Hi', 'Bye'], target_lang: 'fr' }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should handle string translations in response', async () => {
    const ctx = mockContext({ translations: ['Hola', 'Adios'] });
    const result = await execute({ action: 'translate_batch', texts: ['Hi', 'Bye'], target_lang: 'es' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Hola'));
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleBatchResult);
    const result = await execute({ action: 'translate_batch', texts: ['Hi'], target_lang: 'fr' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 6. get_usage action
// ---------------------------------------------------------------------------
describe('translator-deepl-google: get_usage', () => {
  beforeEach(() => {});

  it('should return usage data', async () => {
    const ctx = mockContext(sampleUsageResult);
    const result = await execute({ action: 'get_usage' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_usage');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.character_count, 45000);
    assert.equal(result.metadata.character_limit, 500000);
    assert.equal(result.metadata.remaining, 455000);
  });

  it('should include usage info in result text', async () => {
    const ctx = mockContext(sampleUsageResult);
    const result = await execute({ action: 'get_usage' }, ctx);
    assert.ok(result.result.includes('45000'));
    assert.ok(result.result.includes('500000'));
    assert.ok(result.result.includes('455000'));
  });

  it('should call GET /usage', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleUsageResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_usage' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.equal(calledPath, '/usage');
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleUsageResult);
    const result = await execute({ action: 'get_usage' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should handle zero usage', async () => {
    const ctx = mockContext({ character_count: 0, character_limit: 500000 });
    const result = await execute({ action: 'get_usage' }, ctx);
    assert.equal(result.metadata.character_count, 0);
    assert.equal(result.metadata.remaining, 500000);
  });
});

// ---------------------------------------------------------------------------
// 7. list_languages action
// ---------------------------------------------------------------------------
describe('translator-deepl-google: list_languages', () => {
  beforeEach(() => {});

  it('should list all supported languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_languages');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.languageCount, 27);
  });

  it('should include language codes in result text', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.ok(result.result.includes('en'));
    assert.ok(result.result.includes('de'));
    assert.ok(result.result.includes('fr'));
    assert.ok(result.result.includes('ja'));
  });

  it('should include language names in result text', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.ok(result.result.includes('English'));
    assert.ok(result.result.includes('German'));
    assert.ok(result.result.includes('French'));
  });

  it('should return languages as code/name objects', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    const langs = result.metadata.languages;
    assert.ok(Array.isArray(langs));
    assert.ok(langs.some((l) => l.code === 'en' && l.name === 'English'));
    assert.ok(langs.some((l) => l.code === 'ja' && l.name === 'Japanese'));
  });

  it('should not require a provider client', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should include timestamp', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.ok(result.metadata.timestamp);
  });

  it('should include all required language codes', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    const codes = result.metadata.languages.map((l) => l.code);
    const required = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'sv', 'da', 'fi', 'nb', 'el', 'cs', 'ro', 'hu', 'tr', 'id', 'th', 'vi', 'uk'];
    for (const code of required) {
      assert.ok(codes.includes(code), `Should include language code "${code}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. get_glossaries action
// ---------------------------------------------------------------------------
describe('translator-deepl-google: get_glossaries', () => {
  beforeEach(() => {});

  it('should return glossaries', async () => {
    const ctx = mockContext(sampleGlossariesResult);
    const result = await execute({ action: 'get_glossaries' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_glossaries');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.glossary_count, 2);
  });

  it('should include glossary details in result text', async () => {
    const ctx = mockContext(sampleGlossariesResult);
    const result = await execute({ action: 'get_glossaries' }, ctx);
    assert.ok(result.result.includes('Tech Terms'));
    assert.ok(result.result.includes('Legal Terms'));
    assert.ok(result.result.includes('150 entries'));
  });

  it('should call GET /glossaries', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleGlossariesResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_glossaries' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.equal(calledPath, '/glossaries');
  });

  it('should handle empty glossaries', async () => {
    const ctx = mockContext({ glossaries: [] });
    const result = await execute({ action: 'get_glossaries' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.glossary_count, 0);
  });

  it('should handle "data" alt field', async () => {
    const ctx = mockContext({ data: [{ name: 'Alt Glossary', source_lang: 'en', target_lang: 'de', entry_count: 10 }] });
    const result = await execute({ action: 'get_glossaries' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.glossary_count, 1);
  });

  it('should include timestamp', async () => {
    const ctx = mockContext(sampleGlossariesResult);
    const result = await execute({ action: 'get_glossaries' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 9. Timeout handling
// ---------------------------------------------------------------------------
describe('translator-deepl-google: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on translate abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on detect_language abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'detect_language', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on translate_batch abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'translate_batch', texts: ['Hello'], target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_usage abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_usage' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_glossaries abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_glossaries' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 10. Network error handling
// ---------------------------------------------------------------------------
describe('translator-deepl-google: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on translate failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on detect_language failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'detect_language', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on translate_batch failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'translate_batch', texts: ['Hello'], target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_usage failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'get_usage' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_glossaries failure', async () => {
    const ctx = mockContextError(new Error('Service unavailable'));
    const result = await execute({ action: 'get_glossaries' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 11. getClient helper
// ---------------------------------------------------------------------------
describe('translator-deepl-google: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient over gatewayClient', () => {
    const result = getClient({
      providerClient: { request: () => {} },
      gatewayClient: { request: () => {} },
    });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { request: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });

  it('should return null for null context', () => {
    assert.equal(getClient(null), null);
  });
});

// ---------------------------------------------------------------------------
// 12. redactSensitive
// ---------------------------------------------------------------------------
describe('translator-deepl-google: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: test_value_placeholder data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_value_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: sample_placeholder_value';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_placeholder_value'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: sample_auth_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_auth_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact password patterns', () => {
    const input = 'password=test_pass_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_pass_placeholder'));
  });

  it('should redact secret patterns', () => {
    const input = 'secret: my_secret_placeholder_value';
    const output = redactSensitive(input);
    assert.ok(!output.includes('my_secret_placeholder_value'));
  });

  it('should not alter clean strings', () => {
    const input = 'Translated 5 texts successfully';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('token: exposed_placeholder_val'));
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, ctx);
    assert.ok(!result.result.includes('exposed_placeholder_val'));
  });
});

// ---------------------------------------------------------------------------
// 13. validateText helper
// ---------------------------------------------------------------------------
describe('translator-deepl-google: validateText', () => {
  beforeEach(() => {});

  it('should accept valid text', () => {
    const result = validateText('Hello world');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Hello world');
  });

  it('should trim whitespace', () => {
    const result = validateText('  Hello  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Hello');
  });

  it('should reject null', () => {
    assert.equal(validateText(null).valid, false);
  });

  it('should reject undefined', () => {
    assert.equal(validateText(undefined).valid, false);
  });

  it('should reject empty string', () => {
    assert.equal(validateText('').valid, false);
  });

  it('should reject whitespace-only string', () => {
    assert.equal(validateText('   ').valid, false);
  });

  it('should reject non-string', () => {
    assert.equal(validateText(123).valid, false);
  });

  it('should reject text exceeding default max length', () => {
    const long = 'a'.repeat(MAX_TEXT_LENGTH + 1);
    assert.equal(validateText(long).valid, false);
  });

  it('should accept text at exact max length', () => {
    const exact = 'a'.repeat(MAX_TEXT_LENGTH);
    assert.equal(validateText(exact).valid, true);
  });

  it('should respect custom max length', () => {
    const text = 'a'.repeat(100);
    assert.equal(validateText(text, 50).valid, false);
    assert.equal(validateText(text, 100).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 14. validateTexts helper
// ---------------------------------------------------------------------------
describe('translator-deepl-google: validateTexts', () => {
  beforeEach(() => {});

  it('should accept valid array', () => {
    const result = validateTexts(['Hello', 'World']);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, ['Hello', 'World']);
  });

  it('should trim items', () => {
    const result = validateTexts(['  Hello  ']);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, ['Hello']);
  });

  it('should reject non-array', () => {
    assert.equal(validateTexts('not array').valid, false);
  });

  it('should reject null', () => {
    assert.equal(validateTexts(null).valid, false);
  });

  it('should reject empty array', () => {
    assert.equal(validateTexts([]).valid, false);
  });

  it('should reject array with non-string item', () => {
    assert.equal(validateTexts(['hello', 123]).valid, false);
  });

  it('should reject array with empty string item', () => {
    assert.equal(validateTexts(['hello', '']).valid, false);
  });

  it('should reject array with whitespace-only item', () => {
    assert.equal(validateTexts(['hello', '   ']).valid, false);
  });

  it('should reject too many items', () => {
    const tooMany = Array.from({ length: MAX_BATCH_ITEMS + 1 }, () => 'text');
    assert.equal(validateTexts(tooMany).valid, false);
  });

  it('should reject item exceeding max length', () => {
    const longItem = 'a'.repeat(MAX_BATCH_ITEM_LENGTH + 1);
    assert.equal(validateTexts([longItem]).valid, false);
  });

  it('should accept max items at max length', () => {
    const items = Array.from({ length: MAX_BATCH_ITEMS }, () => 'a'.repeat(MAX_BATCH_ITEM_LENGTH));
    assert.equal(validateTexts(items).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 15. validateLangCode helper
// ---------------------------------------------------------------------------
describe('translator-deepl-google: validateLangCode', () => {
  beforeEach(() => {});

  it('should accept 2-letter code', () => {
    const result = validateLangCode('en', 'target_lang', true);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'en');
  });

  it('should accept 5-letter code', () => {
    const result = validateLangCode('ptbra', 'target_lang', true);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'ptbra');
  });

  it('should lowercase code', () => {
    const result = validateLangCode('EN', 'target_lang', true);
    assert.equal(result.value, 'en');
  });

  it('should trim code', () => {
    const result = validateLangCode('  en  ', 'target_lang', true);
    assert.equal(result.value, 'en');
  });

  it('should return null for optional undefined', () => {
    const result = validateLangCode(undefined, 'source_lang', false);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should return null for optional null', () => {
    const result = validateLangCode(null, 'source_lang', false);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should fail for required undefined', () => {
    const result = validateLangCode(undefined, 'target_lang', true);
    assert.equal(result.valid, false);
  });

  it('should fail for required null', () => {
    const result = validateLangCode(null, 'target_lang', true);
    assert.equal(result.valid, false);
  });

  it('should reject non-string', () => {
    const result = validateLangCode(123, 'target_lang', true);
    assert.equal(result.valid, false);
  });

  it('should reject single char', () => {
    const result = validateLangCode('e', 'target_lang', true);
    assert.equal(result.valid, false);
  });

  it('should reject code longer than 5', () => {
    const result = validateLangCode('toolong', 'target_lang', true);
    assert.equal(result.valid, false);
  });

  it('should reject code with numbers', () => {
    const result = validateLangCode('e1', 'target_lang', true);
    assert.equal(result.valid, false);
  });

  it('should reject code with special chars', () => {
    const result = validateLangCode('en-US', 'target_lang', true);
    assert.equal(result.valid, false);
  });

  it('should return null for optional empty string', () => {
    const result = validateLangCode('', 'source_lang', false);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should fail for required empty string', () => {
    const result = validateLangCode('', 'target_lang', true);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateFormality helper
// ---------------------------------------------------------------------------
describe('translator-deepl-google: validateFormality', () => {
  beforeEach(() => {});

  it('should accept "default"', () => {
    const result = validateFormality('default');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'default');
  });

  it('should accept "more"', () => {
    const result = validateFormality('more');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'more');
  });

  it('should accept "less"', () => {
    const result = validateFormality('less');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'less');
  });

  it('should accept case-insensitive', () => {
    const result = validateFormality('MORE');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'more');
  });

  it('should return null for undefined', () => {
    const result = validateFormality(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should return null for null', () => {
    const result = validateFormality(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should reject invalid value', () => {
    const result = validateFormality('ultra');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('ultra'));
  });

  it('should reject non-string', () => {
    const result = validateFormality(123);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('translator-deepl-google: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000);
  });

  it('should cap at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should ignore non-positive timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
    assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should ignore non-number timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 'fast' } }), DEFAULT_TIMEOUT_MS);
  });

  it('should have default of 30000ms', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should have max of 120000ms', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });
});

// ---------------------------------------------------------------------------
// 18. requestWithTimeout helper
// ---------------------------------------------------------------------------
describe('translator-deepl-google: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return response on success', async () => {
    const client = { request: async () => ({ ok: true }) };
    const result = await requestWithTimeout(client, 'POST', '/test', {}, 5000);
    assert.deepEqual(result, { ok: true });
  });

  it('should throw TIMEOUT on AbortError', async () => {
    const client = {
      request: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    try {
      await requestWithTimeout(client, 'POST', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'TIMEOUT');
    }
  });

  it('should throw UPSTREAM_ERROR on other errors', async () => {
    const client = {
      request: async () => { throw new Error('Server down'); },
    };
    try {
      await requestWithTimeout(client, 'POST', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('Server down'));
    }
  });

  it('should pass signal to client', async () => {
    let receivedOpts = null;
    const client = {
      request: async (method, path, body, opts) => {
        receivedOpts = opts;
        return {};
      },
    };
    await requestWithTimeout(client, 'POST', '/test', {}, 5000);
    assert.ok(receivedOpts.signal);
    assert.ok(receivedOpts.signal instanceof AbortSignal);
  });
});

// ---------------------------------------------------------------------------
// 19. validate() export
// ---------------------------------------------------------------------------
describe('translator-deepl-google: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('bad'));
  });

  it('should reject missing action', () => {
    assert.equal(validate({}).valid, false);
  });

  it('should reject null params', () => {
    assert.equal(validate(null).valid, false);
  });

  it('should validate translate requires text', () => {
    assert.equal(validate({ action: 'translate', target_lang: 'de' }).valid, false);
  });

  it('should validate translate requires target_lang', () => {
    assert.equal(validate({ action: 'translate', text: 'Hello' }).valid, false);
  });

  it('should validate translate accepts valid params', () => {
    assert.equal(validate({ action: 'translate', text: 'Hello', target_lang: 'de' }).valid, true);
  });

  it('should validate translate rejects bad formality', () => {
    assert.equal(validate({ action: 'translate', text: 'Hello', target_lang: 'de', formality: 'ultra' }).valid, false);
  });

  it('should validate translate rejects bad source_lang', () => {
    assert.equal(validate({ action: 'translate', text: 'Hello', target_lang: 'de', source_lang: '123' }).valid, false);
  });

  it('should validate detect_language requires text', () => {
    assert.equal(validate({ action: 'detect_language' }).valid, false);
  });

  it('should validate detect_language accepts valid text', () => {
    assert.equal(validate({ action: 'detect_language', text: 'Hello' }).valid, true);
  });

  it('should validate translate_batch requires texts', () => {
    assert.equal(validate({ action: 'translate_batch', target_lang: 'de' }).valid, false);
  });

  it('should validate translate_batch requires target_lang', () => {
    assert.equal(validate({ action: 'translate_batch', texts: ['Hello'] }).valid, false);
  });

  it('should validate translate_batch accepts valid params', () => {
    assert.equal(validate({ action: 'translate_batch', texts: ['Hello'], target_lang: 'de' }).valid, true);
  });

  it('should validate translate_batch rejects bad source_lang', () => {
    assert.equal(validate({ action: 'translate_batch', texts: ['Hello'], target_lang: 'de', source_lang: '123' }).valid, false);
  });

  it('should validate get_usage requires nothing', () => {
    assert.equal(validate({ action: 'get_usage' }).valid, true);
  });

  it('should validate list_languages requires nothing', () => {
    assert.equal(validate({ action: 'list_languages' }).valid, true);
  });

  it('should validate get_glossaries requires nothing', () => {
    assert.equal(validate({ action: 'get_glossaries' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 20. meta export
// ---------------------------------------------------------------------------
describe('translator-deepl-google: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'translator-deepl-google');
  });

  it('should have version', () => {
    assert.ok(meta.version);
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('translation'));
  });

  it('should list all 6 actions', () => {
    assert.equal(meta.actions.length, 6);
    assert.ok(meta.actions.includes('translate'));
    assert.ok(meta.actions.includes('detect_language'));
    assert.ok(meta.actions.includes('translate_batch'));
    assert.ok(meta.actions.includes('get_usage'));
    assert.ok(meta.actions.includes('list_languages'));
    assert.ok(meta.actions.includes('get_glossaries'));
  });
});

// ---------------------------------------------------------------------------
// 21. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('translator-deepl-google: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleTranslateResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'translate', text: 'Hello', target_lang: 'de' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/translate');
  });

  it('should use gatewayClient for detect_language', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleDetectResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'detect_language', text: 'Bonjour' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/detect');
  });
});

// ---------------------------------------------------------------------------
// 22. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('translator-deepl-google: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });

  it('should mention translation in message', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.metadata.error.message.includes('translation'));
  });
});

// ---------------------------------------------------------------------------
// 23. Constants verification
// ---------------------------------------------------------------------------
describe('translator-deepl-google: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, [
      'translate', 'detect_language', 'translate_batch', 'get_usage', 'list_languages', 'get_glossaries',
    ]);
  });

  it('should have 27 supported languages', () => {
    assert.equal(Object.keys(SUPPORTED_LANGUAGES).length, 27);
  });

  it('should include en in supported languages', () => {
    assert.ok('en' in SUPPORTED_LANGUAGES);
    assert.equal(SUPPORTED_LANGUAGES.en, 'English');
  });

  it('should include all required language codes', () => {
    const required = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'sv', 'da', 'fi', 'nb', 'el', 'cs', 'ro', 'hu', 'tr', 'id', 'th', 'vi', 'uk'];
    for (const code of required) {
      assert.ok(code in SUPPORTED_LANGUAGES, `Missing language "${code}"`);
    }
  });

  it('should have correct VALID_FORMALITY', () => {
    assert.deepEqual(VALID_FORMALITY, ['default', 'more', 'less']);
  });

  it('should have correct max text length', () => {
    assert.equal(MAX_TEXT_LENGTH, 10000);
  });

  it('should have correct max detect text length', () => {
    assert.equal(MAX_DETECT_TEXT_LENGTH, 5000);
  });

  it('should have correct max batch items', () => {
    assert.equal(MAX_BATCH_ITEMS, 50);
  });

  it('should have correct max batch item length', () => {
    assert.equal(MAX_BATCH_ITEM_LENGTH, 5000);
  });
});
