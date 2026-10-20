# Security

Security is a first-class requirement. This document is the threat model, the required controls, and how to verify them. Any change that touches auth, data access, uploads, HTML rendering, or the practice partner must keep every control here intact and tested.

## Assets

1. **User accounts:** credentials and sessions.
2. **Student personal data:** name, email, school, major, résumé PDFs, practice transcripts and scores.
3. **Employer data:** company profile, job drafts, applicant pipeline.
4. **LLM provider keys and spend.**
5. **Integrity of public job listings** (scam jobs, phishing links).

## Threats and controls

| Threat                               | Control                                                                                                                                                                                                                                                                                              | Where                                         | Verified by                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| Credential stuffing / brute force    | argon2id hashing; 5 sign-in attempts/min per IP+email with backoff; generic error for unknown email vs wrong password                                                                                                                                                                                | api `auth`                                    | integration tests for lockout + identical responses                 |
| Weak passwords                       | 12–128 chars, breached-password check (HIBP k-anonymity range API, 2 s timeout; offline fallback list), not equal to email                                                                                                                                                                           | api `services/password-policy`                | unit tests                                                          |
| Session theft / fixation             | server-side sessions (connect-mongo), session ID regenerated on sign-in and privilege change, `httpOnly`, `Secure` in prod, `SameSite=Lax`, rolling 7 d / absolute 30 d, destroyed on sign-out, password reset, password change (others)                                                             | api `middleware/session`                      | integration tests                                                   |
| CSRF                                 | `SameSite=Lax` + Origin check + double-submit token (`x-csrf-token`) on all non-GET routes                                                                                                                                                                                                           | api `middleware/csrf`, `origin-check`         | tests: missing token → 403, wrong Origin → 403                      |
| User enumeration                     | signin, forgot-password, and resend return identical responses and similar timing for unknown emails; signup for an existing email returns `201` with the same body and sends that address a "someone tried to sign up" email                                                                        | api `auth`                                    | tests                                                               |
| NoSQL injection                      | zod `.strict()` validation of every input (strings are strings); `mongoose.set('sanitizeFilter', true)`; `strictQuery`                                                                                                                                                                               | api                                           | tests sending `{ "$gt": "" }` payloads                              |
| Mass assignment                      | handlers pass only schema-parsed fields to services; models never receive `req.body`                                                                                                                                                                                                                 | api                                           | tests attempting to set `companyId`, `role`, `status`, `applicants` |
| Broken access control / IDOR         | ownership helpers on every resource route; not-owned → 404                                                                                                                                                                                                                                           | api                                           | per-route not-owner tests                                           |
| Stored XSS                           | job descriptions sanitized on write with `sanitize-html` allowlist (p, br, strong, em, u, ul, ol, li, h3, h4, a[href https/mailto, rel="noopener noreferrer nofollow", target=_blank], blockquote); rendered only via `SafeHtml` (sanitizes again); all other user text rendered as text; strict CSP | api `services/html-sanitizer`, web `SafeHtml` | tests with script, `onerror`, `javascript:` payloads                |
| Phishing / scam jobs                 | domain-match company verification, done only after the employer confirms their email (companies start `unverified`); unverified badge + `noindex` + sitemap/JSON-LD exclusion; admin CLI suspend; `meetingUrl`, `website`, `logoUrl`, `linkedinUrl` must be `https:`                                 | api                                           | tests                                                               |
| Malicious uploads                    | résumé only: PDF magic bytes, ≤ 2 MB, stored in GridFS under a random ID, served with `Content-Type: application/pdf`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`; never rendered inline                                                                                   | api `profile`, `services/files`               | tests with renamed non-PDF, oversize                                |
| Host header poisoning                | all links in emails built from `APP_URL`                                                                                                                                                                                                                                                             | api mailer                                    | test                                                                |
| Token theft from DB                  | verification/reset tokens: 32 random bytes, only sha256 stored, single use, short expiry, TTL index                                                                                                                                                                                                  | api `auth`                                    | tests                                                               |
| LLM spend abuse                      | practice requires a signed-in, verified, consented student; per-student daily/monthly quota; global daily token budget; per-call `max_tokens`; 1 in-flight turn per attempt; turn/char/time limits                                                                                                   | api `practice`, coach                         | tests                                                               |
| Prompt injection / jailbreak / leaks | student text in delimited data blocks; guard pre-check; canary token leak detection; output moderation; persona never reveals instructions; scenarioPrivate never sent to browser                                                                                                                    | coach, api                                    | coach unit tests + adversarial eval cases                           |
| Coach exposure                       | coach not public; HMAC-SHA256 signature with 60 s window; constant-time compare; secret ≥ 32 bytes; signatures cover method, path, body and a ±60 s timestamp; replay within the window is an accepted risk for this internal, stateless service                                                     | coach `auth/hmac`                             | unit tests                                                          |
| PII leakage to logs / provider       | redact emails/phones/card-like numbers before forwarding and storing; logs never contain bodies or transcripts                                                                                                                                                                                       | api, coach                                    | tests on redaction; log review                                      |
| Data retention                       | attempts TTL 180 d; tokens TTL; account deletion cascades (other sessions of a deleted user are rejected on their next request and expire by TTL); delete-attempt unshares from applications                                                                                                         | api                                           | tests                                                               |
| Security headers                     | helmet: CSP with nonces (Next.js) and `default-src 'self'`, `frame-ancestors 'none'`, HSTS (prod), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=(self), camera=(), geolocation=()`                                                                            | web `proxy.ts`/`next.config`, api helmet      | header assertions in e2e                                            |
| DoS                                  | body size 100 kB (JSON), 2 MB (résumé); pagination caps; rate limits on all public routes; request timeouts                                                                                                                                                                                          | api                                           | tests                                                               |
| Secrets in git                       | `.env*` ignored (except `.env.example`), gitleaks in CI and pre-commit, config only via env                                                                                                                                                                                                          | repo                                          | CI                                                                  |
| Vulnerable dependencies              | `npm audit --audit-level=high` in CI, Dependabot weekly, exact versions                                                                                                                                                                                                                              | repo                                          | CI                                                                  |

