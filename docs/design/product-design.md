# PitchPerfect: Product Design

## 1. Intent

PitchPerfect is a platform where students and early-career candidates (18+) train for tech-sales roles and connect with employers hiring for them. Its core is **a practice partner the student pitches to by voice, which plays a realistic buyer and then scores the pitch.** Around it sit short lessons, a job board and a two-sided student/employer app.

It is a **portfolio-grade demo**: fully working and deployable, with seeded demo data, not a production launch with real users.

In the product, the partner is labelled for what is really answering: an **"AI practice partner"** when a live model runs it, a **"Scripted demo partner"** when the scripted provider does (the public demo always uses that one). Users are told the buyer is automated either way, and with a live model the privacy page names the LLM provider that processes transcripts. Naming the provider as a runtime dependency (SDK package, env var, adapter module) is fine.

## 2. Goals

1. **It works end to end:** a student signs up, practices, browses jobs and applies. An employer signs up, posts jobs and manages candidates. It runs locally with one command and deploys with documented steps.
2. **Security comes first:** no secrets in the repo, data kept to a minimum, OWASP Top 10 covered, and abuse limits on everything that costs money (LLM calls, email).
3. **A modern, attractive, easy UI** with a clear brand: blue and navy, Poppins and Manrope, and a simple student/employer split.
4. **SEO-friendly public pages:** server-rendered or static HTML, real metadata, sitemap, structured data, fast Core Web Vitals.
5. **Pitch practice runs as a separate, independent service** ("coach") that can be deployed, scaled, tested and swapped without touching the rest.
6. **No dead or duplicated code.** Shared UI and server logic each live in exactly one place.

## 3. Non-goals

- Native mobile apps. The web app is responsive and works well on phones.
- Paid speech services (server-side STT/TTS) in v1.
- Video lessons. Lessons are short written pages (§6.3).
- Payments, subscriptions, messaging between users, admin console UI (an admin CLI script is enough).
- Production-launch work: binding legal text (privacy and terms are clearly-marked templates), an operations runbook, GDPR export/data-location work, and multi-member company teams. Scale-only concerns are documented in `docs/limits.md` instead of built.
- Users under 18.

## 4. Anti-goals (failure even if it "works")

- Any secret, credential, personal document or real person's data in the repo or in git history.
- A public endpoint that lets anyone run up LLM spend.
- Pitch practice that can be steered off-topic into producing harmful content, or that leaks its system prompt.
- A design that looks like a generic template.
- Collecting sensitive demographic data (race, gender, date of birth) that the product doesn't need.

## 5. Constraints

- **Brand:** the name is **PitchPerfect**, with a logo and favicon set (a simple wordmark plus an icon mark, drawn as SVG). Palette and typography: primary blue `#3f56d2`, deep navy `#2d3c90`, neutrals (`#212529`, `#6c757d`, `#f8f9fa`, `#e9ecef`), Poppins (headings) and Manrope (body). The site has a student side and an employer side.
- **Stack:**
  - **TypeScript everywhere**, Node 22 LTS (`engines: >=22.12`), npm workspaces monorepo.
  - **`apps/web`:** Next.js (App Router) + React, for server-rendered, SEO-friendly pages. Styling is Tailwind CSS, with brand tokens as CSS variables.
  - **`apps/api`:** Express + Mongoose + MongoDB.
  - **`apps/coach`:** a separate Node service (Fastify) for pitch practice. It is internal-only.
  - **`packages/shared`:** zod schemas, types, constants and small helpers used by all three apps, which removes client/server duplication.
  - **`packages/partner`:** the practice partner engine (prompts, guardrails, the scripted provider, and the plan, turn and score steps), run by coach and by the static demo.
  - **Local:** `npm run dev:infra` starts MongoDB and a local mail catcher (Mailpit) for `npm run dev`; `docker compose --profile full up --build -d` runs those plus api, coach and web.
- **Practice mode:** voice-first with typing always available. It uses the browser's Web Speech API for speech-to-text and `speechSynthesis` for the buyer's voice. Unsupported browsers (e.g. Firefox STT) fall back to text automatically.
- **LLM provider:** swappable between OpenAI and Anthropic via `COACH_PROVIDER=openai|anthropic`. Model IDs come from env (`COACH_MODEL`, `COACH_SCORING_MODEL`). Keys exist only in the coach service's environment.

