# Permissions Report: AI & ML Plugin

**Plugin ID:** `@claw2agent/plugin-ai-ml`
**Category:** `ai-ml`
**Skills included:** 11
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `agent-council` | None / Local | — | L0 | L0 |
| `image-generation` | External API | `IMAGE_GENERATION_API_KEY` | L1 | L1 |
| `multi-agent-orchestration` | None / Local | — | L0 | L0 |
| `ollama-local-llm` | External API | `OLLAMA_LOCAL_LLM_API_KEY` | L1 | L1 |
| `prompt-generator` | External API | `PROMPT_GENERATOR_API_KEY` | L1 | L1 |
| `prompt-library` | None / Local | — | L0 | L0 |
| `prompt-optimizer` | None / Local | — | L0 | L0 |
| `sentiment-analysis` | External API | `SENTIMENT_ANALYSIS_API_KEY` | L1 | L1 |
| `translation-hub` | None / Local | `TRANSLATION_HUB_API_KEY` | L0 | L0 |
| `vision-model` | External API | `VISION_MODEL_API_KEY` | L1 | L1 |
| `whisper-transcribe` | External API | `WHISPER_TRANSCRIBE_API_KEY` | L1 | L1 |

## Default Policy

- All skills are **disabled by default** until explicitly enabled via `tools.allow`.
- API keys are injected via `providerClient` — never hardcoded.
- Network access is limited to the specific upstream API for each skill.
- No skill in this plugin writes to the local filesystem unless explicitly designed to do so.

## Enabling Skills

```yaml
# openclaw config
tools:
  allow:
    - agent-council
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
