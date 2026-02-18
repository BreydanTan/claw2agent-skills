# Finance Plugin

Skills for stock/crypto market data, DeFi analytics, and financial research.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-finance
```

## Included Skills (3)

- [`defi-llama-api`](../../skills/defi-llama-api/SKILL.md) — Query DeFi protocol TVL, yields, and chain data via DeFiLlama API.
- [`finnhub-api`](../../skills/finnhub-api/SKILL.md) — Access stock quotes, company profiles, and market news via Finnhub API.
- [`stock-crypto-analyzer`](../../skills/stock-crypto-analyzer/SKILL.md) — Real-time stock and cryptocurrency quotes, technical analysis (SMA, RSI, MACD, Bollinger Bands), symbol comparison, and price alert watchlists. Requires a platform gateway adapter for market data access.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
