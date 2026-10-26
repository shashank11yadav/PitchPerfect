# Architecture

## Services

| Service | Path                             | Runtime                                   | Port               | Exposed publicly                    | Owns                                                                                                       |
| ------- | -------------------------------- | ----------------------------------------- | ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| web     | `apps/web`                       | Next.js (App Router), React, Tailwind CSS | 3000               | Yes                                 | Pages, UI, SEO, proxying `/api/*`                                                                          |
| api     | `apps/api`                       | Express 5, Mongoose, MongoDB              | 4000               | Only through web's `/api/*` rewrite | Accounts, sessions, all persistence, authorization, quotas                                                 |
| coach   | `apps/coach`                     | Fastify                                   | 4100               | **Never**                           | HMAC-checked routes that run `packages/partner`; the LLM keys and the OpenAI/Anthropic adapters            |
| partner | `packages/partner`               | TypeScript library                        | n/a                | n/a                                 | The practice partner engine: prompts, guardrails, scripted provider, plan/turn/score                       |
| shared  | `packages/shared`                | TypeScript library                        | n/a                | n/a                                 | zod schemas, types, constants, seed data, slugify, UTC calendar helpers, PII redaction                     |
| demo    | GitHub Pages                     | Static export of `apps/web`               | n/a                | Yes                                 | The public demo: pages, lessons, job board, and the practice room with the scripted partner in the browser |
| mongo   | Docker `mongo:8.2.6`             |                                           | 27017              | No                                  | Data                                                                                                       |
| mailpit | Docker `axllent/mailpit:v1.31.6` |                                           | 1025 SMTP, 8025 UI | Dev only                            | Catches outgoing email locally                                                                             |

### Why three services

- **web** renders public pages on the server for SEO and serves the app UI. The browser only ever talks to the web origin; Next.js rewrites `/api/:path*` to `${API_ORIGIN}/api/:path*`, so the session cookie is always first-party and production needs no cross-site CORS.
- **api** is the only component with database access and the only component that decides _who may do what_. Every authorization check lives here.
- **coach** is the independent practice partner. It holds the LLM keys and nothing else: no database, no user accounts, no cookies. It trusts only HMAC-signed requests from api, so it can be deployed, scaled, rate-limited, and swapped independently, and a compromise of web cannot reach the LLM keys. The partner's logic itself (prompts, guardrails, the scripted provider, and the plan, turn and score steps) is `packages/partner`, a plain TypeScript library with no transport; coach wraps it in Fastify routes, and the static GitHub Pages demo runs the same code in the browser with the scripted provider ([deploy.md](deploy.md#github-pages-demo)).

## Monorepo layout

