import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execute, validate, meta, redactSensitive, validateAddress } from '../handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ADDR = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38';
const VALID_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

function mockContext(responseData) {
  return {
    providerClient: {
      request: async () => responseData,
    },
    config: {},
  };
}

function errorContext(msg) {
  return {
    providerClient: {
      request: async () => { throw new Error(msg); },
    },
    config: {},
  };
}

function abortContext() {
  return {
    providerClient: {
      request: async () => { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; },
    },
    config: {},
  };
}

// ===========================================================================
// meta
// ===========================================================================

describe('etherscan-api: meta', () => {
  it('should export correct name', () => assert.equal(meta.name, 'etherscan-api'));
  it('should export 5 actions', () => assert.equal(meta.actions.length, 5));
  it('should include get_balance', () => assert.ok(meta.actions.includes('get_balance')));
  it('should include get_gas_price', () => assert.ok(meta.actions.includes('get_gas_price')));
});

// ===========================================================================
// validate
// ===========================================================================

describe('etherscan-api: validate', () => {
  it('should validate known actions', () => {
    for (const a of meta.actions) assert.equal(validate({ action: a }).valid, true);
  });
  it('should reject unknown action', () => assert.equal(validate({ action: 'x' }).valid, false));
  it('should reject null', () => assert.equal(validate(null).valid, false));
});

// ===========================================================================
// validateAddress
// ===========================================================================

