# Conventions

These rules apply to every workspace. If a rule here conflicts with a habit, the rule wins; if it conflicts with a real need, change this document in the same pull request.

## Language and tooling

- TypeScript everywhere, `strict: true`, `noUncheckedIndexedAccess: true`. No `any` (use `unknown` and narrow). No `// @ts-ignore`; `// @ts-expect-error` only with a reason.
- ES modules. Node 22+.
- ESLint (flat config at the repo root) + Prettier (default settings, `printWidth: 100`). CI fails on lint errors and on unformatted files.
- Dependencies: add only what a task needs, pin exact versions (`save-exact=true` in `.npmrc`), prefer well-maintained packages with no known high-severity advisories. Every new dependency must be used; `npm run check:dead` fails on unused ones.

## Structure and naming

- Files: `kebab-case.ts`; React components `PascalCase.tsx`; tests next to the module they cover as `*.test.ts(x)` (api integration tests live in `apps/api/test/`).
- One responsibility per file. If a file passes ~300 lines, split it by responsibility.
- api modules follow the same shape: `routes.ts` (wires paths to handlers with middleware), `handlers.ts` (thin: parse → call service → respond), `service.ts` (business logic, no `req`/`res`), plus model files under `src/db/models/`.
- Names describe the domain: `applyToJob`, `scoreAttempt`, not `handleData` or `doStuff`.

## No duplication (DRY rules that matter here)

- **Schemas live once** in `packages/shared/src/schemas`. api validates requests with them; web uses the same schemas for form validation and response typing. Never re-declare a request/response type by hand.
- **Constants live once**: skills, rubric dimensions, enums, limits → `packages/shared`. So do the helpers more than one app needs: `slugify`, the UTC day/month helpers, `redactTurn`/`redactPii`, the job-description HTML allowlist, the `text/event-stream` reader, and the fictional seed data.
- **The practice partner lives once** in `packages/partner`: prompts, guardrails, the scripted provider, and `planScenario`/`runTurn`/`scoreTranscript`. coach and the static demo call it; neither re-implements a step.
- **UI lives once**: one `Navbar` for the public site and one `AppShell` for both signed-in areas (links passed in by role), one auth form family (`AuthCard`, `SignupFormShell`, `form-parts`), one `JobDetails` used by public, student, and employer views (actions passed as props), one `ProfileForm` driven by a field config. If you're about to copy a component, add a prop instead.
- **Server patterns live once**: ownership checks are helpers (`requireJobOwnedBy(employer)`, `requireApplicationForEmployer(...)`); status changes on applications go through one `transitionApplication(app, to, actor)` function with an allowed-transitions table.
- CI runs jscpd; the duplication threshold is **3%**.

## No dead code

- No commented-out code, no unused exports, files, or dependencies (knip runs in CI).
- No placeholder routes, TODO stubs, or "coming soon" buttons in merged code. If something isn't built, it doesn't appear in the UI.
- Delete code instead of disabling it; git has the history.

## Validation and errors

- Every api route validates `params`, `query`, and `body` with a shared zod schema via the `validate()` middleware; unknown keys are rejected (`.strict()`).
- Services throw typed errors (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`, `RateLimitedError`, `QuotaExceededError`, `UpstreamError`). The central error handler maps them to status codes and a body of `{ error: { code, message, requestId } }`. Never send raw `error.message` from libraries or stack traces to clients.
- Mongo `CastError` → 400, duplicate key → 409, zod error → 400 with field errors.
- Return `404` (not `403`) when a user asks for a resource they don't own, so IDs can't be probed.
- In the web app, every data-fetching view handles loading, empty, error, and unauthorized states. Error boundaries wrap each app layout.

## Security habits (details in security.md)

- Never build HTML from user input except through the shared sanitizer. Never use `dangerouslySetInnerHTML` except in `SafeHtml`, which takes already-sanitized HTML and sanitizes it again, and `JsonLd`, which writes `JSON.stringify` output with `<`, `>`, `&`, U+2028 and U+2029 escaped as `\uXXXX` (React would entity-encode a text child and break the JSON). These are the only two exceptions.
- Never log request bodies, transcripts, passwords, tokens, or résumé contents. Log IDs, routes, status codes, timings.
- Never read secrets outside `config.ts`. web has no `config.ts`; its one secret, `PROXY_SHARED_SECRET`, is read only in `proxy.ts` (proxied browser requests) and `lib/server-api.ts` (the server's own api calls).
- Never put secrets, personal data, or real people's information in fixtures, seeds, screenshots, or docs. Seed data is fictional.

## Testing

- TDD for logic: write the failing test, make it pass, refactor.
- Vitest everywhere. api integration tests use supertest against `createApp()` with `mongodb-memory-server`. partner and coach tests use the `fake` provider; no test ever calls a real LLM.
- Every endpoint gets at least: happy path, validation failure, unauthenticated, wrong role, and (where relevant) not-owner tests.
- Playwright e2e covers the main journeys and runs against the full stack with `COACH_PROVIDER=fake`. A separate suite (`npm run e2e:pages`) checks the static demo build.
- Tests must be deterministic: no real network, fixed clock where time matters (`vi.useFakeTimers`), seeded randomness in the fake provider.

## Git

- Branch from `main`: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`.
- Conventional commit messages: `feat(api): add job applications`, `fix(web): keep focus in modal`. Present tense, imperative, ≤ 72-char subject.
- Small commits that each pass `npm run lint && npm run typecheck && npm test` for the touched workspace.
- Never commit `.env` files or generated builds.

## Copy and content

- Plain, friendly, direct English. Sentence case for headings and buttons ("Start practice", not "Start Practice").
- The practice feature is called the **practice partner**, or "the partner" for short. "Buyer" means only the role the partner plays ("a partner that plays the buyer"), never the partner itself, and `coach` is the service's name, never a word in user copy. Personas have human names but are always labelled for what is answering: "AI practice partner" only when a live model runs it (partner kind `live`), "Scripted demo partner" for `scripted` and `browser`. Copy that can't know the partner kind (marketing pages, metadata, JSON-LD) never calls it AI, and the sample calls on those pages are labelled "Sample buyer".
- No real company names, logos, or people in seed data, lessons, or examples.
- Rendered copy uses curly apostrophes and quotes (’ “ ”), typed as characters, not `&apos;` or other entities; `apps/web/content/copy-typography.test.ts` fails on a straight one in any web string or lesson. Code strings that aren't copy (selectors, CSP sources) are left alone.
- "Résumé", with accents, in copy; identifiers, routes and api fields stay `resume`.