```
apps/
  web/
    app/                    Next.js routes (see "Routes" below)
    components/             shared UI components (one implementation each); demo/ is the static demo's room, frame and notes
    content/lessons/        8 MDX lessons, one per skill slug
    lib/                    api client, auth helpers, speech helpers, seo helpers; demo/ answers the api in the browser for the static demo
    public/                 brand SVGs and PWA icons (the favicons and share image are in app/)
    scripts/                build-pages.mjs (the static demo), generate-icons.mjs
    Dockerfile              standalone Next.js server image
  api/
    src/
      app.ts                express app factory (no listen), used by tests
      server.ts             connects DB, starts listening
      config.ts             env parsing with zod (fails fast)
      db/                   mongoose connection + models/
      middleware/           session, csrf, origin-check, rate-limit, auth guards, error handler, validate
      modules/
        auth/               signup, verify, signin, signout, forgot/reset, me
        profile/            profile, email/password change, résumé, account deletion, consent
        lessons/            lesson progress
        jobs/               public listing, job detail, save/unsave
        applications/       apply, withdraw, student list
        employer/           company, jobs CRUD, applicant pipeline, interviews, dashboard
        practice/           sessions, turns (SSE proxy), end/score, attempts, quota
      services/             mailer, password-policy, html-sanitizer, coach-client, coach-probe, company-verification, files (GridFS)
      scripts/              CLI entries (seed, admin, purge-expired), their run-*.ts logic, and the --demo accounts and company
    test/                   integration tests (supertest + mongodb-memory-server)
    Dockerfile              api image; also runs the compiled scripts
  coach/
    src/
      app.ts, server.ts, config.ts, errors.ts, logger.ts
      auth/                 hmac.ts (signature verification), guard.ts (every route but /healthz needs one)
      providers/            openai.ts, anthropic.ts, sdk-provider.ts, json-schema.ts, index.ts (selection by COACH_PROVIDER)
      routes/               plan.ts, turn.ts, score.ts, health.ts (thin wrappers over packages/partner), sse.ts
    evals/                  scripted conversations + runner
    test/
    Dockerfile              practice partner image (never given a public port)
packages/
  partner/
    src/
      provider.ts           the LlmProvider interface, task tags, usage meter, ProviderError
      deps.ts               provider + circuit breaker, retry and timeout per call, structured-output repair
      prompts/              persona-plan.ts, persona-turn.ts, scorer.ts, guard.ts, blocks.ts, fixed-lines.ts, skill-guides.ts
      guardrails/           input.ts, guard-rules.ts, output.ts, canary.ts, leak-scan.ts, circuit-breaker.ts
      fake/                 the scripted provider: persona, intents, voices, scorecard
      scoring/              verify-quotes.ts (evidence must be a verbatim student quote)
      plan.ts, turn/, score.ts  the three steps of a session, without a transport
  shared/
    src/
      skills.ts             the 8 skills (slug, title, summary, weighted rubric dimension)
      rubric.ts             rubric dimensions and scorecard schema
      schemas/              request/response zod schemas per api module + coach contract
      enums.ts              roles, job status, application status, etc.
      limits.ts             every numeric limit (turns, quotas, sizes, token caps)
      pii.ts                redactPii and redactTurn (emails, phones, card-like numbers)
      text.ts, time.ts      slugify and turn-text helpers; UTC day/month helpers for quotas
      env.ts, hmac.ts       server-only env parsing and request signing (the ./env and ./hmac subpaths)
      seed-data.ts          the fictional companies and jobs (api seed, static demo board; the ./seed-data subpath)
      index.ts
e2e/                        Playwright suites: tests/ (full stack), pages/ (static demo), smoke/ (a deployed site); screenshots.ts for the README images
docs/                       docs, design/product-design.md, and images/ for the README screenshots
scripts/                    start-mongo.sh (CI), pre-commit.sh
.github/                    workflows/ci.yml (checks), workflows/pages.yml (static demo deploy), dependabot.yml
docker-compose.yml          MongoDB and Mailpit; the `full` profile adds web, api and coach
```

## Data model (MongoDB via Mongoose)

All collections have `createdAt`/`updatedAt` timestamps. IDs are ObjectIds. Never expose `passwordHash`, token hashes, or `scenarioPrivate` in responses.

