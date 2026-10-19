# PitchPerfect

Practice your sales pitch out loud, get scored, get hired.

PitchPerfect is a training and hiring platform for tech-sales roles. Students learn the core sales skills, practice pitching by voice to an AI practice partner that plays a realistic buyer, and get a scorecard with specific, quoted feedback. Employers post roles, review applicants, and see the practice scorecards that candidates choose to share.

> Status: portfolio project. Fully working locally with seeded demo data; deployment steps are documented in [docs/deploy.md](docs/deploy.md).

## What's inside

| Area          | What it does                                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Learn**     | Eight short lessons, one per core skill: introducing yourself, pitching, objection handling, probing and discovery, referrals and networking, next steps, asking for the business, interpersonal skills.  |
| **Practice**  | Pick a skill (or a real job posting), pitch by voice or text to an AI buyer persona with hidden objections, then get a 7-dimension scorecard with strengths, improvements, and a rewritten stronger line. |
| **Jobs**      | Public job board. Students save, apply, optionally share a scorecard, and track status.                                                                                                                   |
| **Employers** | Company profile, job posting with a safe rich-text editor, applicant pipeline (shortlist, interview, hire, reject), interview scheduling, dashboard.                                                      |

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
npm run seed           # demo companies, jobs, and two demo accounts
npm run dev            # web, api, and coach with hot reload
```

Open http://localhost:3000. Verification and password-reset emails land in Mailpit at http://localhost:8025.

The practice partner runs with `COACH_PROVIDER=fake` by default, a deterministic offline persona, so everything works without an API key. To use a real model, set `COACH_PROVIDER=openai` or `anthropic` plus the matching key and model IDs in `apps/coach/.env`.

Run the whole stack in containers instead: `docker compose --profile full up --build`.

## Scripts

| Command                           | What it does                                                       |
| --------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                     | Run web, api, and coach in watch mode                              |
| `npm run dev:infra`               | Start MongoDB and Mailpit containers                               |
| `npm run seed`                    | Load demo data (idempotent)                                        |
| `npm run build`                   | Build every workspace                                              |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                  |
| `npm run typecheck`               | TypeScript project-wide check                                      |
| `npm test`                        | Unit and integration tests for all workspaces                      |
| `npm run e2e`                     | Playwright end-to-end tests (fake practice provider)               |
| `npm run check:dead`              | knip (unused files, exports, deps) and jscpd (duplication)         |
| `npm run eval -w apps/coach`      | Run practice partner evals against a real provider (needs a key)   |
| `npm run admin -- <command>`      | Admin CLI: `approve-company`, `suspend-company`, `list-unverified` |

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