## 6. What gets built

### 6.1 Repository layout

```
PitchPerfect/
  apps/web/         Next.js site (public pages + student + employer apps), also built as the static demo
  apps/api/         REST API: auth, users, companies, jobs, applications, practice proxy
  apps/coach/       Pitch-practice service: HMAC-checked routes, LLM provider adapters, evals
  packages/partner/ the practice partner engine: personas, conversation, scoring, guardrails
  packages/shared/  zod schemas, types, constants (skills, roles, enums), seed data
  e2e/              Playwright suites for the full stack, the static demo and a deployed site
  docs/             architecture.md, security.md, deploy.md, and the other guides; design/ (this doc)
  docker-compose.yml, .env.example (per app), .gitignore, .gitleaks.toml
  .github/          workflows/ci.yml, workflows/pages.yml, dependabot.yml
```

### 6.2 Accounts and auth

- **Roles:** `student`, `employer`. One `User` collection with a `role` field, plus role-specific profile documents, so sign-in and sessions are one code path for both roles.
- **Sign up:** email + password (min 12 chars, checked against a breached-password list via a k-anonymity range query, or a bundled list of common passwords if offline). Students must tick an **"I am 18 or older"** confirmation. Email verification is required before practice or applying. Each employer creates their **own** company record, one employer per company in v1, with no invites or teams, so one employer can never take over another's company.
- **Employer verification (lightweight, demo-appropriate):** a company is marked **verified** automatically when the employer's verified email domain matches the company website's domain. Otherwise it stays **unverified** until approved with the admin CLI (`npm run admin -- approve-company <id>`). Jobs from unverified companies show an "Unverified employer" badge, are `noindex`, and are left out of the sitemap and `JobPosting` structured data. The admin CLI can also suspend a company, which hides its jobs.
- **Sessions:** server-side sessions stored in MongoDB, with an opaque session ID in an `httpOnly; Secure; SameSite=Lax` cookie. Rolling expiry is 7 days, absolute expiry 30 days. Logout destroys the session server-side. No JWTs in the browser.
- **CSRF:** SameSite=Lax plus an Origin/Referer check on every state-changing request, plus a double-submit CSRF token (`x-csrf-token`) on every non-GET request.
- **Password reset:** a 32-byte random token stored **hashed**, single use, expiring after 30 minutes. The link is built from `APP_URL`, never from the Host header. The response is the same whether or not the email exists.
- **Rate limits:** sign-in 5/min per IP+email with exponential backoff; sign-up 3/hour per IP; reset 3/hour per email. Counters are stored in MongoDB.
- **Data minimization:** students give name, email, school, major, graduation year, target role/industry and state. **Race, gender, date of birth and phone are not collected.** Employers give name, work email, job title and company.
- **Uploads:** students can upload one résumé PDF. It is validated by magic bytes and capped at 2 MB, stored in GridFS under a random ID, and served only to the owner and to employers whose job the student applied to. Profile photos aren't part of v1.
- **Account deletion:**
  - **Student:** removes the user, sessions, applications, saved jobs, practice attempts and résumé.
  - **Employer:** removes the user, their company, its jobs and interviews. Open applications to those jobs are marked "closed (employer left)", and affected applicants get an email.
- **Same-origin API:** the browser only ever talks to the web origin. Next.js rewrites `/api/*` to the api service (and SSE streams pass through the same rewrite), so session cookies are always first-party and no cross-site CORS is needed in production. This works with or without a custom domain.

### 6.3 Product areas

**Public site (SEO; static or server-rendered):**

- `/` home: hero, how it works (Learn → Practice → Get hired), for students, for employers, sample scorecard, FAQ, CTA.
- `/students`, `/employers`, `/how-it-works`, `/about`, `/privacy`, `/terms`.
- `/jobs`: public job listings (active jobs only), with each job at `/jobs/[slug]` rendered server-side with `JobPosting` structured data. Apply requires sign-in.
- **SEO baseline:** per-page `<title>`/description, canonical URLs from `SITE_URL`, Open Graph/Twitter cards, `sitemap.xml`, `robots.txt`, JSON-LD (`Organization`, `WebSite`, `JobPosting`, `FAQPage`), semantic headings, image `alt`. Lighthouse ≥ 90 for Performance, Accessibility, Best Practices and SEO on the public pages.