| Collection         | Key fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Indexes                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `users`            | `email` (lowercased), `passwordHash` (argon2id), `role` (`student`\|`employer`), `name.first`, `name.last`, `emailVerifiedAt?`, `ageConfirmedAt?` (students), `practiceConsentAt?` (students)                                                                                                                                                                                                                                                                                                                          | unique `email`                                                                                            |
| `studentprofiles`  | `userId`, `school`, `major`, `gradYear`, `targetRole`, `industry`, `state`, `resumeFileId?`, `lessonsCompleted: SkillSlug[]`                                                                                                                                                                                                                                                                                                                                                                                           | unique `userId`                                                                                           |
| `employerprofiles` | `userId`, `jobTitle`, `companyId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | unique `userId`, `companyId`                                                                              |
| `companies`        | `ownerId`, `name`, `slug`, `website`, `linkedinUrl?`, `pitch`, `logoUrl?`, `verification` (`verified`\|`unverified`\|`suspended`)                                                                                                                                                                                                                                                                                                                                                                                      | unique `slug`, unique `ownerId`                                                                           |
| `jobs`             | `companyId`, `slug`, `title`, `location`, `workplace` (`onsite`\|`hybrid`\|`remote`), `employmentType` (`internship`\|`full_time`\|`part_time`\|`contract`), `descriptionHtml` (sanitized), `skills: string[]`, `pay` {`type` `range`\|`exact`\|`unpaid`, `min?`, `max?`, `amount?`, `currency` `USD`\|`EUR`\|`CAD`, `frequency` `hourly`\|`weekly`\|`monthly`\|`annually`, `commission` bool}, `status` (`draft`\|`active`\|`archived`), `publishedAt?`, `closesAt?`                                                  | unique `slug`; `{companyId, status}`; `{status, publishedAt}`; text index on `title`,`skills`             |
| `applications`     | `jobId`, `studentId`, `jobSnapshot` {`title`, `companyName`}, `status` (`applied`\|`shortlisted`\|`interview`\|`hired`\|`rejected`\|`withdrawn`\|`closed`), `closedReason` (`employer_left`\|`job_archived`\|null), `savedByEmployer` bool, `sharedAttemptId?`, `interview?` {`startsAt`, `meetingUrl`}                                                                                                                                                                                                                | unique `{jobId, studentId}`; `{studentId}`; `{jobId, status}`                                             |
| `savedjobs`        | `studentId`, `jobId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | unique `{studentId, jobId}`                                                                               |
| `practiceattempts` | `studentId`, `skill`, `jobId?`, `status` (`starting`\|`active`\|`completed`\|`abandoned`\|`ended_by_guard`), `scenarioPublic` {`personaName`, `personaTitle`, `companyType`, `personality`, `openingLine`}, `scenarioPrivate` {`hiddenObjections[]`, `winConditions[]`}, `transcript[]` {`role` `student`\|`partner`, `text`, `at`, `flagged` bool}, `guardFlags` int, `stage` (forward only), `scorecard?`, `provider`, `model`, `tokens` {`input`, `output`}, `turnLockUntil?`, `startedAt`, `endedAt?`, `expiresAt` | `{studentId, startedAt:-1}`; unique `{studentId}` where status is `starting`/`active`; TTL on `expiresAt` |
| `authtokens`       | `userId`, `type` (`verify_email`\|`reset_password`), `tokenHash` (sha256), `expiresAt`, `usedAt?`                                                                                                                                                                                                                                                                                                                                                                                                                      | unique `tokenHash`; TTL on `expiresAt`                                                                    |
| `practicestarts`   | the quota ledger: `studentId`, `month` (YYYY-MM UTC), `starts`, `days` {YYYY-MM-DD: count}, `expiresAt` (start of the next month). Deleting an attempt leaves it alone; deleting the account removes it                                                                                                                                                                                                                                                                                                                | unique `{studentId, month}`; TTL on `expiresAt`                                                           |
| `usagedays`        | `day` (YYYY-MM-DD UTC), `inputTokens`, `outputTokens`, `sessions`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | unique `day`                                                                                              |
| `sessions`         | managed by `connect-mongo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | TTL managed by store                                                                                      |
| `ratelimits`       | managed by the rate-limit store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | TTL                                                                                                       |
| GridFS `resumes`   | PDF bytes, metadata `{ownerId}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |                                                                                                           |

### Ownership rules (enforced in api, tested in api integration tests)

- A student can read/change only their own profile, saved jobs, applications, attempts, and résumé.
- An employer can read/change only their own company, jobs where `job.companyId === myCompanyId`, and applications whose job belongs to their company.
- An employer can read a student's résumé or shared scorecard **only through an application to one of their jobs**, never by student ID directly.
- Unverified companies' jobs are visible on `/jobs` with a badge but are excluded from the sitemap and structured data; suspended companies' jobs are hidden everywhere.

## Key request flows

### Sign up → verify → sign in

1. `POST /api/auth/signup` validates with `SignupSchema` (shared), checks password policy, creates `users` + role profile (+ `companies` for employers, always created `unverified`), sends a verification email with a single-use token (stored hashed, 24 h expiry).
2. `POST /api/auth/verify-email {token}` marks `emailVerifiedAt`. For employers, the company is then promoted to `verified` if the now-confirmed email's registrable domain matches the company website's (free and disposable mail domains never match, matched case-insensitively and including their subdomains against the `email-providers` and `disposable-email-domains-js` lists; a `suspended` company is never changed). Renaming the company, or moving its website to another registrable domain, later turns a `verified` company back to `unverified` until an admin approves it again.
3. `POST /api/auth/signin` verifies argon2id hash, regenerates the session ID, stores `{userId, role}` in the session. The cookie is `pp.sid`, `httpOnly`, `Secure` (prod), `SameSite=Lax`, rolling 7 days, absolute 30 days.

