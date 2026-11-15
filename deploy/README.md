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
- Social publishing uses the server-wide credentials (`YOUTUBE_*`, `TIKTOK_ACCESS_TOKEN`,
  `INSTAGRAM_*`, `FACEBOOK_*`, `TWITTER_*`). Platforms without credentials are reported as
  `not_configured`.
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
