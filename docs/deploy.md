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
   - Run `npm run seed -w apps/api -- --demo` only for a demo environment.
5. **Deploy web:** set `API_ORIGIN`, `SITE_URL`, and `PROXY_SHARED_SECRET` if used.
6. **Verify:**
   - Run `npx playwright test --config e2e/playwright.smoke.config.ts` with `BASE_URL` set to the deployed URL. It runs a read-only smoke test of the public pages, `/api/health`, and the headers.
   - Run Lighthouse on `/`, `/jobs` and one job page.
   - Run the [security checklist](security.md#pre-release-security-checklist).
7. **Schedule the purge job:** run `npm run purge -w apps/api` daily. It removes expired tokens and attempts as a backstop for the TTL indexes.

## Environment variables

Each app documents its variables, with defaults and purpose, in its `.env.example`. Production values live only in the hosting provider's secret store.

## Rollback

- web: promote the previous Vercel deployment.
- api/coach: redeploy the previous image tag.
- Schema changes are additive only: new optional fields and new indexes. A rollback never needs a data migration.
