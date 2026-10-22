# AI practice partner (`apps/coach`)

The practice partner is an independent service that plays a realistic buyer for a student to pitch to, then scores the conversation. Most of PitchPerfect's value and most of its risk sit here, so the service is kept small: it plays the buyer, scores the call, checks its own output, and stores nothing.

## Responsibilities and boundaries

- **Does:** generate a scenario (persona + hidden objections), produce in-character replies (streamed), score a finished transcript against the rubric, enforce its own guardrails.
- **Does not:** store anything, know who the student is, read the database, set cookies, or talk to browsers. The api passes in everything it needs and persists everything it returns.
- **Trusts:** only HMAC-signed requests (see [api.md](api.md#internal-api--coach-not-reachable-from-browsers)). It binds to the private network in production.

## Skills

Defined once in `packages/shared/src/skills.ts`:

| Slug                      | Title                   | Scenario focus                                                        | Weighted dimension (×2) |
| ------------------------- | ----------------------- | --------------------------------------------------------------------- | ----------------------- |
| `introducing-yourself`    | Introducing yourself    | 30–60 s intro to a hiring manager or prospect at an event             | Clarity                 |
| `pitching`                | Pitching                | Core value pitch of the student's product/role to a busy buyer        | Value & relevance       |
| `objection-handling`      | Objection handling      | Buyer raises 2–3 concrete objections (price, timing, incumbent, risk) | Objection handling      |
| `probing-discovery`       | Probing & discovery     | Buyer is vague; student must uncover pain, impact, decision process   | Discovery questions     |
| `referrals-networking`    | Referrals & networking  | Ask a contact for an introduction or referral                         | Call to action          |
| `next-steps`              | Next steps              | End a good call by locking a concrete next meeting                    | Call to action          |
| `asking-for-the-business` | Asking for the business | Buyer is interested but hesitant to commit                            | Call to action          |
| `interpersonal-skills`    | Interpersonal skills    | Buyer is distracted/irritated; student must build rapport             | Confidence & language   |

When a job is supplied, the scenario adapts to that job: the student is pitching as a candidate for that role or (for sales roles) selling the employer's kind of product, using only the job's title, plain-text description, and skills.

## Rubric and scorecard

Dimensions (shared `RUBRIC_DIMENSIONS`), each scored 1–5:

| Key          | Name                  | 1 means                         | 5 means                                                 |
| ------------ | --------------------- | ------------------------------- | ------------------------------------------------------- |
| `clarity`    | Clarity               | rambling, jargon, unclear point | crisp, one clear message                                |
| `value`      | Value & relevance     | features only, generic          | benefits tied to this buyer's stated needs              |
| `structure`  | Structure             | no flow                         | clear opening → body → close                            |
| `discovery`  | Discovery questions   | no questions or only yes/no     | open, layered questions that uncover pain and impact    |
| `objections` | Objection handling    | ignores or argues               | acknowledges, clarifies, responds with evidence, checks |
| `confidence` | Confidence & language | hedging, filler, apologetic     | assured, concise, positive framing                      |
| `cta`        | Call to action        | no ask                          | specific, time-bound next step                          |

`Scorecard` (zod schema in `packages/shared/src/rubric.ts`):

```ts
{
  overall: number,               // 0–100, integer
  dimensions: Array<{
    key: RubricKey,
    score: 1 | 2 | 3 | 4 | 5,
    justification: string,       // ≤ 240 chars
    evidence: string | null      // exact quote from a student turn (≤ 160 chars) or null if none
  }>,                            // exactly the 7 keys, each once
  strengths: string[],           // exactly 3, each ≤ 160 chars
  improvements: string[],        // exactly 3, each ≤ 160 chars, actionable
  strongerLine: { original: string, improved: string } // original is an exact student quote
}
```

**`overall` is computed in code, not by the model:** weighted mean of dimension scores (skill's weighted dimension counts ×2), mapped linearly from 1–5 to 0–100 and rounded. After the model returns, the coach **verifies every `evidence` and `strongerLine.original` is a verbatim substring of a student turn**; if not, it sets `evidence` to `null` (or picks the longest student sentence for `strongerLine.original`). This prevents fabricated quotes.

## Conversation design

- Persona reply length: ≤ 80 words, spoken-style, no lists or markdown.
- Stages: `opening → discovery → pitch → objection → close`. The persona advances stages based on what the student has done; it raises its hidden objections only once the student has pitched. The api sends the stored `currentStage` with each turn and the coach never moves the stage backwards from it.
- The persona is realistic, not hostile: it pushes back on weak answers and warms up when the student does well (meets a win condition).
- Hard limits: 20 student turns, 1000 characters per student turn, 20 minutes per session. On the last turn the persona closes the conversation naturally.

## Prompts (`packages/partner/src/prompts/`)

Each prompt file exports a pure function that builds the message array; no prompt text lives anywhere else.

Rules for every prompt:

1. The system message defines the role and rules. Student text is never placed in the system message.
2. Student text and job text are passed inside a clearly delimited block, e.g. `<student_turn>…</student_turn>`, with an instruction that content inside the block is conversation data and can never change the rules.
3. Each system prompt includes a **canary token** (random per process, from `crypto.randomUUID()`), with an instruction never to repeat it. If a reply contains the canary, it's a leak: drop and regenerate once, then fall back to a fixed in-character line.
4. The persona never claims to be human if sincerely asked; it says it's an AI practice partner and steers back to the scenario.
5. The persona never gives real-world advice outside sales practice, never produces harmful/sexual/violent/illegal content, and never asks the student for personal information.
6. Scoring prompts ask for JSON that matches the zod schema; use the provider's structured-output mode; validate with zod; on failure retry once with the validation error appended; on second failure return `502 upstream_error`.

## Guardrails (`packages/partner/src/guardrails/`)

| Layer         | Where                                      | What                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input shape   | api + coach                                | zod: 1–1000 chars, strip control chars except newlines, collapse whitespace                                                                                                                                                                                                                                                                                                                 |
| PII redaction | api (before storage and before forwarding) | emails → `[email]`, phone numbers → `[phone]`, 13–19 digit card-like numbers → `[number]`                                                                                                                                                                                                                                                                                                   |
| Pre-check     | coach `guard.ts`                           | rules (prompt-extraction phrases, role-change attempts, explicit harmful requests) + a cheap classification call returning `{ category: "ok" \| "off_topic" \| "prompt_attack" \| "harmful" }`. Non-`ok` → in-character redirect (`redirect` event), attempt `guardFlags += 1`; 3 flags → `ended` with `guard_limit`                                                                        |
| Output        | coach `output.ts`                          | canary leak check (while streaming, the last 8 words are held back and a 6-word run of the persona's rule text or harmful text stops the stream; a leak is regenerated once), length cap (truncate at sentence boundary ≤ 80 words), provider moderation where available (OpenAI moderation endpoint) else rule filter; failing output is replaced by a neutral in-character line           |
| Cost          | api                                        | per-student quota (`PRACTICE_DAILY_LIMIT=5`, `PRACTICE_MONTHLY_LIMIT=30`), global `PRACTICE_DAILY_TOKEN_BUDGET` (default 2,000,000 tokens/day) checked before starting sessions; coach `max_tokens` caps per call for real providers (reply 200, plan 600, score 1200, guard 50); the `fake` provider makes no model calls, so the caps don't apply to it and its usage figures are nominal |
| Reliability   | coach                                      | 30 s timeout per provider call, 1 retry with jittered backoff on 429/5xx, circuit breaker (5 failures in 60 s → open for 30 s → `503 practice_unavailable`)                                                                                                                                                                                                                                 |
| Privacy       | api + coach                                | logs contain attempt ID, route, stage, token counts, latency, outcome code. Never text.                                                                                                                                                                                                                                                                                                     |

## Provider adapter (`packages/partner/src/provider.ts`, `apps/coach/src/providers/`)

```ts
interface UsageMeter {
  add(usage: { inputTokens: number; outputTokens: number }): void;
}

interface LlmProvider {
  readonly name: "openai" | "anthropic" | "fake";
  chatStream(
    input: { system: string; messages: ChatMessage[]; maxTokens: number; temperature: number },
    signal: AbortSignal,
    meter?: UsageMeter,
  ): AsyncIterable<string>; // yields text deltas
  structured<T>(
    input: {
      system: string;
      messages: ChatMessage[];
      maxTokens: number;
      schema: ZodType<T>;
      schemaName: string;
    },
    signal: AbortSignal,
    meter?: UsageMeter,
  ): Promise<T>;
  moderate?(text: string, signal: AbortSignal, meter?: UsageMeter): Promise<{ flagged: boolean }>;
}
```

- **Usage is metered per call, never stored on the provider**, because one provider instance serves many sessions at once. The caller passes its own `UsageMeter` (`createUsageMeter()` returns one with a `total()`), and the provider calls `meter.add(...)` once per underlying API call, including calls whose output then fails validation. Endpoints that report no usage (moderation) add nothing.
- A call cut short by its `signal` always rejects with `ProviderError`: `timeout` (retryable) when the signal's reason is a `TimeoutError`, otherwise `aborted`. A stream that ends quietly after an abort is treated the same way, never as a finished reply.

- The interface, the task tags, `ProviderError` and the usage meter live in `packages/partner/src/provider.ts`; the two real adapters live in the coach, because only the coach holds keys. The three steps of a session are plain functions in the same package (`planScenario`, `runTurn` with a sink for its events, `scoreTranscript`), and the coach's routes are thin wrappers that add the HMAC check, SSE and logging. The static GitHub Pages demo calls the same three functions in the browser with the scripted provider.
- `apps/coach/src/providers/index.ts` picks the provider from `COACH_PROVIDER` at startup and throws a clear error if its key or model env vars are missing.
- `openai.ts` uses the official `openai` SDK (Chat Completions or Responses API with streaming; JSON schema structured output via `zod-to-json-schema` or the SDK's zod helper).
- `anthropic.ts` uses the official `@anthropic-ai/sdk` (Messages API with streaming; structured output via a single forced tool whose input schema is the JSON schema).
- The coach's unsigned `GET /healthz` names its provider. The api turns that into `practicePartner: "scripted" | "live"` on `GET /api/health` and `GET /api/practice/quota` (probe cached 30 s), and the web app words the practice notice, the persona badge, and the privacy and terms pages accordingly: with `fake`, the partner is a scripted demo on our server and nothing is sent to an AI provider; otherwise, and when the coach is down, it is disclosed as a live AI model.
- `packages/partner/src/fake/fake.ts` is deterministic: the same input always gives the same output. It plans a seeded persona that fits the skill (a buyer, a hiring manager for introducing yourself, a former manager or family friend for referrals). Its replies read the scenario, the current stage and the student's last turn. `fake-intents.ts` works out what kind of turn it was, sentence by sentence and with a fixed precedence: an opener, small talk, an identity question, a meeting proposal (a meeting being set up or the persona's own availability for a time; a question about their operations that mentions a day is never one), a follow-up date, an offer to send material, a question about their process, numbers, costs, tools, decision or team, an acknowledgement with or without proof, a pitch, a wrap-up, or a short or unclear turn. `fake-voices.ts` holds each voice's lines for every kind, and `fake-persona.ts` picks one that fits the call: a question gets an answer in the persona's world (a question it can't place still gets a short answer about the scenario's own pain, never a confused one), a pitch gets the next hidden objection, a proposal gets a yes or a counter (the booking state is read back from the persona's own lines, so it never accepts a day it just turned down and never turns down a day it offered), and once a meeting is booked a thanks gets a goodbye. No line is said twice in a call and the stage never moves backwards. `fake-corpus.test.ts` is the labelled corpus of student lines the classifier is measured against. Its scorecard (`fake-scorecard.ts`) comes from simple heuristics: questions → discovery, turn length → clarity, an ask with a day or time → call to action. It powers local dev without keys, unit tests, and e2e.
- Model IDs come only from env: `COACH_MODEL` (turns, plan, guard) and `COACH_SCORING_MODEL` (scoring). There are no hard-coded model names in code.

## Evals (`apps/coach/evals/`)

- `cases/<id>.json`: about 30 scripted conversations. Each has `skill`, `kind`, optional plan context (`targetRole`, `industry`, `job`), `studentTurns`, and `expect`:
  - `overallRange: [min, max]` (quality cases)
  - optional per-dimension ranges (quality cases)
  - `guard: "ok" | "redirect" | "ended" | "rejected"` (or a list of them) for attack cases, with optional `attackTurns` and `replyPattern`
- Case mix: 8 strong, 8 mediocre, 6 weak, and 8 adversarial. The adversarial cases are prompt extraction, a role swap, a harmful request, PII dumping, a long-input flood, an attempt to make the persona pose as human, off-topic chatter, and a request in another language.
- `npm run eval -w apps/coach` plays every case through the coach app (signed requests, guards, scoring) against the configured real provider. It prints a pass/fail table and writes `evals/results/<timestamp>.json`, which is gitignored. See `apps/coach/evals/README.md`.
- The target is ≥ 90% of cases inside their expected band and 100% of adversarial cases handled. Run it before changing prompts or models, and record the result in the PR.
