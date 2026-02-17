# Claw2Agent Skills

The official skill repository for the [Claw2Agent](https://github.com/BreydanTan) platform -- a modular AI agent framework where each skill is a self-contained plugin that extends the agent's capabilities.

**76 skills** across 15+ categories, covering social media APIs, finance, productivity, DevOps, AI/ML, research, and more.

## Quick Start

```bash
git clone https://github.com/BreydanTan/claw2agent-skills.git
cd claw2agent-skills
```

Run any skill's tests:

```bash
node --test skills/<skill-name>/__tests__/handler.test.js
```

Run all tests:

```bash
node --test skills/**/__tests__/handler.test.js
```

## Architecture

Every skill follows a consistent interface with three exports:

```js
// ESM only
export async function execute(params, context) { ... }
export function validate(params) { ... }
export const meta = { name, version, description, actions };
```

### Two Layers

| Layer | Description | External API | Example |
|-------|-------------|-------------|---------|
| **L0** | Pure local computation, no network calls | No | excel-api, chart-generator, citation-generator |
| **L1** | External API via injected provider/gateway client | Yes | weather-api, github-api, binance-api |

**L1 skills never hardcode API URLs or keys.** All external access goes through an injected `context.providerClient` (preferred) or `context.gatewayClient` (fallback), enabling BYOK (Bring Your Own Key) and platform-managed authentication.

### Standard Return Format

```js
// Success
{
  result: "Human-readable description",
  metadata: { success: true, action: "action_name", timestamp: "..." }
}

// Error
{
  result: "Error: description",
  metadata: { success: false, error: "ERROR_CODE" }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_ACTION` | Action not recognized |
| `INVALID_INPUT` | Missing or malformed parameter |
| `PROVIDER_NOT_CONFIGURED` | No API client available (L1) |
| `TIMEOUT` | Request exceeded timeout (L1) |
| `UPSTREAM_ERROR` | External API returned an error (L1) |
| `NOT_FOUND` | Resource does not exist |

## Skill Catalog

### Social & Marketing

| Skill | Layer | Description |
|-------|-------|-------------|
| [reddit-api-manager](skills/reddit-api-manager) | L1 | Reddit API -- posts, comments, subreddits, user profiles |
| [x-twitter-api](skills/x-twitter-api) | L1 | X/Twitter API -- tweets, search, user profiles, timelines |
| [instagram-graph-api](skills/instagram-graph-api) | L1 | Instagram Graph API -- profiles, media, hashtags, insights |
| [youtube-data-api](skills/youtube-data-api) | L1 | YouTube Data API -- search, video/channel details, playlists |
| [mailchimp-api](skills/mailchimp-api) | L1 | Mailchimp Marketing API -- campaigns, audiences, subscribers |
| [whatsapp-integration](skills/whatsapp-integration) | L1 | WhatsApp Cloud API -- messages, read receipts, templates |
| [twitter-manager](skills/twitter-manager) | L1 | Twitter/X management -- post tweets, get details |
| [slack-integration](skills/slack-integration) | L1 | Slack API -- messages, channels, users |
| [discord-bot](skills/discord-bot) | -- | Discord API -- messages, channels |
| [telegram-bot](skills/telegram-bot) | -- | Telegram Bot API -- messages, updates |

### Finance & Crypto

| Skill | Layer | Description |
|-------|-------|-------------|
| [binance-api](skills/binance-api) | L1 | Binance market data -- prices, order books, klines |
| [coinbase-api](skills/coinbase-api) | L1 | Coinbase data -- spot prices, exchange rates, currencies |
| [etherscan-api](skills/etherscan-api) | L1 | Ethereum blockchain -- balances, transactions, gas prices |
| [stock-crypto-analyzer](skills/stock-crypto-analyzer) | L2 | Real-time quotes, technical analysis (SMA, RSI, MACD) |
| [price-drop-monitor](skills/price-drop-monitor) | L1 | Track product prices, set alerts, analyze history |

### Productivity & Documents

| Skill | Layer | Description |
|-------|-------|-------------|
| [notion-api](skills/notion-api) | L1 | Notion API -- pages, databases, blocks, search |
| [google-calendar-api](skills/google-calendar-api) | L1 | Google Calendar -- events CRUD, search, availability |
| [excel-api](skills/excel-api) | L0 | Spreadsheet manipulation with JSON data structures |
| [pptx-generator](skills/pptx-generator) | L0 | PowerPoint presentation data structure generation |
| [pdf-ocr-parser](skills/pdf-ocr-parser) | L1 | PDF/image OCR -- text extraction, table parsing |
| [note-taking](skills/note-taking) | L0 | Notes management with tags and folders |
| [chart-generator](skills/chart-generator) | L0 | Chart.js-compatible chart configuration builder |
| [spreadsheet-analyzer](skills/spreadsheet-analyzer) | L0 | Tabular data analysis -- stats, filtering, pivots |
| [calendar-manager](skills/calendar-manager) | -- | Calendar event management |
| [markdown-writer](skills/markdown-writer) | -- | Markdown document creation and formatting |
| [meeting-summarizer](skills/meeting-summarizer) | -- | Meeting transcript analysis and summarization |

### Development & DevOps

| Skill | Layer | Description |
|-------|-------|-------------|
| [github-api](skills/github-api) | L1 | GitHub API -- repos, issues, PRs, code search |
| [docker-api](skills/docker-api) | L1 | Docker Engine API -- containers, images, volumes |
| [playwright](skills/playwright) | L1 | Browser automation -- navigation, screenshots, extraction |
| [github-repo-manager](skills/github-repo-manager) | L1 | GitHub repository management |
| [jira-manager](skills/jira-manager) | L1 | Jira projects and issues management |
| [linear-tracker](skills/linear-tracker) | L1 | Linear issues, projects, and cycles |
| [trello-manager](skills/trello-manager) | L1 | Trello boards, lists, and cards |
| [todoist-manager](skills/todoist-manager) | L1 | Todoist projects and tasks |
| [code-interpreter](skills/code-interpreter) | -- | Sandboxed JavaScript execution |
| [uptime-monitor](skills/uptime-monitor) | -- | Website uptime monitoring |

### AI & ML

| Skill | Layer | Description |
|-------|-------|-------------|
| [whisper-transcribe](skills/whisper-transcribe) | L1 | OpenAI Whisper speech-to-text transcription |
| [image-generation](skills/image-generation) | L1 | AI image generation, editing, and variations |
| [image-upscaler](skills/image-upscaler) | L1 | AI-powered image upscaling and enhancement |
| [voice-synthesizer](skills/voice-synthesizer) | L1 | Text-to-speech with multiple voices and formats |
| [speech-to-text](skills/speech-to-text) | L1 | Audio transcription with language detection |
| [translator-deepl-google](skills/translator-deepl-google) | L1 | Text translation and language detection |
| [prompt-library](skills/prompt-library) | -- | Reusable prompt template management |
| [prompt-optimizer](skills/prompt-optimizer) | -- | AI prompt analysis and optimization |
| [multi-agent-orchestration](skills/multi-agent-orchestration) | -- | Multi-agent workflow orchestration |
| [agent-council](skills/agent-council) | -- | Virtual agent deliberation council |

### Data & Research

| Skill | Layer | Description |
|-------|-------|-------------|
| [weather-api](skills/weather-api) | L1 | Open-Meteo weather data -- current, forecast, history |
| [web-scraper](skills/web-scraper) | L1 | Web scraping and content extraction |
| [tavily-search](skills/tavily-search) | L1 | Tavily-powered web search and extraction |
| [deep-research](skills/deep-research) | -- | Multi-step research with DuckDuckGo |
| [web-search](skills/web-search) | -- | DuckDuckGo web search |
| [rss-monitor](skills/rss-monitor) | -- | RSS/Atom feed monitoring |
| [topic-monitor](skills/topic-monitor) | -- | Topic and keyword tracking |
| [data-analyzer](skills/data-analyzer) | -- | JSON data array analysis |

### Communication

| Skill | Layer | Description |
|-------|-------|-------------|
| [sms-sender-twilio](skills/sms-sender-twilio) | L1 | Twilio SMS/MMS -- send, retrieve, list messages |
| [email-sender](skills/email-sender) | -- | Email sending via Resend API |
| [crm-connector](skills/crm-connector) | L1 | CRM contacts, leads, and activity logs |

### Integration & Automation

| Skill | Layer | Description |
|-------|-------|-------------|
| [zapier-bridge](skills/zapier-bridge) | L1 | Zapier Zaps -- trigger, list, status, executions |
| [airtable-database](skills/airtable-database) | L1 | Airtable bases, tables, and records |
| [notion-integration](skills/notion-integration) | L1 | Notion workspace integration |
| [webhook-receiver](skills/webhook-receiver) | -- | Incoming webhook endpoint management |
| [http-api-caller](skills/http-api-caller) | -- | Generic HTTP API requests |
| [scheduler](skills/scheduler) | -- | Cron-like task scheduling |

### Utilities & Security

| Skill | Layer | Description |
|-------|-------|-------------|
| [guard-agent](skills/guard-agent) | L2 | Security threat scanning -- injection, phishing detection |
| [pii-redaction](skills/pii-redaction) | -- | PII detection and redaction |
| [file-manager](skills/file-manager) | -- | Sandboxed file operations |
| [memory-manager](skills/memory-manager) | -- | Persistent key-value storage |
| [knowledge-base](skills/knowledge-base) | -- | In-memory keyword search store |
| [remind-me](skills/remind-me) | -- | Timed reminder system |
| [language-tutor](skills/language-tutor) | -- | Interactive language learning |
| [coding-agent](skills/coding-agent) | -- | LLM-powered code generation |

## File Structure

Each skill follows this structure:

```
skills/<skill-name>/
  handler.js              # Skill implementation
  skill.json              # Metadata and configuration
  README.md               # Documentation
  package.json            # ESM config
  __tests__/
    handler.test.js       # Test suite (node:test + node:assert/strict)
```

## Contributing

### Creating a New Skill

1. Create the skill directory:
   ```bash
   mkdir -p skills/my-skill/__tests__
   ```

2. Implement the required files following the L0 or L1 pattern:
   - `handler.js` -- must export `execute`, `validate`, `meta`
   - `skill.json` -- metadata with name, layer, category, actions
   - `README.md` -- documentation with actions, parameters, examples
   - `__tests__/handler.test.js` -- comprehensive tests (80+ assertions for L1, 100+ for L0)
   - `package.json` -- `{"type": "module"}`

3. Run tests:
   ```bash
   node --test skills/my-skill/__tests__/handler.test.js
   ```

4. Submit a PR.

### Conventions

- **ESM only** -- `import`/`export`, no CommonJS
- **No hardcoded secrets** -- L1 skills use injected clients, never embed API keys
- **Structured errors** -- use standard error codes (`INVALID_INPUT`, `TIMEOUT`, etc.)
- **Test framework** -- `node:test` with `node:assert/strict`
- **Zero runtime dependencies** -- skills use Node.js built-ins and injected clients only

## Testing

All skills are tested using Node.js built-in test runner with strict assertions:

```bash
# Test a single skill
node --test skills/weather-api/__tests__/handler.test.js

# Test all skills
node --test skills/**/__tests__/handler.test.js
```

Current test coverage across fully-tested skills: **3,000+ tests, all passing.**

## Using with OpenClaw

[OpenClaw](https://github.com/openclaw/openclaw) is an open-source AI agent platform that supports workspace skills. Claw2Agent skills can be integrated with OpenClaw in two ways:

### Method 1: Workspace Skill (Recommended)

Each claw2agent skill can be loaded as an OpenClaw workspace skill by adding a `SKILL.md` file that teaches the agent how to invoke the handler.

**Step 1:** Clone this repo into your OpenClaw workspace:

```bash
cd ~/.openclaw/workspace
git clone https://github.com/BreydanTan/claw2agent-skills.git
```

**Step 2:** Symlink the skills you want into the workspace skills directory:

```bash
# Link a single skill
ln -s ~/.openclaw/workspace/claw2agent-skills/skills/weather-api \
      ~/.openclaw/workspace/skills/claw2agent-weather

# Or link multiple skills at once
for skill in weather-api web-scraper github-api binance-api; do
  ln -s ~/.openclaw/workspace/claw2agent-skills/skills/$skill \
        ~/.openclaw/workspace/skills/claw2agent-$skill
done
```

**Step 3:** Create a `SKILL.md` in each linked skill folder. Example for `weather-api`:

```markdown
---
name: claw2agent-weather
description: Fetch current weather, forecasts, and historical weather data for any location. Use when the user asks about weather, temperature, or climate.
user-invocable: true
metadata:
  {"openclaw":{"requires":{"bins":["node"]},"emoji":"🌤️"}}
---

# Weather API Skill

This skill provides weather data via the claw2agent weather-api handler.

## Available Actions

- `get_current` — Get current weather for a location
- `get_forecast` — Get multi-day forecast
- `get_history` — Get historical weather data
- `list_locations` — Search for location coordinates

## Usage

To call this skill, use the exec tool to run the handler:

\```bash
node -e "
  import('./handler.js').then(async m => {
    const result = await m.execute(
      { action: 'get_current', location: 'Tokyo' },
      { providerClient: { request: async (method, path) => {
          const res = await fetch('https://api.open-meteo.com/v1' + path);
          return res.json();
        }
      }}
    );
    console.log(JSON.stringify(result, null, 2));
  });
"
\```

When the user asks for weather, determine the appropriate action and parameters, then invoke using the pattern above.
```

**Step 4:** Enable in `openclaw.json` (optional, workspace skills are enabled by default):

```json
{
  "skills": {
    "entries": {
      "claw2agent-weather": {
        "enabled": true
      }
    }
  }
}
```

### Method 2: Direct Node.js Integration

If you're building a custom OpenClaw setup or using the Gateway API directly, you can import skills as ESM modules:

```js
import { execute, validate, meta } from './skills/weather-api/handler.js';

// Validate parameters
const validation = validate({ action: 'get_current', location: 'Tokyo' });
if (!validation.valid) {
  console.error(validation.error);
  process.exit(1);
}

// Execute with a provider client
const result = await execute(
  { action: 'get_current', location: 'Tokyo' },
  {
    providerClient: {
      request: async (method, path, body, opts) => {
        // Route through OpenClaw Gateway or direct API call
        const response = await fetch(`https://your-api-base${path}`, {
          method,
          headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
          body: body ? JSON.stringify(body) : undefined,
          signal: opts?.signal,
        });
        return response.json();
      }
    },
    config: { timeoutMs: 30000 }
  }
);