### Practice session

```
web practice room            api                                 coach                 provider
  │ POST /practice/sessions ─► auth+verified+consent+quota ─► POST /v1/plan (HMAC) ─► structured()
  │ ◄── {attemptId, scenario, limits}  stores scenario (private part never leaves api)
  │ POST /practice/sessions/:id/turns {text}
  │                          ─► validate, redact PII, append ─► POST /v1/turn (HMAC, SSE) ─► chatStream()
  │                                                            checks each sentence ─► moderate
  │ ◄══ SSE: delta…delta, [retract], done{stage} ◄═══ relays stream, appends partner reply
  │ POST /practice/sessions/:id/end ─► POST /v1/score (HMAC) ─► structured(Scorecard)
  │ ◄── {attempt} with scorecard  saves scorecard, tokens, usage day
```

Browser speech recognition produces the text; the browser's `speechSynthesis` speaks the partner's reply. No audio is sent to PitchPerfect servers.

### Employer applicant pipeline

`GET /api/employer/jobs/:id/applications` → `PATCH /api/employer/applications/:id {status}` → `POST /api/employer/applications/:id/interview {startsAt, meetingUrl}` (student gets an email). Every step checks the job belongs to the employer's company.

## Routes (web)

| Path                                                                                                                                                                                              | Rendering                                          | Access        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------- |
| `/`, `/students`, `/employers`, `/how-it-works`, `/about`, `/privacy`, `/terms`                                                                                                                   | Server-rendered per request                        | Public        |
| `/jobs`, `/jobs/[slug]`                                                                                                                                                                           | Server-rendered per request                        | Public        |
| `/signin`, `/signup`, `/signup/student`, `/signup/employer`, `/verify-email`, `/forgot-password`, `/reset-password`                                                                               | Server-rendered shell + client forms               | Signed-out    |
| `/app` (dashboard), `/app/learn`, `/app/learn/[skill]`, `/app/practice`, `/app/practice/[skill]`, `/app/practice/attempt/[id]`, `/app/history`, `/app/jobs`, `/app/applications`, `/app/settings` | Client app, `noindex`                              | Student       |
| `/employer` (dashboard), `/employer/company`, `/employer/jobs`, `/employer/jobs/new`, `/employer/jobs/[id]`, `/employer/jobs/[id]/applicants`, `/employer/settings`                               | Client app, `noindex`                              | Employer      |
| `/practice`, `/practice/[skill]`, `/practice/attempt`, `/practice/history`, `/learn`, `/learn/[skill]`                                                                                            | Static demo only ("not found" in the normal build) | Public (demo) |

Every page renders per request: the CSP nonce is new on each request, and Next.js adds it to scripts only while rendering a request. Never add `force-static`, `revalidate` or other ISR/static options to a page; the browser would block its scripts. (The static demo is the one exception, and it is a separate build: `PAGES_EXPORT=1` turns off the per-request pieces and carries its policy in a `<meta>` tag. In that build `/practice/*` and `/learn/*` are public pages for the room and the lessons, and the account routes show a note; in the normal build those two trees are "not found".)

Route protection: `apps/web/proxy.ts` (the Next.js 16 name for middleware) checks for the session cookie and redirects to `/signin?next=…`; the page then calls `GET /api/auth/me` and redirects on 401/403 (wrong role → own dashboard). The API is the real gate; the client guard is only UX.

## Configuration

api and coach parse their environment with zod in `config.ts` at startup (helpers from `@pitchperfect/shared/env`) and exit with a readable error if anything is missing or malformed. web reads `API_ORIGIN`, `SITE_URL` and the optional `PROXY_SHARED_SECRET` directly; `PAGES_EXPORT` and `PAGES_BASE_PATH` are set by the static demo build. Variables are documented in each app's `.env.example`.
