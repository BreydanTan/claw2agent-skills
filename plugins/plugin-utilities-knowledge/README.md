# Utilities & Knowledge Plugin

Skills for file management, memory storage, knowledge bases, reminders, and general utilities.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-utilities-knowledge
```

## Included Skills (11)

- [`binance-api`](../../skills/binance-api/SKILL.md) — Access Binance cryptocurrency market data including prices, order books, and trading pairs
- [`coinbase-api`](../../skills/coinbase-api/SKILL.md) — Access Coinbase cryptocurrency data including spot prices, exchange rates, and supported currencies
- [`etherscan-api`](../../skills/etherscan-api/SKILL.md) — Access Ethereum blockchain data including balances, transactions, and gas prices
- [`file-manager`](../../skills/file-manager/SKILL.md) — Manage files within a sandboxed /data/ directory. Supports reading, writing, listing, and deleting files and directories.
- [`knowledge-base`](../../skills/knowledge-base/SKILL.md) — In-memory keyword-based knowledge store. Add, search, list, and delete knowledge entries. Search uses TF-IDF-like scoring for relevance ranking.
- [`memory-manager`](../../skills/memory-manager/SKILL.md) — Persistent key-value memory storage using a local JSON file. Store, retrieve, search, list, and delete entries with automatic timestamping.
- [`note-taking`](../../skills/note-taking/SKILL.md) — Create, manage, search, and organize notes with tags and folders
- [`price-drop-monitor`](../../skills/price-drop-monitor/SKILL.md) — Track product prices, set price alerts, and analyze price history
- [`speech-to-text`](../../skills/speech-to-text/SKILL.md) — Transcribe audio to text with language detection, timestamps, and multiple format support
- [`spreadsheet-analyzer`](../../skills/spreadsheet-analyzer/SKILL.md) — Analyze tabular data with statistics, filtering, sorting, aggregation, and pivot tables
- [`voice-synthesizer`](../../skills/voice-synthesizer/SKILL.md) — Convert text to speech with multiple voices, languages, and audio formats

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