**Student app (`/app`):**

- **Onboarding:** target role, industry, state.
- **Learn:** 8 short written lessons, one per practice skill: Introducing yourself, Pitching, Objection handling, Probing & discovery, Referrals/networking, Next steps, Asking for the business, Interpersonal skills. They are original text (≈300–500 words each, with a framework, an example and common mistakes) written as MDX in the repo. Progress is stored server-side.
- **Practice:** a grid of the same 8 skills. Each opens the practice room (§6.4). Students can also "Practice for this job" from any job page, which passes the job's title, description and skills as context.
- **History:** past attempts with scorecards and a score trend per skill.
- **Jobs:** browse, save, apply (optionally sharing one scorecard), withdraw. Application status is visible. A shared scorecard is a **live reference**, not a copy. If the student deletes that attempt, withdraws the application, or the retention purge removes it, the employer sees "Scorecard no longer shared". The practice room states this when the student shares.
- **Profile & settings:** edit profile, change email/password (current password **required**), résumé, delete account.

**Employer app (`/employer`):**

- **Company profile:** name, website, LinkedIn, pitch, logo URL (validated HTTPS).
- **Jobs:** create, edit, draft, publish, archive, delete. The description editor produces sanitized HTML (an allowlist applied with sanitize-html on the server at write time, and again with DOMPurify on render).
- **Candidates per job:** the applicant list, with status pipeline applied → shortlisted → interview → hired/rejected and a save-for-later toggle. Employers schedule interviews with a date/time and a meeting link (HTTPS validated). Employers see a candidate's résumé and any scorecard the candidate chose to share.
- **Dashboard:** counts of active jobs, applicants and interviews.
- **Ownership:** every employer route checks that the job belongs to the employer's company (no cross-company access).

### 6.4 Pitch-practice service ("coach")

**Shape:** `apps/coach` is its own process with its own package.json, Dockerfile, env and tests. It is **never exposed publicly**. Only `apps/api` calls it, over HTTP, using an HMAC-signed request (shared secret `COACH_SHARED_SECRET`, signature over the timestamp, method, path and body, 60 s replay window). The coach has no database access: the api owns persistence and passes in whatever context the coach needs.

**Flow:**

1. **Start:** the student picks a skill (and optionally a job). The api checks auth, email verification and quota, then calls `coach POST /v1/plan` with skill + job context + student target role. The coach returns a **scenario**: buyer persona (name, title, company type, personality, 2–3 hidden objections, what would convince them) and an opening line. The scenario is stored by the api; the hidden fields are never sent to the browser.
2. **Turns:** the browser captures speech, transcribes it in-browser, shows the transcript for the student to edit, and sends it to `api POST /api/practice/sessions/:id/turns`. The api appends it and calls `coach POST /v1/turn` with the scenario + transcript so far. The coach returns the persona's reply (≤ 80 words) plus a stage marker (opening, discovery, pitch, objection, close). Replies stream to the browser (SSE via the api) and are spoken with `speechSynthesis`.
3. **End:** the student ends the session, or it auto-ends at the turn or time cap. The api calls `coach POST /v1/score`, which returns a **scorecard** validated against a zod schema:
   - Rubric dimensions, each scored 1–5 with a one-sentence justification quoting the student's words: Clarity, Value & relevance, Structure, Discovery questions, Objection handling, Confidence & language, Call to action.
   - An overall 0–100 score.
   - 3 strengths and 3 improvements.
   - A rewritten "stronger version" of one weak line.
   - The skill-specific dimension is weighted higher (e.g. Objection handling for that skill).
4. Results are saved as a `PracticeAttempt` (studentId, skill, jobId?, scenario public fields, transcript, scorecard, model/provider used, token counts, timestamps).

**Provider adapter:** `LlmProvider` interface with `chatStream` (streaming), `structured` (zod-validated) and an optional `moderate`, implemented for OpenAI and Anthropic in the coach, plus the deterministic scripted provider in `packages/partner`. It is selected by env at startup and fails fast with a clear error if the selected provider's key or model IDs are missing. No provider names appear in prompts; the privacy page names the provider that processes transcripts.