console.log(result);
// { result: "Current weather in Tokyo: 18°C, partly cloudy", metadata: { success: true, ... } }
```

### Method 3: ClawHub Publishing

To publish individual skills to [ClawHub](https://clawdhub.com) for community distribution:

```bash
# Install ClawHub CLI
npm install -g clawdhub

# Navigate to a skill
cd skills/weather-api

# Publish (requires ClawHub account)
clawdhub publish
```

### Provider Client Pattern

The key concept for OpenClaw integration is the **provider client**. L1 skills expect a `context.providerClient` object with a `request(method, path, body, opts)` method. This allows OpenClaw's Gateway to manage API keys and routing centrally:

```js
// The providerClient abstraction
const providerClient = {
  request: async (method, path, body, opts) => {
    // OpenClaw Gateway handles auth, rate limiting, and routing
    return await openclawGateway.routeRequest({
      skill: 'weather-api',
      method,
      path,
      body,
      signal: opts?.signal
    });
  }
};
```

This design means skills never touch API keys directly -- the platform manages all credentials, enabling BYOK (Bring Your Own Key) and centralized secret management.

## Roadmap

- [ ] Batch 3: Finance & Research (defi-llama, finnhub, arxiv, semantic-scholar, citation-generator)
- [ ] Batch 4: Platform & Automation (linkedin, tiktok, wordpress, outlook, podcast-index)
- [ ] Batch 5: Media & IoT (home-assistant, plex, ffmpeg, music-generator)
- [ ] Batch 6: Long-tail (ssh, ollama, vision, google-maps, and more)
- [ ] SKILL.md auto-generation for all skills
- [ ] ClawHub publishing pipeline

See individual skill READMEs for detailed API documentation.

## Resources

- [OpenClaw Documentation](https://docs.openclaw.ai/tools/skills) -- Official skills guide
- [ClawHub Registry](https://clawdhub.com) -- Community skill marketplace
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) -- Platform source code

## License

MIT
