import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  redactSensitive,
  requestWithTimeout,
  isValidUrl,
  validateAudioInput,
  validateResponseFormat,
  validateGranularity,
  validateLanguage,
  KNOWN_MODELS,
  SUPPORTED_LANGUAGES,
  VALID_ACTIONS,
  VALID_RESPONSE_FORMATS,
  VALID_GRANULARITIES,
  DEFAULT_MODEL,
  DEFAULT_RESPONSE_FORMAT,
  DEFAULT_GRANULARITY,
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
      request: async (_method, _path, _body) => requestResponse,
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
      request: async (_method, _path, opts) => {
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
  text: 'Hello world, this is a translated text.',
  language: 'fr',
  duration: 4.8,
};

/** Sample detect language response. */
const sampleDetectLanguage = {
  text: 'Bonjour le monde.',
  language: 'fr',
  duration: 3.1,
};

/** Sample transcription with timestamps (segment granularity). */
const sampleTimestampSegment = {
  text: 'Hello world. How are you?',
  language: 'en',
  duration: 6.0,
  segments: [
    { start: 0.0, end: 2.5, text: 'Hello world.' },
    { start: 2.5, end: 6.0, text: 'How are you?' },
  ],
  words: [],
};

/** Sample transcription with timestamps (word granularity). */
const sampleTimestampWord = {
  text: 'Hello world.',
  language: 'en',
  duration: 2.5,
  segments: [],
  words: [
    { word: 'Hello', start: 0.0, end: 1.0 },
    { word: 'world.', start: 1.0, end: 2.5 },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('speech-to-text: action validation', () => {
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
describe('speech-to-text: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail transcribe without client', async () => {
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail translate without client', async () => {
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail detect_language without client', async () => {
    const result = await execute(
      { action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail transcribe_with_timestamps without client', async () => {
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should not require client for list_languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_languages');
  });

  it('should not require client for list_models', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_models');
  });
});

// ---------------------------------------------------------------------------
// 3. list_models action (local, no client needed)
// ---------------------------------------------------------------------------
describe('speech-to-text: list_models', () => {
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

  it('should include format and timestamp info in result', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.ok(result.result.includes('Formats:'));
    assert.ok(result.result.includes('Timestamps:'));
    assert.ok(result.result.includes('Max File Size:'));
  });
});

// ---------------------------------------------------------------------------
// 4. list_languages action (local, no client needed)
// ---------------------------------------------------------------------------
describe('speech-to-text: list_languages', () => {
  beforeEach(() => {});

  it('should return list of supported languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_languages');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.languageCount, SUPPORTED_LANGUAGES.length);
    assert.ok(result.metadata.languages.length > 0);
  });

  it('should include English in languages list', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    const en = result.metadata.languages.find((l) => l.code === 'en');
    assert.ok(en, 'Should include English in the languages list');
    assert.equal(en.name, 'English');
  });

  it('should include multiple common languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.ok(result.result.includes('English'));
    assert.ok(result.result.includes('French'));
    assert.ok(result.result.includes('German'));
    assert.ok(result.result.includes('Spanish'));
    assert.ok(result.result.includes('Japanese'));
    assert.ok(result.result.includes('Chinese'));
  });

  it('should work without any context', async () => {
    const result = await execute({ action: 'list_languages' }, undefined);
    assert.equal(result.metadata.success, true);
  });

  it('should include language codes in result', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.ok(result.result.includes('(en)'));
    assert.ok(result.result.includes('(fr)'));
    assert.ok(result.result.includes('(de)'));
  });
});

