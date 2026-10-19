# PitchPerfect: Rebuild Design

Date: 2026-10-19 · Status: approved

## 1. Intent

PitchPerfect is a platform where students and early-career candidates (18+) train for tech-sales roles and connect with employers hiring for them. It was originally shipped in 2024 under the name "Amie". That first version no longer builds or runs, carries heavy duplication and outdated dependencies, and never shipped the pitch-practice feature at its core. This rebuild starts fresh.

This rebuild is a **portfolio-grade demo**: fully working and deployable, with seeded demo data. It is not a production launch with real users. It produces a clean, secure product that keeps the original look and the two-sided student/employer model, under a new PitchPerfect brand. It also adds the feature the product was always meant to have: **a practice partner the student pitches to by voice, which plays a realistic buyer and then scores the pitch.**

In the product, the practice feature is honestly called an **"AI practice partner"**: users are told the buyer is automated, and the privacy page names the LLM provider that processes transcripts. Naming the provider as a runtime dependency (SDK package, env var, adapter module) is fine.

## 2. Goals

1. **It works end to end:** a student signs up, practices, browses jobs and applies. An employer signs up, posts jobs and manages candidates. It runs locally with one command and deploys with documented steps.
2. **Security comes first:** no secrets in the repo, data kept to a minimum, OWASP Top 10 covered, and abuse limits on everything that costs money (LLM calls, email).
3. **A modern, attractive, easy UI** that clearly descends from the original: same brand blue, fonts, logo, name, and the same student/employer split.
4. **SEO-friendly public pages:** server-rendered or static HTML, real metadata, sitemap, structured data, fast Core Web Vitals.
5. **Pitch practice runs as a separate, independent service** ("coach") that can be deployed, scaled, tested and swapped without touching the rest.
6. **No dead or duplicated code.** Shared UI and server logic each live in exactly one place.

## 3. Non-goals

- Migrating data from the original version. The rebuild starts with an empty database.
- Native mobile apps. The web app is responsive and works well on phones.
- Paid speech services (server-side STT/TTS) in v1.
- Video lessons. YouTube embeds are removed (§6.4).
- Payments, subscriptions, messaging between users, admin console UI (an admin CLI script is enough).
- Production-launch work: binding legal text (privacy and terms are clearly-marked templates), an operations runbook, GDPR export/data-location work, and multi-member company teams. Scale-only concerns are documented in `docs/limits.md` instead of built.
- Users under 18.

## 4. Anti-goals (failure even if it "works")

- Any secret, credential, personal document or real person's data in the repo or in git history.
- A public endpoint that lets anyone run up LLM spend.
- Pitch practice that can be steered off-topic into producing harmful content, or that leaks its system prompt.
- A redesign that looks like a generic template and no longer reads as Amie/PitchPerfect.
- Re-collecting sensitive demographic data (race, gender, date of birth) that the product doesn't need.

## 5. Constraints

- **Repository:** a new git repository with clean history. The old codebase is used only as a reference and is never copied wholesale.
- **Brand:** the name is **PitchPerfect**, with a **new logo and favicon set** (a simple wordmark plus an icon mark, drawn as SVG). The old "Amie" name, logo and favicons are **not** reused. The design stays recognizably the original through the palette and typography: primary blue `#3f56d2`, deep navy `#2d3c90`, neutrals (`#212529`, `#6c757d`, `#f8f9fa`, `#e9ecef`), Poppins (headings) and Manrope (body), and the same student/employer structure.
- **Stack choices** (the owner chose accounts, voice, swappable LLM and a fresh repo; the specific technologies are implementation choices, listed in §9):
  - **TypeScript everywhere**, Node 22 LTS (`engines: >=22`), npm workspaces monorepo.
  - **`apps/web`:** Next.js (App Router) + React. It is the SEO-capable successor to the old Create React App (now deprecated). Styling is Tailwind CSS, with brand tokens as CSS variables.
  - **`apps/api`:** Express + Mongoose + MongoDB. This keeps the original backend stack, rebuilt cleanly.
  - **`apps/coach`:** a separate Node service (Fastify) for pitch practice. It is internal-only.
  - **`packages/shared`:** zod schemas and types used by all three apps, which removes client/server duplication.
  - **Local:** `docker compose up` runs MongoDB, a local mail catcher (Mailpit), api, coach and web.
