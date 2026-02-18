# Social Media Plugin

Skills for managing social media platforms: Twitter/X, LinkedIn, Instagram, TikTok, Reddit, and more.

## Installation

```bash
openclaw plugins install @claw2agent/plugin-social
```

## Included Skills (13)

- [`google-business-api`](../../skills/google-business-api/SKILL.md) — Manage Google Business Profile listings, reviews, and posts.
- [`instagram-graph-api`](../../skills/instagram-graph-api/SKILL.md) — Interact with the Instagram Graph API to retrieve user profiles, media posts, hashtags, insights/analytics, comments, and stories. Layer 1 skill using provider client for API access.
- [`linkedin-marketing-api`](../../skills/linkedin-marketing-api/SKILL.md) — Manage LinkedIn posts, company pages, and ad campaigns via Marketing API.
- [`mailchimp-api`](../../skills/mailchimp-api/SKILL.md) — Interact with the Mailchimp Marketing API to manage campaigns, audiences, subscribers, and reporting. Layer 1 skill using provider client for API access.
- [`meta-ad-library-api`](../../skills/meta-ad-library-api/SKILL.md) — Search and analyze ads from Meta platforms (Facebook/Instagram) via Ad Library API.
- [`quora-zhihu-manager`](../../skills/quora-zhihu-manager/SKILL.md) — Manage Q&A content on Quora and Zhihu platforms.
- [`reddit-api-manager`](../../skills/reddit-api-manager/SKILL.md) — Interact with the Reddit API to fetch posts, comments, subreddit info, user profiles, search, and list trending topics. Layer 1 skill using provider client for API access.
- [`social-poster`](../../skills/social-poster/SKILL.md) — Cross-post content to multiple social media platforms.
- [`tiktok-content-api`](../../skills/tiktok-content-api/SKILL.md) — Manage TikTok content publishing and analytics via Content Posting API.
- [`twitter-manager`](../../skills/twitter-manager/SKILL.md) — Manage Twitter/X interactions via the Twitter API. Post tweets, get tweet details, search tweets, get user profiles, view timelines, delete tweets, like tweets, and retweet. Uses injected provider client for API access (BYOK).
- [`whatsapp-integration`](../../skills/whatsapp-integration/SKILL.md) — Send messages, manage conversations, and handle read receipts via WhatsApp Cloud API. Layer 1 skill using provider client for API access.
- [`x-twitter-api`](../../skills/x-twitter-api/SKILL.md) — Interact with the X/Twitter API: fetch tweets, search, get user profiles, timelines, post tweets, trending topics, and tweet likes. Layer 1 skill using provider client for API access.
- [`youtube-data-api`](../../skills/youtube-data-api/SKILL.md) — YouTube Data API interaction skill. Search videos, retrieve video and channel details, list comments, get trending videos, browse playlists, and list channel videos. Layer 1 skill using provider client for API access.

## Permissions

See [reports/permissions.md](reports/permissions.md) for the full permission matrix.

## Security

See [reports/security-test-report.md](reports/security-test-report.md) for the security test report.

## Configuration

Skills in this plugin that require API keys will prompt for configuration on first use.
See each skill's `SKILL.md` for specific requirements.

## License

MIT
