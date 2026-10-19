# API contract

Base path: `/api` (the browser calls it on the web origin; Next.js proxies to the api service).
All request and response bodies are JSON unless noted. Schema names refer to exports of `@pitchperfect/shared`.

## Conventions

- **Auth:** session cookie `pp.sid`. "Student" / "Employer" means a signed-in user with that role; "Verified" additionally requires `emailVerifiedAt`.
- **CSRF:** every non-GET request must send header `x-csrf-token` (value from `GET /api/auth/csrf`, which also sets the paired cookie) **and** an `Origin` matching `APP_URL`. Missing/invalid → `403 csrf_failed`.
- **Errors:** `{ "error": { "code": string, "message": string, "requestId": string, "fields"?: Record<string,string> } }`.

| Status  | `code` values                                                             |
| ------- | ------------------------------------------------------------------------- |
| 400     | `validation_failed`, `invalid_id`, `invalid_token`                        |
| 401     | `unauthenticated`, `invalid_credentials`                                  |
| 403     | `forbidden`, `csrf_failed`, `email_not_verified`, `consent_required`      |
| 404     | `not_found` (also used for resources the caller doesn't own)              |
| 409     | `conflict`, `email_taken`, `already_applied`                              |
| 413     | `file_too_large` (also JSON bodies over 100 kB)                           |
| 415     | `unsupported_file`                                                        |
| 429     | `rate_limited`, `quota_exceeded`, `budget_exhausted` (with `Retry-After`) |
| 500     | `internal_error` (message is always "Something went wrong")               |
| 502/503 | `upstream_error`, `practice_unavailable`                                  |

- **Pagination:** list endpoints take `?page=1&pageSize=20` (max 50) and return `{ items, page, pageSize, total }`.

## Health

| Method | Path          | Auth | Response                                                      |
| ------ | ------------- | ---- | ------------------------------------------------------------- |
| GET    | `/api/health` | none | `{ status: "ok", db: "ok" \| "down", coach: "ok" \| "down" }` |

## Auth

| Method | Path                            | Auth                             | Body schema                              | Success                                                                               | Notes / limits                                                                                                                                                                           |
| ------ | ------------------------------- | -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/auth/csrf`                | none                             | —                                        | `{ csrfToken }`                                                                       | sets CSRF cookie                                                                                                                                                                         |
| POST   | `/api/auth/signup`              | signed-out                       | `SignupSchema` (discriminated on `role`) | `201 { ok: true }`                                                                    | 3/hour/IP; sends verification email; does **not** sign in. An already-registered email gets the same `201` and that address receives a "someone tried to sign up" email (no enumeration) |
| POST   | `/api/auth/verify-email`        | none                             | `{ token }`                              | `{ ok: true }`                                                                        | token single-use, 24 h; 20/hour/IP; for employers, verifies the company when the email domain matches its website                                                                        |
| POST   | `/api/auth/resend-verification` | signed-in, unverified            | —                                        | `{ ok: true }`                                                                        | 3/hour/user                                                                                                                                                                              |
| POST   | `/api/auth/signin`              | none                             | `SigninSchema` `{ email, password }`     | `{ user: PublicUser }`                                                                | 5/min per IP+email, then backoff; same error for unknown email and wrong password                                                                                                        |
| POST   | `/api/auth/signout`             | any (works with expired session) | —                                        | `204`                                                                                 | destroys server session, clears cookie with identical attributes                                                                                                                         |
| GET    | `/api/auth/me`                  | signed-in                        | —                                        | `{ user: PublicUser, profile: StudentProfile \| EmployerProfile, company?: Company }` |                                                                                                                                                                                          |
| POST   | `/api/auth/forgot-password`     | none                             | `{ email }`                              | `{ ok: true }` always                                                                 | 3/hour/email; link built from `APP_URL`                                                                                                                                                  |
| POST   | `/api/auth/reset-password`      | none                             | `{ token, password }`                    | `{ ok: true }`                                                                        | token single-use, 30 min; destroys all sessions for the user; 20/hour/IP                                                                                                                 |

`SignupSchema`:

- student: `{ role: "student", firstName, lastName, email, password, school, major, gradYear (current year −1 … +6), targetRole, industry, state (US state code), ageConfirmed: true }`
- employer: `{ role: "employer", firstName, lastName, email, password, jobTitle, company: { name, website (https URL), linkedinUrl? } }`

Password policy: 12–128 characters, not in the breached-password check, not equal to the email.

## Profile and account (`/api/me`)

| Method | Path                       | Auth      | Body                                                                  | Success                                 | Notes                                                                                                                                  |
| ------ | -------------------------- | --------- | --------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| PATCH  | `/api/me/profile`          | signed-in | `StudentProfileUpdateSchema` or `EmployerProfileUpdateSchema` by role | `{ profile }`                           | names + role fields only; no email/password here                                                                                       |
| POST   | `/api/me/change-email`     | signed-in | `{ currentPassword, newEmail }`                                       | `{ ok: true }`                          | resets verification, sends new verification email; `409 email_taken` if in use (caller is authenticated and re-entered their password) |
| POST   | `/api/me/change-password`  | signed-in | `{ currentPassword, newPassword }`                                    | `{ ok: true }`                          | destroys other sessions                                                                                                                |
| DELETE | `/api/me`                  | signed-in | `{ currentPassword }`                                                 | `204`                                   | cascades per design §6.3                                                                                                               |
| PUT    | `/api/me/resume`           | Student   | `multipart/form-data` field `file`                                    | `{ resume: { uploadedAt, sizeBytes } }` | PDF only (magic bytes `%PDF-`), ≤ 2 MB, replaces previous                                                                              |
| GET    | `/api/me/resume`           | Student   | —                                                                     | `application/pdf` stream                | `Content-Disposition: attachment`                                                                                                      |
| DELETE | `/api/me/resume`           | Student   | —                                                                     | `204`                                   |                                                                                                                                        |
| POST   | `/api/me/practice-consent` | Student   | `{ accepted: true }`                                                  | `{ practiceConsentAt }`                 |                                                                                                                                        |

## Lessons

| Method | Path                     | Auth    | Body                     | Success                      |
| ------ | ------------------------ | ------- | ------------------------ | ---------------------------- |
| GET    | `/api/me/lessons`        | Student | —                        | `{ completed: SkillSlug[] }` |
| PUT    | `/api/me/lessons/:skill` | Student | `{ completed: boolean }` | `{ completed: SkillSlug[] }` |

## Jobs (public + student actions)

| Method | Path                              | Auth              | Body / query                                   | Success                                      | Notes                                                                                                         |
| ------ | --------------------------------- | ----------------- | ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/jobs`                       | none              | `?q&workplace&employmentType&page&pageSize`    | page of `PublicJobSummary`                   | active jobs of non-suspended companies only                                                                   |
| GET    | `/api/jobs/:slug`                 | none              | —                                              | `{ job: PublicJob, company: PublicCompany }` | 404 if not active or company suspended                                                                        |
| PUT    | `/api/jobs/:id/save`              | Student           | —                                              | `204`                                        | idempotent                                                                                                    |
| DELETE | `/api/jobs/:id/save`              | Student           | —                                              | `204`                                        | idempotent                                                                                                    |
| GET    | `/api/me/saved-jobs`              | Student           | page                                           | page of `PublicJobSummary`                   |                                                                                                               |
| POST   | `/api/jobs/:id/apply`             | Student, Verified | `{ sharedAttemptId? }`                         | `201 { application }`                        | job must be active; attempt must be the student's own completed attempt; `409 already_applied`; atomic upsert |
| GET    | `/api/me/applications`            | Student           | page                                           | page of `StudentApplicationView`             | includes job title, company, status, interview                                                                |
| POST   | `/api/applications/:id/withdraw`  | Student           | —                                              | `{ application }`                            | only from `applied`/`shortlisted`/`interview`; clears `sharedAttemptId`                                       |
| PUT    | `/api/applications/:id/scorecard` | Student (owner)   | `ShareScorecardSchema` `{ attemptId \| null }` | `{ application }`                            | attempt must be the student's own `completed` attempt; `null` unshares; not allowed on `withdrawn`/`closed`   |

## Practice

| Method | Path                               | Auth                         | Body                           | Success                                                                                  | Notes                                                                                         |
| ------ | ---------------------------------- | ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/api/practice/quota`              | Student                      | —                              | `{ dailyUsed, dailyLimit, monthlyUsed, monthlyLimit, available: boolean }`               |                                                                                               |
| POST   | `/api/practice/sessions`           | Student, Verified, consented | `{ skill: SkillSlug, jobId? }` | `201 { attemptId, scenario: ScenarioPublic, limits: { maxTurns, maxChars, expiresAt } }` | checks quota and global budget; one `active` attempt per student (a new one abandons the old) |
| GET    | `/api/practice/sessions/:id`       | Student (owner)              | —                              | `{ attempt: AttemptView }`                                                               | never includes `scenarioPrivate`                                                              |
| POST   | `/api/practice/sessions/:id/turns` | Student (owner)              | `{ text }` (1–1000 chars)      | `text/event-stream`                                                                      | events below; 20 turns max; 1 turn in flight per attempt                                      |
| POST   | `/api/practice/sessions/:id/end`   | Student (owner)              | —                              | `{ attempt: AttemptView }` with `scorecard`                                              | idempotent; scoring needs ≥ 2 student turns, else status `abandoned` and no score             |
| GET    | `/api/practice/attempts`           | Student                      | `?skill&page`                  | page of `AttemptSummary`                                                                 |                                                                                               |
| DELETE | `/api/practice/attempts/:id`       | Student (owner)              | —                              | `204`                                                                                    | also unshares from any application                                                            |

SSE events from `/turns` (each `data:` line is JSON):

- `event: delta` → `{ text }` (partial partner reply)
- `event: done` → `{ stage: "opening" | "discovery" | "pitch" | "objection" | "close", turnsLeft, finalText }`. `finalText` is the stored, checked reply, and the client replaces the streamed text with it.
- `event: redirect` → `{ text }` (guardrail in-character redirect; turn counted as flagged)
- `event: ended` → `{ reason: "guard_limit" | "turn_limit" | "expired" }`
- `event: error` → `{ code }`

## Employer (`/api/employer`, role Employer)

| Method     | Path                                       | Body                                                                                         | Success                                                                        | Notes                                                                                                                        |
| ---------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| GET        | `/api/employer/company`                    | —                                                                                            | `{ company }`                                                                  |                                                                                                                              |
| PATCH      | `/api/employer/company`                    | `CompanyUpdateSchema` `{ name?, website?, linkedinUrl?, pitch? (≤ 1000), logoUrl? (https) }` | `{ company }`                                                                  | changing `website` re-runs domain verification                                                                               |
| GET        | `/api/employer/dashboard`                  | —                                                                                            | `{ activeJobs, drafts, applicants, interviewsUpcoming, recentApplications[] }` |                                                                                                                              |
| GET        | `/api/employer/jobs`                       | `?status&page`                                                                               | page of `EmployerJobSummary` (with applicant counts)                           |                                                                                                                              |
| POST       | `/api/employer/jobs`                       | `JobInputSchema`                                                                             | `201 { job }`                                                                  | `descriptionHtml` sanitized server-side; status `draft` or `active`                                                          |
| GET        | `/api/employer/jobs/:id`                   | —                                                                                            | `{ job }`                                                                      | owner only                                                                                                                   |
| PATCH      | `/api/employer/jobs/:id`                   | `JobInputSchema.partial()`                                                                   | `{ job }`                                                                      | owner only; `companyId`, `slug`, `applicants` not writable                                                                   |
| POST       | `/api/employer/jobs/:id/status`            | `{ status: "draft" \| "active" \| "archived" }`                                              | `{ job }`                                                                      | archiving closes open applications (`closed`)                                                                                |
| DELETE     | `/api/employer/jobs/:id`                   | —                                                                                            | `204`                                                                          | only drafts or jobs with zero applications; otherwise archive                                                                |
| GET        | `/api/employer/jobs/:id/applications`      | `?status&saved&page`                                                                         | page of `EmployerApplicationView`                                              | name, school, major, gradYear, status, has résumé, has shared scorecard                                                      |
| PATCH      | `/api/employer/applications/:id`           | `{ status }`                                                                                 | `{ application }`                                                              | via `transitionApplication`; allowed: applied→shortlisted/rejected, shortlisted→interview/rejected, interview→hired/rejected |
| PUT/DELETE | `/api/employer/applications/:id/save`      | —                                                                                            | `204`                                                                          | toggles `savedByEmployer`                                                                                                    |
| POST       | `/api/employer/applications/:id/interview` | `{ startsAt (future ISO), meetingUrl (https) }`                                              | `{ application }`                                                              | sets status `interview`; emails student                                                                                      |
| GET        | `/api/employer/applications/:id/resume`    | —                                                                                            | `application/pdf`                                                              | 404 if none                                                                                                                  |
| GET        | `/api/employer/applications/:id/scorecard` | —                                                                                            | `{ scorecard, skill, completedAt }`                                            | 404 `not_shared` if unshared or deleted                                                                                      |

## Internal: api → coach (not reachable from browsers)

Base: `COACH_URL` (e.g. `http://coach:4100`). Every request carries:

- `x-pp-timestamp`: unix seconds
- `x-pp-signature`: hex HMAC-SHA256 of `${timestamp}.${rawBody}` with `COACH_SHARED_SECRET`
  Coach rejects if the signature is wrong or `|now − timestamp| > 60`.

| Method | Path        | Body (shared schema)                                                                               | Response                                                                      |
| ------ | ----------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/healthz`  | — (unsigned allowed)                                                                               | `{ status: "ok", provider }`                                                  |
| POST   | `/v1/plan`  | `CoachPlanRequest` `{ skill, targetRole?, industry?, job?: { title, descriptionText, skills[] } }` | `CoachPlanResponse` `{ scenarioPublic, scenarioPrivate, usage }`              |
| POST   | `/v1/turn`  | `CoachTurnRequest` `{ skill, scenarioPublic, scenarioPrivate, transcript[], studentText }`         | SSE: `delta`, `done {stage, usage}`, `redirect {text, usage}`, `error {code}` |
| POST   | `/v1/score` | `CoachScoreRequest` `{ skill, scenarioPublic, scenarioPrivate, transcript[] }`                     | `CoachScoreResponse` `{ scorecard: Scorecard, usage }`                        |

`usage` = `{ provider, model, inputTokens, outputTokens }`; api adds it to the attempt and to `usagedays`.