- **Practice mode:** voice-first with typing always available. It uses the browser's Web Speech API for speech-to-text and `speechSynthesis` for the buyer's voice. Unsupported browsers (e.g. Firefox STT) fall back to text automatically.
- **LLM provider:** swappable between OpenAI and Anthropic via `COACH_PROVIDER=openai|anthropic`. Model IDs come from env (`COACH_MODEL`, `COACH_SCORING_MODEL`). Keys exist only in the coach service's environment.

## 6. What gets built

### 6.1 Repository layout

```
PitchPerfect/
  apps/web/        Next.js site (public pages + student + employer apps)
  apps/api/        REST API: auth, users, companies, jobs, applications, practice proxy
  apps/coach/      Pitch-practice service: personas, conversation, scoring, guardrails
  packages/shared/ zod schemas, types, constants (skills, roles, enums)
  docs/            architecture.md, security.md, deploy.md, design/ (this doc)
  docker-compose.yml, .env.example (per app), .gitignore, .gitleaks.toml
  .github/workflows/ci.yml
```

### 6.2 Relationship to the original version

No code, configuration, data, third-party content, video links, real company lists or lockfiles are carried over from the original version. What carries over is ideas only: the brand colors and fonts, the skill taxonomy (8 practice skills), and the product's page structure. No files or image assets are copied.

### 6.3 Accounts and auth (rebuilt)

- **Roles:** `student`, `employer`. One `User` collection with a `role` field, plus role-specific profile documents. This replaces the duplicated Student/Employer auth code.
- **Sign up:** email + password (min 12 chars, checked against a breached-password list via a k-anonymity range query, or a bundled top-100k list if offline). Students must tick an **"I am 18 or older"** confirmation. Email verification is required before practice or applying. Each employer creates their **own** company record, one employer per company in v1, with no invites or teams. This fixes the company-hijack bug.
- **Employer verification (lightweight, demo-appropriate):** a company is marked **verified** automatically when the employer's verified email domain matches the company website's domain. Otherwise it stays **unverified** until approved with the admin CLI (`npm run admin -- approve-company <id>`). Jobs from unverified companies show an "Unverified employer" badge, are `noindex`, and are left out of the sitemap and `JobPosting` structured data. The admin CLI can also suspend a company, which hides its jobs.
- **Sessions:** server-side sessions stored in MongoDB, with an opaque session ID in an `httpOnly; Secure; SameSite=Lax` cookie. Rolling expiry is 7 days, absolute expiry 30 days. Logout destroys the session server-side. No JWTs in the browser.
- **CSRF:** SameSite=Lax plus an Origin/Referer check on every state-changing request, plus a double-submit CSRF token for form posts.
- **Password reset:** a 32-byte random token stored **hashed**, single use, expiring after 30 minutes. The link is built from `APP_URL`, never from the Host header. The response is the same whether or not the email exists.
- **Rate limits:** sign-in 5/min per IP+email with exponential backoff; sign-up 3/hour per IP; reset 3/hour per email. Storage is Mongo-backed (or Redis if `REDIS_URL` is set).
- **Data minimization:** students give name, email, school, major, graduation year, target role/industry and state. **Race, gender, date of birth and phone are no longer collected.** Employers give name, work email, job title and company.
- **Uploads:** students can upload one résumé PDF. It is validated by magic bytes and capped at 2 MB, stored in GridFS under a random ID, and served only to the owner and to employers whose job the student applied to. Profile photos are dropped in v1.
- **Account deletion:**
  - **Student:** removes the user, sessions, applications, practice attempts and résumé.
  - **Employer:** removes the user, their company, its jobs and interviews. Open applications to those jobs are marked "closed (employer left)", and affected applicants get an email.
- **Same-origin API:** the browser only ever talks to the web origin. Next.js rewrites `/api/*` to the api service (and SSE streams pass through the same rewrite), so session cookies are always first-party and no cross-site CORS is needed in production. This works with or without a custom domain.

### 6.4 Product areas

**Public site (SEO; static or server-rendered):**

