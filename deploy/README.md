# Synthia AI — production (https://synthia.ikelyane.com)

Same layout as the other Ikelyane sub-domains:

Cloudflare (A record `synthia`, proxied) → Apache cPanel (sub-domain `synthia` of the `ikelyane`
account, docroot `public_html/synthia`) → `synthia-app.service` (`next start -H 127.0.0.1 -p 3000`).

| Piece | Location |
|---|---|
| HTTPS proxy | `apache/ssl-proxy.conf` → `/etc/apache2/conf.d/userdata/ssl/2_4/ikelyane/synthia.ikelyane.com/proxy.conf` |
| HTTP → HTTPS | `apache/std-redirect.conf` → `/etc/apache2/conf.d/userdata/std/2_4/ikelyane/synthia.ikelyane.com/redirect.conf` |
| TLS | certbot DNS-01 Cloudflare (`/etc/letsencrypt/cloudflare/ikelyane.ini`), hook `certbot-deploy-hook.sh` → `/etc/letsencrypt/renewal-hooks/deploy/synthia-cpanel.sh` (AutoSSL fails behind Cloudflare) |
| Secrets (DB password, NEXTAUTH_SECRET, Groq/ElevenLabs keys) | `/etc/synthia/app.env` (0600 root) — never in the unit file, which is world-readable |
| Service overrides | `/etc/systemd/system/synthia-app.service.d/10-subdomain.conf` (public URL, loopback bind), `/etc/systemd/system/synthia-cron.service.d/10-internal.conf` |
| Internal token (app ↔ scheduler) | `/etc/synthia/internal.env` (0600) |
| Database migration | `scripts/migrations/001_projects_brand.sql` (applied by hand with `mysql`) |

Port 3000 is closed in firewalld; the old `http://144.91.103.251:3000` address is retired.

## Update

```bash
cd /root/synthia-ai
npx next build            # node 24: export PATH=/root/.nvm/versions/node/v24.14.0/bin:$PATH
systemctl restart synthia-app synthia-cron
```

After changing Apache files: `/scripts/rebuildhttpdconf && apachectl -t && /scripts/restartsrv_httpd --graceful`.

## Background work

- Renders run in the background of the app process (max 2 at once, `SYNTHIA_MAX_RENDERS`); the
  browser polls `GET /api/projects/:id`. Requests through Cloudflare are cut after 100 s, so nothing
  long may run inside a request.
- `synthia-cron` calls `POST /api/internal/publish-due` every minute (header `x-synthia-internal`)
  to publish scheduled videos.
- Social publishing: each user connects their OWN accounts (page « Comptes connectés »), see below.
- Paid plans: Flutterwave webhook `/api/billing/webhook` activates the plan only when
  `FLUTTERWAVE_WEBHOOK_HASH` and `FLUTTERWAVE_SECRET_KEY` are set and the verified amount matches
  the plan price. Without `NEXT_PUBLIC_FLW_PUBLIC_KEY` (build time) the upgrade buttons open WhatsApp.
- Groq model: `GROQ_MODEL` (default `openai/gpt-oss-120b`; `llama-3.3-70b-versatile` was retired).

## Security measures (2026-11-15)

- Origin lock-down: the vhost answers only to Cloudflare's ranges (`RewriteCond expr … CONN_REMOTE_ADDR`);
  `Require` inside `<Location>` was NOT enforced for proxied requests in cPanel's vhost, hence mod_rewrite.
- App headers (next.config.js): CSP, X-Frame-Options, nosniff, Referrer/Permissions-Policy, COOP/CORP; Apache adds HSTS only.
- `proxy.ts`: state-changing `/api` calls with a foreign `Origin` → 403 (CSRF).
- Session required on every API route, per-project ownership, validated paths, upload signature sniffing,
  per-user rate limits on costly endpoints, login brake per e-mail and per IP, 7-day sessions,
  generic error messages (details only in `journalctl -u synthia-app`).
- `npm audit --omit=dev`: 0 vulnerabilities (bull removed, googleapis 190, node-cron 4).
- Not reachable with the DNS-only Cloudflare token: WAF / Bot Fight Mode / rate-limit rules — set them in the dashboard.

## PWA

`/api/sw` serves `public/sw.js` stamped with `.next/BUILD_ID`: each deployment is a new worker; the page checks
every 20 min and on focus, applies at once in background tabs, otherwise shows a 15 s countdown banner.
Dashboard pages are never cached (private data); offline fallback `public/offline.html`.

## Social accounts (YouTube, TikTok, Instagram, Facebook, X) — per-user OAuth

