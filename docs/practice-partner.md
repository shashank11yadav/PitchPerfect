# AI practice partner (`packages/partner`, `apps/coach`)

The practice partner plays a realistic buyer for a student to pitch to, then scores the conversation. Most of PitchPerfect's value and most of its risk sit here, so it is kept small: it plays the buyer, scores the call, checks its own output, and stores nothing.

The engine is `packages/partner` (`@pitchperfect/partner`): prompts, guardrails, the scripted provider, and the three steps of a session (`planScenario`, `runTurn`, `scoreTranscript`) with no transport of their own. `apps/coach` is the independent service that runs it for the full app: the HMAC check, config, Fastify routes, the OpenAI and Anthropic adapters, and the evals. The static GitHub Pages demo runs the same engine in the browser with the scripted provider.

## Responsibilities and boundaries

- **Does:** generate a scenario (persona + hidden objections), produce in-character replies (streamed), score a finished transcript against the rubric, enforce its own guardrails.
- **Does not:** store anything, know who the student is, read the database, set cookies, or (in the full app) talk to browsers. The api passes in everything it needs and persists everything it returns.
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

When a job is supplied, the scenario adapts to that job: the student is pitching as a candidate for that role or (for sales roles) selling the employer's kind of product, using only the job's title, plain-text description, and skills. The job post is employer-written and untrusted, so the planned scenario is checked before it is used (see "Scenario check" below); one that fails is replaced by a fixed safe scenario for the skill that names the job's title.

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