## Age and consent

- Students confirm they are 18 or older at sign-up (`ageConfirmed: true` is required and stored as `ageConfirmedAt`).
- Before the first practice session, students accept the practice notice. It says three things:
  - The partner is an AI.
  - Transcripts are processed by the configured LLM provider and kept for 180 days.
  - The browser's speech recognition may send audio to the browser vendor (Google, Apple or Microsoft). PitchPerfect never receives or stores audio.
- Acceptance is stored as `practiceConsentAt`.

## Logging

- Use structured JSON logs (`pino`) with fields: `requestId`, `route`, `method`, `status`, `durationMs`, `userId?`, `attemptId?`, `outcome`.
- Never log bodies, headers containing cookies or authorization, transcripts, tokens, or file contents.
- `pino` redaction paths cover `req.headers.cookie`, `req.headers.authorization`, `*.password`, `*.token`, `*.text`.

## Reporting

Found a vulnerability? Please open a private security advisory on the GitHub repository, or email the maintainer listed on the GitHub profile. Do not open a public issue. Expect an acknowledgement within 72 hours.

## Pre-release security checklist

- [ ] `npm audit --audit-level=high` is clean in all workspaces
- [ ] gitleaks reports no findings across the full history
- [ ] Every api route has unauthenticated, wrong-role, and not-owner tests
- [ ] All XSS and NoSQL-injection payload tests pass
- [ ] Coach adversarial evals are 100% handled (manual run with a real provider)
- [ ] Response headers are verified on the deployed preview (CSP, HSTS, nosniff, frame-ancestors)
- [ ] `.env.example` files contain no real values