- `/` home: hero, how it works (Learn → Practice → Get hired), for students, for employers, sample scorecard, FAQ, CTA.
- `/students`, `/employers`, `/how-it-works`, `/about`, `/privacy`, `/terms`.
- `/jobs`: public job listings (active jobs only), with each job at `/jobs/[slug]` rendered server-side with `JobPosting` structured data. Apply requires sign-in.
- **SEO baseline:** per-page `<title>`/description, canonical URLs from `SITE_URL`, Open Graph/Twitter cards, `sitemap.xml`, `robots.txt`, JSON-LD (`Organization`, `WebSite`, `JobPosting`, `FAQPage`), semantic headings, image `alt`. Lighthouse ≥ 90 for Performance, Accessibility, Best Practices and SEO on the public pages.

**Student app (`/app`):**

- **Onboarding:** target role, industry, state.
- **Learn:** 8 short written lessons, one per practice skill: Introducing yourself, Pitching, Objection handling, Probing & discovery, Referrals/networking, Next steps, Asking for the business, Interpersonal skills. They are original text (≈300–500 words each, with a framework, an example and common mistakes) written as MDX in the repo. They replace the YouTube training room. Progress is stored server-side.
- **Practice:** a grid of the same 8 skills. Each opens the practice room (§6.5). Students can also "Practice for this job" from any job page, which passes the job's title, description and skills as context.
- **History:** past attempts with scorecards and a score trend per skill.
- **Jobs:** browse, save, apply (optionally sharing one scorecard), withdraw. Application status is visible. A shared scorecard is a **live reference**, not a copy. If the student deletes that attempt, withdraws the application, or the retention purge removes it, the employer sees "Scorecard no longer shared". The practice room states this when the student shares.
- **Profile & settings:** edit profile, change email/password (current password **required**), résumé, delete account.

**Employer app (`/employer`):**

- **Company profile:** name, website, LinkedIn, pitch, logo URL (validated HTTPS).
- **Jobs:** create, edit, draft, publish, archive, delete. The description editor produces sanitized HTML (allowlist via DOMPurify on the server at write time and on render).
- **Candidates per job:** the applicant list, with status pipeline applied → shortlisted → interview → hired/rejected and a save-for-later toggle. Employers schedule interviews with a date/time and a meeting link (HTTPS validated). Employers see a candidate's résumé and any scorecard the candidate chose to share.
- **Dashboard:** counts of active jobs, applicants and interviews.
- **Ownership:** every employer route checks that the job belongs to the employer's company (no cross-company access).

### 6.5 Pitch-practice service ("coach")

**Shape:** `apps/coach` is its own process with its own package.json, Dockerfile, env and tests. It is **never exposed publicly**. Only `apps/api` calls it, over HTTP, using an HMAC-signed request (shared secret `COACH_SHARED_SECRET`, timestamp + body hash, 60 s replay window). The coach has no database access: the api owns persistence and passes in whatever context the coach needs.

**Flow:**

1. **Start:** the student picks a skill (and optionally a job). The api checks auth, email verification and quota, then calls `coach POST /sessions/plan` with skill + job context + student target role. The coach returns a **scenario**: buyer persona (name, title, company type, personality, 2–3 hidden objections, what would convince them) and an opening line. The scenario is stored by the api; the hidden fields are never sent to the browser.
2. **Turns:** the browser captures speech, transcribes it in-browser, shows the transcript for the student to edit, and sends it to `api POST /practice/:id/turns`. The api appends it and calls `coach POST /turns` with the scenario + transcript so far. The coach returns the persona's reply (≤ 80 words) plus a stage marker (opening, discovery, pitch, objection, close). Replies stream to the browser (SSE via the api) and are spoken with `speechSynthesis`.
3. **End:** the student ends the session, or it auto-ends at the turn or time cap. The api calls `coach POST /score`, which returns a **scorecard** validated against a zod schema:
   - Rubric dimensions, each scored 1–5 with a one-sentence justification quoting the student's words: Clarity, Value & relevance, Structure, Discovery questions, Objection handling, Confidence & language, Call to action.
   - An overall 0–100 score.
   - 3 strengths and 3 improvements.
   - A rewritten "stronger version" of one weak line.
   - The skill-specific dimension is weighted higher (e.g. Objection handling for that skill).
4. Results are saved as a `PracticeAttempt` (studentId, skill, jobId?, scenario public fields, transcript, scorecard, model/provider used, token counts, timestamps).

**Provider adapter:** `LlmProvider` interface with `chat(messages, opts)` (streaming) and `structured(messages, zodSchema)`, implemented for OpenAI and Anthropic. It is selected by env at startup and fails fast with a clear error if the selected provider's key is missing. No provider names appear in prompts or UI.

