# Deployment

Nothing here runs automatically. Deploying is a manual, deliberate step.

## Topology

| Piece   | Recommended host                                                       | Notes                                                                                                         |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| web     | Vercel (Next.js)                                                       | `API_ORIGIN` points at the api's private or public URL; the browser only sees the web origin                  |
| api     | Render or Fly.io (Docker, `apps/api/Dockerfile`)                       | Public only to web's rewrite (restrict by secret header `x-pp-proxy` if the host can't do private networking) |
| coach   | Render private service or Fly.io private app (`apps/coach/Dockerfile`) | Never public; reachable only from api                                                                         |
| MongoDB | New MongoDB Atlas cluster                                              | New database user with least privilege, IP allowlist for api only, TLS required                               |
| Email   | Any SMTP provider (e.g. Postmark, Resend SMTP, SES)                    | SPF/DKIM for the sending domain                                                                               |

## Steps

1. **Create the database:** a new Atlas project and cluster, plus a DB user with `readWrite` on the `pitchperfect` database only. Allowlist the api's egress IPs and copy the SRV connection string.
2. **Generate secrets:**
   - `SESSION_SECRET` and `CSRF_SECRET`: 64 random bytes each (`openssl rand -base64 64`).
   - `COACH_SHARED_SECRET`: 48 random bytes (`openssl rand -base64 48`).
3. **Deploy coach:** set every variable from `apps/coach/.env.example`, then check that `/healthz` returns `ok` from inside the private network.
4. **Deploy api:**
   - Set every variable from `apps/api/.env.example`, with `NODE_ENV=production`, `APP_URL=https://<web domain>` and `COACH_URL=<private coach URL>`.
   - Run `npm run admin -w apps/api -- migrate` (builds indexes) once.
   - Run `npm run seed -w apps/api -- --demo` only for a demo environment, with `SEED_DEMO_PASSWORD` (12 or more characters) set in that shell. The password is never printed, and re-running the seed never changes an existing account's password.
5. **Deploy web:** set `API_ORIGIN`, `SITE_URL`, and `PROXY_SHARED_SECRET` if used. `API_ORIGIN` must be set when the app is **built**, because Next.js compiles the `/api` rewrite into the build. See [The web proxy](#the-web-proxy) below.
6. **Verify:**
   - Run `npx playwright test --config e2e/playwright.smoke.config.ts` with `BASE_URL` set to the deployed URL. It runs a read-only smoke test of the public pages, `/api/health`, and the headers.
   - Run Lighthouse on `/`, `/jobs` and one job page.
   - Run the [security checklist](security.md#pre-release-security-checklist).
7. **Schedule the purge job:** run `npm run purge -w apps/api` daily. It removes expired tokens and attempts as a backstop for the TTL indexes, marks sessions that were left `active` long past the 20-minute limit as abandoned, and removes `starting` placeholders of session starts that never finished (older than 5 minutes).

## The web proxy

The browser only talks to web. Next.js rewrites `/api/*` to `${API_ORIGIN}/api/*`, and `apps/web/proxy.ts` sets these headers on each proxied request:

- `x-pp-proxy`: the shared secret, when `PROXY_SHARED_SECRET` is set. Any value the client sent is dropped first.
- `x-forwarded-proto` and `x-forwarded-host`: the public protocol and host. The api sets `Secure` cookies only when it trusts these, so it needs `TRUST_PROXY` of 1 or more in production.

`X-Forwarded-For` is passed through unchanged, and the api's per-IP rate limits read it. Run web behind a platform or reverse proxy that sets or appends it (Vercel overwrites it with the real client address; nginx can append with `proxy_add_x_forwarded_for`). If `next start` faces the internet directly, a client can choose the address the api sees.

Practice turns stream as server-sent events through the same rewrite:

- The api sends `Cache-Control: no-store, no-transform`. Without `no-transform`, Next.js gzips the proxied response and holds the whole stream until it ends.
- `experimental.proxyTimeout` is 60 s. That is the longest a proxied request may sit idle, and it is above the api's 35 s practice partner timeout.
- A proxy in front of web must not buffer `text/event-stream` responses either. The api also sends `X-Accel-Buffering: no` for nginx.

Every page is rendered per request, because the CSP nonce is new on each request. Static pages would carry no nonce, and the browser would block their scripts.

## Environment variables

Each app documents its variables, with defaults and purpose, in its `.env.example`. Production values live only in the hosting provider's secret store.

## Rollback

- web: promote the previous Vercel deployment.
- api/coach: redeploy the previous image tag.
- Schema changes are additive only: new optional fields and new indexes. A rollback never needs a data migration.