**Guardrails (coach + api):**

- **Input:** ≤ 1,000 characters per turn, ≤ 20 student turns per session, session lifetime ≤ 20 min. Control characters are stripped. Student text is always passed inside a delimited data block, never concatenated into instructions.
- **Off-topic and jailbreak handling:** the system prompt pins the persona to the sales scenario. A cheap pre-check (rules + a small classification call) flags attempts to extract instructions, change role, or request harmful/sexual/violent/illegal content. Flagged turns get an in-character redirect, and 3 confirmed attacks end the session with a neutral notice.
- **Output:** replies are checked for system-prompt leakage (canary token in the prompt; if it appears in output, the reply is dropped and regenerated once), length-capped, and run through the provider's moderation endpoint where available, otherwise through the rule filter.
- **PII:** emails, phone numbers and card-like numbers are redacted from transcripts before they are sent to the provider and before storage.
- **Cost:** per-student quota (default 5 sessions/day, 30/month, env-configurable). A global daily token budget makes the api refuse new sessions with a friendly message once it is exceeded. Per-request timeout 30 s, one retry with backoff, and a circuit breaker on provider errors.
- **Privacy:** logs record IDs, timings, token counts and outcome codes only, never transcript text. Transcripts are kept 180 days, then removed by a TTL index, with a scheduled purge job as a backstop. Students can delete any attempt.
- **Evaluation:** `apps/coach/evals/` contains ~30 scripted conversations (strong, mediocre, weak, and adversarial ones such as off-topic chatter and jailbreak attempts) with expected score bands and guardrail outcomes. `npm run eval -w apps/coach` runs them against a real provider (manual, needs a key). Unit tests run against the fake provider in CI.

**Voice UX:**