describe('etherscan-api: validateAddress', () => {
  it('should accept valid address', () => {
    const r = validateAddress(VALID_ADDR);
    assert.equal(r.valid, true);
    assert.equal(r.value, VALID_ADDR);
  });
  it('should reject short address', () => assert.equal(validateAddress('0x123').valid, false));
  it('should reject null', () => assert.equal(validateAddress(null).valid, false));
  it('should reject empty', () => assert.equal(validateAddress('').valid, false));
  it('should reject non-hex', () => assert.equal(validateAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG').valid, false));
});

// ===========================================================================
// redactSensitive
// ===========================================================================

describe('etherscan-api: redactSensitive', () => {
  it('should redact api_key', () => assert.ok(redactSensitive('api_key: xyz').includes('[REDACTED]')));
  it('should pass clean text', () => assert.equal(redactSensitive('hello'), 'hello'));
  it('should handle non-string', () => assert.equal(redactSensitive(42), 42));
});

// ===========================================================================
// Action validation
// ===========================================================================

describe('etherscan-api: action validation', () => {
  it('should error on missing action', async () => {
    const r = await execute({}, {});
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });
  it('should error on unknown action', async () => {
    const r = await execute({ action: 'bad' }, {});
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });
  it('should error on null params', async () => {
    const r = await execute(null, {});
    assert.equal(r.metadata.error, 'INVALID_ACTION');
  });
});

// ===========================================================================
// get_balance
// ===========================================================================

describe('etherscan-api: get_balance', () => {
  it('should return balance', async () => {
    const ctx = mockContext({ balance: '1000000000000000000' }); // 1 ETH in wei
    const r = await execute({ action: 'get_balance', address: VALID_ADDR }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_balance');
    assert.equal(r.metadata.address, VALID_ADDR);
    assert.equal(r.metadata.balanceEth, 1);
    assert.ok(r.result.includes('1.000000'));
  });

  it('should error on invalid address', async () => {
    const r = await execute({ action: 'get_balance', address: 'bad' }, mockContext({}));
    assert.equal(r.metadata.error, 'INVALID_ADDRESS');
  });

  it('should error on missing address', async () => {
    const r = await execute({ action: 'get_balance' }, mockContext({}));
    assert.equal(r.metadata.error, 'INVALID_ADDRESS');
  });

  it('should error without provider', async () => {
    const r = await execute({ action: 'get_balance', address: VALID_ADDR }, {});
    assert.equal(r.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should handle request error', async () => {
    const r = await execute({ action: 'get_balance', address: VALID_ADDR }, errorContext('fail'));
    assert.equal(r.metadata.error, 'REQUEST_ERROR');
  });

  it('should handle timeout', async () => {
    const r = await execute({ action: 'get_balance', address: VALID_ADDR }, abortContext());
    assert.equal(r.metadata.error, 'TIMEOUT');
  });
});

// ===========================================================================
// get_transactions
// ===========================================================================

describe('etherscan-api: get_transactions', () => {
  it('should return transactions', async () => {
    const ctx = mockContext({
      transactions: [
        { hash: '0xabc123def456', from: '0x111', to: '0x222', value: '500000000000000000' },
      ],
    });
    const r = await execute({ action: 'get_transactions', address: VALID_ADDR }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 1);
    assert.ok(r.result.includes('0xabc123de'));
  });

  it('should handle empty transactions', async () => {
    const ctx = mockContext({ transactions: [] });
    const r = await execute({ action: 'get_transactions', address: VALID_ADDR }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.count, 0);
  });

  it('should error on invalid address', async () => {
    const r = await execute({ action: 'get_transactions', address: 'bad' }, mockContext({}));
    assert.equal(r.metadata.error, 'INVALID_ADDRESS');
  });
});

// ===========================================================================
// get_gas_price
// ===========================================================================

describe('etherscan-api: get_gas_price', () => {
  it('should return gas prices', async () => {
    const ctx = mockContext({ SafeGasPrice: '20', ProposeGasPrice: '25', FastGasPrice: '35' });
    const r = await execute({ action: 'get_gas_price' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.action, 'get_gas_price');
    assert.equal(r.metadata.safeGwei, 20);
    assert.equal(r.metadata.standardGwei, 25);
    assert.equal(r.metadata.fastGwei, 35);
    assert.ok(r.result.includes('20.00'));
  });

  it('should error without provider', async () => {
    const r = await execute({ action: 'get_gas_price' }, {});
    assert.equal(r.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });

  it('should handle alternative field names', async () => {
    const ctx = mockContext({ safe: '15', standard: '20', fast: '30' });
    const r = await execute({ action: 'get_gas_price' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.safeGwei, 15);
  });
});

// ===========================================================================
// get_token_balance
// ===========================================================================

describe('etherscan-api: get_token_balance', () => {
  it('should return token balance', async () => {
    const ctx = mockContext({ balance: '1000000', tokenName: 'USDT', decimals: 6 });
    const r = await execute({ action: 'get_token_balance', address: VALID_ADDR, contractAddress: VALID_CONTRACT }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.tokenName, 'USDT');
    assert.equal(r.metadata.contractAddress, VALID_CONTRACT);
  });

  it('should error on missing address', async () => {
    const r = await execute({ action: 'get_token_balance', contractAddress: VALID_CONTRACT }, mockContext({}));
    assert.equal(r.metadata.error, 'INVALID_ADDRESS');
  });

  it('should error on missing contractAddress', async () => {
    const r = await execute({ action: 'get_token_balance', address: VALID_ADDR }, mockContext({}));
    assert.equal(r.metadata.error, 'INVALID_CONTRACT_ADDRESS');
  });
});

// ===========================================================================
// get_block
// ===========================================================================

describe('etherscan-api: get_block', () => {
  it('should return block data', async () => {
    const ctx = mockContext({
      number: 18000000,
      transactionCount: 150,
      miner: '0xminer',
      timestamp: '2023-09-01T00:00:00Z',
      gasUsed: '15000000',
      gasLimit: '30000000',
    });
    const r = await execute({ action: 'get_block', blockNumber: '18000000' }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.blockNumber, '18000000');
    assert.equal(r.metadata.transactionCount, 150);
    assert.ok(r.result.includes('18000000'));
  });

  it('should default to latest block', async () => {
    const ctx = mockContext({ number: 'latest' });
    const r = await execute({ action: 'get_block' }, ctx);
    assert.equal(r.metadata.success, true);
  });

  it('should error without provider', async () => {
    const r = await execute({ action: 'get_block' }, {});
    assert.equal(r.metadata.error, 'PROVIDER_NOT_CONFIGURED');
  });
});

// ===========================================================================
// Gateway fallback
// ===========================================================================

describe('etherscan-api: gateway fallback', () => {
  it('should use gatewayClient when providerClient is absent', async () => {
    const ctx = { gatewayClient: { request: async () => ({ balance: '2000000000000000000' }) } };
    const r = await execute({ action: 'get_balance', address: VALID_ADDR }, ctx);
    assert.equal(r.metadata.success, true);
    assert.equal(r.metadata.balanceEth, 2);
  });
});