// ---------------------------------------------------------------------------
// 5. transcribe action
// ---------------------------------------------------------------------------
describe('speech-to-text: transcribe', () => {
  beforeEach(() => {});

  it('should transcribe audio with valid audioUrl', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
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

  it('should transcribe audio with audioData', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioData: 'base64encodedaudiodata' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'transcribe');
    assert.ok(result.result.includes('Hello world'));
  });

  it('should use custom model', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', model: 'whisper-1' },
      ctx
    );
    assert.equal(result.metadata.model, 'whisper-1');
  });

  it('should accept custom response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', responseFormat: 'srt' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.responseFormat, 'srt');
  });

  it('should accept language parameter', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', language: 'fr' },
      ctx
    );
    assert.equal(result.metadata.success, true);
  });

  it('should accept prompt parameter', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', prompt: 'Technical discussion about AI' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(capturedBody.prompt, 'Technical discussion about AI');
  });

  it('should reject missing audio input', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute({ action: 'transcribe' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_AUDIO_INPUT');
  });

  it('should reject invalid audioUrl', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'not-a-url' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_AUDIO_INPUT');
  });

  it('should reject ftp audioUrl', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'ftp://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_AUDIO_INPUT');
  });

  it('should reject invalid response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', responseFormat: 'xml' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_RESPONSE_FORMAT');
  });

  it('should reject invalid language code', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', language: 'zz' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_LANGUAGE');
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.ok(result.metadata.timestamp);
  });

  it('should include textLength in metadata', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.textLength, sampleTranscription.text.length);
  });

  it('should handle response with no duration', async () => {
    const ctx = mockContext({ text: 'No duration test.', language: 'en' });
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.duration, null);
  });

  it('should default to json response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.responseFormat, 'json');
  });

  it('should accept vtt response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', responseFormat: 'vtt' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.responseFormat, 'vtt');
  });

  it('should accept text response format', async () => {
    const ctx = mockContext(sampleTranscription);
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', responseFormat: 'text' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.responseFormat, 'text');
  });
});

// ---------------------------------------------------------------------------
// 6. translate action
// ---------------------------------------------------------------------------
describe('speech-to-text: translate', () => {
  beforeEach(() => {});

  it('should translate audio with valid audioUrl', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
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

  it('should translate audio with audioData', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioData: 'base64audiodata' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'translate');
  });

  it('should reject missing audio input for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute({ action: 'translate' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_AUDIO_INPUT');
  });

  it('should reject invalid audioUrl for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioUrl: 'bad-url' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_AUDIO_INPUT');
  });

  it('should reject invalid response format for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3', responseFormat: 'pdf' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_RESPONSE_FORMAT');
  });

  it('should include duration in translate metadata', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.duration, 4.8);
  });

  it('should always target English for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.targetLanguage, 'en');
  });

  it('should include textLength for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.textLength, sampleTranslation.text.length);
  });

  it('should use default model for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.model, 'whisper-1');
  });

  it('should accept custom model for translate', async () => {
    const ctx = mockContext(sampleTranslation);
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3', model: 'whisper-1' },
      ctx
    );
    assert.equal(result.metadata.model, 'whisper-1');
  });
});