**Guardrails (coach + api):**

- **Input:** ≤ 1,000 characters per turn, ≤ 20 student turns per session, session lifetime ≤ 20 min. Control characters are stripped. Student text is always passed inside a delimited data block, never concatenated into instructions.
- **Off-topic and jailbreak handling:** the system prompt pins the persona to the sales scenario. A cheap pre-check (rules + a small classification call) flags attempts to extract instructions, change role, or request harmful/sexual/violent/illegal content. Flagged turns get an in-character redirect, and 3 flags end the session with a neutral notice.
- **Output:** replies are checked for system-prompt leakage (canary token in the prompt; if it appears in output, the reply is dropped and regenerated once), length-capped, and run through the provider's moderation endpoint where available, otherwise through the rule filter.
- **PII:** emails, phone numbers and card-like numbers are redacted from transcripts before they are sent to the provider and before storage.
- **Cost:** per-student quota (default 5 sessions/day, 30/month, env-configurable). A global daily token budget makes the coach refuse new sessions with a friendly message once it is exceeded. Per-request timeout 30 s, one retry with backoff, and a circuit breaker on provider errors.
- **Privacy:** logs record IDs, timings, token counts and outcome codes only, never transcript text. Transcripts are kept 180 days, then purged by a scheduled job. Students can delete any attempt.
- **Evaluation:** `apps/coach/evals/` contains ~30 scripted pitch transcripts (good, mediocre, off-topic, jailbreak attempts) with expected score bands and guardrail outcomes. `npm run eval` runs them against a real provider (manual, needs a key). Unit tests run against a fake provider in CI.

**Voice UX:**

