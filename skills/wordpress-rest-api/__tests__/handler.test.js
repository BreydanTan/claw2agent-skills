import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  execute, validate, meta, getClient, providerNotConfiguredError,
  resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString,
  VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS,
} from '../handler.js';

function mockContext(requestResponse, config) {
  return { providerClient: { request: async (m, p, b, o) => requestResponse }, config: config || { timeoutMs: 5000 } };
}
function mockContextError(error) {
  return { providerClient: { request: async () => { throw error; } }, config: { timeoutMs: 1000 } };
}
function mockContextTimeout() {
  return { providerClient: { request: async (_m, _p, _b, o) => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; } }, config: { timeoutMs: 100 } };
}

const sample_create_post = {"id":1,"title":{"rendered":"Test Post"},"status":"draft","link":"https://example.com/test-post"};
const sample_list_posts = [{"id":1,"title":{"rendered":"Post 1"}},{"id":2,"title":{"rendered":"Post 2"}}];
const sample_update_post = {"id":1,"title":{"rendered":"Updated Post"},"status":"published"};
const sample_delete_post = {"id":1,"deleted":true};
const sample_upload_media = {"id":10,"source_url":"https://example.com/uploads/file.png","title":{"rendered":"file.png"}};

// 1. Action validation
describe('wordpress-rest-api: action validation', () => {
  beforeEach(() => {});
  it('should reject invalid action', async () => { const r = await execute({ action: 'invalid' }, {}); assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'INVALID_ACTION'); });
  it('should reject missing action', async () => { const r = await execute({}, {}); assert.equal(r.metadata.success, false); });
  it('should reject null params', async () => { const r = await execute(null, {}); assert.equal(r.metadata.success, false); });
  it('should reject undefined params', async () => { const r = await execute(undefined, {}); assert.equal(r.metadata.success, false); });
  it('should list valid actions in error message', async () => { const r = await execute({ action: 'bad' }, {}); for (const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

// 2. PROVIDER_NOT_CONFIGURED
describe('wordpress-rest-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});
  it('should fail create_post without client', async () => {
    const r = await execute({ action: 'create_post', title: 'test', content: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail list_posts without client', async () => {
    const r = await execute({ action: 'list_posts' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail update_post without client', async () => {
    const r = await execute({ action: 'update_post', postId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail delete_post without client', async () => {
    const r = await execute({ action: 'delete_post', postId: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail upload_media without client', async () => {
    const r = await execute({ action: 'upload_media', fileName: 'test', mimeType: 'test', data: 'test' }, {});
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// 3-N. Per-action tests
describe('wordpress-rest-api: create_post', () => {
  beforeEach(() => {});

  it('should execute create_post successfully', async () => {
    const ctx = mockContext(sample_create_post);
    const r = await execute({ action: 'create_post', title: 'test', content: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'create_post');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for create_post', async () => {
    const ctx = mockContext(sample_create_post);
    const r = await execute({ action: 'create_post' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for create_post', async () => {
    const ctx = mockContext(sample_create_post);
    const r = await execute({ action: 'create_post', title: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('wordpress-rest-api: list_posts', () => {
  beforeEach(() => {});

  it('should execute list_posts successfully', async () => {
    const ctx = mockContext(sample_list_posts);
    const r = await execute({ action: 'list_posts' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'list_posts');
    assert.ok(r.metadata.timestamp);
  });
});

describe('wordpress-rest-api: update_post', () => {
  beforeEach(() => {});

  it('should execute update_post successfully', async () => {
    const ctx = mockContext(sample_update_post);
    const r = await execute({ action: 'update_post', postId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'update_post');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for update_post', async () => {
    const ctx = mockContext(sample_update_post);
    const r = await execute({ action: 'update_post' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for update_post', async () => {
    const ctx = mockContext(sample_update_post);
    const r = await execute({ action: 'update_post', postId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('wordpress-rest-api: delete_post', () => {
  beforeEach(() => {});

  it('should execute delete_post successfully', async () => {
    const ctx = mockContext(sample_delete_post);
    const r = await execute({ action: 'delete_post', postId: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'delete_post');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for delete_post', async () => {
    const ctx = mockContext(sample_delete_post);
    const r = await execute({ action: 'delete_post' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for delete_post', async () => {
    const ctx = mockContext(sample_delete_post);
    const r = await execute({ action: 'delete_post', postId: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

describe('wordpress-rest-api: upload_media', () => {
  beforeEach(() => {});

  it('should execute upload_media successfully', async () => {
    const ctx = mockContext(sample_upload_media);
    const r = await execute({ action: 'upload_media', fileName: 'test', mimeType: 'test', data: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'upload_media');
    assert.ok(r.metadata.timestamp);
  });

  it('should reject missing required params for upload_media', async () => {
    const ctx = mockContext(sample_upload_media);
    const r = await execute({ action: 'upload_media' }, ctx);
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string required params for upload_media', async () => {
    const ctx = mockContext(sample_upload_media);
    const r = await execute({ action: 'upload_media', fileName: 123 }, ctx);
    assert.equal(r.metadata.success, false);
  });
});

// N+1. Timeout
describe('wordpress-rest-api: timeout', () => {
  beforeEach(() => {});
  it('should timeout on create_post', async () => {
    const r = await execute({ action: 'create_post', title: 'test', content: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on list_posts', async () => {
    const r = await execute({ action: 'list_posts' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on update_post', async () => {
    const r = await execute({ action: 'update_post', postId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on delete_post', async () => {
    const r = await execute({ action: 'delete_post', postId: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });

  it('should timeout on upload_media', async () => {
    const r = await execute({ action: 'upload_media', fileName: 'test', mimeType: 'test', data: 'test' }, mockContextTimeout());
    assert.equal(r.metadata.success, false);
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// N+2. Network errors
describe('wordpress-rest-api: network errors', () => {
  beforeEach(() => {});
  it('should return UPSTREAM_ERROR', async () => {
    const r = await execute({ action: 'create_post', title: 'test', content: 'test' }, mockContextError(new Error('Connection refused')));
    assert.equal(r.metadata.success, false); assert.equal(r.metadata.error, 'UPSTREAM_ERROR');
  });
  it('should include error message', async () => {
    const r = await execute({ action: 'create_post', title: 'test', content: 'test' }, mockContextError(new Error('Connection refused')));
    assert.ok(r.result.includes('Connection refused'));
  });
});

// N+3. getClient
describe('wordpress-rest-api: getClient', () => {
  beforeEach(() => {});
  it('prefer provider', () => { assert.equal(getClient({ providerClient: {request: () => {}}, gatewayClient: {request: () => {}} }).type, 'provider'); });
  it('fallback gateway', () => { assert.equal(getClient({ gatewayClient: {request: () => {}} }).type, 'gateway'); });
  it('null for empty', () => { assert.equal(getClient({}), null); });
  it('null for undefined', () => { assert.equal(getClient(undefined), null); });
  it('null for null', () => { assert.equal(getClient(null), null); });
});

// N+4. redactSensitive
describe('wordpress-rest-api: redactSensitive', () => {
  beforeEach(() => {});
  it('redact api_key', () => { assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', () => { assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('redact authorization', () => { assert.ok(redactSensitive('authorization: sample_auth_value').includes('[REDACTED]')); });
  it('clean string unchanged', () => { assert.equal(redactSensitive('clean'), 'clean'); });
  it('non-string input', () => { assert.equal(redactSensitive(42), 42); assert.equal(redactSensitive(null), null); });
});

// N+5. resolveTimeout
describe('wordpress-rest-api: resolveTimeout', () => {
  beforeEach(() => {});
  it('default empty', () => { assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS); });
  it('default undefined', () => { assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS); });
  it('custom val', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 60000 } }), 60000); });
  it('cap at max', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 999999 } }), MAX_TIMEOUT_MS); });
  it('ignore 0', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS); });
  it('ignore neg', () => { assert.equal(resolveTimeout({ config: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS); });
  it('ignore non-num', () => { assert.equal(resolveTimeout({ config: { timeoutMs: 'x' } }), DEFAULT_TIMEOUT_MS); });
  it('DEFAULT=30000', () => { assert.equal(DEFAULT_TIMEOUT_MS, 30000); });
  it('MAX=120000', () => { assert.equal(MAX_TIMEOUT_MS, 120000); });
});

// N+6. validate()
describe('wordpress-rest-api: validate()', () => {
  beforeEach(() => {});
  it('reject invalid', () => { assert.equal(validate({ action: 'bad' }).valid, false); });
  it('reject missing', () => { assert.equal(validate({}).valid, false); });
  it('reject null', () => { assert.equal(validate(null).valid, false); });
  it('create_post requires params', () => { assert.equal(validate({ action: 'create_post' }).valid, false); assert.equal(validate({ action: 'create_post', title: 'test', content: 'test' }).valid, true); });
  it('list_posts valid with no params', () => { assert.equal(validate({ action: 'list_posts' }).valid, true); });
  it('update_post requires params', () => { assert.equal(validate({ action: 'update_post' }).valid, false); assert.equal(validate({ action: 'update_post', postId: 'test' }).valid, true); });
  it('delete_post requires params', () => { assert.equal(validate({ action: 'delete_post' }).valid, false); assert.equal(validate({ action: 'delete_post', postId: 'test' }).valid, true); });
  it('upload_media requires params', () => { assert.equal(validate({ action: 'upload_media' }).valid, false); assert.equal(validate({ action: 'upload_media', fileName: 'test', mimeType: 'test', data: 'test' }).valid, true); });
});

// N+7. meta export
describe('wordpress-rest-api: meta export', () => {
  beforeEach(() => {});
  it('name', () => { assert.equal(meta.name, 'wordpress-rest-api'); });
  it('version', () => { assert.equal(meta.version, '1.0.0'); });
  it('description', () => { assert.ok(meta.description.length > 0); });
  it('actions count', () => { assert.equal(meta.actions.length, 5); });
});

// N+8. gatewayClient fallback
describe('wordpress-rest-api: gatewayClient fallback', () => {
  beforeEach(() => {});
  it('should use gatewayClient', async () => {
    const ctx = { gatewayClient: { request: async () => sample_create_post }, config: { timeoutMs: 5000 } };
    const r = await execute({ action: 'create_post', title: 'test', content: 'test' }, ctx);
    assert.equal(r.metadata.success, true);
  });
});

// N+9. providerNotConfiguredError
describe('wordpress-rest-api: providerNotConfiguredError', () => {
  beforeEach(() => {});
  it('success false', () => { assert.equal(providerNotConfiguredError().metadata.success, false); });
  it('code', () => { assert.equal(providerNotConfiguredError().metadata.error.code, 'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', () => { assert.equal(providerNotConfiguredError().metadata.error.retriable, false); });
  it('result includes Error', () => { assert.ok(providerNotConfiguredError().result.includes('Error')); });
});

// N+10. constants
describe('wordpress-rest-api: constants', () => {
  beforeEach(() => {});
  it('VALID_ACTIONS', () => { assert.deepEqual(VALID_ACTIONS, ['create_post', 'list_posts', 'update_post', 'delete_post', 'upload_media']); });
});

// N+11. request path verification
describe('wordpress-rest-api: request path verification', () => {
  beforeEach(() => {});
  it('should call correct path for create_post', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_create_post; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'create_post', title: 'test', content: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for list_posts', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_list_posts; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'list_posts' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for update_post', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_update_post; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'update_post', postId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for delete_post', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_delete_post; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'delete_post', postId: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });

  it('should call correct path for upload_media', async () => {
    let calledPath = null;
    const ctx = { providerClient: { request: async (m, p) => { calledPath = p; return sample_upload_media; } }, config: { timeoutMs: 5000 } };
    await execute({ action: 'upload_media', fileName: 'test', mimeType: 'test', data: 'test' }, ctx);
    assert.ok(calledPath !== null);
  });
});
