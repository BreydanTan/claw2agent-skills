# Permissions Report: IoT & Media Plugin

**Plugin ID:** `@claw2agent/plugin-iot-media`
**Category:** `iot-media`
**Skills included:** 12
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `calibre-api` | External API | `CALIBRE_API_API_KEY` | L1 | L1 |
| `color-palette-extractor` | External API | `COLOR_PALETTE_EXTRACTOR_API_KEY` | L1 | L1 |
| `frigate-nvr-api` | External API | `FRIGATE_NVR_API_API_KEY` | L1 | L1 |
| `home-assistant-api` | External API | `HOME_ASSISTANT_API_API_KEY` | L1 | L1 |
| `image-upscaler` | External API | `IMAGE_UPSCALER_API_KEY` | L1 | L1 |
| `minecraft-bot-controller` | External API | `MINECRAFT_BOT_CONTROLLER_API_KEY` | L1 | L1 |
| `music-generator` | External API | `MUSIC_GENERATOR_API_KEY` | L1 | L1 |
| `plex-api` | External API | `PLEX_API_API_KEY` | L1 | L1 |
| `transmission-rpc` | External API | `TRANSMISSION_RPC_API_KEY` | L1 | L1 |
| `video-downloader` | External API | `VIDEO_DOWNLOADER_API_KEY` | L1 | L1 |
| `video-editor-ffmpeg` | External API | `VIDEO_EDITOR_FFMPEG_API_KEY` | L1 | L1 |
| `weather-api` | External API | `WEATHER_API_API_KEY` | L1 | L1 |

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
    - calibre-api
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
