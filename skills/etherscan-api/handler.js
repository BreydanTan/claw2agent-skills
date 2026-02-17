/**
 * Etherscan API Skill Handler (Layer 1)
 *
 * Access Ethereum blockchain data including account balances,
 * transaction history, gas prices, token balances, and block info.
 *
 * L1 RULES:
 * - No hardcoded vendor endpoints
 * - All external access through injected providerClient or gatewayClient
 * - Enforces timeout (default 15s, max 30s)
 * - Redacts tokens/keys from outputs
 * - Validates/sanitizes all inputs
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = [
  'get_balance',
  'get_transactions',
  'get_gas_price',
  'get_token_balance',
  'get_block',
];

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

function getClient(context) {
  if (context?.providerClient) return { client: context.providerClient, type: 'provider' };
  if (context?.gatewayClient) return { client: context.gatewayClient, type: 'gateway' };
  return null;
}

function providerNotConfiguredError() {
  return {
    result: 'Error: Provider client required for Etherscan data access. Configure an API key or platform adapter.',
    metadata: { success: false, error: 'PROVIDER_NOT_CONFIGURED' },
  };
}

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

function resolveTimeout(context) {
  const configured = context?.config?.timeoutMs;
  if (typeof configured === 'number' && configured > 0) {
    return Math.min(configured, MAX_TIMEOUT_MS);
  }
  return DEFAULT_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Request with timeout
// ---------------------------------------------------------------------------

async function requestWithTimeout(client, method, path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.request(method, path, body, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms.` };
    }
    throw { code: 'REQUEST_ERROR', message: err.message || 'Unknown request error' };
  }
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi,
];

export function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

export function validateAddress(address) {
  if (!address || typeof address !== 'string') return { valid: false, error: 'Address is required.' };
  const trimmed = address.trim();
  if (!ETH_ADDRESS_REGEX.test(trimmed)) {
    return { valid: false, error: `Invalid Ethereum address "${trimmed}". Must be 0x followed by 40 hex characters.` };
  }
  return { valid: true, value: trimmed };
}

function resolveLimit(limit) {
  if (typeof limit === 'number' && limit > 0) return Math.min(Math.floor(limit), MAX_LIMIT);
  return DEFAULT_LIMIT;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function weiToEth(wei) {
  if (typeof wei === 'string') wei = parseFloat(wei);
  if (typeof wei !== 'number' || isNaN(wei)) return 'N/A';
  return (wei / 1e18).toFixed(6);
}

function gweiToGwei(gwei) {
  if (typeof gwei === 'string') gwei = parseFloat(gwei);
  if (typeof gwei !== 'number' || isNaN(gwei)) return 'N/A';
  return gwei.toFixed(2);
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleGetBalance(params, context) {
  const addrResult = validateAddress(params.address);
  if (!addrResult.valid) {
    return {
      result: `Error: ${addrResult.error}`,
      metadata: { success: false, error: 'INVALID_ADDRESS' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET',
      `/account/${addrResult.value}/balance`,
      null, timeoutMs,
    );

    const balanceWei = data?.balance ?? data?.result ?? '0';
    const balanceEth = weiToEth(balanceWei);

    return {
      result: redactSensitive(`Balance for ${addrResult.value}: ${balanceEth} ETH`),
      metadata: {
        success: true,
        action: 'get_balance',
        layer: 'L1',
        address: addrResult.value,
        balanceWei: String(balanceWei),
        balanceEth: parseFloat(balanceEth),
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

async function handleGetTransactions(params, context) {
  const addrResult = validateAddress(params.address);
  if (!addrResult.valid) {
    return {
      result: `Error: ${addrResult.error}`,
      metadata: { success: false, error: 'INVALID_ADDRESS' },
    };
  }

  const limit = resolveLimit(params.limit);
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET',
      `/account/${addrResult.value}/transactions?limit=${limit}`,
      null, timeoutMs,
    );

    const txns = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data?.result) ? data.result : []);

    if (txns.length === 0) {
      return {
        result: `No transactions found for ${addrResult.value}.`,
        metadata: {
          success: true, action: 'get_transactions', layer: 'L1',
          address: addrResult.value, count: 0, transactions: [],
        },
      };
    }

    const lines = [
      `Transactions for ${addrResult.value} (${txns.length}):`,
      '',
      ...txns.slice(0, limit).map((tx, i) => {
        const hash = tx.hash || tx.txHash || 'N/A';
        const value = tx.value ? `${weiToEth(tx.value)} ETH` : 'N/A';
        const from = tx.from || 'N/A';
        const to = tx.to || 'N/A';
        return `  ${i + 1}. ${hash.slice(0, 10)}... | ${value} | ${from.slice(0, 8)}→${to.slice(0, 8)}`;
      }),
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true, action: 'get_transactions', layer: 'L1',
        address: addrResult.value, count: txns.length,
        transactions: txns.slice(0, limit),
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

async function handleGetGasPrice(_params, context) {
  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET', '/gas/price', null, timeoutMs,
    );

    const safeGwei = data?.SafeGasPrice ?? data?.safe ?? data?.low ?? 'N/A';
    const proposeGwei = data?.ProposeGasPrice ?? data?.standard ?? data?.medium ?? 'N/A';
    const fastGwei = data?.FastGasPrice ?? data?.fast ?? data?.high ?? 'N/A';

    const lines = [
      'Gas Price (Gwei)',
      `Safe: ${gweiToGwei(safeGwei)}`,
      `Standard: ${gweiToGwei(proposeGwei)}`,
      `Fast: ${gweiToGwei(fastGwei)}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true, action: 'get_gas_price', layer: 'L1',
        safeGwei: parseFloat(safeGwei) || null,
        standardGwei: parseFloat(proposeGwei) || null,
        fastGwei: parseFloat(fastGwei) || null,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

async function handleGetTokenBalance(params, context) {
  const addrResult = validateAddress(params.address);
  if (!addrResult.valid) {
    return {
      result: `Error: ${addrResult.error}`,
      metadata: { success: false, error: 'INVALID_ADDRESS' },
    };
  }

  const contractResult = validateAddress(params.contractAddress);
  if (!contractResult.valid) {
    return {
      result: 'Error: The "contractAddress" parameter is required and must be a valid Ethereum address.',
      metadata: { success: false, error: 'INVALID_CONTRACT_ADDRESS' },
    };
  }

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET',
      `/account/${addrResult.value}/token/${contractResult.value}/balance`,
      null, timeoutMs,
    );

    const balance = data?.balance ?? data?.result ?? '0';
    const tokenName = data?.tokenName ?? data?.name ?? 'Unknown Token';
    const decimals = data?.decimals ?? 18;

    return {
      result: redactSensitive(`Token balance for ${addrResult.value}: ${balance} ${tokenName}`),
      metadata: {
        success: true, action: 'get_token_balance', layer: 'L1',
        address: addrResult.value,
        contractAddress: contractResult.value,
        balance: String(balance),
        tokenName,
        decimals,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

async function handleGetBlock(params, context) {
  const blockNumber = params.blockNumber || 'latest';

  const resolved = getClient(context);
  if (!resolved) return providerNotConfiguredError();

  const timeoutMs = resolveTimeout(context);

  try {
    const data = await requestWithTimeout(
      resolved.client, 'GET',
      `/block/${encodeURIComponent(blockNumber)}`,
      null, timeoutMs,
    );

    const number = data?.number ?? data?.blockNumber ?? blockNumber;
    const txCount = data?.transactionCount ?? data?.transactions?.length ?? 0;
    const miner = data?.miner ?? 'N/A';
    const blockTimestamp = data?.timestamp ?? 'N/A';
    const gasUsed = data?.gasUsed ?? 'N/A';
    const gasLimit = data?.gasLimit ?? 'N/A';

    const lines = [
      `Block #${number}`,
      `Transactions: ${txCount}`,
      `Miner: ${miner}`,
      `Timestamp: ${blockTimestamp}`,
      `Gas Used: ${gasUsed} / ${gasLimit}`,
    ];

    return {
      result: redactSensitive(lines.join('\n')),
      metadata: {
        success: true, action: 'get_block', layer: 'L1',
        blockNumber: String(number),
        transactionCount: txCount,
        miner,
        timestamp: new Date().toISOString(),
        gasUsed, gasLimit,
      },
    };
  } catch (err) {
    return {
      result: redactSensitive(`Error: ${err.message}`),
      metadata: { success: false, error: err.code || 'REQUEST_ERROR' },
    };
  }
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

export function validate(params) {
  const { action } = params || {};
  if (!action || !VALID_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const meta = {
  name: 'etherscan-api',
  version: '1.0.0',
  description: 'Access Ethereum blockchain data including balances, transactions, gas prices, token balances, and block info.',
  actions: VALID_ACTIONS,
};

// ---------------------------------------------------------------------------
// Main execute entry point
// ---------------------------------------------------------------------------

export async function execute(params, context) {
  const { action } = params || {};

  if (!action) {
    return {
      result: 'Error: The "action" parameter is required. Supported actions: ' + VALID_ACTIONS.join(', ') + '.',
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  if (!VALID_ACTIONS.includes(action)) {
    return {
      result: `Error: Unknown action "${String(action)}". Supported actions: ${VALID_ACTIONS.join(', ')}.`,
      metadata: { success: false, error: 'INVALID_ACTION' },
    };
  }

  switch (action) {
    case 'get_balance': return handleGetBalance(params, context);
    case 'get_transactions': return handleGetTransactions(params, context);
    case 'get_gas_price': return handleGetGasPrice(params, context);
    case 'get_token_balance': return handleGetTokenBalance(params, context);
    case 'get_block': return handleGetBlock(params, context);
    default:
      return { result: `Error: Unknown action "${String(action)}".`, metadata: { success: false, error: 'INVALID_ACTION' } };
  }
}
