# Deployment

Deploying the full stack is a manual, deliberate step; no workflow deploys it. The one automatic deploy is the static demo on GitHub Pages ([below](#github-pages-demo)).

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
3. **Deploy coach:** from the `apps/coach/Dockerfile` image. Set every variable from `apps/coach/.env.example` (the image already sets `HOST=0.0.0.0` and `PORT=4100`), then check that `/healthz` returns `ok` from inside the private network. With a live provider, check that the startup log names a moderator (`openai` or `model`); see `COACH_MODERATOR` under [Environment variables](#environment-variables).
4. **Deploy api:**
   - Deploy the `apps/api/Dockerfile` image. Set every variable from `apps/api/.env.example`, with `APP_URL=https://<web domain>` and `COACH_URL=<private coach URL>`. The image sets `NODE_ENV=production`.
   - Run `node dist/scripts/admin.js migrate` (builds indexes) once, in a one-off container from the api image (for example a Render shell or `fly ssh console`). The scripts are compiled into the image; `tsx` and the `npm run admin`/`seed`/`purge` scripts are for development only. Outside a container, `npm run admin:prod -w apps/api -- migrate` runs the same build after `npm run build`.
   - Run `node dist/scripts/seed.js --demo` only for a demo environment, with `SEED_DEMO_PASSWORD` (12 or more characters) set for that command. The password is never printed, and re-running the seed never changes an existing account's password.
5. **Deploy web:** set `API_ORIGIN`, `SITE_URL`, and `PROXY_SHARED_SECRET` if used. `API_ORIGIN` must be set when the app is **built**, because Next.js compiles the `/api` rewrite into the build. For the container image that means a build argument, `--build-arg API_ORIGIN=<api URL>`; set the same value at run time too, since server-rendered pages read it then. Build the packages first, since web imports their compiled output: `npm run build -w packages/shared && npm run build -w packages/partner && npm run build -w apps/web` (the root `npm run build` builds `packages/*` before `apps/*`). See [The web proxy](#the-web-proxy) below.
6. **Verify:**
   - Run `npx playwright test --config e2e/playwright.smoke.config.ts` with `BASE_URL` set to the deployed URL. It runs a read-only smoke test of the public pages, `/api/health`, `/api/practice/partner`, and the headers.
   - Run Lighthouse on `/`, `/jobs` and one job page.
   - If `COACH_PROVIDER` is a real provider (`openai` or `anthropic`), run `npm run eval -w apps/coach` once with the production model ids (`COACH_MODEL`, `COACH_SCORING_MODEL`) and record the pass rate before go-live. The runner refuses `fake`; see `apps/coach/evals/README.md`.
   - Check that `/api/practice/partner` reports the partner you meant to deploy: `practicePartner` is `scripted` only for `COACH_PROVIDER=fake`, and the web copy follows it.
   - Check that `TRUST_PROXY` doesn't let a client pick its address ([below](#trust_proxy-the-number-of-trusted-hops)): from outside, send six sign-ins for one made-up address (for example `nobody@example.test`) with a wrong password, each with a different `X-Forwarded-For` header. The sixth must answer `429`. If it answers `401`, `TRUST_PROXY` is too high.
   - Run the [security checklist](security.md#pre-release-security-checklist).
7. **Schedule the purge job:** run `node dist/scripts/purge-expired.js` daily from the api image (a cron job on the host with the api's environment; `npm run purge:prod -w apps/api` outside a container). It removes expired tokens and attempts as a backstop for the TTL indexes, marks sessions that were left `active` long past the 20-minute limit as abandoned, removes `starting` placeholders of session starts that never finished (older than 5 minutes), and deletes applications' résumé copies more than 7 days after the application was decided or closed.

## GitHub Pages demo

The live site at https://shashank11yadav.github.io/PitchPerfect/ is a static export of `apps/web`, deployed by `.github/workflows/pages.yml` on every push to `main` (and by hand with "Run workflow"): a build job with read access that builds and checks the export, then a deploy job that holds the Pages token. Pages serves files only, so nothing of the api, the coach or the database runs there. What the demo does instead:

- `npm run build:pages -w apps/web` (`apps/web/scripts/build-pages.mjs`) builds `packages/shared` and `packages/partner`, then runs `next build` with `PAGES_EXPORT=1`: `output: "export"`, `basePath` and `assetPrefix` from `PAGES_BASE_PATH` (default `/PitchPerfect`), `trailingSlash`, unoptimized images, and no rewrites or headers. The output is `apps/web/out`, with a `.nojekyll` marker, the share image copied to `opengraph-image.png` so Pages serves it as an image, and the policy `<meta>` moved to the top of every page's `<head>`; the build's own files go to `.next` as for any build, so run `npm run build` again before a local `next start`. `SITE_URL` defaults to the Pages URL, and canonical links, the sitemap, robots and JSON-LD use it.
- The job board, job pages and the sitemap are baked from the seed data (`@pitchperfect/shared/seed-data`, the same records `npm run seed` loads); search and filters run in the browser.
- `/practice/` is a public practice room. The partner is the engine the coach runs (`packages/partner`) with its scripted provider, in the browser, and is disclosed as the `browser` partner kind (the notice and the legal pages say it runs in the tab): the consent notice, the input guard, PII redaction, the turn, time and guard-flag limits and the scorer all run there. Sessions, consent and lesson progress live in `sessionStorage` for the tab; nothing is sent anywhere. `/learn/` has the lessons and `/practice/history/` the tab's sessions.
- Sign-in, sign-up, `/app/*` and `/employer/*` show a short note with the way to the practice room, the jobs and the repository. The normal build serves `/practice/*` and `/learn/*` as "not found"; they exist only in the export.
- There are no response headers on Pages, so the page carries a `<meta http-equiv="Content-Security-Policy">` (see [security.md](security.md#the-static-demo)). The site's own `proxy.ts` and `/api` rewrite are not part of the export.

Check it locally with `npm run e2e:pages`, which builds the export, serves it under `/PitchPerfect/` on port 3100 (`E2E_PAGES_PORT` moves it) from `e2e/pages/static-server.mjs` and runs `e2e/pages/demo.spec.ts`. CI's `e2e-pages` job runs the same check on every push and pull request, and the `build` job in `pages.yml` (`npm ci`, Chromium, `npm run e2e:pages`, then the upload) runs it again before the `deploy` job publishes, so a broken demo is never deployed. `PAGES_EXPORT` is unset for the normal build, the dev server and the full e2e suite.

## Container images

Each service has a multi-stage image built from the repository root:

```bash
docker build -f apps/coach/Dockerfile -t pitchperfect-coach .
docker build -f apps/api/Dockerfile -t pitchperfect-api .
docker build -f apps/web/Dockerfile --build-arg API_ORIGIN=https://api.example.test -t pitchperfect-web .
```

- The base is `node:22.23.3-alpine3.23`. The build stage installs only the workspaces the image needs (its own, `packages/shared`, and `packages/partner` for coach and web), builds the packages, then the app.
- The runtime stage holds production dependencies and the compiled output, runs as the non-root `node` user with `NODE_ENV=production`, and can't write to its own files (web's Next.js cache directory is the one exception).
- Each image has a `HEALTHCHECK`: api `GET /api/health`, coach `GET /healthz`, web `GET /`.
- web is the Next.js standalone server (`NEXT_OUTPUT=standalone` at build time). Other builds, including Vercel's and the one `next start` uses in CI, keep the normal output.

`docker compose --profile full up --build -d` runs all three locally with MongoDB and Mailpit. That stack is a demo over plain http: it overrides `NODE_ENV` to `development` and uses `dev-only-` placeholder secrets, which the services refuse in production. Nothing sits in front of web, so a client can set the address the api sees (see [below](#trust_proxy-the-number-of-trusted-hops)). Don't deploy it as it is.

## The web proxy

The browser only talks to web. Next.js rewrites `/api/*` to `${API_ORIGIN}/api/*`, and `apps/web/proxy.ts` sets these headers on each proxied request:

- `x-pp-proxy`: the shared secret, when `PROXY_SHARED_SECRET` is set. Any value the client sent is dropped first.
- `x-forwarded-proto`: the protocol of the request web received. The api marks its cookies `Secure` only when it trusts this header.
- `x-forwarded-host`: the host web received. Behind a platform this is the public domain; under a self-hosted `next start` it is the server's own host. The api doesn't rely on it: email links come from `APP_URL`.

Practice turns stream as server-sent events through the same rewrite:

- The api sends `Cache-Control: no-store, no-transform`. Without `no-transform`, Next.js gzips the proxied response and holds the whole stream until it ends.
- `experimental.proxyTimeout` is 60 s. That is the longest a proxied request may sit idle, and it is above the api's 35 s practice partner timeout.
- A proxy in front of web must not buffer `text/event-stream` responses either. The api also sends `X-Accel-Buffering: no` for nginx.

Every page is rendered per request, because the CSP nonce is new on each request. Static pages would carry no nonce, and the browser would block their scripts.

### `TRUST_PROXY`: the number of trusted hops

The api's per-IP rate limits key on `req.ip`, which Express reads from `X-Forwarded-For` by skipping `TRUST_PROXY` addresses from the right: the api's direct peer, then one header entry per further hop. Set it to **1 plus the number of entries your infrastructure adds to the header after the client's own address**. Counting proxies doesn't give that number, because `next start` forwards the header as it came and adds nothing for the hop in front of it: Next.js only fills it in when it is missing, from the address that connected to it.

| Deploy shape                                                                                                                                            | What happens to `X-Forwarded-For`                                                                   | `TRUST_PROXY`                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| web on Vercel, api on Render or Fly.io at its public URL (the recommended topology)                                                                     | Vercel replaces it with the client's address; the api host's router appends Vercel's egress address | `2`                                                         |
| A reverse proxy that replaces the header (nginx `proxy_set_header X-Forwarded-For $remote_addr;`), then `next start`, then the api on a private network | the proxy writes the client's address; web forwards it                                              | `1`                                                         |
| A reverse proxy that appends (nginx `$proxy_add_x_forwarded_for`), then `next start`, then the api on a private network                                 | the proxy appends the client's address after anything the client sent; web forwards it              | `1`, never `2`                                              |
| `next start` facing the internet with nothing in front (as in the compose demo)                                                                         | the client's own header reaches the api unchanged                                                   | none is safe: put a proxy that replaces the header in front |

- **Too high** (or trusting every hop, which is why `true` and `*` are refused at startup) and the api takes an address the client wrote into the header as the client, so a client can pick a new address per request and get around the per-IP limits on sign-in and sign-up. One too many is enough: in the appending row, `2` makes the key whatever the client wrote.
- **Too low** and the api sees a proxy's address as the client, so all users share one rate-limit bucket. `0` also means `Secure` cookies never work, and production refuses it.
- If your proxies' addresses are fixed or sit in a private range, list them instead of counting: `TRUST_PROXY=10.0.0.0/8,fd00::/8` trusts each hop from the right while its address is inside those subnets, and the first address outside them is the client. Only whole numbers and comma-separated addresses or CIDR subnets are accepted.
- The Vercel row rests on how Vercel and the api host handle the header today. Run the spoofing check in [Steps](#steps) (step 6) after every change to the topology.

## Environment variables

Each app documents its variables, with defaults and purpose, in its `.env.example`. Production values live only in the hosting provider's secret store.

Notes that don't fit in an `.env.example` line:

- `PRACTICE_RETENTION_DAYS` (api) is how long practice attempts are kept before the TTL index removes them. It stays configurable, but the web app's privacy policy, practice notice and other copy read the shared default (`LIMITS.attemptRetentionDays`, 180). If you change it, update that constant, or the copy will promise the wrong retention.
- `PRACTICE_STUDENT_DAILY_TOKEN_LIMIT` (api, default `250000`) is how many tokens one student's coach calls may use in a UTC day, failed and estimated calls included. Once it is reached, new sessions and turns are refused with `token_limit_reached` until midnight UTC; a session in progress can still be ended and scored. The default is about five ordinary live sessions and an eighth of `PRACTICE_DAILY_TOKEN_BUDGET`, so a handful of students can't spend the whole day's budget. With the scripted partner the figures are nominal.
- `COACH_PROVIDER` (coach) decides what the web app tells users about the partner, through `practicePartner` on `/api/practice/partner` and `/api/practice/quota`: `fake` is disclosed as a scripted demo that sends nothing to an AI provider; anything else, and a coach that can't be reached, as a live AI model.
- `COACH_MODERATOR` (coach) picks what checks each sentence of a live partner's reply before it is shown ([practice-partner.md](practice-partner.md#output-moderation)): `openai` (the OpenAI moderation endpoint, needs `OPENAI_API_KEY`, and works with either provider), `model` (a short classifier call through `COACH_MODEL` on the configured provider), or `none`. Leave it unset for the safe default: `openai` when `OPENAI_API_KEY` is set, otherwise `model`, and `none` for `COACH_PROVIDER=fake`. In production the coach refuses to start with a live provider and `none`, and `openai` is refused with `fake` because the scripted partner is disclosed as sending nothing to an AI provider. The startup log line names the moderator in use.
- `COACH_MODERATION_TIMEOUT_MS` (coach, default `5000`) is how long one moderation check may take. A check that times out or fails withholds the sentence and the student sees the fallback line, so keep it well under `COACH_TIMEOUT_MS`.
- `GET /api/health` is liveness only (`status`, and whether the database and the coach answer). It is limited to 120 requests a minute per address (counted in memory per instance, so it keeps answering when the database is down), with the coach probe cached for 30 s. Point platform health checks at it as often as every few seconds from a single prober; only a flood is refused.
- `NODE_ENV` (api and coach): unset or empty counts as `production`, with every production check and secure default (`Secure` cookies, HSTS, refusing `dev-only-` secrets, an explicit `COACH_PROVIDER`, a moderator for a live provider). Development is opt-in: the `dev`, `seed`, `admin` and `purge` npm scripts, docker compose and the e2e stack set `NODE_ENV=development` themselves. The web app leaves HSTS out and allows `'unsafe-eval'` only under `next dev`, which sets `NODE_ENV=development`.

## Rollback

- web: promote the previous Vercel deployment.
- api/coach: redeploy the previous image tag.
- Schema changes are additive only: new optional fields and new indexes. A rollback never needs a data migration.
