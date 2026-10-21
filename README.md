# PitchPerfect

Practice the sales call out loud before the real one, then apply with the scorecard.

PitchPerfect is a practice and hiring site for entry-level sales jobs. A student reads a short lesson on one skill, then runs the call by voice or text with an AI practice partner that plays the buyer. When the call ends they get a scorecard that quotes what they actually said. Employers post roles and, if a candidate chooses to share one, read that scorecard next to the application.

> Status: portfolio project. It runs end to end on your machine with seeded demo data; deployment steps are in [docs/deploy.md](docs/deploy.md).

## What's inside

| Area          | What it does                                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Learn**     | Eight short lessons, one per core skill: introducing yourself, pitching, objection handling, probing and discovery, referrals and networking, next steps, asking for the business, interpersonal skills.  |
| **Practice**  | Pick a skill (or a real job posting), pitch by voice or text to an AI buyer persona with hidden objections, then get a 7-dimension scorecard with strengths, improvements, and a rewritten stronger line. |
| **Jobs**      | Public job board. Students save, apply, optionally share a scorecard, and track status.                                                                                                                   |
| **Employers** | Company profile, job posting with a safe rich-text editor, applicant pipeline (shortlist, interview, hire, not a fit), interview scheduling, dashboard.                                                   |

## Screenshots

Taken with `npx tsx e2e/screenshots.ts` from a local production build (`npm run build`, then `next start`) running the `fake` practice partner, the demo data, and the default practice limits.

![Home page: the headline "Practice your pitch. Get hired." beside a sample practice call](docs/images/home.png)