- Push-to-talk button with a visible level meter and live interim transcript. The final transcript is editable before sending.
- A voice picker (from the browser's available voices) and a mute toggle.
- Captions are always on: the persona's reply is shown as text as well as spoken.
- Keyboard shortcuts: Space for push-to-talk, Enter to send. Screen-reader announcements for new replies.
- If mic permission is denied or STT is unavailable, it switches to text mode with an explanation.
- **Honest privacy copy:** PitchPerfect never uploads or stores audio. However, the browser's own speech recognition may send audio to the browser vendor (Google for Chrome, Apple for Safari, Microsoft for Edge). The practice room says so next to the mic toggle and links to the privacy page. Where the browser offers on-device recognition, it is preferred automatically. Text mode is always one click away for anyone who prefers it.
- **First-session consent:** before a student's first practice session, a one-time notice explains three things: what the partner is (an AI, or the scripted demo), where transcripts go (the configured LLM provider, our own server, or nowhere outside the browser tab) and how long they are kept, and voice handling works as described above. The student must accept before starting. Acceptance is stored with a timestamp.

### 6.5 Security baseline (all services)

- Request validation with shared zod schemas on every route. Unknown fields are rejected (no mass assignment). `mongoose.set('sanitizeFilter', true)` and `strictQuery`.
- helmet with a strict Content-Security-Policy (no inline scripts except Next.js nonces). HSTS in production. No CORS: the browser reaches the api only through web's same-origin `/api` rewrite, so cookies stay first-party.
- A central error handler maps validation and cast errors to 400, duplicates to 409 and everything else to a generic 500 with a request ID. No stack traces reach clients.
- Rate limiting on all public routes. Body size limit 100 kB (except résumé upload). Pagination limits on all list endpoints.
- All user-generated HTML is sanitized. Everything else renders as text.
- Secrets live only in env. `.env*` is gitignored except `.env.example`. gitleaks runs in CI and as a pre-commit hook. `npm audit --audit-level=high` runs in CI. Dependabot is configured.
- `docs/security.md` covers the threat model, the controls above, and how to report a vulnerability.

### 6.6 Design system

- **Look:** clean, airy, confident. A white/`#f8f9fa` base, brand blue `#3f56d2` for primary actions and highlights, navy `#2d3c90` for headers, footers and hero gradients, Poppins headings and Manrope body. Rounded 12–16 px cards, soft shadows and generous spacing. The PitchPerfect wordmark and icon in the same palette (SVG, plus generated favicon/PWA sizes).
- **Legal pages:** `/privacy` and `/terms` are complete, readable templates covering the real data flows (accounts, résumés, transcripts, LLM provider, browser speech, retention, deletion, 18+). Each carries a visible banner saying it is a demo template, not legal advice.
- **Components** (one shared set): Button, Input/Field with label + error, Select, Card, Badge, Tabs, Modal, Toast, EmptyState, Skeleton, DataTable, Navbar (public) and AppShell (role-aware: one component with links passed in), Footer, SkillGrid, ScoreRing, RubricBar.
- **Accessibility:** WCAG 2.2 AA. Every input has a visible label, focus rings are visible, contrast is checked, and everything works by keyboard. `prefers-reduced-motion` is respected.
- **Responsive:** mobile-first. Dashboards collapse to a bottom tab bar on phones.
- **Motion:** subtle only (hover, page fade, score count-up). Nothing that hurts Core Web Vitals.

### 6.7 Quality

- **Tests:**
  - api: integration tests (Vitest + supertest + mongodb-memory-server) for auth, ownership, validation and rate limits.
  - partner and coach: unit tests with the fake provider for guardrails, prompts, the scripted partner, adapter selection, schema validation and HMAC.
  - web: component tests for forms and the practice room state machine.
  - Playwright e2e: sign up → verify (via Mailpit) → practice in text mode → see scorecard → apply to a job; employer posts a job → sees applicant → schedules interview. A separate suite checks the static demo build.
- **CI** (GitHub Actions): install, format check (Prettier), lint (ESLint), typecheck, unit/integration tests, build, knip and jscpd, npm audit and gitleaks; e2e (with the fake coach provider); the static demo's e2e; Lighthouse; and a build of the three container images.
- **Docs:** README (what it is, screenshots, run locally, env vars, scripts), `docs/architecture.md` (diagram of web → api → coach → provider), `docs/deploy.md`.

### 6.8 Deployment

- **web:** Vercel.
- **api** and **coach:** containers (Render or Fly.io). coach on a private network or protected by HMAC + IP allowlist.
- **Database:** a new MongoDB Atlas cluster with a new user, IP allowlist and TLS.
- **Email:** any SMTP provider via env.
- **Static demo:** the public pages, lessons, job board and practice room are also published to GitHub Pages (https://shashank11yadav.github.io/PitchPerfect/) by `.github/workflows/pages.yml` on every push to `main`, with the scripted practice partner and the scorer running in the browser. Accounts, applying and the employer tools are full-app only.

## 7. Success criteria

- `docker compose --profile full up --build -d` gives a working site at `http://localhost:3000`, and the seed command loads the fictional companies and jobs. All e2e flows pass.
- Public pages score Lighthouse ≥ 90 in all four categories (CI allows performance down to 85 on shared runners).
- gitleaks and `npm audit --audit-level=high` are clean, and there are no high-severity findings in a final security review.
- Duplicate code (jscpd) is under 3%, and knip reports no unused files, exports or dependencies.
- A practice session works by voice in Chrome/Edge/Safari and by text in Firefox, and returns a scorecard in under 10 s after ending.

## 8. Key decisions

- Accounts for students and employers, with secure server-side sessions rather than browser tokens.
- The LLM provider is swappable between OpenAI and Anthropic, and a deterministic scripted partner runs the demo without a key.
- Practice is voice-first with a text fallback, using browser speech (no paid speech APIs).
- Students must be 18 or older, and race, gender, date of birth, phone and profile photos are not collected.
- Written MDX lessons, one per practice skill.
- Fictional seed companies and jobs only.
- A public `/jobs` listing, with applying behind sign-in.
- Same-origin API through Next.js rewrites (no shared parent domain needed).
- One employer per company with no invites, plus lightweight domain-match verification, an unverified badge and an admin CLI.
- Employer deletion cascades to company, jobs and interviews, and closes open applications with an email to applicants.
- Shared scorecards are live references that disappear when the student deletes or withdraws.
- Browser-vendor speech processing is disclosed, and on-device recognition is preferred where available.
