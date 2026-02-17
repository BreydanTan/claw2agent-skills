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
  validateProtocol,
  validateChain,
  VALID_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from '../handler.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockContext(requestResponse, config) {
  return {
    providerClient: {
      request: async (method, path, body, opts) => requestResponse,
    },
    config: config || { timeoutMs: 5000 },
  };
}

function mockContextError(error) {
  return {
    providerClient: {
      request: async () => { throw error; },
    },
    config: { timeoutMs: 1000 },
  };
}

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

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleProtocol = { name: 'Aave', tvl: 12345678900, chains: ['Ethereum', 'Polygon', 'Avalanche'], chainTvls: {} };
const sampleProtocols = [
  { name: 'Aave', tvl: 12345678900, chain: 'Ethereum' },
  { name: 'Uniswap', tvl: 9876543210, chain: 'Ethereum' },
];
const sampleChainTvl = [
  { date: 1700000000, tvl: 5000000000 },
  { date: 1700086400, tvl: 5100000000 },
];
const sampleYields = {
  data: [
    { pool: 'pool1', project: 'Aave', chain: 'Ethereum', apy: 5.23 },
    { pool: 'pool2', project: 'Compound', chain: 'Ethereum', apy: 3.14 },
  ],
};

// ---------------------------------------------------------------------------
// 1. Action validation
// ---------------------------------------------------------------------------
describe('defi-llama-api: action validation', () => {
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
describe('defi-llama-api: PROVIDER_NOT_CONFIGURED', () => {
  beforeEach(() => {});

  it('should fail get_protocol_tvl without client', async () => {
    const result = await execute({ action: 'get_protocol_tvl', protocol: 'aave' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(result.metadata.error.retriable, false);
  });

  it('should fail list_protocols without client', async () => {
    const result = await execute({ action: 'list_protocols' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_chain_tvl without client', async () => {
    const result = await execute({ action: 'get_chain_tvl', chain: 'ethereum' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should fail get_yields without client', async () => {
    const result = await execute({ action: 'get_yields' }, {});
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// 3. get_protocol_tvl
// ---------------------------------------------------------------------------
describe('defi-llama-api: get_protocol_tvl', () => {
  beforeEach(() => {});

  it('should get protocol TVL successfully', async () => {
    const ctx = mockContext(sampleProtocol);
    const result = await execute({ action: 'get_protocol_tvl', protocol: 'aave' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_protocol_tvl');
    assert.equal(result.metadata.protocol, 'aave');
    assert.ok(result.result.includes('Aave'));
    assert.ok(result.metadata.timestamp);
  });

  it('should reject missing protocol', async () => {
    const ctx = mockContext(sampleProtocol);
    const result = await execute({ action: 'get_protocol_tvl' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string protocol', async () => {
    const ctx = mockContext(sampleProtocol);
    const result = await execute({ action: 'get_protocol_tvl', protocol: 123 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should include chain count in metadata', async () => {
    const ctx = mockContext(sampleProtocol);
    const result = await execute({ action: 'get_protocol_tvl', protocol: 'aave' }, ctx);
    assert.equal(result.metadata.chainCount, 3);
  });
});

// ---------------------------------------------------------------------------
// 4. list_protocols
// ---------------------------------------------------------------------------
describe('defi-llama-api: list_protocols', () => {
  beforeEach(() => {});

  it('should list protocols successfully', async () => {
    const ctx = mockContext(sampleProtocols);
    const result = await execute({ action: 'list_protocols' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'list_protocols');
    assert.equal(result.metadata.protocolCount, 2);
    assert.ok(result.result.includes('Aave'));
    assert.ok(result.result.includes('Uniswap'));
  });

  it('should handle empty protocols', async () => {
    const ctx = mockContext([]);
    const result = await execute({ action: 'list_protocols' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.protocolCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. get_chain_tvl
// ---------------------------------------------------------------------------
describe('defi-llama-api: get_chain_tvl', () => {
  beforeEach(() => {});

  it('should get chain TVL history successfully', async () => {
    const ctx = mockContext(sampleChainTvl);
    const result = await execute({ action: 'get_chain_tvl', chain: 'ethereum' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_chain_tvl');
    assert.equal(result.metadata.chain, 'ethereum');
    assert.equal(result.metadata.dataPoints, 2);
  });

  it('should reject missing chain', async () => {
    const ctx = mockContext(sampleChainTvl);
    const result = await execute({ action: 'get_chain_tvl' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });

  it('should reject non-string chain', async () => {
    const ctx = mockContext(sampleChainTvl);
    const result = await execute({ action: 'get_chain_tvl', chain: 42 }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// 6. get_yields
// ---------------------------------------------------------------------------
describe('defi-llama-api: get_yields', () => {
  beforeEach(() => {});

  it('should get yields successfully', async () => {
    const ctx = mockContext(sampleYields);
    const result = await execute({ action: 'get_yields' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.action, 'get_yields');
    assert.equal(result.metadata.poolCount, 2);
    assert.ok(result.result.includes('Aave'));
  });

  it('should accept optional pool filter', async () => {
    const ctx = mockContext(sampleYields);
    const result = await execute({ action: 'get_yields', pool: 'pool1' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.poolFilter, 'pool1');
  });

  it('should handle empty yields', async () => {
    const ctx = mockContext({ data: [] });
    const result = await execute({ action: 'get_yields' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.equal(result.metadata.poolCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout handling
// ---------------------------------------------------------------------------
describe('defi-llama-api: timeout', () => {
  beforeEach(() => {});

  it('should return TIMEOUT error on get_protocol_tvl abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_protocol_tvl', protocol: 'aave' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on list_protocols abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'list_protocols' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_chain_tvl abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_chain_tvl', chain: 'ethereum' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });

  it('should return TIMEOUT error on get_yields abort', async () => {
    const ctx = mockContextTimeout();
    const result = await execute({ action: 'get_yields' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 8. Network error handling
// ---------------------------------------------------------------------------
describe('defi-llama-api: network errors', () => {
  beforeEach(() => {});

  it('should return UPSTREAM_ERROR on get_protocol_tvl failure', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_protocol_tvl', protocol: 'aave' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on list_protocols failure', async () => {
    const ctx = mockContextError(new Error('Network down'));
    const result = await execute({ action: 'list_protocols' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_chain_tvl failure', async () => {
    const ctx = mockContextError(new Error('Server error'));
    const result = await execute({ action: 'get_chain_tvl', chain: 'ethereum' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should return UPSTREAM_ERROR on get_yields failure', async () => {
    const ctx = mockContextError(new Error('Bad gateway'));
    const result = await execute({ action: 'get_yields' }, ctx);
    assert.equal(result.metadata.success, false);
    assert.equal(result.metadata.error, 'UPSTREAM_ERROR');
  });

  it('should include error message in result', async () => {
    const ctx = mockContextError(new Error('Connection refused'));
    const result = await execute({ action: 'get_protocol_tvl', protocol: 'aave' }, ctx);
    assert.ok(result.result.includes('Connection refused'));
  });
});

// ---------------------------------------------------------------------------
// 9. getClient
// ---------------------------------------------------------------------------
describe('defi-llama-api: getClient', () => {
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

  it('should return null when no client (empty object)', () => {
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
// 10. redactSensitive
// ---------------------------------------------------------------------------
describe('defi-llama-api: redactSensitive', () => {
  beforeEach(() => {});

  it('should redact api_key patterns', () => {
    const input = 'api_key: sample_api_key_for_testing data';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_api_key_for_testing'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact bearer token patterns', () => {
    const input = 'bearer: test_placeholder_token';
    const output = redactSensitive(input);
    assert.ok(!output.includes('test_placeholder_token'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should redact authorization patterns', () => {
    const input = 'authorization: sample_auth_value_placeholder';
    const output = redactSensitive(input);
    assert.ok(!output.includes('sample_auth_value_placeholder'));
    assert.ok(output.includes('[REDACTED]'));
  });

  it('should not alter clean strings', () => {
    const input = 'Found 5 protocols matching query';
    assert.equal(redactSensitive(input), input);
  });

  it('should handle non-string input', () => {
    assert.equal(redactSensitive(42), 42);
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
  });
});

// ---------------------------------------------------------------------------
// 11. resolveTimeout
// ---------------------------------------------------------------------------
describe('defi-llama-api: resolveTimeout', () => {
  beforeEach(() => {});

  it('should return default timeout when no config', () => {
    assert.equal(resolveTimeout({}), DEFAULT_TIMEOUT_MS);
  });

  it('should return default timeout for undefined context', () => {
    assert.equal(resolveTimeout(undefined), DEFAULT_TIMEOUT_MS);
  });

  it('should use custom configured timeout', () => {
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

  it('should verify DEFAULT_TIMEOUT_MS is 30000', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30000);
  });

  it('should verify MAX_TIMEOUT_MS is 120000', () => {
    assert.equal(MAX_TIMEOUT_MS, 120000);
  });
});

// ---------------------------------------------------------------------------
// 12. validate()
// ---------------------------------------------------------------------------
describe('defi-llama-api: validate()', () => {
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

  it('should validate get_protocol_tvl requires protocol', () => {
    assert.equal(validate({ action: 'get_protocol_tvl' }).valid, false);
    assert.equal(validate({ action: 'get_protocol_tvl', protocol: 'aave' }).valid, true);
  });

  it('should validate list_protocols needs no required params', () => {
    assert.equal(validate({ action: 'list_protocols' }).valid, true);
  });

  it('should validate get_chain_tvl requires chain', () => {
    assert.equal(validate({ action: 'get_chain_tvl' }).valid, false);
    assert.equal(validate({ action: 'get_chain_tvl', chain: 'ethereum' }).valid, true);
  });

  it('should validate get_yields needs no required params', () => {
    assert.equal(validate({ action: 'get_yields' }).valid, true);
  });
});

// ---------------------------------------------------------------------------
// 13. meta export
// ---------------------------------------------------------------------------
describe('defi-llama-api: meta export', () => {
  beforeEach(() => {});

  it('should have correct name', () => {
    assert.equal(meta.name, 'defi-llama-api');
  });

  it('should have version', () => {
    assert.ok(meta.version);
    assert.equal(meta.version, '1.0.0');
  });

  it('should have description', () => {
    assert.ok(meta.description);
    assert.ok(meta.description.includes('DeFi'));
  });

  it('should list all 4 actions', () => {
    assert.equal(meta.actions.length, 4);
    assert.ok(meta.actions.includes('get_protocol_tvl'));
    assert.ok(meta.actions.includes('list_protocols'));
    assert.ok(meta.actions.includes('get_chain_tvl'));
    assert.ok(meta.actions.includes('get_yields'));
  });
});

// ---------------------------------------------------------------------------
// 14. gatewayClient fallback
// ---------------------------------------------------------------------------
describe('defi-llama-api: gatewayClient fallback', () => {
  beforeEach(() => {});

  it('should use gatewayClient when providerClient is absent', async () => {
    let calledPath = null;
    const ctx = {
      gatewayClient: {
        request: async (method, path) => {
          calledPath = path;
          return sampleProtocol;
        },
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'get_protocol_tvl', protocol: 'aave' }, ctx);
    assert.equal(result.metadata.success, true);
    assert.ok(calledPath.includes('/protocol/'));
  });

  it('should succeed with gatewayClient for list_protocols', async () => {
    const ctx = {
      gatewayClient: {
        request: async () => sampleProtocols,
      },
      config: { timeoutMs: 5000 },
    };
    const result = await execute({ action: 'list_protocols' }, ctx);
    assert.equal(result.metadata.success, true);
  });
});

// ---------------------------------------------------------------------------
// 15. providerNotConfiguredError
// ---------------------------------------------------------------------------
describe('defi-llama-api: providerNotConfiguredError', () => {
  beforeEach(() => {});

  it('should return correct error structure', () => {
    const err = providerNotConfiguredError();
    assert.equal(err.metadata.success, false);
    assert.equal(err.metadata.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(err.metadata.error.retriable, false);
    assert.ok(err.metadata.error.message.includes('Provider client required'));
  });

  it('should include Error in result', () => {
    const err = providerNotConfiguredError();
    assert.ok(err.result.includes('Error'));
  });
});

// ---------------------------------------------------------------------------
// 16. constants
// ---------------------------------------------------------------------------
describe('defi-llama-api: constants', () => {
  beforeEach(() => {});

  it('should have correct VALID_ACTIONS', () => {
    assert.deepEqual(VALID_ACTIONS, [
      'get_protocol_tvl', 'list_protocols', 'get_chain_tvl', 'get_yields',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 17. request path verification
// ---------------------------------------------------------------------------
describe('defi-llama-api: request path verification', () => {
  beforeEach(() => {});

  it('should call GET /protocol/{protocol} for get_protocol_tvl', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: { request: async (method, path) => { calledMethod = method; calledPath = path; return sampleProtocol; } },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_protocol_tvl', protocol: 'aave' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.equal(calledPath, '/protocol/aave');
  });

  it('should call GET /protocols for list_protocols', async () => {
    let calledMethod = null;
    let calledPath = null;
    const ctx = {
      providerClient: { request: async (method, path) => { calledMethod = method; calledPath = path; return sampleProtocols; } },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'list_protocols' }, ctx);
    assert.equal(calledMethod, 'GET');
    assert.equal(calledPath, '/protocols');
  });

  it('should call GET /v2/historicalChainTvl/{chain} for get_chain_tvl', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: { request: async (method, path) => { calledPath = path; return sampleChainTvl; } },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_chain_tvl', chain: 'ethereum' }, ctx);
    assert.equal(calledPath, '/v2/historicalChainTvl/ethereum');
  });

  it('should call GET /pools for get_yields', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: { request: async (method, path) => { calledPath = path; return sampleYields; } },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_yields' }, ctx);
    assert.equal(calledPath, '/pools');
  });

  it('should call GET /pools?pool=xxx for get_yields with pool filter', async () => {
    let calledPath = null;
    const ctx = {
      providerClient: { request: async (method, path) => { calledPath = path; return sampleYields; } },
      config: { timeoutMs: 5000 },
    };
    await execute({ action: 'get_yields', pool: 'pool1' }, ctx);
    assert.ok(calledPath.includes('/pools?pool=pool1'));
  });
});