![Practice room two turns into a pitching call, with the buyer's profile, the stage tracker, and the reply box](docs/images/practice-room.png)

![Scorecard for a pitching call: 72 out of 100, with a 1 to 5 score, a reason and a quoted line for each of the seven rubric lines](docs/images/scorecard.png)

![Employer view of one applicant: their school, status, the Shortlist and Not a fit buttons, and the practice scorecard they attached, scored on seven rubric lines](docs/images/employer-pipeline.png)

## Architecture at a glance

```
Browser ──► apps/web (Next.js, port 3000)
              │  /api/* is proxied (same origin, first-party cookies)
              ▼
            apps/api (Express + MongoDB, port 4000)
              │  HMAC-signed internal calls only
              ▼
            apps/coach (practice partner service, port 4100, never public)
              │
              ▼
            LLM provider (OpenAI or Anthropic, chosen by env)
```

- `apps/web`: Next.js App Router site: public pages (static/SSR for SEO), student app, employer app.
- `apps/api`: REST API: accounts, sessions, companies, jobs, applications, lessons, and the practice proxy.
- `apps/coach`: independent practice partner service: buyer personas, conversation, scoring, guardrails, provider adapter.
- `packages/shared`: zod schemas, types, and constants shared by all apps.

Details: [docs/architecture.md](docs/architecture.md).

## Quick start

Requirements: Node 22+ and Docker.

```bash
git clone <this repo> pitchperfect && cd pitchperfect
npm install
cp apps/api/.env.example apps/api/.env
cp apps/coach/.env.example apps/coach/.env
cp apps/web/.env.example apps/web/.env.local
npm run dev:infra      # MongoDB + Mailpit (local email inbox) in Docker
SEED_DEMO_PASSWORD='pick-a-12-plus-char-password' npm run seed -- --demo   # companies, jobs, two demo accounts
npm run dev            # web, api, and coach with hot reload
```

The demo student (`student@pitchperfect.example`) and employer (`employer@pitchperfect.example`) both sign in with the `SEED_DEMO_PASSWORD` you set; it needs 12 or more characters and is never printed. You can put it in `apps/api/.env` instead of the command line. With `--demo` the employer account also gets its own company (Pitchwell Demo Hiring Co) with two open jobs, and the student has one application to it. Without `--demo` the seed loads only the six fictional companies, their jobs, and their employers.

Open http://localhost:3000. Verification and password-reset emails land in Mailpit at http://localhost:8025.

The practice partner runs with `COACH_PROVIDER=fake` by default, a deterministic offline persona, so everything works without an API key. To use a real model, set `COACH_PROVIDER=openai` or `anthropic` plus the matching key and model IDs in `apps/coach/.env`.

To run the whole stack in containers instead, use `docker compose --profile full up --build -d`. It needs no `.env` files: it runs on `dev-only-` placeholder secrets and the `fake` partner (unless `apps/coach/.env` picks a provider), and serves http://localhost:3000 (set `WEB_PORT` if 3000 is taken). Load the demo data into it with:

```bash
docker compose exec -e SEED_DEMO_PASSWORD='pick-a-12-plus-char-password' api node dist/scripts/seed.js --demo
```

## Scripts

| Command                                       | What it does                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                 | Run web, api, and coach in watch mode                                                                     |
| `npm run dev:infra`                           | Start MongoDB and Mailpit containers                                                                      |
| `npm run seed -- --demo`                      | Load demo data and accounts (idempotent; needs `SEED_DEMO_PASSWORD`)                                      |
| `npm run purge`                               | Delete expired attempts and tokens, abandon stale sessions, clear unfinished starts                       |
| `npm run build`                               | Build every workspace                                                                                     |
| `npm run lint` / `npm run format`             | ESLint / Prettier                                                                                         |
| `npm run typecheck`                           | TypeScript project-wide check                                                                             |
| `npm test`                                    | Unit and integration tests for all workspaces                                                             |
| `npm run e2e`                                 | Build, then Playwright end-to-end tests on a throwaway database (needs `dev:infra`; fake provider)        |
| `npm run e2e:smoke`                           | Read-only smoke test of a running site: `BASE_URL=https://… npm run e2e:smoke`                            |
| `npm run lighthouse`                          | Lighthouse CI on `/`, `/students` and `/jobs` against `next start` (needs a build and the api)            |
| `npm run check:dead`                          | knip (unused files, exports, deps) and jscpd (duplication)                                                |
| `npm run eval -w apps/coach`                  | Run practice partner evals against a real provider (needs a key)                                          |
| `npm run admin -- <command>`                  | Admin CLI: `migrate`, `list-unverified`, `approve-company`, `suspend-company`, `unsuspend-company`        |
| `npm run admin:prod -w apps/api -- <command>` | The admin CLI run from the compiled build, for production. `seed:prod` and `purge:prod` work the same way |
| `npx tsx e2e/screenshots.ts`                  | Retake the screenshots above from a running stack (needs `SEED_DEMO_PASSWORD`, `BASE_URL`)                |

## Documentation

| Doc                                                                                  | Read it when you're...                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                                         | Getting oriented: services, data model, request flows          |
| [docs/conventions.md](docs/conventions.md)                                           | Writing any code: structure, naming, validation, errors, tests |
| [docs/api.md](docs/api.md)                                                           | Adding or calling an endpoint                                  |
| [docs/practice-partner.md](docs/practice-partner.md)                                 | Working on personas, scoring, guardrails, or providers         |
| [docs/design-system.md](docs/design-system.md)                                       | Building UI: brand tokens, components, accessibility, SEO      |
| [docs/security.md](docs/security.md)                                                 | Touching auth, data, uploads, or anything user-facing          |
| [docs/deploy.md](docs/deploy.md)                                                     | Deploying                                                      |
| [docs/limits.md](docs/limits.md)                                                     | Wondering what's intentionally out of scope                    |
| [docs/design/2026-10-19-rebuild-design.md](docs/design/2026-10-19-rebuild-design.md) | Understanding why the product is shaped this way               |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                   | Opening a pull request                                         |

## Security

Never commit secrets. Every app reads configuration from its own `.env` (see the `.env.example` files). CI runs gitleaks and `npm audit`. To report a vulnerability, see [docs/security.md](docs/security.md#reporting).

## Author

Built by [Shashank Yadav](https://github.com/shashank11yadav).
