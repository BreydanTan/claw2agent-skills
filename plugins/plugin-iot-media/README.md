# IoT & Media Plugin

Skills for Home Assistant, Plex, Frigate NVR, video editing, music generation, and media management.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-iot-media
```

## Included Skills (12)

- [`calibre-api`](../../skills/calibre-api/SKILL.md) — Browse and manage ebook libraries via Calibre Content Server.
- [`color-palette-extractor`](../../skills/color-palette-extractor/SKILL.md) — Extract dominant colors and generate palettes from images.
- [`frigate-nvr-api`](../../skills/frigate-nvr-api/SKILL.md) — Monitor cameras, view events, and manage recordings via Frigate NVR.
- [`home-assistant-api`](../../skills/home-assistant-api/SKILL.md) — Control smart home devices and automations via Home Assistant API.
- [`image-upscaler`](../../skills/image-upscaler/SKILL.md) — AI-powered image upscaling and enhancement via provider client
- [`minecraft-bot-controller`](../../skills/minecraft-bot-controller/SKILL.md) — Control Minecraft bots for building, mining, and exploring.
- [`music-generator`](../../skills/music-generator/SKILL.md) — Generate music, melodies, and audio compositions via AI music APIs.
- [`plex-api`](../../skills/plex-api/SKILL.md) — Browse and manage media libraries on Plex Media Server.
- [`transmission-rpc`](../../skills/transmission-rpc/SKILL.md) — Manage torrent downloads via Transmission RPC interface.
- [`video-downloader`](../../skills/video-downloader/SKILL.md) — Download videos from supported platforms for processing.
- [`video-editor-ffmpeg`](../../skills/video-editor-ffmpeg/SKILL.md) — Process and transform video/audio files using FFmpeg commands.
- [`weather-api`](../../skills/weather-api/SKILL.md) — Weather data retrieval via Open-Meteo API. Supports current weather, forecasts, hourly data, historical data, and location search. Layer 1 skill using provider client for API access.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