// ---------------------------------------------------------------------------
// 7. detect_language action
// ---------------------------------------------------------------------------
describe('speech-to-text: detect_language', () => {
  beforeEach(() => {});

  it('should detect language with valid audioUrl', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute(
      { action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'detect_language');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.detectedLanguage, 'fr');
    assert.equal(result.metadata.languageName, 'French');
    assert.ok(result.result.includes('French'));
  });

  it('should detect language with audioData', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute(
      { action: 'detect_language', audioData: 'base64audiodata' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.detectedLanguage, 'fr');
  });

  it('should reject missing audio input for detect_language', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute({ action: 'detect_language' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_AUDIO_INPUT');
  });

  it('should handle unknown language code', async () => {
    const ctx = mockContext({ text: 'Unknown.', language: 'xx' });
    const result = await execute(
      { action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.detectedLanguage, 'xx');
    assert.equal(result.metadata.languageName, 'xx');
  });

  it('should include model in detect_language metadata', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute(
      { action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.model, 'whisper-1');
  });

  it('should include timestamp in detect_language metadata', async () => {
    const ctx = mockContext(sampleDetectLanguage);
    const result = await execute(
      { action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 8. transcribe_with_timestamps action
// ---------------------------------------------------------------------------
describe('speech-to-text: transcribe_with_timestamps', () => {
  beforeEach(() => {});

  it('should transcribe with segment timestamps', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'transcribe_with_timestamps');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.granularity, 'segment');
    assert.equal(result.metadata.segmentCount, 2);
    assert.ok(result.result.includes('Segments:'));
    assert.ok(result.result.includes('Hello world.'));
  });

  it('should transcribe with word timestamps', async () => {
    const ctx = mockContext(sampleTimestampWord);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3', granularity: 'word' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.granularity, 'word');
    assert.equal(result.metadata.wordCount, 2);
    assert.ok(result.result.includes('Words:'));
    assert.ok(result.result.includes('Hello'));
  });

  it('should transcribe with timestamps using audioData', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioData: 'base64audiodata' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'transcribe_with_timestamps');
  });

  it('should reject invalid granularity', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3', granularity: 'phoneme' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_GRANULARITY');
  });

  it('should reject missing audio input for timestamps', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute({ action: 'transcribe_with_timestamps' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_AUDIO_INPUT');
  });

  it('should reject invalid language for timestamps', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3', language: 'xyz' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_LANGUAGE');
  });

  it('should default granularity to segment', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.granularity, 'segment');
  });

  it('should accept language for timestamps', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3', language: 'en' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.language, 'en');
  });

  it('should include duration in timestamp metadata', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.duration, 6.0);
  });

  it('should include text in timestamp result', async () => {
    const ctx = mockContext(sampleTimestampSegment);
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.ok(result.result.includes('Hello world. How are you?'));
  });
});

