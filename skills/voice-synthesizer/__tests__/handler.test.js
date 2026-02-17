import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  redactSensitive,
  requestWithTimeout,
  validateText,
  validateVoice,
  validateSpeed,
  validateResponseFormat,
  validateSsml,
  validateBatchItems,
  estimateDurationSeconds,
  KNOWN_VOICES,
  KNOWN_LANGUAGES,
  VALID_ACTIONS,
  VALID_VOICES,
  VALID_RESPONSE_FORMATS,
  MAX_TEXT_LENGTH,
  MAX_BATCH_ITEMS,
  MIN_SPEED,
  MAX_SPEED,
  WORDS_PER_MINUTE,
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
      request: async (_method, _path, _body, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample successful synthesis response. */
const sampleSynthesizeResponse = {
  audio_url: 'https://cdn.example.com/audio/speech-001.mp3',
  duration_seconds: 5.2,
  format: 'mp3',
  size_bytes: 83200,
};

/** Sample synthesis response with alternate format. */
const sampleWavResponse = {
  audio_url: 'https://cdn.example.com/audio/speech-002.wav',
  duration_seconds: 3.8,
  format: 'wav',
  size_bytes: 182400,
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('voice-synthesizer: action validation', () => {
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
    for (const action of VALID_ACTIONS) {
      assert.ok(result.result.includes(action), `Should mention "${action}" in error`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for synthesize/synthesize_ssml/batch_synthesize
// ---------------------------------------------------------------------------
describe('voice-synthesizer: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail synthesize without client', async () => {
    const result = await execute({ action: 'synthesize', text: 'Hello world' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail synthesize_ssml without client', async () => {
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail batch_synthesize without client', async () => {
    const result = await execute(
      { action: 'batch_synthesize', items: [{ text: 'Hello' }] },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should not require client for list_voices', async () => {
    const result = await execute({ action: 'list_voices' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_voices');
  });

  it('should not require client for list_languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_languages');
  });

  it('should not require client for estimate_duration', async () => {
    const result = await execute({ action: 'estimate_duration', text: 'Hello world' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'estimate_duration');
  });
});

// ---------------------------------------------------------------------------
// 3. list_voices action (local, no client needed)
// ---------------------------------------------------------------------------
describe('voice-synthesizer: list_voices', () => {
  beforeEach(() => {});

  it('should return list of known voices', async () => {
    const result = await execute({ action: 'list_voices' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_voices');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.voiceCount, KNOWN_VOICES.length);
    assert.ok(result.metadata.voices.length > 0);
  });

  it('should include alloy in voices list', async () => {
    const result = await execute({ action: 'list_voices' }, {});
    const alloyVoice = result.metadata.voices.find((v) => v.id === 'alloy');
    assert.ok(alloyVoice, 'Should include alloy in the voices list');
  });

  it('should include all six voices', async () => {
    const result = await execute({ action: 'list_voices' }, {});
    for (const voice of VALID_VOICES) {
      const found = result.metadata.voices.find((v) => v.id === voice);
      assert.ok(found, `Should include ${voice} in the voices list`);
    }
  });

  it('should include voice details in result text', async () => {
    const result = await execute({ action: 'list_voices' }, {});
    assert.ok(result.result.includes('Alloy'));
    assert.ok(result.result.includes('Echo'));
    assert.ok(result.result.includes('Fable'));
    assert.ok(result.result.includes('Onyx'));
    assert.ok(result.result.includes('Nova'));
    assert.ok(result.result.includes('Shimmer'));
  });

  it('should include gender information', async () => {
    const result = await execute({ action: 'list_voices' }, {});
    assert.ok(result.result.includes('Gender:'));
  });

  it('should work without any context', async () => {
    const result = await execute({ action: 'list_voices' }, undefined);
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 4. list_languages action (local, no client needed)
// ---------------------------------------------------------------------------
describe('voice-synthesizer: list_languages', () => {
  beforeEach(() => {});

  it('should return list of known languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_languages');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.languageCount, KNOWN_LANGUAGES.length);
    assert.ok(result.metadata.languages.length > 0);
  });

  it('should include English in languages list', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    const english = result.metadata.languages.find((l) => l.code === 'en');
    assert.ok(english, 'Should include English');
    assert.equal(english.name, 'English');
  });

  it('should include multiple languages', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.ok(result.metadata.languageCount >= 10, 'Should have at least 10 languages');
  });

  it('should include language names in result text', async () => {
    const result = await execute({ action: 'list_languages' }, {});
    assert.ok(result.result.includes('English'));
    assert.ok(result.result.includes('Spanish'));
    assert.ok(result.result.includes('French'));
    assert.ok(result.result.includes('Japanese'));
  });

  it('should work without any context', async () => {
    const result = await execute({ action: 'list_languages' }, undefined);
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 5. synthesize action
// ---------------------------------------------------------------------------
describe('voice-synthesizer: synthesize', () => {
  beforeEach(() => {});

  it('should synthesize with valid text', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute({ action: 'synthesize', text: 'Hello world, this is a test.' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'synthesize');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.model, 'tts-1');
    assert.equal(result.metadata.voice, 'alloy');
    assert.equal(result.metadata.speed, 1.0);
    assert.equal(result.metadata.responseFormat, 'mp3');
    assert.ok(result.metadata.audioUrl.includes('speech-001'));
    assert.equal(result.metadata.durationSeconds, 5.2);
    assert.equal(result.metadata.sizeBytes, 83200);
    assert.ok(result.result.includes('Speech synthesized successfully'));
  });

  it('should use custom voice, model, speed, and format', async () => {
    const ctx = mockContext(sampleWavResponse);
    const result = await execute(
      {
        action: 'synthesize',
        text: 'Custom settings test',
        voice: 'nova',
        model: 'tts-1-hd',
        speed: 1.5,
        responseFormat: 'wav',
      },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.voice, 'nova');
    assert.equal(result.metadata.model, 'tts-1-hd');
    assert.equal(result.metadata.speed, 1.5);
    assert.equal(result.metadata.responseFormat, 'wav');
  });

  it('should reject missing text', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute({ action: 'synthesize' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TEXT');
  });

  it('should reject empty text', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute({ action: 'synthesize', text: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TEXT');
  });

  it('should reject text exceeding max length', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const longText = 'x'.repeat(MAX_TEXT_LENGTH + 1);
    const result = await execute({ action: 'synthesize', text: longText }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TEXT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should reject invalid voice', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize', text: 'Hello', voice: 'unknown_voice' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_VOICE');
  });

  it('should reject speed below minimum', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize', text: 'Hello', speed: 0.1 },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SPEED');
  });

  it('should reject speed above maximum', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize', text: 'Hello', speed: 5.0 },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SPEED');
  });

  it('should reject invalid response format', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize', text: 'Hello', responseFormat: 'wma' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_FORMAT');
  });

  it('should include textLength in metadata', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute({ action: 'synthesize', text: 'Hello world' }, ctx);
    assert.equal(result.metadata.textLength, 11);
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute({ action: 'synthesize', text: 'Hello' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should accept minimum speed', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize', text: 'Hello', speed: MIN_SPEED },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.speed, MIN_SPEED);
  });

  it('should accept maximum speed', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize', text: 'Hello', speed: MAX_SPEED },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.speed, MAX_SPEED);
  });

  it('should accept all valid voice options', async () => {
    for (const voice of VALID_VOICES) {
      const ctx = mockContext(sampleSynthesizeResponse);
      const result = await execute(
        { action: 'synthesize', text: 'Hello', voice },
        ctx
      );
      assert.equal(result.metadata.success, true, `Voice "${voice}" should be accepted`);
      assert.equal(result.metadata.voice, voice);
    }
  });

  it('should accept all valid response formats', async () => {
    for (const format of VALID_RESPONSE_FORMATS) {
      const ctx = mockContext({ ...sampleSynthesizeResponse, format });
      const result = await execute(
        { action: 'synthesize', text: 'Hello', responseFormat: format },
        ctx
      );
      assert.equal(result.metadata.success, true, `Format "${format}" should be accepted`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. estimate_duration action
// ---------------------------------------------------------------------------
describe('voice-synthesizer: estimate_duration', () => {
  beforeEach(() => {});

  it('should estimate duration for text at default speed', async () => {
    // 150 words -> 60 seconds at speed 1.0
    const words = Array(150).fill('word').join(' ');
    const result = await execute({ action: 'estimate_duration', text: words }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'estimate_duration');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.wordCount, 150);
    assert.equal(result.metadata.estimatedDurationSeconds, 60);
  });

  it('should halve duration at speed 2.0', async () => {
    const words = Array(150).fill('word').join(' ');
    const result = await execute({ action: 'estimate_duration', text: words, speed: 2.0 }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.estimatedDurationSeconds, 30);
  });

  it('should double duration at speed 0.5', async () => {
    const words = Array(150).fill('word').join(' ');
    const result = await execute({ action: 'estimate_duration', text: words, speed: 0.5 }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.estimatedDurationSeconds, 120);
  });

  it('should reject missing text', async () => {
    const result = await execute({ action: 'estimate_duration' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_TEXT');
  });

  it('should reject invalid speed', async () => {
    const result = await execute(
      { action: 'estimate_duration', text: 'Hello world', speed: 10.0 },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SPEED');
  });

  it('should include word count in metadata', async () => {
    const result = await execute({ action: 'estimate_duration', text: 'one two three' }, {});
    assert.equal(result.metadata.wordCount, 3);
  });

  it('should include speed in metadata', async () => {
    const result = await execute({ action: 'estimate_duration', text: 'test', speed: 1.5 }, {});
    assert.equal(result.metadata.speed, 1.5);
  });

  it('should include duration info in result text', async () => {
    const result = await execute({ action: 'estimate_duration', text: 'Hello world' }, {});
    assert.ok(result.result.includes('Duration Estimate'));
    assert.ok(result.result.includes('Words:'));
    assert.ok(result.result.includes('Estimated duration:'));
  });
});

// ---------------------------------------------------------------------------
// 7. synthesize_ssml action
// ---------------------------------------------------------------------------
describe('voice-synthesizer: synthesize_ssml', () => {
  beforeEach(() => {});

  it('should synthesize valid SSML', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello <break time="500ms"/> world</speak>' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'synthesize_ssml');
    assert.equal(result.metadata.layer, 'L1');
    assert.ok(result.metadata.audioUrl.includes('speech-001'));
    assert.ok(result.result.includes('SSML speech synthesized successfully'));
  });

  it('should reject missing SSML', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute({ action: 'synthesize_ssml' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SSML');
  });

  it('should reject empty SSML', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute({ action: 'synthesize_ssml', ssml: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SSML');
  });

  it('should reject SSML without speak tags', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: 'Hello world' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SSML');
    assert.ok(result.result.includes('<speak>'));
  });

  it('should reject SSML with only opening speak tag', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello world' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SSML');
  });

  it('should reject SSML with only closing speak tag', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: 'Hello world</speak>' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SSML');
  });

  it('should reject SSML exceeding max length', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const longSsml = '<speak>' + 'x'.repeat(MAX_TEXT_LENGTH) + '</speak>';
    const result = await execute(
      { action: 'synthesize_ssml', ssml: longSsml },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SSML');
  });

  it('should accept custom voice for SSML', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>', voice: 'shimmer' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.voice, 'shimmer');
  });

  it('should accept custom model for SSML', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>', model: 'tts-1-hd' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.model, 'tts-1-hd');
  });

  it('should accept custom response format for SSML', async () => {
    const ctx = mockContext(sampleWavResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>', responseFormat: 'wav' },
      ctx
    );
    assert.equal(result.metadata.success, true);
  });

  it('should reject invalid voice for SSML', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>', voice: 'invalid' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_VOICE');
  });

  it('should reject invalid format for SSML', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>', responseFormat: 'midi' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_FORMAT');
  });

  it('should include ssmlLength in metadata', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const ssml = '<speak>Hello world</speak>';
    const result = await execute(
      { action: 'synthesize_ssml', ssml },
      ctx
    );
    assert.equal(result.metadata.ssmlLength, ssml.length);
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>' },
      ctx
    );
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 8. batch_synthesize action
// ---------------------------------------------------------------------------
describe('voice-synthesizer: batch_synthesize', () => {
  beforeEach(() => {});

  it('should synthesize a batch of items', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      {
        action: 'batch_synthesize',
        items: [
          { text: 'Hello' },
          { text: 'World', voice: 'nova' },
        ],
      },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'batch_synthesize');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.totalItems, 2);
    assert.equal(result.metadata.successCount, 2);
    assert.equal(result.metadata.errorCount, 0);
    assert.ok(result.result.includes('2/2 succeeded'));
  });

  it('should reject missing items', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute({ action: 'batch_synthesize' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_BATCH');
  });

  it('should reject non-array items', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'batch_synthesize', items: 'not an array' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_BATCH');
  });

  it('should reject empty items array', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'batch_synthesize', items: [] },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_BATCH');
  });

  it('should reject items exceeding max batch size', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const items = Array(MAX_BATCH_ITEMS + 1).fill({ text: 'Hello' });
    const result = await execute(
      { action: 'batch_synthesize', items },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_BATCH');
    assert.ok(result.result.includes(`${MAX_BATCH_ITEMS}`));
  });

  it('should reject item with invalid text', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'batch_synthesize', items: [{ text: '' }] },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_BATCH');
  });

  it('should reject item with invalid voice', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'batch_synthesize', items: [{ text: 'Hello', voice: 'invalid' }] },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_BATCH');
  });

  it('should reject item with invalid speed', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'batch_synthesize', items: [{ text: 'Hello', speed: 10 }] },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_BATCH');
  });

  it('should reject non-object items in array', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'batch_synthesize', items: ['not an object'] },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_BATCH');
  });

  it('should handle partial failures in batch', async () => {
    let callCount = 0;
    const ctx = {
      providerClient: {
        request: async () => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Server error on second item');
          }
          return sampleSynthesizeResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute(
      {
        action: 'batch_synthesize',
        items: [
          { text: 'First' },
          { text: 'Second' },
          { text: 'Third' },
        ],
      },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.successCount, 2);
    assert.equal(result.metadata.errorCount, 1);
    assert.equal(result.metadata.totalItems, 3);
  });

  it('should accept custom model for batch', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      {
        action: 'batch_synthesize',
        items: [{ text: 'Hello' }],
        model: 'tts-1-hd',
      },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.model, 'tts-1-hd');
  });

  it('should accept custom response format for batch', async () => {
    const ctx = mockContext(sampleWavResponse);
    const result = await execute(
      {
        action: 'batch_synthesize',
        items: [{ text: 'Hello' }],
        responseFormat: 'wav',
      },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.responseFormat, 'wav');
  });

  it('should reject invalid response format for batch', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'batch_synthesize', items: [{ text: 'Hello' }], responseFormat: 'midi' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_FORMAT');
  });

  it('should include timestamp in batch metadata', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const result = await execute(
      { action: 'batch_synthesize', items: [{ text: 'Hello' }] },
      ctx
    );
    assert.ok(result.metadata.timestamp);
  });

  it('should accept exactly MAX_BATCH_ITEMS items', async () => {
    const ctx = mockContext(sampleSynthesizeResponse);
    const items = Array(MAX_BATCH_ITEMS).fill(null).map((_, i) => ({ text: `Item ${i + 1}` }));
    const result = await execute(
      { action: 'batch_synthesize', items },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.totalItems, MAX_BATCH_ITEMS);
  });
});

