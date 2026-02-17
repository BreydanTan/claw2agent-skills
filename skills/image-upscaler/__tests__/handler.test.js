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
  validateImage,
  validateScale,
  validateFormat,
  validateDenoiseLevel,
  validateSharpen,
  validateJobId,
  VALID_ACTIONS,
  VALID_FORMATS,
  AVAILABLE_MODELS,
  DEFAULT_SCALE,
  DEFAULT_FORMAT,
  DEFAULT_DENOISE_LEVEL,
  DEFAULT_SHARPEN,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_JOB_ID_LENGTH,
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

/** Sample upscale response */
const sampleUpscaleResult = {
  outputUrl: 'https://cdn.example.com/upscaled-image.png',
  width: 3840,
  height: 2160,
  jobId: 'job-abc-123',
};

/** Sample enhance response */
const sampleEnhanceResult = {
  outputUrl: 'https://cdn.example.com/enhanced-image.png',
  quality: 0.92,
  jobId: 'job-def-456',
};

/** Sample image info response */
const sampleInfoResult = {
  info: {
    width: 1920,
    height: 1080,
    format: 'png',
    fileSize: '4.2MB',
    colorSpace: 'sRGB',
  },
};

/** Sample job status response */
const sampleStatusResult = {
  status: 'completed',
  progress: 100,
  outputUrl: 'https://cdn.example.com/result.png',
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('image-upscaler: action validation', () => {
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
});

// ---------------------------------------------------------------------------
// 2. PROVIDER_NOT_CONFIGURED
// ---------------------------------------------------------------------------
describe('image-upscaler: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail upscale without client', async () => {
    const result = await execute({ action: 'upscale', image: 'photo.png' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail enhance without client', async () => {
    const result = await execute({ action: 'enhance', image: 'photo.png' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_info without client', async () => {
    const result = await execute({ action: 'get_info', image: 'photo.png' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail check_status without client', async () => {
    const result = await execute({ action: 'check_status', jobId: 'job-123' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should NOT fail list_models without client (no API call)', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 3. upscale action
// ---------------------------------------------------------------------------
describe('image-upscaler: upscale', () => {
  beforeEach(() => {});

  it('should upscale an image with defaults', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'photo.png' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'upscale');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.image, 'photo.png');
    assert.equal(result.metadata.scale, 2);
    assert.equal(result.metadata.format, 'png');
    assert.ok(result.result.includes('Image Upscale Result'));
  });

  it('should upscale with custom scale and format', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute(
      { action: 'upscale', image: 'img.jpg', scale: 4, format: 'webp' },
      ctx
    );
    assert.equal(result.metadata.scale, 4);
    assert.equal(result.metadata.format, 'webp');
  });

  it('should include output dimensions in result', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('3840x2160'));
    assert.equal(result.metadata.width, 3840);
    assert.equal(result.metadata.height, 2160);
  });

  it('should include output URL in result', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('cdn.example.com/upscaled-image.png'));
    assert.equal(result.metadata.outputUrl, 'https://cdn.example.com/upscaled-image.png');
  });

  it('should include job ID in result', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('job-abc-123'));
    assert.equal(result.metadata.jobId, 'job-abc-123');
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'photo.png' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing image', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty image', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only image', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid scale (1)', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'img.png', scale: 1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid scale (5)', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'img.png', scale: 5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer scale', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'img.png', scale: 2.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid format', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'img.png', format: 'bmp' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept format case-insensitively', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'img.png', format: 'JPEG' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.format, 'jpeg');
  });

  it('should call POST /images/upscale', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleUpscaleResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'upscale', image: 'test.png' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/images/upscale');
  });

  it('should pass body with image, scale, format', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleUpscaleResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'upscale', image: 'test.png', scale: 3, format: 'webp' }, ctx);
    assert.deepEqual(capturedOpts.body, { image: 'test.png', scale: 3, format: 'webp' });
  });

  it('should handle url field in response', async () => {
    const ctx = mockContext({ url: 'https://cdn.example.com/alt-output.png' });
    const result = await execute({ action: 'upscale', image: 'photo.png' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.outputUrl, 'https://cdn.example.com/alt-output.png');
  });

  it('should handle missing output url gracefully', async () => {
    const ctx = mockContext({ width: 200, height: 100 });
    const result = await execute({ action: 'upscale', image: 'photo.png' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.outputUrl, '');
  });

  it('should accept scale 3', async () => {
    const ctx = mockContext(sampleUpscaleResult);
    const result = await execute({ action: 'upscale', image: 'img.png', scale: 3 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.scale, 3);
  });
});

// ---------------------------------------------------------------------------
// 4. enhance action
// ---------------------------------------------------------------------------
describe('image-upscaler: enhance', () => {
  beforeEach(() => {});

  it('should enhance an image with defaults', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'noisy.jpg' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'enhance');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.image, 'noisy.jpg');
    assert.equal(result.metadata.denoise_level, 1);
    assert.equal(result.metadata.sharpen, true);
    assert.ok(result.result.includes('Image Enhancement Result'));
  });

  it('should enhance with custom denoise_level and sharpen', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute(
      { action: 'enhance', image: 'photo.png', denoise_level: 3, sharpen: false },
      ctx
    );
    assert.equal(result.metadata.denoise_level, 3);
    assert.equal(result.metadata.sharpen, false);
  });

  it('should include quality score in result', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('Quality score: 0.92'));
    assert.equal(result.metadata.quality, 0.92);
  });

  it('should include output URL in result', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('cdn.example.com/enhanced-image.png'));
  });

  it('should include job ID in result', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('job-def-456'));
    assert.equal(result.metadata.jobId, 'job-def-456');
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'photo.png' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing image', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty image', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid denoise_level (-1)', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'img.png', denoise_level: -1 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject invalid denoise_level (4)', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'img.png', denoise_level: 4 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-integer denoise_level', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'img.png', denoise_level: 1.5 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-boolean sharpen', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'img.png', sharpen: 'yes' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should accept denoise_level 0', async () => {
    const ctx = mockContext(sampleEnhanceResult);
    const result = await execute({ action: 'enhance', image: 'img.png', denoise_level: 0 }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.denoise_level, 0);
  });

  it('should call POST /images/enhance', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleEnhanceResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'enhance', image: 'scan.png' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/images/enhance');
  });

  it('should pass body with image, denoise_level, sharpen', async () => {
    let capturedOpts = null;
    const ctx = {
      providerClient: {
        request: async (method, path, body, opts) => {
          capturedOpts = opts;
          return sampleEnhanceResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'enhance', image: 'img.jpg', denoise_level: 2, sharpen: false }, ctx);
    assert.deepEqual(capturedOpts.body, { image: 'img.jpg', denoise_level: 2, sharpen: false });
  });

  it('should handle null quality in response', async () => {
    const ctx = mockContext({ outputUrl: 'https://cdn.example.com/out.png' });
    const result = await execute({ action: 'enhance', image: 'img.jpg' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.quality, null);
  });

  it('should handle url field in response', async () => {
    const ctx = mockContext({ url: 'https://cdn.example.com/alt-enhanced.png' });
    const result = await execute({ action: 'enhance', image: 'img.jpg' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.outputUrl, 'https://cdn.example.com/alt-enhanced.png');
  });
});

// ---------------------------------------------------------------------------
// 5. get_info action
// ---------------------------------------------------------------------------
describe('image-upscaler: get_info', () => {
  beforeEach(() => {});

  it('should get image info', async () => {
    const ctx = mockContext(sampleInfoResult);
    const result = await execute({ action: 'get_info', image: 'photo.png' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_info');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.image, 'photo.png');
    assert.ok(result.result.includes('Image Info'));
    assert.ok(result.result.includes('1920x1080'));
  });

  it('should include format in result', async () => {
    const ctx = mockContext(sampleInfoResult);
    const result = await execute({ action: 'get_info', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('Format: png'));
  });

  it('should include file size in result', async () => {
    const ctx = mockContext(sampleInfoResult);
    const result = await execute({ action: 'get_info', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('4.2MB'));
  });

  it('should include color space in result', async () => {
    const ctx = mockContext(sampleInfoResult);
    const result = await execute({ action: 'get_info', image: 'photo.png' }, ctx);
    assert.ok(result.result.includes('sRGB'));
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleInfoResult);
    const result = await execute({ action: 'get_info', image: 'photo.png' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing image', async () => {
    const ctx = mockContext(sampleInfoResult);
    const result = await execute({ action: 'get_info' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty image', async () => {
    const ctx = mockContext(sampleInfoResult);
    const result = await execute({ action: 'get_info', image: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call POST /images/info', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleInfoResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_info', image: 'test.png' }, ctx);
    assert.equal(calledMethod, 'POST');
    assert.equal(calledPath, '/images/info');
  });

  it('should handle raw response without info wrapper', async () => {
    const ctx = mockContext({ width: 800, height: 600, format: 'jpeg' });
    const result = await execute({ action: 'get_info', image: 'raw.jpg' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('800x600'));
  });

  it('should handle sparse info response', async () => {
    const ctx = mockContext({ info: { format: 'webp' } });
    const result = await execute({ action: 'get_info', image: 'sparse.webp' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('Format: webp'));
  });

  it('should handle size field in info', async () => {
    const ctx = mockContext({ info: { width: 100, height: 100, format: 'png', size: '1KB' } });
    const result = await execute({ action: 'get_info', image: 'tiny.png' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(result.result.includes('1KB'));
  });
});

// ---------------------------------------------------------------------------
// 6. list_models action
// ---------------------------------------------------------------------------
describe('image-upscaler: list_models', () => {
  beforeEach(() => {});

  it('should list all available models', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_models');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.modelCount, AVAILABLE_MODELS.length);
  });

  it('should include all model names in result text', async () => {
    const result = await execute({ action: 'list_models' }, {});
    for (const model of AVAILABLE_MODELS) {
      assert.ok(result.result.includes(model.name), `Should include model "${model.name}"`);
    }
  });

  it('should include all model descriptions in result text', async () => {
    const result = await execute({ action: 'list_models' }, {});
    for (const model of AVAILABLE_MODELS) {
      assert.ok(result.result.includes(model.description), `Should include description for "${model.name}"`);
    }
  });

  it('should not require a provider client', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.equal(result.metadata.success, true);
  });

  it('should include timestamp', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.ok(result.metadata.timestamp);
  });

  it('should return 5 models', async () => {
    const result = await execute({ action: 'list_models' }, {});
    assert.equal(result.metadata.modelCount, 5);
    assert.equal(result.metadata.models.length, 5);
  });

  it('should return models with name and description properties', async () => {
    const result = await execute({ action: 'list_models' }, {});
    for (const model of result.metadata.models) {
      assert.ok(model.name, 'Each model should have a name');
      assert.ok(model.description, 'Each model should have a description');
    }
  });
});

// ---------------------------------------------------------------------------
// 7. check_status action
// ---------------------------------------------------------------------------
describe('image-upscaler: check_status', () => {
  beforeEach(() => {});

  it('should check job status', async () => {
    const ctx = mockContext(sampleStatusResult);
    const result = await execute({ action: 'check_status', jobId: 'job-abc-123' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'check_status');
    assert.equal(result.metadata.layer, 'L1');
    assert.equal(result.metadata.jobId, 'job-abc-123');
    assert.ok(result.result.includes('Job Status'));
  });

  it('should include status in result', async () => {
    const ctx = mockContext(sampleStatusResult);
    const result = await execute({ action: 'check_status', jobId: 'job-123' }, ctx);
    assert.ok(result.result.includes('Status: completed'));
    assert.equal(result.metadata.status, 'completed');
  });

  it('should include progress in result', async () => {
    const ctx = mockContext(sampleStatusResult);
    const result = await execute({ action: 'check_status', jobId: 'job-123' }, ctx);
    assert.ok(result.result.includes('Progress: 100%'));
    assert.equal(result.metadata.progress, 100);
  });

  it('should include output URL when present', async () => {
    const ctx = mockContext(sampleStatusResult);
    const result = await execute({ action: 'check_status', jobId: 'job-123' }, ctx);
    assert.ok(result.result.includes('cdn.example.com/result.png'));
    assert.equal(result.metadata.outputUrl, 'https://cdn.example.com/result.png');
  });

  it('should include timestamp in metadata', async () => {
    const ctx = mockContext(sampleStatusResult);
    const result = await execute({ action: 'check_status', jobId: 'job-123' }, ctx);
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing jobId', async () => {
    const ctx = mockContext(sampleStatusResult);
    const result = await execute({ action: 'check_status' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject empty jobId', async () => {
    const ctx = mockContext(sampleStatusResult);
    const result = await execute({ action: 'check_status', jobId: '' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject whitespace-only jobId', async () => {
    const ctx = mockContext(sampleStatusResult);
    const result = await execute({ action: 'check_status', jobId: '   ' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject jobId exceeding 100 chars', async () => {
    const ctx = mockContext(sampleStatusResult);
    const longId = 'x'.repeat(101);
    const result = await execute({ action: 'check_status', jobId: longId }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should call GET /images/status/:jobId', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: {
        request: async (method, path) => {
          calledMethod = method;
          calledPath = path;
          return sampleStatusResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'check_status', jobId: 'my-job-42' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.equal(calledPath, '/images/status/my-job-42');
  });

  it('should handle in-progress status', async () => {
    const ctx = mockContext({ status: 'processing', progress: 50 });
    const result = await execute({ action: 'check_status', jobId: 'job-in-progress' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.status, 'processing');
    assert.equal(result.metadata.progress, 50);
  });

  it('should handle url field in status response', async () => {
    const ctx = mockContext({ status: 'done', url: 'https://cdn.example.com/alt.png' });
    const result = await execute({ action: 'check_status', jobId: 'job-alt' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.outputUrl, 'https://cdn.example.com/alt.png');
  });

  it('should handle unknown status', async () => {
    const ctx = mockContext({});
    const result = await execute({ action: 'check_status', jobId: 'job-unknown' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.status, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// 8. Timeout handling
// ---------------------------------------------------------------------------
describe('image-upscaler: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on upscale abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'upscale', image: 'img.png' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on enhance abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'enhance', image: 'img.png' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_info abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_info', image: 'img.png' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on check_status abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'check_status', jobId: 'job-123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 9. Network error handling
// ---------------------------------------------------------------------------
describe('image-upscaler: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on upscale failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'upscale', image: 'img.png' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on enhance failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'enhance', image: 'img.png' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_info failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'get_info', image: 'img.png' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on check_status failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'check_status', jobId: 'job-123' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'upscale', image: 'img.png' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 10. getClient helper
// ---------------------------------------------------------------------------
describe('image-upscaler: getClient', () => {
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
// 11. redactSensitive
// ---------------------------------------------------------------------------
describe('image-upscaler: redactSensitive', () => {
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
    const input = 'secret: my_secret_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('my_secret_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Upscaled image to 3840x2160 pixels';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });

  it('should redact sensitive data in error messages', async () => {
    const ctx = mockContextError(new Error('token: exposed_placeholder_val'));
    const result = await execute({ action: 'upscale', image: 'img.png' }, ctx);
    assert.ok(!result.result.includes('exposed_placeholder_val'));
  });
});

// ---------------------------------------------------------------------------
// 12. validateImage helper
// ---------------------------------------------------------------------------
describe('image-upscaler: validateImage', () => {
  beforeEach(() => {});

  it('should accept valid file path', () => {
    const result = validateImage('/path/to/image.png');
    assert.equal(result.valid, true);
    assert.equal(result.value, '/path/to/image.png');
  });

  it('should accept URL', () => {
    const result = validateImage('https://example.com/photo.jpg');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'https://example.com/photo.jpg');
  });

  it('should trim whitespace', () => {
    const result = validateImage('  img.png  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'img.png');
  });

  it('should reject null', () => {
    const result = validateImage(null);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject undefined', () => {
    const result = validateImage(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateImage('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = validateImage('   ');
    assert.equal(result.valid, false);
  });

  it('should reject non-string', () => {
    const result = validateImage(123);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 13. validateScale helper
// ---------------------------------------------------------------------------
describe('image-upscaler: validateScale', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateScale(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 2);
  });

  it('should return default when null', () => {
    const result = validateScale(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 2);
  });

  it('should accept scale 2', () => {
    const result = validateScale(2);
    assert.equal(result.valid, true);
    assert.equal(result.value, 2);
  });

  it('should accept scale 3', () => {
    const result = validateScale(3);
    assert.equal(result.valid, true);
    assert.equal(result.value, 3);
  });

  it('should accept scale 4', () => {
    const result = validateScale(4);
    assert.equal(result.valid, true);
    assert.equal(result.value, 4);
  });

  it('should reject scale 1', () => {
    const result = validateScale(1);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject scale 5', () => {
    const result = validateScale(5);
    assert.equal(result.valid, false);
  });

  it('should reject scale 0', () => {
    const result = validateScale(0);
    assert.equal(result.valid, false);
  });

  it('should reject negative scale', () => {
    const result = validateScale(-2);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer scale', () => {
    const result = validateScale(2.5);
    assert.equal(result.valid, false);
  });

  it('should reject string scale', () => {
    const result = validateScale('2');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 14. validateFormat helper
// ---------------------------------------------------------------------------
describe('image-upscaler: validateFormat', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateFormat(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'png');
  });

  it('should return default when null', () => {
    const result = validateFormat(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 'png');
  });

  it('should accept png', () => {
    const result = validateFormat('png');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'png');
  });

  it('should accept jpeg', () => {
    const result = validateFormat('jpeg');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'jpeg');
  });

  it('should accept webp', () => {
    const result = validateFormat('webp');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'webp');
  });

  it('should accept case-insensitive format', () => {
    const result = validateFormat('PNG');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'png');
  });

  it('should accept mixed case format', () => {
    const result = validateFormat('Jpeg');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'jpeg');
  });

  it('should reject invalid format', () => {
    const result = validateFormat('bmp');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('bmp'));
  });

  it('should reject empty string', () => {
    const result = validateFormat('');
    assert.equal(result.valid, false);
  });

  it('should reject non-string', () => {
    const result = validateFormat(123);
    assert.equal(result.valid, false);
  });

  it('should trim whitespace', () => {
    const result = validateFormat('  webp  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'webp');
  });
});

// ---------------------------------------------------------------------------
// 15. validateDenoiseLevel helper
// ---------------------------------------------------------------------------
describe('image-upscaler: validateDenoiseLevel', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateDenoiseLevel(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1);
  });

  it('should return default when null', () => {
    const result = validateDenoiseLevel(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1);
  });

  it('should accept level 0', () => {
    const result = validateDenoiseLevel(0);
    assert.equal(result.valid, true);
    assert.equal(result.value, 0);
  });

  it('should accept level 1', () => {
    const result = validateDenoiseLevel(1);
    assert.equal(result.valid, true);
    assert.equal(result.value, 1);
  });

  it('should accept level 2', () => {
    const result = validateDenoiseLevel(2);
    assert.equal(result.valid, true);
    assert.equal(result.value, 2);
  });

  it('should accept level 3', () => {
    const result = validateDenoiseLevel(3);
    assert.equal(result.valid, true);
    assert.equal(result.value, 3);
  });

  it('should reject level -1', () => {
    const result = validateDenoiseLevel(-1);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject level 4', () => {
    const result = validateDenoiseLevel(4);
    assert.equal(result.valid, false);
  });

  it('should reject non-integer', () => {
    const result = validateDenoiseLevel(1.5);
    assert.equal(result.valid, false);
  });

  it('should reject string', () => {
    const result = validateDenoiseLevel('2');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 16. validateSharpen helper
// ---------------------------------------------------------------------------
describe('image-upscaler: validateSharpen', () => {
  beforeEach(() => {});

  it('should return default when undefined', () => {
    const result = validateSharpen(undefined);
    assert.equal(result.valid, true);
    assert.equal(result.value, true);
  });

  it('should return default when null', () => {
    const result = validateSharpen(null);
    assert.equal(result.valid, true);
    assert.equal(result.value, true);
  });

  it('should accept true', () => {
    const result = validateSharpen(true);
    assert.equal(result.valid, true);
    assert.equal(result.value, true);
  });

  it('should accept false', () => {
    const result = validateSharpen(false);
    assert.equal(result.valid, true);
    assert.equal(result.value, false);
  });

  it('should reject string', () => {
    const result = validateSharpen('true');
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject number', () => {
    const result = validateSharpen(1);
    assert.equal(result.valid, false);
  });

  it('should reject object', () => {
    const result = validateSharpen({});
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// 17. validateJobId helper
// ---------------------------------------------------------------------------
describe('image-upscaler: validateJobId', () => {
  beforeEach(() => {});

  it('should accept valid job ID', () => {
    const result = validateJobId('job-abc-123');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'job-abc-123');
  });

  it('should trim whitespace', () => {
    const result = validateJobId('  job-123  ');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'job-123');
  });

  it('should reject null', () => {
    const result = validateJobId(null);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject undefined', () => {
    const result = validateJobId(undefined);
    assert.equal(result.valid, false);
  });

  it('should reject empty string', () => {
    const result = validateJobId('');
    assert.equal(result.valid, false);
  });

  it('should reject whitespace-only string', () => {
    const result = validateJobId('   ');
    assert.equal(result.valid, false);
  });

  it('should reject non-string', () => {
    const result = validateJobId(123);
    assert.equal(result.valid, false);
  });

  it('should accept job ID at max length (100)', () => {
    const id = 'a'.repeat(100);
    const result = validateJobId(id);
    assert.equal(result.valid, true);
    assert.equal(result.value, id);
  });

  it('should reject job ID exceeding max length', () => {
    const id = 'a'.repeat(101);
    const result = validateJobId(id);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('100'));
  });
});

// ---------------------------------------------------------------------------
// 18. resolveTimeout helper
// ---------------------------------------------------------------------------
describe('image-upscaler: resolveTimeout', () => {
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
// 19. validate() export
// ---------------------------------------------------------------------------
describe('image-upscaler: validate()', () => {
  beforeEach(() => {});

  it('should reject invalid action', () => {
    const result = validate({ action: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('bad'));
  });

  it('should reject missing action', () => {
    const result = validate({});
    assert.equal(result.valid, false);
  });

  it('should reject null params', () => {
    const result = validate(null);
    assert.equal(result.valid, false);
  });

  it('should validate upscale requires image', () => {
    assert.equal(validate({ action: 'upscale' }).valid, false);
    assert.equal(validate({ action: 'upscale', image: '' }).valid, false);
    assert.equal(validate({ action: 'upscale', image: 'photo.png' }).valid, true);
  });

  it('should validate upscale rejects bad scale', () => {
    assert.equal(validate({ action: 'upscale', image: 'img.png', scale: 1 }).valid, false);
    assert.equal(validate({ action: 'upscale', image: 'img.png', scale: 5 }).valid, false);
    assert.equal(validate({ action: 'upscale', image: 'img.png', scale: 2 }).valid, true);
  });

  it('should validate upscale rejects bad format', () => {
    assert.equal(validate({ action: 'upscale', image: 'img.png', format: 'bmp' }).valid, false);
    assert.equal(validate({ action: 'upscale', image: 'img.png', format: 'jpeg' }).valid, true);
  });

  it('should validate enhance requires image', () => {
    assert.equal(validate({ action: 'enhance' }).valid, false);
    assert.equal(validate({ action: 'enhance', image: 'photo.png' }).valid, true);
  });

  it('should validate enhance rejects bad denoise_level', () => {
    assert.equal(validate({ action: 'enhance', image: 'img.png', denoise_level: -1 }).valid, false);
    assert.equal(validate({ action: 'enhance', image: 'img.png', denoise_level: 4 }).valid, false);
    assert.equal(validate({ action: 'enhance', image: 'img.png', denoise_level: 2 }).valid, true);
  });

  it('should validate enhance rejects bad sharpen', () => {
    assert.equal(validate({ action: 'enhance', image: 'img.png', sharpen: 'yes' }).valid, false);
    assert.equal(validate({ action: 'enhance', image: 'img.png', sharpen: true }).valid, true);
  });

  it('should validate get_info requires image', () => {
    assert.equal(validate({ action: 'get_info' }).valid, false);
    assert.equal(validate({ action: 'get_info', image: 'img.png' }).valid, true);
  });

  it('should validate list_models requires nothing', () => {
    assert.equal(validate({ action: 'list_models' }).valid, true);
  });

  it('should validate check_status requires jobId', () => {
    assert.equal(validate({ action: 'check_status' }).valid, false);
    assert.equal(validate({ action: 'check_status', jobId: '' }).valid, false);
    assert.equal(validate({ action: 'check_status', jobId: 'job-123' }).valid, true);
  });

  it('should validate check_status rejects long jobId', () => {
    const longId = 'x'.repeat(101);
    assert.equal(validate({ action: 'check_status', jobId: longId }).valid, false);
  });
});

// ---------------------------------------------------------------------------
// 20. meta export
// ---------------------------------------------------------------------------
describe('image-upscaler: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'image-upscaler');
  });

  it('should have version', () => {
    assert.ok(meta.version);
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('upscal'));
  });

  it('should list all 5 actions', () => {
    assert.equal(meta.actions.length, 5);
    assert.ok(meta.actions.includes('upscale'));
    assert.ok(meta.actions.includes('enhance'));
    assert.ok(meta.actions.includes('get_info'));
    assert.ok(meta.actions.includes('list_models'));
    assert.ok(meta.actions.includes('check_status'));
  });
});

// ---------------------------------------------------------------------------
// 21. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('image-upscaler: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleUpscaleResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'upscale', image: 'img.png' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/images/upscale');
  });

  it('should use gatewayClient for enhance', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleEnhanceResult;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'enhance', image: 'img.png' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(calledPath, '/images/enhance');
  });
});

// ---------------------------------------------------------------------------
// 22. providerNotConfiguredError helper
// ---------------------------------------------------------------------------
describe('image-upscaler: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.result.includes('Error'));
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });

  it('should mention image upscaling in error message', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.result.includes('image upscaling'));
  });
});

// ---------------------------------------------------------------------------
// 23. Constants verification
// ---------------------------------------------------------------------------
describe('image-upscaler: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, [
      'upscale', 'enhance', 'get_info', 'list_models', 'check_status',
    ]);
  });

  it('should have correct VALID_FORMATS', () => {
    assert.deepEqual(VALID_FORMATS, ['png', 'jpeg', 'webp']);
  });

  it('should have 5 available models', () => {
    assert.equal(AVAILABLE_MODELS.length, 5);
  });

  it('should have correct default scale', () => {
    assert.equal(DEFAULT_SCALE, 2);
  });

  it('should have correct default format', () => {
    assert.equal(DEFAULT_FORMAT, 'png');
  });

  it('should have correct default denoise level', () => {
    assert.equal(DEFAULT_DENOISE_LEVEL, 1);
  });

  it('should have correct default sharpen', () => {
    assert.equal(DEFAULT_SHARPEN, true);
  });

  it('should have correct max job ID length', () => {
    assert.equal(MAX_JOB_ID_LENGTH, 100);
  });

  it('should include real-esrgan-x4 model', () => {
    assert.ok(AVAILABLE_MODELS.some(m => m.name === 'real-esrgan-x4'));
  });

  it('should include waifu2x-cunet model', () => {
    assert.ok(AVAILABLE_MODELS.some(m => m.name === 'waifu2x-cunet'));
  });
});

// ---------------------------------------------------------------------------
// 24. requestWithTimeout helper
// ---------------------------------------------------------------------------
describe('image-upscaler: requestWithTimeout', () => {
  beforeEach(() => {});

  it('should return response on success', async () => {
    const client = { request: async () => ({ data: 'ok' }) };
    const result = await requestWithTimeout(client, 'POST', '/test', {}, 5000);
    assert.deepEqual(result, { data: 'ok' });
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
      assert.ok(err.message.includes('5000'));
    }
  });

  it('should throw UPSTREAM_ERROR on other errors', async () => {
    const client = {
      request: async () => { throw new Error('server down'); },
    };
    try {
      await requestWithTimeout(client, 'POST', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.ok(err.message.includes('server down'));
    }
  });

  it('should handle error with no message', async () => {
    const client = {
      request: async () => { throw new Error(); },
    };
    try {
      await requestWithTimeout(client, 'POST', '/test', {}, 5000);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UPSTREAM_ERROR');
    }
  });
});
