# Claw2Agent Skills

The official skill repository for the [Claw2Agent](https://github.com/BreydanTan) platform -- a modular AI agent framework where each skill is a self-contained plugin that extends the agent's capabilities.

**119 skills** across 15+ categories, covering social media APIs, finance, productivity, DevOps, AI/ML, research, IoT, media, and more. **10,207 tests, all passing.**

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

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [reddit-api-manager](skills/reddit-api-manager) | L1 | 129 | Reddit API -- posts, comments, subreddits, user profiles |
| [x-twitter-api](skills/x-twitter-api) | L1 | 150 | X/Twitter API -- tweets, search, user profiles, timelines |
| [instagram-graph-api](skills/instagram-graph-api) | L1 | 148 | Instagram Graph API -- profiles, media, hashtags, insights |
| [youtube-data-api](skills/youtube-data-api) | L1 | 152 | YouTube Data API -- search, video/channel details, playlists |
| [mailchimp-api](skills/mailchimp-api) | L1 | 147 | Mailchimp Marketing API -- campaigns, audiences, subscribers |
| [whatsapp-integration](skills/whatsapp-integration) | L1 | 70 | WhatsApp Cloud API -- messages, read receipts, templates |
| [twitter-manager](skills/twitter-manager) | L1 | 81 | Twitter/X management -- post tweets, get details |
| [slack-integration](skills/slack-integration) | L1 | 78 | Slack API -- messages, channels, users |
| [discord-bot](skills/discord-bot) | L1 | 90 | Discord API -- messages, channels |
| [telegram-bot](skills/telegram-bot) | L1 | 96 | Telegram Bot API -- messages, updates |
| [linkedin-marketing-api](skills/linkedin-marketing-api) | L1 | 63 | LinkedIn Marketing API -- posts, profiles, analytics |
| [tiktok-content-api](skills/tiktok-content-api) | L1 | 65 | TikTok Content API -- publishing, analytics |
| [quora-zhihu-manager](skills/quora-zhihu-manager) | L1 | 55 | Quora/Zhihu management -- posts, answers |
| [social-poster](skills/social-poster) | L1 | 55 | Cross-platform social media posting |
| [seo-optimizer](skills/seo-optimizer) | L1 | 57 | SEO analysis and optimization |
| [google-trends-api](skills/google-trends-api) | L1 | 55 | Google Trends data -- interest over time, related queries |
| [google-business-api](skills/google-business-api) | L1 | 67 | Google Business Profile -- listings, reviews, posts |
| [meta-ad-library-api](skills/meta-ad-library-api) | L1 | 67 | Meta Ad Library -- ad search and analysis |

### Finance & Crypto

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [binance-api](skills/binance-api) | L1 | 48 | Binance market data -- prices, order books, klines |
| [coinbase-api](skills/coinbase-api) | L1 | 42 | Coinbase data -- spot prices, exchange rates, currencies |
| [etherscan-api](skills/etherscan-api) | L1 | 37 | Ethereum blockchain -- balances, transactions, gas prices |
| [stock-crypto-analyzer](skills/stock-crypto-analyzer) | L0 | 76 | Real-time quotes, technical analysis (SMA, RSI, MACD) |
| [price-drop-monitor](skills/price-drop-monitor) | L0 | 127 | Track product prices, set alerts, analyze history |
| [defi-llama-api](skills/defi-llama-api) | L1 | 69 | DeFi protocol TVL, yields, and chain data |
| [finnhub-api](skills/finnhub-api) | L1 | 65 | Stock quotes, company profiles, market news |

### Productivity & Documents

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [notion-api](skills/notion-api) | L1 | 163 | Notion API -- pages, databases, blocks, search |
| [google-calendar-api](skills/google-calendar-api) | L1 | 184 | Google Calendar -- events CRUD, search, availability |
| [excel-api](skills/excel-api) | L0 | 126 | Spreadsheet manipulation with JSON data structures |
| [pptx-generator](skills/pptx-generator) | L0 | 121 | PowerPoint presentation data structure generation |
| [pdf-ocr-parser](skills/pdf-ocr-parser) | L1 | 134 | PDF/image OCR -- text extraction, table parsing |
| [note-taking](skills/note-taking) | L0 | 129 | Notes management with tags and folders |
| [chart-generator](skills/chart-generator) | L0 | 170 | Chart.js-compatible chart configuration builder |
| [spreadsheet-analyzer](skills/spreadsheet-analyzer) | L0 | 137 | Tabular data analysis -- stats, filtering, pivots |
| [calendar-manager](skills/calendar-manager) | L0 | 41 | Calendar event management |
| [markdown-writer](skills/markdown-writer) | L0 | 33 | Markdown document creation and formatting |
| [meeting-summarizer](skills/meeting-summarizer) | L0 | 32 | Meeting transcript analysis and summarization |
| [outlook-microsoft-graph-api](skills/outlook-microsoft-graph-api) | L1 | 65 | Outlook email via Microsoft Graph API |
| [excel-handler](skills/excel-handler) | L0 | 88 | Excel file parsing and manipulation |
| [pdf-reader](skills/pdf-reader) | L0 | 89 | PDF text extraction and parsing |
| [pdf-compare](skills/pdf-compare) | L0 | 57 | PDF document comparison |

### Development & DevOps

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [github-api](skills/github-api) | L1 | 192 | GitHub API -- repos, issues, PRs, code search |
| [docker-api](skills/docker-api) | L1 | 179 | Docker Engine API -- containers, images, volumes |
| [playwright](skills/playwright) | L1 | 185 | Browser automation -- navigation, screenshots, extraction |
| [github-repo-manager](skills/github-repo-manager) | L1 | 86 | GitHub repository management |
| [jira-manager](skills/jira-manager) | L1 | 84 | Jira projects and issues management |
| [linear-tracker](skills/linear-tracker) | L1 | 148 | Linear issues, projects, and cycles |
| [trello-manager](skills/trello-manager) | L1 | 75 | Trello boards, lists, and cards |
| [todoist-manager](skills/todoist-manager) | L1 | 77 | Todoist projects and tasks |
| [code-interpreter](skills/code-interpreter) | L0 | 97 | Sandboxed JavaScript execution |
| [uptime-monitor](skills/uptime-monitor) | L0 | 67 | Website uptime monitoring |
| [npm-audit-snyk](skills/npm-audit-snyk) | L1 | 57 | NPM package auditing and vulnerability scanning |
| [code-sandbox-e2b](skills/code-sandbox-e2b) | L1 | 55 | Cloud sandbox code execution via E2B |
| [ssh-client](skills/ssh-client) | L1 | 57 | SSH remote command execution |
| [coding-agent](skills/coding-agent) | L1 | 82 | LLM-powered code generation |
| [test-generator](skills/test-generator) | L1 | 57 | Automated test generation |
| [swagger-openapi-generator](skills/swagger-openapi-generator) | L0 | 57 | OpenAPI/Swagger spec generation |
| [sql-analyzer](skills/sql-analyzer) | L0 | 57 | SQL query analysis and optimization |
| [database-query](skills/database-query) | L1 | 87 | Database query execution |
| [log-monitor](skills/log-monitor) | L1 | 53 | Application log monitoring and analysis |

### AI & ML

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [whisper-transcribe](skills/whisper-transcribe) | L1 | 151 | OpenAI Whisper speech-to-text transcription |
| [image-generation](skills/image-generation) | L1 | 77 | AI image generation, editing, and variations |
| [image-upscaler](skills/image-upscaler) | L1 | 198 | AI-powered image upscaling and enhancement |
| [voice-synthesizer](skills/voice-synthesizer) | L1 | 147 | Text-to-speech with multiple voices and formats |
| [speech-to-text](skills/speech-to-text) | L1 | 149 | Audio transcription with language detection |
| [translator-deepl-google](skills/translator-deepl-google) | L1 | 188 | Text translation and language detection |
| [prompt-library](skills/prompt-library) | L0 | 1 | Reusable prompt template management |
| [prompt-optimizer](skills/prompt-optimizer) | L0 | 24 | AI prompt analysis and optimization |
| [multi-agent-orchestration](skills/multi-agent-orchestration) | L0 | 57 | Multi-agent workflow orchestration |
| [agent-council](skills/agent-council) | L0 | 60 | Virtual agent deliberation council |
| [sentiment-analysis](skills/sentiment-analysis) | L1 | 57 | Text sentiment analysis and classification |
| [ollama-local-llm](skills/ollama-local-llm) | L1 | 55 | Local LLM inference via Ollama |
| [vision-model](skills/vision-model) | L1 | 57 | Image analysis and visual question answering |
| [prompt-generator](skills/prompt-generator) | L1 | 55 | AI prompt generation and templating |
| [music-generator](skills/music-generator) | L1 | 59 | AI music generation |

### Data & Research

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [weather-api](skills/weather-api) | L1 | 210 | Open-Meteo weather data -- current, forecast, history |
| [web-scraper](skills/web-scraper) | L1 | 233 | Web scraping and content extraction |
| [tavily-search](skills/tavily-search) | L1 | 194 | Tavily-powered web search and extraction |
| [deep-research](skills/deep-research) | L0 | 92 | Multi-step research with DuckDuckGo |
| [web-search](skills/web-search) | L1 | 93 | DuckDuckGo web search |
| [rss-monitor](skills/rss-monitor) | L0 | 41 | RSS/Atom feed monitoring |
| [topic-monitor](skills/topic-monitor) | L0 | 1 | Topic and keyword tracking |
| [data-analyzer](skills/data-analyzer) | L0 | 98 | JSON data array analysis |
| [arxiv-api](skills/arxiv-api) | L1 | 67 | arXiv paper search and retrieval |
| [semantic-scholar-api](skills/semantic-scholar-api) | L1 | 66 | Academic paper search, citations, references |
| [citation-generator](skills/citation-generator) | L0 | 80 | APA/MLA/Chicago/BibTeX citation formatting |
| [google-maps-api](skills/google-maps-api) | L1 | 57 | Google Maps geocoding, directions, places |

### Communication

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [sms-sender-twilio](skills/sms-sender-twilio) | L1 | 164 | Twilio SMS/MMS -- send, retrieve, list messages |
| [email-sender](skills/email-sender) | L1 | 93 | Email sending via Resend API |
| [crm-connector](skills/crm-connector) | L1 | 78 | CRM contacts, leads, and activity logs |
| [crm-api-salesforce-hubspot](skills/crm-api-salesforce-hubspot) | L1 | 70 | Unified CRM for Salesforce/HubSpot |
| [email-validator](skills/email-validator) | L1 | 57 | Email address validation and verification |

### Integration & Automation

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [zapier-bridge](skills/zapier-bridge) | L1 | 72 | Zapier Zaps -- trigger, list, status, executions |
| [airtable-database](skills/airtable-database) | L1 | 135 | Airtable bases, tables, and records |
| [notion-integration](skills/notion-integration) | L1 | 83 | Notion workspace integration |
| [webhook-receiver](skills/webhook-receiver) | L0 | 1 | Incoming webhook endpoint management |
| [http-api-caller](skills/http-api-caller) | L1 | 46 | Generic HTTP API requests |
| [scheduler](skills/scheduler) | L0 | 96 | Cron-like task scheduling |
| [wordpress-rest-api](skills/wordpress-rest-api) | L1 | 72 | WordPress posts, pages, and media |
| [podcast-index-api](skills/podcast-index-api) | L1 | 65 | Podcast search, episodes, trending feeds |

### Content & Media

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [video-downloader](skills/video-downloader) | L1 | 57 | Video downloading from multiple platforms |
| [video-editor-ffmpeg](skills/video-editor-ffmpeg) | L1 | 63 | Video editing via FFmpeg |
| [youtube-analyzer](skills/youtube-analyzer) | L0 | 92 | YouTube video analysis and statistics |
| [plex-api](skills/plex-api) | L1 | 57 | Plex media server management |
| [calibre-api](skills/calibre-api) | L1 | 59 | Calibre e-book library management |
| [translation-hub](skills/translation-hub) | L0 | 16 | Multi-provider translation aggregation |
| [color-palette-extractor](skills/color-palette-extractor) | L0 | 63 | Image color palette extraction |
| [i18n-tool](skills/i18n-tool) | L0 | 57 | Internationalization and localization toolkit |

### IoT & Home Automation

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [home-assistant-api](skills/home-assistant-api) | L1 | 61 | Home Assistant smart home control |
| [frigate-nvr-api](skills/frigate-nvr-api) | L1 | 57 | Frigate NVR camera and event management |
| [minecraft-bot-controller](skills/minecraft-bot-controller) | L1 | 53 | Minecraft bot automation and control |
| [transmission-rpc](skills/transmission-rpc) | L1 | 59 | Transmission torrent client management |
| [apple-health-parser](skills/apple-health-parser) | L0 | 57 | Apple Health data parsing and analysis |

### Utilities & Security

| Skill | Layer | Tests | Description |
|-------|-------|-------|-------------|
| [guard-agent](skills/guard-agent) | L0 | 65 | Security threat scanning -- injection, phishing detection |
| [pii-redaction](skills/pii-redaction) | L0 | 33 | PII detection and redaction |
| [file-manager](skills/file-manager) | L0 | 93 | Sandboxed file operations |
| [memory-manager](skills/memory-manager) | L0 | 85 | Persistent key-value storage |
| [knowledge-base](skills/knowledge-base) | L0 | 86 | In-memory keyword search store |
| [remind-me](skills/remind-me) | L0 | 84 | Timed reminder system |
| [language-tutor](skills/language-tutor) | L0 | 1 | Interactive language learning |

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

## Testing

All 119 skills are tested using Node.js built-in test runner (`node:test`) with strict assertions (`node:assert/strict`).

```bash
# Test a single skill
node --test skills/weather-api/__tests__/handler.test.js

# Test all skills
node --test skills/**/__tests__/handler.test.js
```

### Test Summary

| Metric | Value |
|--------|-------|
| Total skills | 119 |
| Total tests | 10,207 |
| Passing | 10,207 |
| Failing | 0 |
| Test suites (describe blocks) | 1,700+ |

### What We Test

Every skill test suite covers these areas:

**1. Input Validation**
- Missing required parameters (`action`, skill-specific params)
- Invalid action names return `INVALID_ACTION` error code
- Invalid parameter types and out-of-range values
- Empty strings, null values, undefined fields

**2. Action Execution (per action)**
- Successful execution with valid parameters
- Correct return format (`result` string + `metadata` object)
- Metadata contains `success: true`, `action`, `timestamp` (ISO 8601)
- Response data accuracy and completeness

**3. Error Handling**
- `INVALID_INPUT` -- missing or malformed parameters
- `INVALID_ACTION` -- unrecognized action name
- `PROVIDER_NOT_CONFIGURED` -- no API client injected (L1 only)
- `TIMEOUT` -- request exceeded timeout limit (L1 only)
- `UPSTREAM_ERROR` -- external API returned error (L1 only)
- `NOT_FOUND` -- requested resource does not exist
- All errors return `metadata.success === false` with appropriate error code

**4. Provider Client Integration (L1 skills)**
- Uses `context.providerClient` when available
- Falls back to `context.gatewayClient` when providerClient is missing
- Returns `PROVIDER_NOT_CONFIGURED` when neither is available
- Correct HTTP method, path, and body passed to provider
- Request timeout enforcement via `AbortController`

**5. Edge Cases**
- Default parameter values applied correctly
- Boundary values (empty arrays, zero counts, max limits)
- Unicode and special characters in input
- Concurrent operations and state isolation

**6. Internal Exports**
- `meta` object contains required fields (name, version, description, actions)
- `validate()` function returns `{ valid: true/false, error? }`
- Helper functions and constants are properly exported

### Top Skills by Test Count

| Skill | Tests | Suites |
|-------|-------|--------|
| web-scraper | 233 | 26 |
| weather-api | 210 | 25 |
| image-upscaler | 198 | 24 |
| tavily-search | 194 | 23 |
| github-api | 192 | 30 |
| translator-deepl-google | 188 | 23 |
| playwright | 185 | 24 |
| google-calendar-api | 184 | 25 |
| docker-api | 179 | 23 |
| chart-generator | 170 | 12 |
| sms-sender-twilio | 164 | 25 |
| notion-api | 163 | 25 |
| youtube-data-api | 152 | 25 |
| whisper-transcribe | 151 | 23 |
| x-twitter-api | 150 | 25 |
| speech-to-text | 149 | 21 |
| instagram-graph-api | 148 | 24 |
| linear-tracker | 148 | 24 |
| mailchimp-api | 147 | 22 |
| voice-synthesizer | 147 | 22 |

### Test Distribution

```
200+ tests:  3 skills  (web-scraper, weather-api, image-upscaler)
150-199:    12 skills  (github-api, playwright, google-calendar-api, ...)
100-149:    10 skills  (reddit-api-manager, pdf-ocr-parser, airtable-database, ...)
 50-99:     62 skills  (majority of skills)
  1-49:     32 skills  (simpler utilities and stubs)
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

- [x] Batch 1-2: Core skills (social, productivity, DevOps, AI/ML)
- [x] Batch 3: Finance & Research (binance, coinbase, etherscan, defi-llama, finnhub, arxiv, semantic-scholar, citation-generator)
- [x] Batch 4: Platform & Automation (linkedin, tiktok, wordpress, outlook, podcast-index, google-business, meta-ad-library, crm-salesforce-hubspot)
- [x] Batch 5: Media & IoT (home-assistant, plex, ffmpeg, music-generator, frigate, transmission, calibre, minecraft)
- [x] Batch 6: Long-tail (ssh, ollama, vision, google-maps, npm-audit, email-validator, sentiment-analysis, and more)
- [ ] SKILL.md auto-generation for all skills
- [ ] ClawHub publishing pipeline

See individual skill READMEs for detailed API documentation.

## Resources

- [OpenClaw Documentation](https://docs.openclaw.ai/tools/skills) -- Official skills guide
- [ClawHub Registry](https://clawdhub.com) -- Community skill marketplace
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) -- Platform source code

## License

MIT
