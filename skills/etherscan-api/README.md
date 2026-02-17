# Etherscan API Skill

**Layer**: L1 (External API via injected client)
**Category**: Finance / Blockchain

## Description

Access Ethereum blockchain data including account balances, transaction history, gas prices, ERC-20 token balances, and block information. All external calls go through an injected provider client — no hardcoded endpoints.

## Actions

| Action | Description | Requires Client |
|--------|-------------|-----------------|
| `get_balance` | Get ETH balance for an address | Yes |
| `get_transactions` | Get transaction history | Yes |
| `get_gas_price` | Get current gas prices | Yes |
| `get_token_balance` | Get ERC-20 token balance | Yes |
| `get_block` | Get block information | Yes |

## Usage Examples

### Get Balance
```json
{ "action": "get_balance", "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38" }
```

### Get Gas Price
```json
{ "action": "get_gas_price" }
```

### Get Block
```json
{ "action": "get_block", "blockNumber": "latest" }
```

## Running Tests

```bash
node --test skills/etherscan-api/__tests__/handler.test.js
```