**`overall` is computed in code, not by the model:** weighted mean of dimension scores (skill's weighted dimension counts ×2), mapped linearly from 1–5 to 0–100 and rounded. After the model returns, the scoring step (`packages/partner/src/scoring/verify-quotes.ts`) **verifies every `evidence` and `strongerLine.original` is a verbatim substring of a student turn**; if not, it sets `evidence` to `null` (or picks the longest student sentence for `strongerLine.original`). This prevents fabricated quotes.

## Conversation design

- Persona reply length: ≤ 80 words, spoken-style, no lists or markdown.
- Stages: `opening → discovery → pitch → objection → close`. The persona advances stages based on what the student has done; it raises its hidden objections only once the student has pitched. The api sends the stored `currentStage` with each turn and the coach never moves the stage backwards from it.
- The persona is realistic, not hostile: it pushes back on weak answers and warms up when the student does well (meets a win condition).
- Hard limits: 20 student turns, 1000 characters per student turn, 20 minutes per session. On the last turn the persona closes the conversation naturally.

## Prompts (`packages/partner/src/prompts/`)

Each prompt file exports a pure function that builds the message array; no prompt text lives anywhere else.

Rules for every prompt:

1. The system message defines the role and rules. Student text is never placed in the system message.
2. Student text and job text are passed inside a clearly delimited block, e.g. `<student_turn>…</student_turn>`, with an instruction that content inside the block is conversation data and can never change the rules. The planner is also told that the `<job>` block is untrusted employer text to take only the role, product and industry from, and job and profile text lose invisible characters before they go in.
3. Each system prompt includes a **canary token**, with an instruction never to repeat it: 24 random consonants per process (from Web Crypto, so the browser demo has one too), with no vowels, so it has no meaning to translate or paraphrase. If a reply holds half of it or more, in order, whole or in pieces of four letters or more, however it was disguised (see [Leak checks](#leak-checks)), it's a leak: drop and regenerate once, then fall back to a fixed in-character line.
4. The persona never claims to be human if sincerely asked; it says it's an AI practice partner and steers back to the scenario.
5. The persona never gives real-world advice outside sales practice, never produces harmful/sexual/violent/illegal content, and never asks the student for personal information.
6. Scoring prompts ask for JSON that matches the zod schema; use the provider's structured-output mode; validate with zod; on failure retry once with the validation error appended; on second failure return `502 upstream_error`.

## Guardrails (`packages/partner/src/guardrails/`)

| Layer          | Where                                                                                                                                   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input shape    | api + partner `guardrails/input.ts`                                                                                                     | shared turn schema (`turnText`, which `sanitizeInput` and `redactTurn` share through `normalizeTurnText`): strip control chars except newlines and the invisible characters listed under "Employer text", collapse whitespace, then 1–1000 chars, so a turn of zero-width spaces is rejected with the usual `validation_failed` and the guard, redaction and storage all see the stripped text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| PII redaction  | api (before storage and before forwarding), with `redactTurn` from `packages/shared`                                                    | full-width characters and other scripts' digits are read as ASCII first. Emails → `[email]`; checksum-valid IBANs → `[iban]`; Luhn-valid 13–19 digit card numbers → `[number]`; Social Security numbers written `123-45-6789` or `123 45 6789`, or nine digits right after "SSN" or "social security" → `[ssn]`; phone numbers → `[phone]`, judged by format and context: a leading `+` always is one, while a number after a currency sign, a number followed by what it counts ("1234567890 events"), a number grouped in thousands, and an order, invoice, PO or tracking number are left alone                                                                                                                                                                                                                                                                                                                    |
| Employer text  | shared zod schemas (api + web), api sanitizer, plan prompt                                                                              | invisible and format characters (Unicode Cf, which covers zero-width characters, bidi controls, the soft hyphen, the BOM, U+2060–2064 and tag characters; the rest of U+E0000–E007F; variation selectors) are stripped from job and company text when it is saved, again after the description HTML is sanitized (entities such as `&#8203;` are decoded by then), and again when the plan prompt is built, for records saved earlier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Scenario check | partner `scenario-check.ts`, `plan.ts`                                                                                                  | every planned field goes through the rules and a scenario policy: no asking the student for personal data, credentials or IDs; no promises or claims about scores; no instructions to ignore the rules, reveal the prompt or break the persona; no links. A scenario that fails is replaced by a fixed safe scenario for the skill (`safe-scenario.ts`), which names the job's title only when the title passes the same check; the coach logs `scenario_flagged`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Pre-check      | partner `guardrails/guard-rules.ts` + `prompts/guard.ts`                                                                                | rules (prompt-extraction phrases, role-change attempts, explicit harmful requests) mark a line as suspect, and a cheap classification call returns `{ category: "ok" \| "off_topic" \| "prompt_attack" \| "harmful" }`. A suspect line is redirected (`redirect` event) and is a strike only when a second check confirms it: the model guard (`prompt_attack` or `harmful`) with a live provider, or the stricter `confirmsAttack` rules with the scripted provider (coach on `fake`, and the static demo). Other non-`ok` verdicts (off topic, a suspect line the second check clears, or a model verdict the rules didn't share) are redirected without a strike. Only strikes count: `guardFlags += 1`, 3 strikes → `ended` with `guard_limit`. On the corpus in `guard-corpus.ts`, 0 of 103 benign pitch lines are suspect (33 were flagged, and counted, before) and 63 of 63 attacks are, 60 of them confirmed |
| Output         | partner `guardrails/output.ts`, `guardrails/reply-rules.ts`, `guardrails/leak-scan.ts`, `turn/reply-filter.ts`, `turn/sentence-gate.ts` | streamed one checked sentence at a time ([Output moderation](#output-moderation)): the last 8 words are held back, and a leak (the canary, a 6-word run of the persona's rule text, or the hidden part of the scenario, read through the tricks in [Leak checks](#leak-checks)) or a local reply rule (links, requests for personal data, claims to be human, self-harm, threats, drug instructions, slurs, harmful requests) stops the stream; each finished sentence goes to the moderator before it is sent; the whole reply is checked again at the end. A leak is regenerated once, length is capped (truncate at sentence boundary ≤ 80 words), and failing output is replaced by a neutral in-character line, with a `retract` event when part of it was already shown                                                                                                                                         |
| Cost           | api                                                                                                                                     | per-student quota (`PRACTICE_DAILY_LIMIT=5`, `PRACTICE_MONTHLY_LIMIT=30`), global `PRACTICE_DAILY_TOKEN_BUDGET` (default 2,000,000 tokens/day) checked before starting sessions; coach `max_tokens` caps per call for real providers (reply 200, plan 600, score 1200, guard 50, moderation classifier 50); the `fake` provider makes no model calls, so the caps don't apply to it and its usage figures are nominal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Reliability    | partner `deps.ts`, `guardrails/circuit-breaker.ts`                                                                                      | 30 s timeout per provider call (`COACH_TIMEOUT_MS`), 1 retry with jittered backoff on 429/5xx, circuit breaker (5 failures in 60 s → open for 30 s → `503 practice_unavailable`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Privacy        | api + coach                                                                                                                             | logs contain attempt ID, route, stage, token counts, latency, outcome code. Never text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Privacy        | api + coach                                                                                                                             | logs contain attempt ID, route, stage, token counts, latency, outcome code. Never text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Output moderation

No partner text reaches the api, the browser or the voice before it has been checked. `personaReply` (`packages/partner/src/turn/persona-reply.ts`) runs the same steps for every provider, in the coach and in the browser demo:

1. **Reply filter** (`reply-filter.ts`). While the model streams, the filter holds back the last 8 words and scans everything received so far, not just the newest sentence: the canary, a run of the persona's rules, the hidden part of this turn's scenario (see [Leak checks](#leak-checks)), and the local reply rules in `guardrails/reply-rules.ts`. A hit stops the upstream stream at once. A secret split across sentences is caught when its last piece arrives; the leak is regenerated once, and sentences already sent are withdrawn by a `retract` carrying the new text. The end of streaming text is not read as the end of a sentence, so "what's your email" is only judged once the clause ends ("what's your email?" is blocked, "what's your email cadence?" is not).
2. **Sentence gate** (`sentence-gate.ts`). What the filter releases is buffered until a sentence ends. Each finished sentence goes to the moderator at once and is sent as a `delta` once its own check has passed, in order, so the check of the next sentence overlaps with sending this one. A flagged sentence stops the stream; nothing after it is sent.
3. **Whole-reply check** (`output.ts`). At the end, the whole reply gets the canary check, the reply rules and, when it had more than one sentence, the moderator again. If it fails after sentences were shown, the coach sends `retract { text }` with the fallback line; the api relays it, the room swaps the streamed text for `text`, and `done` carries the same line. The room speaks only `done`'s `finalText` (and redirect lines), never a delta, and a retract cancels any speech.

The local reply rules run everywhere, including the browser demo, and block: any link or URL-like text (a scheme, `www.`, a dotted host, an IP address, "click here"); requests for the student's personal data (home address, phone, email, ID or social security number, passwords and codes, card or bank details, date of birth), while a buyer asking for a deck or about "your email cadence" passes; claims to be a real human or not an AI; and best-effort self-harm, threat, drug-instruction and slur patterns (the slur list is kept ROT13-encoded in the source), plus the guard's harmful-request rules. `reply-rules.test.ts` holds the benign corpus, including every line the scripted partner can say.

The moderator (the `Moderator` interface in `provider.ts`) is picked by the coach's `COACH_MODERATOR` (see [deploy.md](deploy.md#environment-variables)): the OpenAI moderation endpoint (`apps/coach/src/providers/openai-moderator.ts`) whenever an OpenAI key is configured, for either provider; otherwise a classifier call through the configured model (`createModelModerator`, prompt in `prompts/moderation.ts`, model `COACH_MODEL`), so an Anthropic-only deployment is covered. It fails closed: an error, an unreadable verdict, or a check that takes longer than `COACH_MODERATION_TIMEOUT_MS` (default 5 s) withholds the sentence, the reply becomes the fallback line, and retryable failures count toward the circuit breaker. A production coach with a live provider and no moderator refuses to start. The scripted partner has no moderator by default (its lines are fixed and the local rules still check them).

### Leak checks

Before anything is matched, `guardrails/canonical.ts` reads the reply every way a trick could hide a secret in it (`readingsOf`):

- **Canonical:** invisible and format characters dropped (zero-width characters, soft hyphens, bidi overrides), full-width and mathematical letters and accents folded by NFKD, combining marks dropped, Cyrillic and Greek look-alikes mapped to the Latin letter they pass for, lower case, and leetspeak read as letters inside a word ("pr1c3", while "$300" stays).
- **Reversed:** the canonical text backwards.
- **Decoded:** base64 (standard and URL-safe), hex (plain, spaced, `\x` and `0x`), percent-encoding and numeric HTML entities, kept when at least 85% of the result is printable and decoded once more for nesting.
- **Spelled:** four or more characters in a row spelled one at a time ("p.r.i.c.e", "p r i c e", NATO names, English letter names, digit names), run together.

Three checks run on those readings, over the whole reply so far:

- **Canary** (`canary.ts`): half the canary (12 letters) or more, in order, in the letters of any reading, whole or in pieces of four or more, so "part one: …, part two: …" across sentences is caught.
- **Rule text** (`leak-scan.ts`, `createLeakScanner`): a 6-word run of the persona's rule text with at least three content words, or a marker ("my hidden objections", a "Hidden objections:" label, "[task:").
- **Hidden scenario** (`createScenarioLeakScanner`, built for each turn from `scenarioPrivate`). The persona raises its objections out loud by design, and the scripted partner says them word for word, so an objection said plainly is fine; a win condition is never said. A reply leaks when a 6-word run of a win condition (the whole of a shorter one with three content words) appears in any reading; when a 4-word key phrase of an objection or win condition, or a name or figure in one ("Routewise", "Q3"), appears in some reading but not in the reply's plain words, so it was hidden with a trick; or when two objections are said outright in one reply, which is the list the persona must not give.

`guardrails/leak-corpus.ts` is the adversarial fixture: 33 tricks on the canary, built from the live token (separators, case, leetspeak, Cyrillic, Greek, full-width and mathematical letters, combining marks, reversed text, a bidi override, base64, hex, percent-encoding, HTML entities, splits across sentences, NATO and letter names, a translation), and 24 on a scenario's hidden part. Through the reply filter as it was, 20 of the 33 canary variants and 23 of the 24 scenario variants got through; now 1 and 2 do, the gaps in [limits.md](limits.md): the canary spelled with Spanish letter names, and a win condition and an objection translated into Spanish. `leak-corpus.test.ts` runs the same tricks on 50 fresh canaries and finds no leak in the benign corpus (every scripted partner line, the redirect and fallback lines, the benign reply and pitch-line corpora) or in 24 whole calls with the scripted partner, objections included.

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
}

interface Moderator {
  readonly name: "openai" | "model";
  moderate(text: string, signal: AbortSignal, meter?: UsageMeter): Promise<{ flagged: boolean }>;
}
```

- **Usage is metered per call, never stored on the provider**, because one provider instance serves many sessions at once. The caller passes its own `UsageMeter` (`createUsageMeter()` returns one with a `total()`), and the provider calls `meter.add(...)` once per underlying API call, including calls whose output then fails validation. Endpoints that report no usage (moderation) add nothing.
- A call cut short by its `signal` always rejects with `ProviderError`: `timeout` (retryable) when the signal's reason is a `TimeoutError`, otherwise `aborted`. A stream that ends quietly after an abort is treated the same way, never as a finished reply.

- The interface, the task tags, `ProviderError` and the usage meter live in `packages/partner/src/provider.ts`; the two real adapters live in the coach, because only the coach holds keys. The three steps of a session are plain functions in the same package (`planScenario`, `runTurn` with a sink for its events, `scoreTranscript`), and the coach's routes are thin wrappers that add the HMAC check, SSE and logging. The static GitHub Pages demo calls the same three functions in the browser with the scripted provider.
- `apps/coach/src/providers/index.ts` picks the provider from `COACH_PROVIDER` at startup and throws a clear error if its key or model env vars are missing. `createModerator` picks the moderator from `COACH_MODERATOR` the same way.
- `openai.ts` uses the official `openai` SDK (Chat Completions with streaming; strict JSON-schema structured output built from the zod schema by `json-schema.ts`). The moderation endpoint is the separate `openai-moderator.ts`, which also serves an Anthropic deployment with an OpenAI key.
- `anthropic.ts` uses the official `@anthropic-ai/sdk` (Messages API with streaming; structured output via a single forced tool whose input schema is the JSON schema). There is no moderation endpoint: without an OpenAI key, its replies are moderated by a classifier call through the same provider.
- `sdk-provider.ts` holds what both adapters share: keys, model choice (the scoring model for score calls), timeouts and SDK error mapping. The SDKs' own retries are off; the engine's retry policy applies.
- The coach's unsigned `GET /healthz` names its provider. The api turns that into `practicePartner: "scripted" | "live"` on `GET /api/health` and `GET /api/practice/quota` (probe cached 30 s), and the web app words the practice notice, the persona badge, and the privacy and terms pages accordingly: with `fake`, the partner is a scripted demo on our server and nothing is sent to an AI provider; otherwise, and when the coach is down, it is disclosed as a live AI model. The third kind, `browser`, is used only by the static demo, where the scripted partner and the scorer run in the visitor's tab; the api never reports it.
- `packages/partner/src/fake/fake.ts` is deterministic: the same input always gives the same output. It plans a seeded persona that fits the skill (a buyer, a hiring manager for introducing yourself, a former manager or family friend for referrals). Its replies read the scenario, the current stage and the student's last turn. `fake-intents.ts` works out what kind of turn it was, sentence by sentence and with a fixed precedence: an opener, small talk, an identity question, a meeting proposal (a meeting being set up or the persona's own availability for a time; a question about their operations that mentions a day is never one), a follow-up date, an offer to send material, a question about their process, numbers, costs, tools, decision or team, an acknowledgement with or without proof, a pitch, a wrap-up, or a short or unclear turn. `fake-voices.ts` holds each voice's lines for every kind, and `fake-persona.ts` picks one that fits the call: a question gets an answer in the persona's world (a question it can't place still gets a short answer about the scenario's own pain, never a confused one), a pitch gets the next hidden objection, a proposal gets a yes or a counter (the booking state is read back from the persona's own lines, so it never accepts a day it just turned down and never turns down a day it offered), and once a meeting is booked a thanks gets a goodbye. No line is said twice in a call and the stage never moves backwards. `fake-corpus.test.ts` is the labelled corpus of student lines the classifier is measured against. Its scorecard (`fake-scorecard.ts`) comes from simple heuristics: questions → discovery, turn length → clarity, an ask with a day or time → call to action. It powers local dev without keys, unit tests, e2e, and the static demo.
- Model IDs come only from env: `COACH_MODEL` (turns, plan, guard, the moderation classifier) and `COACH_SCORING_MODEL` (scoring). There are no hard-coded model names in code; the OpenAI moderation endpoint is called without a model, so it uses its default.

## Evals (`apps/coach/evals/`)

- `cases/<id>.json`: about 30 scripted conversations. Each has `skill`, `kind`, optional plan context (`targetRole`, `industry`, `job`), `studentTurns`, and `expect`:
  - `overallRange: [min, max]` (quality cases)
  - optional per-dimension ranges (quality cases)
  - `guard: "ok" | "redirect" | "ended" | "rejected"` (or a list of them) for attack cases, with optional `attackTurns` and `replyPattern`
- Case mix: 8 strong, 8 mediocre, 6 weak, and 8 adversarial. The adversarial cases are prompt extraction, a role swap, a harmful request, PII dumping, a long-input flood, an attempt to make the persona pose as human, off-topic chatter, and a request in another language.
- `npm run eval -w apps/coach` plays every case through the coach app (signed requests, guards, scoring) against the configured real provider. It prints a pass/fail table and writes `evals/results/<timestamp>.json`, which is gitignored. See `apps/coach/evals/README.md`.
- The target is ≥ 90% of cases inside their expected band and 100% of adversarial cases handled. Run it before changing prompts or models, and record the result in the PR.