// ---------------------------------------------------------------------------
// 9. Timeout handling
// ---------------------------------------------------------------------------
describe('speech-to-text: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on transcribe abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on translate abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on detect_language abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on transcribe_with_timestamps abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 10. Network error handling
// ---------------------------------------------------------------------------
describe('speech-to-text: network errors', () => {
  beforeEach(() => {});

  it('should return REQUEST_ERROR on transcribe failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should return REQUEST_ERROR on translate failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should return REQUEST_ERROR on detect_language failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute(
      { action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should return REQUEST_ERROR on transcribe_with_timestamps failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 11. getClient helper
// ---------------------------------------------------------------------------
describe('speech-to-text: getClient', () => {
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
describe('speech-to-text: redactSensitive', () => {
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
// 13. isValidUrl helper
// ---------------------------------------------------------------------------
describe('speech-to-text: isValidUrl', () => {
  beforeEach(() => {});

  it('should accept valid https URL', () => {
    assert.equal(isValidUrl('https://example.com/audio.mp3'), true);
  });

  it('should accept valid http URL', () => {
    assert.equal(isValidUrl('http://example.com/audio.wav'), true);
  });

  it('should reject ftp URL', () => {
    assert.equal(isValidUrl('ftp://example.com/audio.mp3'), false);
  });

  it('should reject empty string', () => {
    assert.equal(isValidUrl(''), false);
  });

  it('should reject non-URL string', () => {
    assert.equal(isValidUrl('not a url'), false);
  });

  it('should reject null', () => {
    assert.equal(isValidUrl(null), false);
  });

  it('should reject undefined', () => {
    assert.equal(isValidUrl(undefined), false);
  });

  it('should reject whitespace only', () => {
    assert.equal(isValidUrl('   '), false);
  });
});

// ---------------------------------------------------------------------------
// 14. validateAudioInput helper
// ---------------------------------------------------------------------------
describe('speech-to-text: validateAudioInput', () => {
  beforeEach(() => {});

  it('should accept valid audioUrl', () => {
    const result = validateAudioInput({ audioUrl: 'https://example.com/audio.mp3' });
    assert.equal(result.valid, true);
    assert.equal(result.source, 'url');
    assert.equal(result.value, 'https://example.com/audio.mp3');
  });

  it('should accept valid audioData', () => {
    const result = validateAudioInput({ audioData: 'base64encodeddata' });
    assert.equal(result.valid, true);
    assert.equal(result.source, 'data');
    assert.equal(result.value, 'base64encodeddata');
  });

  it('should prefer audioUrl over audioData', () => {
    const result = validateAudioInput({
      audioUrl: 'https://example.com/audio.mp3',
      audioData: 'base64data',
    });
    assert.equal(result.source, 'url');
  });

  it('should reject invalid audioUrl', () => {
    const result = validateAudioInput({ audioUrl: 'not-a-url' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('audioUrl'));
  });

  it('should reject empty audioData', () => {
    const result = validateAudioInput({ audioData: '' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('audioData'));
  });

  it('should reject whitespace-only audioData', () => {
    const result = validateAudioInput({ audioData: '   ' });
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validateAudioInput(null);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('required'));
  });

  it('should reject empty params', () => {
    const result = validateAudioInput({});
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('required'));
  });

  it('should reject non-string audioData', () => {
    const result = validateAudioInput({ audioData: 12345 });
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 15. validateResponseFormat helper
// ---------------------------------------------------------------------------
describe('speech-to-text: validateResponseFormat', () => {
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
// 16. validateGranularity helper
// ---------------------------------------------------------------------------
describe('speech-to-text: validateGranularity', () => {
  beforeEach(() => {});

  it('should default to segment for undefined', () => {
    const result = validateGranularity(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'segment');
  });

  it('should default to segment for null', () => {
    const result = validateGranularity(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'segment');
  });

  it('should accept word granularity', () => {
    const result = validateGranularity('word');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'word');
  });

  it('should accept segment granularity', () => {
    const result = validateGranularity('segment');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'segment');
  });

  it('should reject invalid granularity', () => {
    const result = validateGranularity('phoneme');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('phoneme'));
  });

  it('should reject number input', () => {
    const result = validateGranularity(42);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validateLanguage helper
// ---------------------------------------------------------------------------
describe('speech-to-text: validateLanguage', () => {
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

  it('should accept valid language code', () => {
    const result = validateLanguage('en');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'en');
  });

  it('should accept valid language code with case normalization', () => {
    const result = validateLanguage('EN');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'en');
  });

  it('should accept French', () => {
    const result = validateLanguage('fr');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'fr');
  });

  it('should reject unsupported language code', () => {
    const result = validateLanguage('zz');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('zz'));
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
});

// ---------------------------------------------------------------------------
// 18. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('speech-to-text: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (_method, path, _body) => {
          calledPath = path;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/audio/transcriptions');
  });

  it('should use gatewayClient for translate when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (_method, path, _body) => {
          calledPath = path;
          return sampleTranslation;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/audio/translations');
  });
});

// ---------------------------------------------------------------------------
// 19. Endpoint routing verification
// ---------------------------------------------------------------------------
describe('speech-to-text: endpoint routing', () => {
  beforeEach(() => {});

  it('should call /audio/transcriptions for transcribe', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/audio/transcriptions');
  });

  it('should call /audio/translations for translate', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_method, path) => {
          calledPath = path;
          return sampleTranslation;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'translate', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(calledPath, '/audio/translations');
  });

  it('should call /audio/transcriptions for detect_language', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_method, path) => {
          calledPath = path;
          return sampleDetectLanguage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(calledPath, '/audio/transcriptions');
  });

  it('should call /audio/transcriptions for transcribe_with_timestamps', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (_method, path) => {
          calledPath = path;
          return sampleTimestampSegment;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(calledPath, '/audio/transcriptions');
  });

  it('should send POST method for all API actions', async () => {
    const methods = [];
    const ctx = {
      providerClient: {
        request: async (method, _path) => {
          methods.push(method);
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' }, ctx);
    await execute({ action: 'translate', audioUrl: 'https://example.com/audio.mp3' }, ctx);
    await execute({ action: 'detect_language', audioUrl: 'https://example.com/audio.mp3' }, ctx);
    await execute({ action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' }, ctx);
    assert.equal(methods.length, 4);
    for (const method of methods) {
      assert.equal(method, 'POST');
    }
  });
});

// ---------------------------------------------------------------------------
// 20. Request body verification
// ---------------------------------------------------------------------------
describe('speech-to-text: request body', () => {
  beforeEach(() => {});

  it('should include model in request body', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.model, 'whisper-1');
  });

  it('should include file for audioUrl', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.file, 'https://example.com/audio.mp3');
    assert.equal(capturedBody.file_data, undefined);
  });

  it('should include file_data for audioData', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', audioData: 'base64encodeddata' },
      ctx
    );
    assert.equal(capturedBody.file_data, 'base64encodeddata');
    assert.equal(capturedBody.file, undefined);
  });

  it('should include response_format in request body', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', responseFormat: 'srt' },
      ctx
    );
    assert.equal(capturedBody.response_format, 'srt');
  });

  it('should include language in request body when specified', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3', language: 'fr' },
      ctx
    );
    assert.equal(capturedBody.language, 'fr');
  });

  it('should not include language when not specified', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTranscription;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.language, undefined);
  });

  it('should include verbose_json format for timestamps', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTimestampSegment;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3' },
      ctx
    );
    assert.equal(capturedBody.response_format, 'verbose_json');
  });

  it('should include timestamp_granularities for timestamps', async () => {
    let capturedBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body) => {
          capturedBody = body;
          return sampleTimestampWord;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'transcribe_with_timestamps', audioUrl: 'https://example.com/audio.mp3', granularity: 'word' },
      ctx
    );
    assert.deepEqual(capturedBody.timestamp_granularities, ['word']);
  });
});

