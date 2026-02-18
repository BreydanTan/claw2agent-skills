# AI & ML Plugin

Skills for AI orchestration, image generation, local LLMs, vision models, sentiment analysis, and prompt engineering.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-ai-ml
```

## Included Skills (11)

- [`agent-council`](../../skills/agent-council/SKILL.md) — Manage a council of virtual agents that deliberate on decisions using structured debate patterns. Pure local multi-agent collaboration logic with role-based perspective generation and configurable voting methods.
- [`image-generation`](../../skills/image-generation/SKILL.md) — Generate, edit, and create variations of images using AI model APIs. Supports multiple models, sizes, quality levels, and styles. Layer 1 skill using provider client for API access.
- [`multi-agent-orchestration`](../../skills/multi-agent-orchestration/SKILL.md) — Manage workflows where multiple agents collaborate on tasks. Define sequential, parallel, or conditional workflows with dependency tracking and simulated execution.
- [`ollama-local-llm`](../../skills/ollama-local-llm/SKILL.md) — Run local LLM inference via Ollama API.
- [`prompt-generator`](../../skills/prompt-generator/SKILL.md) — Generate and optimize prompts for AI models.
- [`prompt-library`](../../skills/prompt-library/SKILL.md) — Store, search, and manage reusable prompt templates. Supports categorization, variable interpolation, and version tracking.
- [`prompt-optimizer`](../../skills/prompt-optimizer/SKILL.md) — Analyze and optimize prompts for AI models. Provides scoring, suggestions, restructuring, and best-practice checks.
- [`sentiment-analysis`](../../skills/sentiment-analysis/SKILL.md) — Analyze text sentiment, emotion, and tone.
- [`translation-hub`](../../skills/translation-hub/SKILL.md) — Translate text between languages using configurable translation providers. Supports language detection, batch translation, and multiple provider backends.
- [`vision-model`](../../skills/vision-model/SKILL.md) — Analyze images using vision AI models.
- [`whisper-transcribe`](../../skills/whisper-transcribe/SKILL.md) — OpenAI Whisper speech-to-text transcription skill. Transcribe audio, translate to English, detect language, and list supported models and formats. Layer 1 skill using provider client for API access.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