- Push-to-talk button with a visible level meter and live interim transcript. The final transcript is editable before sending.
- A voice picker (from the browser's available voices) and a mute toggle.
- Captions are always on: the persona's reply is shown as text as well as spoken.
- Keyboard shortcuts: Space for push-to-talk, Enter to send. Screen-reader announcements for new replies.
- If mic permission is denied or STT is unavailable, it switches to text mode with an explanation.
- **Honest privacy copy:** PitchPerfect never uploads or stores audio. However, the browser's own speech recognition may send audio to the browser vendor (Google for Chrome, Apple for Safari, Microsoft for Edge). The practice room says so next to the mic toggle and links to the privacy page. Where the browser offers on-device recognition, it is preferred automatically. Text mode is always one click away for anyone who prefers it.
- **First-session consent:** before a student's first practice session, a one-time notice explains three things: the partner is an AI, transcripts are processed by the configured LLM provider and kept for 180 days, and voice handling works as described above. The student must accept before starting. Acceptance is stored with a timestamp.

### 6.6 Security baseline (all services)

- Request validation with shared zod schemas on every route. Unknown fields are rejected (no mass assignment). `mongoose.set('sanitizeFilter', true)` and `strictQuery`.
- helmet with a strict Content-Security-Policy (no inline scripts except Next.js nonces). HSTS in production. CORS allowlist from `CORS_ORIGINS`. web and api share a parent domain in production, so cookies stay first-party.
- A central error handler maps validation and cast errors to 400, duplicates to 409 and everything else to a generic 500 with a request ID. No stack traces reach clients.
- Rate limiting on all public routes. Body size limit 100 kB (except résumé upload). Pagination limits on all list endpoints.
- All user-generated HTML is sanitized. Everything else renders as text.
- Secrets live only in env. `.env*` is gitignored except `.env.example`. gitleaks runs in CI and as a pre-commit hook. `npm audit --audit-level=high` runs in CI. Dependabot is configured.
- `docs/security.md` covers the threat model, the controls above, and how to report a vulnerability.

### 6.7 Design system and redesign

- **Look:** clean, airy, confident. A white/`#f8f9fa` base, brand blue `#3f56d2` for primary actions and highlights, navy `#2d3c90` for headers, footers and hero gradients, Poppins headings and Manrope body. Rounded 12–16 px cards, soft shadows and generous spacing. A new PitchPerfect wordmark and icon in the same palette (SVG, plus generated favicon/PWA sizes).
- **Legal pages:** `/privacy` and `/terms` are complete, readable templates covering the real data flows (accounts, résumés, transcripts, LLM provider, browser speech, retention, deletion, 18+). Each carries a visible banner saying it is a demo template, not legal advice.
- **Components** (one shared set): Button, Input/Field with label + error, Select, Card, Badge, Tabs, Modal, Toast, EmptyState, Skeleton, DataTable, Navbar (role-aware: one component with links passed in), Footer, SkillCard, ScoreRing, RubricBar.
- **Accessibility:** WCAG 2.2 AA. Every input has a visible label, focus rings are visible, contrast is checked, and everything works by keyboard. `prefers-reduced-motion` is respected.
- **Responsive:** mobile-first. Dashboards collapse to a bottom tab bar on phones.
- **Motion:** subtle only (hover, page fade, score count-up). Nothing that hurts Core Web Vitals.

### 6.8 Quality

- **Tests:**
  - api: integration tests (Vitest + supertest + mongodb-memory-server) for auth, ownership, validation and rate limits.
  - coach: unit tests with a fake provider for guardrails, adapter selection, schema validation and HMAC.
  - web: component tests for forms and the practice room state machine.
  - Playwright e2e: sign up → verify (via Mailpit) → practice in text mode → see scorecard → apply to a job; employer posts a job → sees applicant → schedules interview.
- **CI** (GitHub Actions): install, lint (ESLint + Prettier), typecheck, unit/integration tests, build, e2e (with the fake coach provider), gitleaks, npm audit.
- **Docs:** README (what it is, screenshots, run locally, env vars, scripts), `docs/architecture.md` (diagram of web → api → coach → provider), `docs/deploy.md`.

### 6.9 Deployment (documented, not executed)

- **web:** Vercel.
- **api** and **coach:** containers (Render or Fly.io). coach on a private network or protected by HMAC + IP allowlist.
- **Database:** a new MongoDB Atlas cluster with a new user, IP allowlist and TLS.
- **Email:** any SMTP provider via env.
- Nothing is deployed or pushed in this project without the owner's go-ahead.

## 7. Success criteria

- `docker compose up` gives a working site at `http://localhost:3000` with seed data (fictional companies and jobs). All e2e flows pass.
- Public pages score Lighthouse ≥ 90 in all four categories.
- gitleaks and `npm audit --audit-level=high` are clean, and there are no high-severity findings in a final security review.
- Duplicate code (jscpd) is under 3%, and knip/depcheck report no unused files or dependencies.
- A practice session works by voice in Chrome/Edge/Safari and by text in Firefox, and returns a scorecard in under 10 s after ending.

## 8. Decided by the owner

- Keep accounts (student + employer) and rebuild auth securely, rather than removing it.
- LLM provider is swappable between OpenAI and Anthropic.
- Practice is voice-first with a text fallback, using browser speech (no paid speech APIs).
- A new, clean repo on the Desktop with fresh history.
- Remove secrets, PII, YouTube links, dead code and duplicate code. The design must look like the original project, and security comes first.
- It is a portfolio demo, not a production launch.
- Students must be 18 or older.
- The product calls the feature an "AI practice partner" and discloses that it is automated.
- A new PitchPerfect brand with a fresh logo in the original palette. The Amie name and assets are not reused.

## 9. Implementation choices (owner can override)

- The stack in §5 (TypeScript monorepo; Next.js, Express, Fastify; Tailwind; Mongo sessions instead of JWT).
- Repo location `~/Desktop/ai-portfolio/PitchPerfect/`.
- Dropping race, gender, DOB, phone and profile photos.
- Written MDX lessons replacing YouTube videos.
- Fictional seed companies instead of the real brand list.
- Rubric dimensions, quotas, caps and retention periods in §6.5.
- A public `/jobs` listing with apply behind sign-in.
- Same-origin API through Next.js rewrites (no shared parent domain needed).
- One employer per company with no invites, plus lightweight domain-match verification, an unverified badge and an admin CLI, instead of a full approval queue.
- Employer deletion cascades to company, jobs and interviews, and closes open applications with an email to applicants.
- Shared scorecards are live references that disappear when the student deletes or withdraws.
- Disclosing browser-vendor speech processing and preferring on-device STT, instead of dropping voice on browsers without it.

## 10. Left to implementation

File-level structure inside each app, exact component APIs, prompt wording for personas and scoring (within §6.5's rules), the seed data contents, test case selection, and visual details within §6.7.

## 11. Open questions for the owner

None outstanding.
