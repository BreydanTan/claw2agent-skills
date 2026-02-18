# Permissions Report: Social Media Plugin

**Plugin ID:** `@claw2agent/plugin-social`
**Category:** `social`
**Skills included:** 13
**Generated:** 2026-02-18

## Permission Matrix

| Skill | Network Access | Env Vars Required | Layer | Risk |
|-------|---------------|-------------------|-------|------|
| `google-business-api` | External API | `GOOGLE_BUSINESS_API_API_KEY` | L1 | L1 |
| `instagram-graph-api` | External API | `INSTAGRAM_GRAPH_API_API_KEY` | L1 | L1 |
| `linkedin-marketing-api` | External API | `LINKEDIN_MARKETING_API_API_KEY` | L1 | L1 |
| `mailchimp-api` | External API | `MAILCHIMP_API_API_KEY` | L1 | L1 |
| `meta-ad-library-api` | External API | `META_AD_LIBRARY_API_API_KEY` | L1 | L1 |
| `quora-zhihu-manager` | External API | `QUORA_ZHIHU_MANAGER_API_KEY` | L1 | L1 |
| `reddit-api-manager` | External API | `REDDIT_API_MANAGER_API_KEY` | L1 | L1 |
| `social-poster` | External API | `SOCIAL_POSTER_API_KEY` | L1 | L1 |
| `tiktok-content-api` | External API | `TIKTOK_CONTENT_API_API_KEY` | L1 | L1 |
| `twitter-manager` | External API | — | L1 | L1 |
| `whatsapp-integration` | External API | `WHATSAPP_INTEGRATION_API_KEY` | L1 | L1 |
| `x-twitter-api` | External API | `X_TWITTER_API_API_KEY` | L1 | L1 |
| `youtube-data-api` | External API | `YOUTUBE_DATA_API_API_KEY` | L1 | L1 |

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
    - google-business-api
    # add more skills as needed
```

## Revoking Access

Remove the skill from `tools.allow` or add it to `tools.deny` to disable.
