import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute,
  getClient,
  redactSensitive,
  fetchWithTimeout,
  isValidUrl,
  validatePrompt,
  validateN,
  KNOWN_MODELS,
  VALID_SIZES,
  VALID_QUALITIES,
  VALID_STYLES,
  MAX_PROMPT_LENGTH,
  MAX_N,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock context with a providerClient that returns the given data
 * from its .fetch() method.
 */
function mockContext(fetchResponse, config) {
  return {
    providerClient: {
      fetch: async (_endpoint, _opts) => fetchResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

/**
 * Build a mock context where .fetch() rejects with the given error.
 */
function mockContextError(error) {
  return {
    providerClient: {
      fetch: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

/**
 * Build a mock context where .fetch() triggers an AbortError (timeout).
 */
function mockContextTimeout() {
  return {
    providerClient: {
      fetch: async (_endpoint, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    },
    config: { timeoutMs: 100 },
  };
}

/** Sample successful generation response. */
const sampleGenerateResponse = {
  images: [
    { url: 'https://cdn.example.com/img/generated-1.png' },
    { url: 'https://cdn.example.com/img/generated-2.png' },
  ],
};

/** Sample single-image response. */
const sampleSingleImage = {
  data: [
    { url: 'https://cdn.example.com/img/single.png' },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('image-generation: action validation', () => {
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
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED for generate/variations/edit
// ---------------------------------------------------------------------------
describe('image-generation: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail generate without client', async () => {
    const result = await execute({ action: 'generate', prompt: 'A sunset' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail variations without client', async () => {
    const result = await execute(
      { action: 'variations', imageUrl: 'https://example.com/img.png' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail edit without client', async () => {
    const result = await execute(
      { action: 'edit', imageUrl: 'https://example.com/img.png', prompt: 'Add a hat' },
      {}
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
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
describe('image-generation: list_models', () => {
  beforeEach(() => {});

  it('should return list of known models', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_models');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.modelCount, KNOWN_MODELS.length);
    assert.ok(result.metadata.models.length > 0);
  });

  it('should include dall-e-3 in models list', async () => {
    const result = await execute({ action: 'list_models' }, {});
    const dalleModel = result.metadata.models.find((m) => m.id === 'dall-e-3');
    assert.ok(dalleModel, 'Should include dall-e-3 in the models list');
    assert.equal(dalleModel.provider, 'OpenAI');
  });

  it('should include model details in result text', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.ok(result.result.includes('DALL-E 3'));
    assert.ok(result.result.includes('DALL-E 2'));
    assert.ok(result.result.includes('Stable Diffusion XL'));
    assert.ok(result.result.includes('Midjourney v6'));
  });

  it('should work without any context', async () => {
    const result = await execute({ action: 'list_models' }, undefined);
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 4. generate action
// ---------------------------------------------------------------------------
describe('image-generation: generate', () => {
  beforeEach(() => {});

  it('should generate image with valid prompt', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute({ action: 'generate', prompt: 'A beautiful sunset over the ocean' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'generate');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.model, 'dall-e-3');
    assert.equal(result.metadata.size, '1024x1024');
    assert.equal(result.metadata.quality, 'standard');
    assert.equal(result.metadata.style, 'vivid');
    assert.equal(result.metadata.imageCount, 2);
    assert.ok(result.metadata.images.length === 2);
    assert.ok(result.result.includes('Generated 2 image(s)'));
  });

  it('should use custom model, size, quality, and style', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute(
      {
        action: 'generate',
        prompt: 'A cat',
        model: 'dall-e-2',
        size: '512x512',
        quality: 'hd',
        style: 'natural',
        n: 1,
      },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.model, 'dall-e-2');
    assert.equal(result.metadata.size, '512x512');
    assert.equal(result.metadata.quality, 'hd');
    assert.equal(result.metadata.style, 'natural');
    assert.equal(result.metadata.n, 1);
  });

  it('should reject missing prompt', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute({ action: 'generate' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_PROMPT');
  });

  it('should reject empty prompt', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute({ action: 'generate', prompt: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_PROMPT');
  });

  it('should reject prompt exceeding max length', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const longPrompt = 'x'.repeat(MAX_PROMPT_LENGTH + 1);
    const result = await execute({ action: 'generate', prompt: longPrompt }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_PROMPT');
    assert.ok(result.result.includes('maximum length'));
  });

  it('should reject invalid size', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'generate', prompt: 'A cat', size: '800x600' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SIZE');
  });

  it('should reject invalid quality', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'generate', prompt: 'A cat', quality: 'ultra' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_QUALITY');
  });

  it('should reject invalid style', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'generate', prompt: 'A cat', style: 'abstract' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_STYLE');
  });

  it('should reject n exceeding max', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'generate', prompt: 'A cat', n: 5 },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_N');
  });

  it('should reject n of zero', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'generate', prompt: 'A cat', n: 0 },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_N');
  });

  it('should reject negative n', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'generate', prompt: 'A cat', n: -1 },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_N');
  });

  it('should handle data field in response', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute({ action: 'generate', prompt: 'A dog' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.imageCount, 1);
    assert.ok(result.metadata.images[0].includes('single.png'));
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute({ action: 'generate', prompt: 'A dog' }, ctx);
    assert.ok(result.metadata.timestamp);
  });
});

// ---------------------------------------------------------------------------
// 5. variations action
// ---------------------------------------------------------------------------
describe('image-generation: variations', () => {
  beforeEach(() => {});

  it('should generate variations with valid imageUrl', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'variations', imageUrl: 'https://example.com/original.png' },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'variations');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.sourceImage, 'https://example.com/original.png');
    assert.equal(result.metadata.imageCount, 2);
    assert.ok(result.result.includes('variation(s)'));
  });

  it('should reject missing imageUrl', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute({ action: 'variations' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_IMAGE_URL');
  });

  it('should reject invalid imageUrl', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'variations', imageUrl: 'not-a-url' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_IMAGE_URL');
  });

  it('should reject ftp protocol in imageUrl', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'variations', imageUrl: 'ftp://example.com/img.png' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_IMAGE_URL');
  });

  it('should reject invalid size for variations', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'variations', imageUrl: 'https://example.com/img.png', size: '999x999' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SIZE');
  });

  it('should reject n > MAX_N for variations', async () => {
    const ctx = mockContext(sampleGenerateResponse);
    const result = await execute(
      { action: 'variations', imageUrl: 'https://example.com/img.png', n: 10 },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_N');
  });
});

// ---------------------------------------------------------------------------
// 6. edit action
// ---------------------------------------------------------------------------
describe('image-generation: edit', () => {
  beforeEach(() => {});

  it('should edit image with valid imageUrl and prompt', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute(
      {
        action: 'edit',
        imageUrl: 'https://example.com/original.png',
        prompt: 'Add a rainbow in the sky',
      },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'edit');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.sourceImage, 'https://example.com/original.png');
    assert.equal(result.metadata.imageCount, 1);
    assert.ok(result.result.includes('Edited image'));
    assert.ok(result.result.includes('rainbow'));
  });

  it('should accept optional mask parameter', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute(
      {
        action: 'edit',
        imageUrl: 'https://example.com/original.png',
        prompt: 'Replace the sky',
        mask: 'https://example.com/mask.png',
      },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.mask, 'https://example.com/mask.png');
    assert.ok(result.result.includes('Mask:'));
  });

  it('should reject missing imageUrl for edit', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute(
      { action: 'edit', prompt: 'Change something' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_IMAGE_URL');
  });

  it('should reject missing prompt for edit', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute(
      { action: 'edit', imageUrl: 'https://example.com/img.png' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_PROMPT');
  });

  it('should reject invalid mask URL for edit', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute(
      {
        action: 'edit',
        imageUrl: 'https://example.com/img.png',
        prompt: 'Edit this',
        mask: 'not-a-url',
      },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_MASK_URL');
  });

  it('should reject invalid size for edit', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute(
      {
        action: 'edit',
        imageUrl: 'https://example.com/img.png',
        prompt: 'Edit this',
        size: '100x100',
      },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_SIZE');
  });

  it('should set mask to null when not provided', async () => {
    const ctx = mockContext(sampleSingleImage);
    const result = await execute(
      {
        action: 'edit',
        imageUrl: 'https://example.com/img.png',
        prompt: 'Edit this',
      },
      ctx
    );
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.mask, null);
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout handling
// ---------------------------------------------------------------------------
describe('image-generation: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on generate abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'generate', prompt: 'A sunset' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on variations abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'variations', imageUrl: 'https://example.com/img.png' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on edit abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute(
      { action: 'edit', imageUrl: 'https://example.com/img.png', prompt: 'Edit' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 8. Network error handling
// ---------------------------------------------------------------------------
describe('image-generation: network errors', () => {
  beforeEach(() => {});

  it('should return FETCH_ERROR on generate failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'generate', prompt: 'A cat' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on variations failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute(
      { action: 'variations', imageUrl: 'https://example.com/img.png' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });

  it('should return FETCH_ERROR on edit failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute(
      { action: 'edit', imageUrl: 'https://example.com/img.png', prompt: 'Edit' },
      ctx
    );
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'FETCH_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 9. getClient helper
// ---------------------------------------------------------------------------
describe('image-generation: getClient', () => {
  beforeEach(() => {});

  it('should prefer providerClient over gatewayClient', () => {
    const result = getClient({
      providerClient: { fetch: () => {} },
      gatewayClient: { fetch: () => {} },
    });
    assert.equal(result.type, 'provider');
  });

  it('should fall back to gatewayClient', () => {
    const result = getClient({ gatewayClient: { fetch: () => {} } });
    assert.equal(result.type, 'gateway');
  });

  it('should return null when no client', () => {
    assert.equal(getClient({}), null);
  });

  it('should return null for undefined context', () => {
    assert.equal(getClient(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// 10. redactSensitive
// ---------------------------------------------------------------------------
describe('image-generation: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sk_live_abc123 data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sk_live_abc123'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: eyJhbGciOiJIUzI1NiJ9.payload';
    const output = redactSensitive(input);
    assert.ok(!output.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  it('should not alter clean strings', () => {
    const input = 'Generated 2 images at 1024x1024';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 11. isValidUrl helper
// ---------------------------------------------------------------------------
describe('image-generation: isValidUrl', () => {
  beforeEach(() => {});

  it('should accept valid https URL', () => {
    assert.equal(isValidUrl('https://example.com/img.png'), true);
  });

  it('should accept valid http URL', () => {
    assert.equal(isValidUrl('http://example.com/img.png'), true);
  });

  it('should reject ftp URL', () => {
    assert.equal(isValidUrl('ftp://example.com/img.png'), false);
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
});

// ---------------------------------------------------------------------------
// 12. validatePrompt helper
// ---------------------------------------------------------------------------
describe('image-generation: validatePrompt', () => {
  beforeEach(() => {});

  it('should accept valid prompt', () => {
    const result = validatePrompt('A beautiful sunset');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'A beautiful sunset');
  });

  it('should trim whitespace', () => {
    const result = validatePrompt('  A cat  ');
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, 'A cat');
  });

  it('should reject null prompt', () => {
    const result = validatePrompt(null);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject empty prompt', () => {
    const result = validatePrompt('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only prompt', () => {
    const result = validatePrompt('   ');
    assert.equal(result.valid, false);
  });

  it('should reject prompt exceeding max length', () => {
    const result = validatePrompt('x'.repeat(MAX_PROMPT_LENGTH + 1));
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('maximum length'));
  });
});

// ---------------------------------------------------------------------------
// 13. validateN helper
// ---------------------------------------------------------------------------
describe('image-generation: validateN', () => {
  beforeEach(() => {});

  it('should default to 1 for undefined', () => {
    const result = validateN(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1);
  });

  it('should default to 1 for null', () => {
    const result = validateN(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1);
  });

  it('should accept valid n', () => {
    const result = validateN(3);
    assert.equal(result.valid, true);
    assert.equal(result.value, 3);
  });

  it('should accept max n', () => {
    const result = validateN(MAX_N);
    assert.equal(result.valid, true);
    assert.equal(result.value, MAX_N);
  });

  it('should reject n > max', () => {
    const result = validateN(MAX_N + 1);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject 0', () => {
    const result = validateN(0);
    assert.equal(result.valid, false);
  });

  it('should reject negative', () => {
    const result = validateN(-1);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateN(1.5);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 14. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('image-generation: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledEndpoint = null;
    const ctx = {
      gatewayClient: {
        fetch: async (endpoint, opts) => {
          calledEndpoint = endpoint;
          return sampleSingleImage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'generate', prompt: 'A cat' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledEndpoint, 'image/generate');
  });
});

// ---------------------------------------------------------------------------
// 15. Endpoint verification
// ---------------------------------------------------------------------------
describe('image-generation: endpoint routing', () => {
  beforeEach(() => {});

  it('should call image/generate endpoint for generate', async () => {
    let calledEndpoint = null;
    const ctx = {
      providerClient: {
        fetch: async (endpoint) => {
          calledEndpoint = endpoint;
          return sampleSingleImage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'generate', prompt: 'A cat' }, ctx);
    assert.equal(calledEndpoint, 'image/generate');
  });

  it('should call image/variations endpoint for variations', async () => {
    let calledEndpoint = null;
    const ctx = {
      providerClient: {
        fetch: async (endpoint) => {
          calledEndpoint = endpoint;
          return sampleGenerateResponse;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'variations', imageUrl: 'https://example.com/img.png' },
      ctx
    );
    assert.equal(calledEndpoint, 'image/variations');
  });

  it('should call image/edit endpoint for edit', async () => {
    let calledEndpoint = null;
    const ctx = {
      providerClient: {
        fetch: async (endpoint) => {
          calledEndpoint = endpoint;
          return sampleSingleImage;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute(
      { action: 'edit', imageUrl: 'https://example.com/img.png', prompt: 'Edit' },
      ctx
    );
    assert.equal(calledEndpoint, 'image/edit');
  });
});