Users connect their own channel/account; tokens are stored AES-256-GCM-encrypted in `social_accounts`
(key `SOCIAL_TOKEN_KEY` in `/etc/synthia/app.env` — losing it means every user must reconnect).
Publishing runs in the background (`lib/publish.ts`); scheduled posts keep their options in `projects.publish_options`.

To enable a platform, add its developer-app credentials to `/etc/synthia/app.env`, then `systemctl restart synthia-app`:

| Platform | Variables | Redirect URI to declare |
|---|---|---|
| YouTube (Google Cloud: YouTube Data API v3 + OAuth client "Web application") | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | `https://synthia.ikelyane.com/api/social/callback/youtube` |
| TikTok (developers.tiktok.com: Login Kit + Content Posting API) | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (optional `TIKTOK_SCOPES`) | `https://synthia.ikelyane.com/api/social/callback/tiktok` |
| Instagram (developers.facebook.com: app with "Instagram API with Instagram Login"; professional accounts) | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | `https://synthia.ikelyane.com/api/social/callback/instagram` (+ `/api/auth/callback/instagram` for sign-in) |
| Facebook Pages (developers.facebook.com: Facebook Login for Business) | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | `https://synthia.ikelyane.com/api/social/callback/facebook` (+ `/api/auth/callback/facebook`) |
| X (developer.x.com: project + app, OAuth 2.0, type "Web App") | `X_CLIENT_ID`, `X_CLIENT_SECRET` | `https://synthia.ikelyane.com/api/social/callback/twitter` (+ `/api/auth/callback/twitter`) |

Scopes requested: YouTube `youtube.upload` + `youtube.readonly`; TikTok `user.info.basic,video.upload,video.publish`
(if Direct Post is not added to the TikTok app yet, set `TIKTOK_SCOPES=user.info.basic,video.upload`: drafts only).
Public pages required by Google/TikTok reviews: `/fr/privacy`, `/en/privacy`, `/fr/terms`, `/en/terms`.

Scopes: Instagram `instagram_business_basic,instagram_business_content_publish` (Reels: Instagram downloads the file from a
signed link `/api/media/public/…` valid 3 h); Facebook `pages_show_list,pages_read_engagement,pages_manage_posts`
(first Page with CREATE_CONTENT); X `tweet.read tweet.write users.read media.write offline.access` (PKCE, chunked v2 upload).

## Sign in / sign up with Google, Facebook, Instagram, X

Enabled per provider when its keys are present (see `lib/auth.ts`). Google uses `GOOGLE_CLIENT_ID/SECRET`, or the YouTube
client when `GOOGLE_LOGIN=on` (first add `https://synthia.ikelyane.com/api/auth/callback/google` to that client's redirect URIs).
Disable one with `FACEBOOK_LOGIN=off`, `INSTAGRAM_LOGIN=off`, `X_LOGIN=off`. Instagram and X give no e-mail: the account
gets a placeholder `<provider>-<id>@users.synthia.invalid`. Linked identities: table `auth_identities`.

## AI connections, MCP server, REST API v1 (migration 003)

- Users add their own keys (Claude, ChatGPT, Gemini, Mistral, DeepSeek, Grok, Groq, OpenRouter, Kling, Replicate) in
  `/dashboard/integrations`; stored encrypted in `ai_connections` (same `SOCIAL_TOKEN_KEY`). Viral Lab can write with them.
- AI video generation (`lib/ai/video-jobs.ts`): Kling, Veo (Gemini key), Replicate; polled in the app, resumed every
  minute by the scheduler after a restart; result downloaded into `output/` as a normal project (mode `generated`).
- Import (`lib/media-import.ts`): upload ≤ 100 MB or https URL ≤ 1 GB (SSRF-guarded), remuxed/transcoded to H.264.
- MCP server: `POST /api/mcp` (Bearer `syn_…` personal token from `api_tokens`, only SHA-256 stored) or `/api/mcp/t/<token>`.
  Claude Code: `claude mcp add --transport http synthia https://synthia.ikelyane.com/api/mcp --header "Authorization: Bearer syn_…"`.
- REST: `GET/POST /api/v1/videos`, `POST /api/v1/videos/upload`, `GET /api/v1/videos/:id`, `POST /api/v1/videos/generate`,
  `POST /api/v1/publish`, `GET /api/v1/connections`.
- Studio work autosaves into `studio_drafts` ("Recent" in the sidebar, resume with `/dashboard?draft=<id>`).
- `next.config.js` raises `proxyClientMaxBodySize` to 110 MB (the 10 MB default cut every larger upload).
