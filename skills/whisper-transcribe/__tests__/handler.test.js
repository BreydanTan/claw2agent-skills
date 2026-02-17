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
  validateFile,
  validateResponseFormat,
  validateLanguage,
  validatePrompt,
  KNOWN_MODELS,
  VALID_ACTIONS,
  VALID_RESPONSE_FORMATS,
  DEFAULT_MODEL,
  DEFAULT_RESPONSE_FORMAT,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_PROMPT_LENGTH,
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
      request: async (_method, _path, _body, _opts) => requestResponse,
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
      request: async (_method, _path, _body, _opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample successful transcription response. */
const sampleTranscription = {
  text: 'Hello world, this is a test transcription.',
  language: 'en',
  duration: 5.2,
};

/** Sample successful translation response. */
const sampleTranslation = {
  text: 'Hello world, this is translated text.',
  language: 'fr',
  duration: 4.8,
};

/** Sample detect language response. */
const sampleDetectLanguage = {
  text: 'Bonjour le monde.',
  language: 'fr',
  duration: 3.1,
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('whisper-transcribe: action validation', () => {
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
    const result = await execute({ action: 'bad_action' }, {});
    for (const action of VALID_ACTIONS) {
      assert.ok(result.result.includes(action), `Error should mention "${action}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for API actions
// ---------------------------------------------------------------------------
describe('whisper-transcribe: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail transcribe without client', async () => {
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail translate without client', async () => {
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail detect_language without client', async () => {
    const result = await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should not require client for list_models', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_models');
  });

  it('should not require client for list_formats', async () => {
    const result = await execute({ action: 'list_formats' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_formats');
  });
});

// ---------------------------------------------------------------------------
// 3. list_models action (local, no client needed)
// ---------------------------------------------------------------------------
describe('whisper-transcribe: list_models', () => {
  beforeEach(() => {});

  it('should return list of known models', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_models');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.modelCount, KNOWN_MODELS.length);
    assert.ok(result.metadata.models.length > 0);
  });

  it('should include whisper-1 in models list', async () => {
    const result = await execute({ action: 'list_models' }, {});
    const whisperModel = result.metadata.models.find((m) => m.id === 'whisper-1');
    assert.ok(whisperModel, 'Should include whisper-1 in the models list');
    assert.equal(whisperModel.provider, 'OpenAI');
  });

  it('should include model details in result text', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.ok(result.result.includes('Whisper V2'));
    assert.ok(result.result.includes('whisper-1'));
    assert.ok(result.result.includes('OpenAI'));
  });

  it('should work without any context', async () => {
    const result = await execute({ action: 'list_models' }, undefined);
    assert.equal(result.metadata.success, true);
  });

  it('should include format and file size info in result', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.ok(result.result.includes('Formats:'));
    assert.ok(result.result.includes('Max File Size:'));
    assert.ok(result.result.includes('Audio Formats:'));
  });
});

// ---------------------------------------------------------------------------
// 4. list_formats action (local, no client needed)
// ---------------------------------------------------------------------------
describe('whisper-transcribe: list_formats', () => {
  beforeEach(() => {});

  it('should return list of supported formats', async () => {
    const result = await execute({ action: 'list_formats' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_formats');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.formatCount, 5);
  });

  it('should include all format names in result', async () => {
    const result = await execute({ action: 'list_formats' }, {});
    assert.ok(result.result.includes('json'));
    assert.ok(result.result.includes('text'));
    assert.ok(result.result.includes('srt'));
    assert.ok(result.result.includes('vtt'));
    assert.ok(result.result.includes('verbose_json'));
  });

  it('should include format descriptions', async () => {
    const result = await execute({ action: 'list_formats' }, {});
    assert.ok(result.result.includes('SubRip'));
    assert.ok(result.result.includes('WebVTT'));
    assert.ok(result.result.includes('Plain text'));
  });

  it('should work without any context', async () => {
    const result = await execute({ action: 'list_formats' }, undefined);
    assert.equal(result.metadata.success, true);
  });

  it('should include formats array in metadata', async () => {
    const result = await execute({ action: 'list_formats' }, {});
    assert.ok(Array.isArray(result.metadata.formats));
    assert.equal(result.metadata.formats.length, 5);
    const jsonFormat = result.metadata.formats.find((f) => f.format === 'json');
    assert.ok(jsonFormat);
    assert.ok(jsonFormat.description);
  });
});

// ---------------------------------------------------------------------------
// 5. transcribe action
// ---------------------------------------------------------------------------
describe('whisper-transcribe: transcribe', () => {
  beforeEach(() => {});

  it('should transcribe audio with valid file', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'transcribe');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.model, 'whisper-1');
    assert.equal(result.metadata.language, 'en');
    assert.equal(result.metadata.duration, 5.2);
    assert.equal(result.metadata.responseFormat, 'json');
    assert.ok(result.result.includes('Hello world'));
  });

  it('should use custom model', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', model: 'whisper-1' },
      ctx
    );
    assert.equal(result.metadata.model, 'whisper-1');
  });

  it('should accept custom response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', responseFormat: 'srt' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.responseFormat, 'srt');
  });

  it('should accept verbose_json response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', responseFormat: 'verbose_json' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.responseFormat, 'verbose_json');
  });

  it('should accept language parameter', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', language: 'fr' },
      ctx
    );
    assert.equal(result.metadata.success, true);
  });

  it('should accept prompt parameter', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', prompt: 'Technical discussion about AI' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(capturedBody.prompt, 'Technical discussion about AI');
  });

  it('should reject missing file', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute({ action: 'transcribe' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty file', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute({ action: 'transcribe', file: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only file', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute({ action: 'transcribe', file: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', responseFormat: 'xml' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid language code (3 letters)', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', language: 'eng' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject prompt exceeding max length', async () => {
    const ctx = mockContext(sampleTranscription);
    const longPrompt = 'x'.repeat(MAX_PROMPT_LENGTH + 1);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', prompt: longPrompt },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.ok(result.metadata.timestamp);
  });

  it('should include textLength in metadata', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.textLength, sampleTranscription.text.length);
  });

  it('should handle response with no duration', async () => {
    const ctx = mockContext({ text: 'No duration test.', language: 'en' });
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.duration, null);
  });

  it('should default to json response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.responseFormat, 'json');
  });

  it('should accept vtt response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', responseFormat: 'vtt' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.responseFormat, 'vtt');
  });

  it('should accept text response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', responseFormat: 'text' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.responseFormat, 'text');
  });

  it('should accept file path instead of URL', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', file: '/path/to/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
  });

  it('should handle empty text response', async () => {
    const ctx = mockContext({ language: 'en', duration: 1.0 });
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.textLength, 0);
  });

  it('should use auto language when none detected', async () => {
    const ctx = mockContext({ text: 'Hello.' });
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.language, 'auto');
  });
});

// ---------------------------------------------------------------------------
// 6. translate action
// ---------------------------------------------------------------------------
describe('whisper-transcribe: translate', () => {
  beforeEach(() => {});

  it('should translate audio with valid file', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'translate');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.targetLanguage, 'en');
    assert.equal(result.metadata.sourceLanguage, 'fr');
    assert.ok(result.result.includes('Translation Result'));
    assert.ok(result.result.includes('to English'));
  });

  it('should reject missing file for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute({ action: 'translate' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty file for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute({ action: 'translate', file: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include duration in translate metadata', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.duration, 4.8);
  });

  it('should always target English for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.targetLanguage, 'en');
  });

  it('should include textLength for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.textLength, sampleTranslation.text.length);
  });

  it('should use default model for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.model, 'whisper-1');
  });

  it('should accept custom model for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3', model: 'whisper-1' },
      ctx
    );
    assert.equal(result.metadata.model, 'whisper-1');
  });

  it('should handle unknown source language', async () => {
    const ctx = mockContext({ text: 'Translated text.', duration: 2.0 });
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.sourceLanguage, 'unknown');
  });

  it('should handle response with no duration for translate', async () => {
    const ctx = mockContext({ text: 'Translated.', language: 'de' });
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.duration, null);
  });
});

// ---------------------------------------------------------------------------
// 7. detect_language action
// ---------------------------------------------------------------------------
describe('whisper-transcribe: detect_language', () => {
  beforeEach(() => {});

  it('should detect language with valid file', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'detect_language');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.detectedLanguage, 'fr');
    assert.ok(result.result.includes('fr'));
  });

  it('should reject missing file for detect_language', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute({ action: 'detect_language' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should handle unknown language code', async () => {
    const ctx = mockContext({ text: 'Unknown.', language: 'xx' });
    const result = await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.detectedLanguage, 'xx');
  });

  it('should include model in detect_language metadata', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.model, 'whisper-1');
  });

  it('should include timestamp in detect_language metadata', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.ok(result.metadata.timestamp);
  });

  it('should handle missing language in response', async () => {
    const ctx = mockContext({ text: 'Some text.' });
    const result = await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.detectedLanguage, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// 8. Timeout handling
// ---------------------------------------------------------------------------
describe('whisper-transcribe: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on transcribe abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on translate abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on detect_language abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 9. Network error handling
// ---------------------------------------------------------------------------
describe('whisper-transcribe: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on transcribe failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on translate failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on detect_language failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 10. getClient helper
// ---------------------------------------------------------------------------
describe('whisper-transcribe: getClient', () => {
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
// 11. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('whisper-transcribe: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return error with correct code', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should return non-retriable error', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.error.retriable, false);
  });

  it('should include error message in result', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.result.includes('Provider client required'));
  });
});

// ---------------------------------------------------------------------------
// 12. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('whisper-transcribe: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should return configured timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 30000 } }), 30000);
  });

  it('should cap timeout at MAX_TIMEOUT_MS', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS);
  });

  it('should reject zero timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS);
  });

  it('should reject negative timeout', () => {
    assert.equal(resolveTimeout({ config: { timeoutMs: -1000 } }), DEFAULT_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// 13. redactSensitive
// ---------------------------------------------------------------------------
describe('whisper-transcribe: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: test_fake_key_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_fake_key_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: fakeBearerTokenForTesting123';
    const output = redactSensitive(input);
    assert.ok(!output.includes('fakeBearerTokenForTesting123'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: FakeAuthHeaderValue456';
    const output = redactSensitive(input);
    assert.ok(!output.includes('FakeAuthHeaderValue456'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Transcribed 42 seconds of audio in English';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should handle empty string', () => {
    assert.equal(redactSensitive(''), '');
  });
});

// ---------------------------------------------------------------------------
// 14. validateFile helper
// ---------------------------------------------------------------------------
describe('whisper-transcribe: validateFile', () => {
  beforeEach(() => {});

  it('should accept valid URL string', () => {
    const result = validateFile('https://example.com/audio.mp3');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'https://example.com/audio.mp3');
  });

  it('should accept valid file path', () => {
    const result = validateFile('/path/to/audio.mp3');
    assert.equal(result.valid, true);
    assert.equal(result.value, '/path/to/audio.mp3');
  });

  it('should trim whitespace', () => {
    const result = validateFile('  /path/to/audio.mp3  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, '/path/to/audio.mp3');
  });

  it('should reject null', () => {
    const result = validateFile(null);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('file'));
  });

  it('should reject undefined', () => {
    const result = validateFile(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateFile('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = validateFile('   ');
    assert.equal(result.valid, false);
  });

  it('should reject number input', () => {
    const result = validateFile(12345);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 15. validateResponseFormat helper
// ---------------------------------------------------------------------------
describe('whisper-transcribe: validateResponseFormat', () => {
  beforeEach(() => {});

  it('should default to json for undefined', () => {
    const result = validateResponseFormat(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'json');
  });

  it('should default to json for null', () => {
    const result = validateResponseFormat(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'json');
  });

  it('should accept json format', () => {
    const result = validateResponseFormat('json');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'json');
  });

  it('should accept text format', () => {
    const result = validateResponseFormat('text');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'text');
  });

  it('should accept srt format', () => {
    const result = validateResponseFormat('srt');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'srt');
  });

  it('should accept vtt format', () => {
    const result = validateResponseFormat('vtt');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'vtt');
  });

  it('should accept verbose_json format', () => {
    const result = validateResponseFormat('verbose_json');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'verbose_json');
  });

  it('should reject invalid format', () => {
    const result = validateResponseFormat('xml');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('xml'));
  });

  it('should reject number input', () => {
    const result = validateResponseFormat(123);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateLanguage helper
// ---------------------------------------------------------------------------
describe('whisper-transcribe: validateLanguage', () => {
  beforeEach(() => {});

  it('should return null value for undefined', () => {
    const result = validateLanguage(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should return null value for null', () => {
    const result = validateLanguage(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should accept valid 2-letter code', () => {
    const result = validateLanguage('en');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'en');
  });

  it('should normalize to lowercase', () => {
    const result = validateLanguage('EN');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'en');
  });

  it('should accept French', () => {
    const result = validateLanguage('fr');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'fr');
  });

  it('should reject 3-letter code', () => {
    const result = validateLanguage('eng');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('2-letter'));
  });

  it('should reject 1-letter code', () => {
    const result = validateLanguage('e');
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateLanguage('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = validateLanguage('   ');
    assert.equal(result.valid, false);
  });

  it('should trim language code', () => {
    const result = validateLanguage(' en ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'en');
  });

  it('should reject numeric language code', () => {
    const result = validateLanguage('12');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validatePrompt helper
// ---------------------------------------------------------------------------
describe('whisper-transcribe: validatePrompt', () => {
  beforeEach(() => {});

  it('should return null value for undefined', () => {
    const result = validatePrompt(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should return null value for null', () => {
    const result = validatePrompt(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should accept valid prompt', () => {
    const result = validatePrompt('Technical discussion about AI');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Technical discussion about AI');
  });

  it('should trim whitespace', () => {
    const result = validatePrompt('  Hello world  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'Hello world');
  });

  it('should return null for empty/whitespace prompt', () => {
    const result = validatePrompt('   ');
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  });

  it('should reject prompt exceeding max length', () => {
    const result = validatePrompt('x'.repeat(MAX_PROMPT_LENGTH + 1));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
    assert.ok(result.error.includes(String(MAX_PROMPT_LENGTH)));
  });

  it('should accept prompt at exactly max length', () => {
    const result = validatePrompt('x'.repeat(MAX_PROMPT_LENGTH));
    assert.equal(result.valid, true);
    assert.equal(result.value.length, MAX_PROMPT_LENGTH);
  });

  it('should reject non-string prompt', () => {
    const result = validatePrompt(12345);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('string'));
  });
});

// ---------------------------------------------------------------------------
// 18. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('whisper-transcribe: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (_method, path, _body, _opts) => {
          calledPath = path;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/audio/transcriptions');
  });

  it('should use gatewayClient for translate when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (_method, path, _body, _opts) => {
          calledPath = path;
          return sampleTranslation;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/audio/translations');
  });
});

// ---------------------------------------------------------------------------
// 19. Endpoint routing verification
// ---------------------------------------------------------------------------
describe('whisper-transcribe: endpoint routing', () => {
  beforeEach(() => {});

  it('should call /audio/transcriptions for transcribe', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, _body, _opts) => {
          calledMethod = method;
          calledPath = path;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/audio/transcriptions');
  });

  it('should call /audio/translations for translate', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_method, path, _body, _opts) => {
          calledPath = path;
          return sampleTranslation;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(calledPath, '/audio/translations');
  });

  it('should call /audio/transcriptions for detect_language', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_method, path, _body, _opts) => {
          calledPath = path;
          return sampleDetectLanguage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(calledPath, '/audio/transcriptions');
  });

  it('should send POST method for all API actions', async () => {
    const methods = [];
    const ctx = {
      providerClient: {
        request: async (method, _path, _body, _opts) => {
          methods.push(method);
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'transcribe', file: 'https://example.com/audio.mp3' }, ctx);
    await execute({ action: 'translate', file: 'https://example.com/audio.mp3' }, ctx);
    await execute({ action: 'detect_language', file: 'https://example.com/audio.mp3' }, ctx);
    assert.equal(methods.length, 3);
    for (const method of methods) {
      assert.equal(method, 'POST');
    }
  });
});

// ---------------------------------------------------------------------------
// 20. Request body verification
// ---------------------------------------------------------------------------
describe('whisper-transcribe: request body', () => {
  beforeEach(() => {});

  it('should include model in request body', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.model, 'whisper-1');
  });

  it('should include file in request body', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.file, 'https://example.com/audio.mp3');
  });

  it('should include response_format in request body', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', responseFormat: 'srt' },
      ctx
    );
    assert.equal(capturedBody.response_format, 'srt');
  });

  it('should include language in request body when specified', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', language: 'fr' },
      ctx
    );
    assert.equal(capturedBody.language, 'fr');
  });

  it('should not include language when not specified', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.language, undefined);
  });

  it('should include prompt in request body when specified', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3', prompt: 'AI discussion' },
      ctx
    );
    assert.equal(capturedBody.prompt, 'AI discussion');
  });

  it('should not include prompt when not specified', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.prompt, undefined);
  });

  it('should use verbose_json format for detect_language', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleDetectLanguage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'detect_language', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.response_format, 'verbose_json');
  });

  it('should only include model and file for translate body', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          capturedBody = body;
          return sampleTranslation;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'translate', file: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.model, 'whisper-1');
    assert.equal(capturedBody.file, 'https://example.com/audio.mp3');
    assert.equal(Object.keys(capturedBody).length, 2);
  });
});

// ---------------------------------------------------------------------------
// 21. validate function
// ---------------------------------------------------------------------------
describe('whisper-transcribe: validate', () => {
  beforeEach(() => {});

  it('should accept valid action', () => {
    const result = validate({ action: 'transcribe' });
    assert.equal(result.valid, true);
  });

  it('should reject invalid action', () => {
    const result = validate({ action: 'invalid' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('invalid'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 22. meta export
// ---------------------------------------------------------------------------
describe('whisper-transcribe: meta', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'whisper-transcribe');
  });

  it('should have correct layer', () => {
    assert.equal(meta.layer, 'L1');
  });

  it('should have correct category', () => {
    assert.equal(meta.category, 'AI');
  });

  it('should list all actions', () => {
    assert.deepEqual(meta.actions, VALID_ACTIONS);
  });
});

// ---------------------------------------------------------------------------
// 23. Constants exports
// ---------------------------------------------------------------------------
describe('whisper-transcribe: constants', () => {
  beforeEach(() => {});

  it('should export VALID_ACTIONS with correct count', () => {
    assert.equal(VALID_ACTIONS.length, 5);
    assert.ok(VALID_ACTIONS.includes('transcribe'));
    assert.ok(VALID_ACTIONS.includes('translate'));
    assert.ok(VALID_ACTIONS.includes('detect_language'));
    assert.ok(VALID_ACTIONS.includes('list_models'));
    assert.ok(VALID_ACTIONS.includes('list_formats'));
  });

  it('should export VALID_RESPONSE_FORMATS', () => {
    assert.equal(VALID_RESPONSE_FORMATS.length, 5);
    assert.ok(VALID_RESPONSE_FORMATS.includes('json'));
    assert.ok(VALID_RESPONSE_FORMATS.includes('text'));
    assert.ok(VALID_RESPONSE_FORMATS.includes('srt'));
    assert.ok(VALID_RESPONSE_FORMATS.includes('vtt'));
    assert.ok(VALID_RESPONSE_FORMATS.includes('verbose_json'));
  });

  it('should export DEFAULT_MODEL as whisper-1', () => {
    assert.equal(DEFAULT_MODEL, 'whisper-1');
  });

  it('should export DEFAULT_RESPONSE_FORMAT as json', () => {
    assert.equal(DEFAULT_RESPONSE_FORMAT, 'json');
  });

  it('should export DEFAULT_TIMEOUT_MS', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 60000);
  });

  it('should export MAX_TIMEOUT_MS', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });

  it('should export MAX_PROMPT_LENGTH as 500', () => {
    assert.equal(MAX_PROMPT_LENGTH, 500);
  });

  it('should export KNOWN_MODELS with whisper-1', () => {
    const whisper = KNOWN_MODELS.find((m) => m.id === 'whisper-1');
    assert.ok(whisper);
    assert.equal(whisper.provider, 'OpenAI');
    assert.equal(whisper.maxFileSizeMB, 25);
  });
});