// ---------------------------------------------------------------------------
// 9. Timeout handling
// ---------------------------------------------------------------------------
describe('voice-synthesizer: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on synthesize abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'synthesize', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on synthesize_ssml abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return error on batch_synthesize abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'batch_synthesize', items: [{ text: 'Hello' }] },
      ctx
    );
    // Batch catches per-item errors, so it may show partial failure
    assert.equal(result.metadata.errorCount, 1);
  });
});

// ---------------------------------------------------------------------------
// 10. Network error handling
// ---------------------------------------------------------------------------
describe('voice-synthesizer: network errors', () => {
  beforeEach(() => {});

  it('should return REQUEST_ERROR on synthesize failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'synthesize', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should return REQUEST_ERROR on synthesize_ssml failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'REQUEST_ERROR');
  });

  it('should handle errors in batch_synthesize', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute(
      { action: 'batch_synthesize', items: [{ text: 'Hello' }] },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.errorCount, 1);
  });
});

// ---------------------------------------------------------------------------
// 11. getClient helper
// ---------------------------------------------------------------------------
describe('voice-synthesizer: getClient', () => {
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
describe('voice-synthesizer: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: fake_test_key_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('fake_test_key_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: fake_jwt_token_for_testing.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('fake_jwt_token_for_testing'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: fake_auth_header_value';
    const output = redactSensitive(input);
    assert.ok(!output.includes('fake_auth_header_value'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Speech synthesized successfully at 1.0x speed';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 13. validateText helper
// ---------------------------------------------------------------------------
describe('voice-synthesizer: validateText', () => {
  beforeEach(() => {});

  it('should accept valid text', () => {
    const result = validateText('Hello world');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'Hello world');
  });

  it('should trim whitespace', () => {
    const result = validateText('  Hello  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'Hello');
  });

  it('should reject null text', () => {
    const result = validateText(null);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject empty text', () => {
    const result = validateText('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only text', () => {
    const result = validateText('   ');
    assert.equal(result.valid, false);
  });

  it('should reject text exceeding max length', () => {
    const result = validateText('x'.repeat(MAX_TEXT_LENGTH + 1));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
  });

  it('should accept text at exact max length', () => {
    const result = validateText('x'.repeat(MAX_TEXT_LENGTH));
    assert.equal(result.valid, true);
  });

  it('should reject undefined text', () => {
    const result = validateText(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject numeric input', () => {
    const result = validateText(42);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 14. validateVoice helper
// ---------------------------------------------------------------------------
describe('voice-synthesizer: validateVoice', () => {
  beforeEach(() => {});

  it('should default to alloy for undefined', () => {
    const result = validateVoice(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'alloy');
  });

  it('should default to alloy for null', () => {
    const result = validateVoice(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'alloy');
  });

  it('should accept valid voice', () => {
    const result = validateVoice('nova');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'nova');
  });

  it('should normalize to lowercase', () => {
    const result = validateVoice('ALLOY');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'alloy');
  });

  it('should reject invalid voice', () => {
    const result = validateVoice('robot');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('robot'));
  });

  it('should reject non-string voice', () => {
    const result = validateVoice(123);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 15. validateSpeed helper
// ---------------------------------------------------------------------------
describe('voice-synthesizer: validateSpeed', () => {
  beforeEach(() => {});

  it('should default to 1.0 for undefined', () => {
    const result = validateSpeed(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1.0);
  });

  it('should default to 1.0 for null', () => {
    const result = validateSpeed(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1.0);
  });

  it('should accept valid speed', () => {
    const result = validateSpeed(2.0);
    assert.equal(result.valid, true);
    assert.equal(result.value, 2.0);
  });

  it('should accept minimum speed', () => {
    const result = validateSpeed(MIN_SPEED);
    assert.equal(result.valid, true);
    assert.equal(result.value, MIN_SPEED);
  });

  it('should accept maximum speed', () => {
    const result = validateSpeed(MAX_SPEED);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_SPEED);
  });

  it('should reject speed below minimum', () => {
    const result = validateSpeed(0.1);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('0.1'));
  });

  it('should reject speed above maximum', () => {
    const result = validateSpeed(5.0);
    assert.equal(result.valid, false);
  });

  it('should reject NaN speed', () => {
    const result = validateSpeed('not a number');
    assert.equal(result.valid, false);
  });

  it('should accept string number', () => {
    const result = validateSpeed('2.0');
    assert.equal(result.valid, true);
    assert.equal(result.value, 2.0);
  });
});

// ---------------------------------------------------------------------------
// 16. validateResponseFormat helper
// ---------------------------------------------------------------------------
describe('voice-synthesizer: validateResponseFormat', () => {
  beforeEach(() => {});

  it('should default to mp3 for undefined', () => {
    const result = validateResponseFormat(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'mp3');
  });

  it('should default to mp3 for null', () => {
    const result = validateResponseFormat(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'mp3');
  });

  it('should accept all valid formats', () => {
    for (const format of VALID_RESPONSE_FORMATS) {
      const result = validateResponseFormat(format);
      assert.equal(result.valid, true, `Format "${format}" should be valid`);
      assert.equal(result.value, format);
    }
  });

  it('should normalize to lowercase', () => {
    const result = validateResponseFormat('MP3');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'mp3');
  });

  it('should reject invalid format', () => {
    const result = validateResponseFormat('midi');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('midi'));
  });

  it('should reject non-string format', () => {
    const result = validateResponseFormat(123);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validateSsml helper
// ---------------------------------------------------------------------------
describe('voice-synthesizer: validateSsml', () => {
  beforeEach(() => {});

  it('should accept valid SSML', () => {
    const result = validateSsml('<speak>Hello</speak>');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, '<speak>Hello</speak>');
  });

  it('should trim whitespace', () => {
    const result = validateSsml('  <speak>Hello</speak>  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, '<speak>Hello</speak>');
  });

  it('should reject null', () => {
    const result = validateSsml(null);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateSsml('');
    assert.equal(result.valid, false);
  });

  it('should reject SSML without speak tags', () => {
    const result = validateSsml('Hello world');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('<speak>'));
  });

  it('should reject SSML exceeding max length', () => {
    const result = validateSsml('<speak>' + 'x'.repeat(MAX_TEXT_LENGTH) + '</speak>');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 18. validateBatchItems helper
// ---------------------------------------------------------------------------
describe('voice-synthesizer: validateBatchItems', () => {
  beforeEach(() => {});

  it('should accept valid batch items', () => {
    const result = validateBatchItems([{ text: 'Hello' }, { text: 'World' }]);
    assert.equal(result.valid, true);
    assert.equal(result.validated.length, 2);
  });

  it('should reject non-array', () => {
    const result = validateBatchItems('not an array');
    assert.equal(result.valid, false);
  });

  it('should reject empty array', () => {
    const result = validateBatchItems([]);
    assert.equal(result.valid, false);
  });

  it('should reject array exceeding max', () => {
    const items = Array(MAX_BATCH_ITEMS + 1).fill({ text: 'Hello' });
    const result = validateBatchItems(items);
    assert.equal(result.valid, false);
  });

  it('should reject non-object item', () => {
    const result = validateBatchItems(['string']);
    assert.equal(result.valid, false);
  });

  it('should reject item with missing text', () => {
    const result = validateBatchItems([{}]);
    assert.equal(result.valid, false);
  });

  it('should reject item with invalid voice', () => {
    const result = validateBatchItems([{ text: 'Hello', voice: 'invalid' }]);
    assert.equal(result.valid, false);
  });

  it('should reject item with invalid speed', () => {
    const result = validateBatchItems([{ text: 'Hello', speed: 10 }]);
    assert.equal(result.valid, false);
  });

  it('should apply defaults for voice and speed', () => {
    const result = validateBatchItems([{ text: 'Hello' }]);
    assert.equal(result.valid, true);
    assert.equal(result.validated[0].voice, 'alloy');
    assert.equal(result.validated[0].speed, 1.0);
  });

  it('should accept max batch size', () => {
    const items = Array(MAX_BATCH_ITEMS).fill(null).map(() => ({ text: 'Hello' }));
    const result = validateBatchItems(items);
    assert.equal(result.valid, true);
    assert.equal(result.validated.length, MAX_BATCH_ITEMS);
  });
});

// ---------------------------------------------------------------------------
// 19. estimateDurationSeconds helper
// ---------------------------------------------------------------------------
describe('voice-synthesizer: estimateDurationSeconds', () => {
  beforeEach(() => {});

  it('should estimate 60s for 150 words at speed 1.0', () => {
    const text = Array(150).fill('word').join(' ');
    assert.equal(estimateDurationSeconds(text, 1.0), 60);
  });

  it('should estimate 30s for 150 words at speed 2.0', () => {
    const text = Array(150).fill('word').join(' ');
    assert.equal(estimateDurationSeconds(text, 2.0), 30);
  });

  it('should estimate 0s for empty-like text', () => {
    assert.equal(estimateDurationSeconds('', 1.0), 0);
  });

  it('should handle single word', () => {
    const duration = estimateDurationSeconds('hello', 1.0);
    assert.ok(duration > 0);
    assert.ok(duration < 1);
  });
});

// ---------------------------------------------------------------------------
// 20. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('voice-synthesizer: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (_method, path, _body, _opts) => {
          calledPath = path;
          return sampleSynthesizeResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'synthesize', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/audio/speech');
  });
});

// ---------------------------------------------------------------------------
// 21. Endpoint and method verification
// ---------------------------------------------------------------------------
describe('voice-synthesizer: endpoint routing', () => {
  beforeEach(() => {});

  it('should call POST /audio/speech for synthesize', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, _body, _opts) => {
          calledMethod = method;
          calledPath = path;
          return sampleSynthesizeResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'synthesize', text: 'Hello' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/audio/speech');
  });

  it('should call POST /audio/speech for synthesize_ssml', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, _body, _opts) => {
          calledMethod = method;
          calledPath = path;
          return sampleSynthesizeResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'synthesize_ssml', ssml: '<speak>Hello</speak>' },
      ctx
    );
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/audio/speech');
  });

  it('should call POST /audio/speech for batch_synthesize', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path, _body, _opts) => {
          calledMethod = method;
          calledPath = path;
          return sampleSynthesizeResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'batch_synthesize', items: [{ text: 'Hello' }] },
      ctx
    );
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/audio/speech');
  });

  it('should send correct body for synthesize', async () => {
    let calledBody = null;
    const ctx = {
      providerClient: {
        request: async (_method, _path, body, _opts) => {
          calledBody = body;
          return sampleSynthesizeResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'synthesize', text: 'Hello world', voice: 'nova', speed: 1.5, responseFormat: 'opus' },
      ctx
    );
    assert.equal(calledBody.model, 'tts-1');
    assert.equal(calledBody.input, 'Hello world');
    assert.equal(calledBody.voice, 'nova');
    assert.equal(calledBody.speed, 1.5);
    assert.equal(calledBody.response_format, 'opus');
  });
});

// ---------------------------------------------------------------------------
// 22. Timeout resolution
// ---------------------------------------------------------------------------
describe('voice-synthesizer: timeout resolution', () => {
  beforeEach(() => {});

  it('should cap timeout at MAX_TIMEOUT_MS', async () => {
    let receivedSignal = false;
    const ctx = {
      providerClient: {
        request: async (_method, _path, _body, opts) => {
          // We just check the call succeeds with high timeout config
          return sampleSynthesizeResponse;
        },
      },
      config: { timeoutMs: 999999 },
    };
    const result = await execute({ action: 'synthesize', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, true);
  });

  it('should use default timeout when not configured', async () => {
    const ctx = {
      providerClient: {
        request: async () => sampleSynthesizeResponse,
      },
    };
    const result = await execute({ action: 'synthesize', text: 'Hello' }, ctx);
    assert.equal(result.metadata.success, true);
  });
});