// ---------------------------------------------------------------------------
// 21. Constants exports
// ---------------------------------------------------------------------------
describe('speech-to-text: constants', () => {
  beforeEach(() => {});

  it('should export VALID_ACTIONS with correct count', () => {
    assert.equal(VALID_ACTIONS.length, 6);
    assert.ok(VALID_ACTIONS.includes('transcribe'));
    assert.ok(VALID_ACTIONS.includes('translate'));
    assert.ok(VALID_ACTIONS.includes('detect_language'));
    assert.ok(VALID_ACTIONS.includes('list_languages'));
    assert.ok(VALID_ACTIONS.includes('list_models'));
    assert.ok(VALID_ACTIONS.includes('transcribe_with_timestamps'));
  });

  it('should export VALID_RESPONSE_FORMATS', () => {
    assert.equal(VALID_RESPONSE_FORMATS.length, 4);
    assert.ok(VALID_RESPONSE_FORMATS.includes('json'));
    assert.ok(VALID_RESPONSE_FORMATS.includes('text'));
    assert.ok(VALID_RESPONSE_FORMATS.includes('srt'));
    assert.ok(VALID_RESPONSE_FORMATS.includes('vtt'));
  });

  it('should export VALID_GRANULARITIES', () => {
    assert.equal(VALID_GRANULARITIES.length, 2);
    assert.ok(VALID_GRANULARITIES.includes('word'));
    assert.ok(VALID_GRANULARITIES.includes('segment'));
  });

  it('should export DEFAULT_MODEL as whisper-1', () => {
    assert.equal(DEFAULT_MODEL, 'whisper-1');
  });

  it('should export DEFAULT_RESPONSE_FORMAT as json', () => {
    assert.equal(DEFAULT_RESPONSE_FORMAT, 'json');
  });

  it('should export DEFAULT_GRANULARITY as segment', () => {
    assert.equal(DEFAULT_GRANULARITY, 'segment');
  });

  it('should export DEFAULT_TIMEOUT_MS', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 60000);
  });

  it('should export MAX_TIMEOUT_MS', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });

  it('should export SUPPORTED_LANGUAGES with many entries', () => {
    assert.ok(SUPPORTED_LANGUAGES.length > 50);
  });

  it('should export KNOWN_MODELS with whisper-1', () => {
    const whisper = KNOWN_MODELS.find((m) => m.id === 'whisper-1');
    assert.ok(whisper);
    assert.equal(whisper.provider, 'OpenAI');
    assert.ok(whisper.supportsTimestamps);
  });
});
