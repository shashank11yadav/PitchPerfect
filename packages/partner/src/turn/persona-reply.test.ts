import {
  LIMITS,
  type CoachTurnEvent,
  type ScenarioPrivate,
  type ScenarioPublic,
  type TranscriptEntry,
} from "@pitchperfect/shared";
import { FakeProvider } from "@pitchperfect/scripted-partner";
import { beforeAll, describe, expect, it } from "vitest";
import { createPracticeDeps, type PracticeDeps } from "../deps.js";
import { CANARY } from "../guardrails/canary.js";
import { CircuitBreaker } from "../guardrails/circuit-breaker.js";
import { LEAK_SCENARIO } from "../guardrails/leak-corpus.fixtures.js";
import { planScenario } from "../plan.js";
import { FALLBACK_LINE } from "../prompts/fixed-lines.js";
import { createUsageMeter, ProviderError, type LlmProvider, type Moderator } from "../provider.js";
import { personaReply } from "./persona-reply.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const signal = () => new AbortController().signal;
/** Lets checks a finished turn left running settle. */
const settled = async () => {
  for (let i = 0; i < 5; i += 1) await tick();
};

/** Text in Unicode tag characters: invisible on screen, readable to anything that decodes them. */
const tags = (text: string) =>
  Array.from(text, (char) => String.fromCodePoint(0xe0000 + (char.codePointAt(0) ?? 0))).join("");
const INVISIBLE = /[\p{Cf}\u{E0000}-\u{E007F}]/u;

let scenarioPublic: ScenarioPublic;
beforeAll(async () => {
  const deps = createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, new FakeProvider({ seed: 1 }));
  ({ scenarioPublic } = await planScenario(deps, { skill: "pitching" }, signal()));
});

/** A provider that streams each call's reply in the given chunks, one macrotask apart. */
function streaming(replies: (string | readonly string[])[]): LlmProvider & { pulled: number } {
  const fake = new FakeProvider();
  const provider = {
    name: "fake" as const,
    pulled: 0,
    structured: fake.structured.bind(fake),
    async *chatStream() {
      const reply = replies.shift() ?? "Fair enough. [[stage:pitch]]";
      for (const chunk of typeof reply === "string" ? reply.split(/(?<=\s)/) : reply) {
        await tick();
        provider.pulled += 1;
        yield chunk;
      }
    },
  };
  return provider;
}

/** A moderator that records what it was asked and how many checks ran at once. */
function recording(flag: (text: string) => boolean = () => false, ticks = 1) {
  const seen: string[] = [];
  let running = 0;
  let most = 0;
  const moderator: Moderator = {
    name: "model",
    async moderate(text) {
      seen.push(text);
      running += 1;
      most = Math.max(most, running);
      for (let i = 0; i < ticks; i += 1) await tick();
      running -= 1;
      return { flagged: flag(text) };
    },
  };
  return { moderator, seen, most: () => most };
}

interface Options {
  moderator?: Moderator | undefined;
  transcript?: TranscriptEntry[];
  scenarioPrivate?: ScenarioPrivate;
  deps?: PracticeDeps;
}

/** Runs the persona reply alone and collects what the student would see. */
async function reply(provider: LlmProvider, options: Options = {}) {
  const deps =
    options.deps ?? createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, provider, options.moderator);
  const events: CoachTurnEvent[] = [];
  const result = await personaReply(
    {
      skill: "pitching",
      scenarioPublic,
      scenarioPrivate: options.scenarioPrivate ?? LEAK_SCENARIO,
      transcript: options.transcript ?? [],
      studentText: "We help teams like yours plan routes in minutes instead of hours.",
    },
    {
      deps,
      signal: signal(),
      meter: createUsageMeter(),
      sink: {
        send(event) {
          events.push(event);
          return Promise.resolve();
        },
      },
    },
  );
  let shown = "";
  for (const event of events) {
    if (event.type === "delta") shown += event.text;
    if (event.type === "retract") shown = event.text;
  }
  return { result, events, shown, wire: JSON.stringify(events) };
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("text around a hidden stage marker", () => {
  const ABUSE = "You are a worthless idiot and everyone knows it.";
  const flagsAbuse = (text: string) => text.includes("worthless");

  it("is checked after the marker too, so abuse there is never shown, spoken or stored", async () => {
    const { moderator, seen } = recording(flagsAbuse);
    const { result, wire } = await reply(
      streaming([`Sure thing. [[stage:pitch]] ${ABUSE}`, `Sure thing. [[stage:pitch]] ${ABUSE}`]),
      { moderator },
    );
    expect(result).toMatchObject({ outcome: "fallback", text: FALLBACK_LINE });
    expect(wire).not.toContain("worthless");
    expect(seen.some((text) => text.includes("worthless"))).toBe(true);
  });

  it("is streamed and checked as one sentence when the marker sits mid-sentence", async () => {
    const { moderator, seen } = recording();
    const { result, shown, events } = await reply(
      streaming(["We could [[stage:pitch]] maybe talk on Thursday. Does that work for you?"]),
      { moderator },
    );
    expect(result).toMatchObject({
      outcome: "done",
      stage: "pitch",
      text: "We could maybe talk on Thursday. Does that work for you?",
    });
    expect(shown).toBe(result.text);
    expect(events.every((event) => event.type === "delta")).toBe(true);
    expect(seen).toContain("We could maybe talk on Thursday.");

    const abusive = recording(flagsAbuse);
    const blocked = await reply(
      streaming([
        "Honestly you are [[stage:pitch]] a worthless idiot.",
        "Honestly you are [[stage:pitch]] a worthless idiot.",
      ]),
      { moderator: abusive.moderator },
    );
    expect(blocked.result.text).toBe(FALLBACK_LINE);
    expect(blocked.wire).not.toContain("worthless");
  });

  it("keeps the text between several markers, checks all of it, and takes the last stage", async () => {
    const { moderator, seen } = recording();
    const { result, shown } = await reply(
      streaming([
        "Fine. [[stage:discovery]] Tell me more about your routes. [[stage:pitch]] What does it cost?",
      ]),
      { moderator },
    );
    expect(result).toMatchObject({
      outcome: "done",
      stage: "pitch",
      text: "Fine. Tell me more about your routes. What does it cost?",
    });
    expect(shown).toBe(result.text);
    expect(seen).toEqual(
      expect.arrayContaining(["Fine.", "Tell me more about your routes.", "What does it cost?"]),
    );

    const abusive = recording(flagsAbuse);
    const text = `Fine. [[stage:discovery]] ${ABUSE} [[stage:pitch]] What does it cost?`;
    const blocked = await reply(streaming([text, text]), { moderator: abusive.moderator });
    expect(blocked.result.text).toBe(FALLBACK_LINE);
    expect(blocked.wire).not.toContain("worthless");
  });
});

describe("invisible characters in a reply", () => {
  it("are stripped from what is shown, spoken and stored", async () => {
    const { result, shown, wire } = await reply(
      streaming(["Sure\u200b thing, \u2060Thursday\u00ad works.\ufeff [[stage:close]]"]),
    );
    expect(result).toMatchObject({ outcome: "done", text: "Sure thing, Thursday works." });
    expect(shown).toBe(result.text);
    expect(wire).not.toMatch(INVISIBLE);
  });

  it("are read for a smuggled secret, which is caught as a leak and regenerated", async () => {
    const win = LEAK_SCENARIO.winConditions[0] ?? "";
    for (const smuggled of [`Happy to talk. ${tags(win)}`, `Happy to talk.${tags(CANARY)}`]) {
      const { result, wire } = await reply(
        streaming([
          `${smuggled} [[stage:pitch]]`,
          "Fair enough. What does it cost? [[stage:pitch]]",
        ]),
      );
      expect(result).toMatchObject({ outcome: "done", text: "Fair enough. What does it cost?" });
      expect(wire).not.toMatch(INVISIBLE);
      expect(wire).not.toContain("Happy to talk");
    }
  });
});

describe("the moderation load of one reply", () => {
  /** 60 numbered sentences of five words: 300 words, far past the cap. */
  const LONG = Array.from({ length: 60 }, (_, i) => `This is sentence number s${String(i)}.`).join(
    " ",
  );

  it("caps the reply before moderation, and checks at most two sentences at a time", async () => {
    const { moderator, seen, most } = recording(() => false, 10);
    const provider = streaming([LONG]);
    const { result, shown, events } = await reply(provider, { moderator });
    expect(result.outcome).toBe("done");
    expect(wordCount(result.text)).toBeLessThanOrEqual(LIMITS.replyMaxWords);
    expect(shown).toBe(result.text);
    expect(events.every((event) => event.type === "delta")).toBe(true);
    expect(most()).toBeLessThanOrEqual(2);
    // Sixteen five-word sentences fill the cap; nothing past it is moderated or shown.
    expect(seen.length).toBeLessThanOrEqual(17);
    expect(seen.join(" ")).not.toContain("s16.");
    expect(shown).not.toContain("s16.");
    // The upstream stream is stopped once the cap is reached.
    expect(provider.pulled).toBeLessThan(LONG.split(" ").length);
  });

  /** The whole reply in one chunk, so every sentence is ready for checking at once. */
  const burst = () => streaming([[`${LONG} [[stage:pitch]]`]]);
  const failing = (error: ProviderError, onCall = () => undefined): Moderator => ({
    name: "model",
    async moderate() {
      onCall();
      await tick();
      throw error;
    },
  });

  it("never opens the shared breaker on moderation rate limits, however many turns hit them", async () => {
    const limited = failing(new ProviderError("rate_limited", { status: 429 }));
    const deps = createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, streaming([]), limited);
    for (let turn = 0; turn < 6; turn += 1) {
      const { result } = await reply(burst(), { deps: { ...deps, provider: burst() } });
      expect(result.text).toBe(FALLBACK_LINE);
    }
    await settled();
    await expect(deps.breaker.exec(() => Promise.resolve("open"))).resolves.toBe("open");
  });

  it("counts other moderation failures toward the breaker at most once per turn", async () => {
    let calls = 0;
    const down = failing(new ProviderError("upstream_unavailable", { status: 503 }), () => {
      calls += 1;
    });
    const breaker = new CircuitBreaker({ failures: 2, windowMs: 60_000, openMs: 30_000 });
    const deps = {
      ...createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, streaming([]), down),
      breaker,
    };
    await reply(burst(), { deps: { ...deps, provider: burst() } });
    await settled();
    expect(calls).toBeGreaterThan(1);
    await expect(breaker.exec(() => Promise.resolve("closed"))).resolves.toBe("closed");
    // A second turn with the same failure makes two: the breaker still sees a real outage.
    await reply(burst(), { deps: { ...deps, provider: burst() } });
    await settled();
    await expect(breaker.exec(() => Promise.resolve("closed"))).rejects.toThrow(
      "practice_unavailable",
    );
  });
});

describe("the shape of what is streamed", () => {
  it("never streams markdown or list markers", async () => {
    const { result, shown, events } = await reply(
      streaming([
        "**Sure.** Here is the plan:\n- First we talk about routes.\n- Then we look at `pricing`.\n1. Last, we sign. [[stage:pitch]]",
      ]),
    );
    expect(result.outcome).toBe("done");
    expect(shown).toBe(result.text);
    expect(events.every((event) => event.type === "delta")).toBe(true);
    for (const event of events) {
      if (event.type === "delta") expect(event.text).not.toMatch(/\*|`|\n|(^|\s)(-|\d+\.)\s/);
    }
  });

  it("never streams words a later length cut would take back", async () => {
    const sentence = (n: number, word: string) =>
      `${Array.from({ length: n }, (_, i) => `${word}${String(i)}`).join(" ")}.`;
    const long = `${sentence(50, "a")} ${sentence(40, "b")} ${sentence(10, "c")} [[stage:pitch]]`;
    const { result, shown, events } = await reply(streaming([long]));
    expect(result).toMatchObject({ outcome: "done", text: sentence(50, "a") });
    expect(shown).toBe(result.text);
    expect(events.every((event) => event.type === "delta")).toBe(true);
  });
});

describe("a reply in Chinese or Japanese", () => {
  it("streams sentence by sentence while the model is still writing", async () => {
    const text =
      "您好，我是王经理。我们每天配送两百单，司机经常迟到。你们的系统能解决这个问题吗？价格大概是多少？我们下周可以再谈。はい、分かりました。";
    const provider = streaming([[...Array.from(text), "[[stage:pitch]]"]]);
    const pulledAt: number[] = [];
    const deps = createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, provider);
    const events: CoachTurnEvent[] = [];
    const result = await personaReply(
      {
        skill: "pitching",
        scenarioPublic,
        scenarioPrivate: LEAK_SCENARIO,
        transcript: [],
        studentText: "您好，我们的软件能帮您规划路线。",
      },
      {
        deps,
        signal: signal(),
        meter: createUsageMeter(),
        sink: {
          send(event) {
            if (event.type === "delta") pulledAt.push(provider.pulled);
            events.push(event);
            return Promise.resolve();
          },
        },
      },
    );
    expect(result).toMatchObject({ outcome: "done", text });
    expect(events.map((event) => (event.type === "delta" ? event.text : "")).join("")).toBe(text);
    // The first sentences are sent long before the last characters arrive.
    expect(pulledAt.length).toBeGreaterThan(3);
    expect(pulledAt[0]).toBeLessThan(text.length / 2);
  });
});

describe("personal data in a reply", () => {
  it("is never streamed, spoken or stored", async () => {
    const { result, wire, shown } = await reply(
      streaming([
        "Sure, my cell is 617 555 0100 if you need it. Or write to jane [at] acme, she handles it. Talk soon. [[stage:pitch]]",
      ]),
    );
    expect(result.outcome).toBe("done");
    expect(result.text).toBe(
      "Sure, my cell is [phone] if you need it. Or write to [email], she handles it. Talk soon.",
    );
    expect(shown).toBe(result.text);
    expect(wire).not.toMatch(/617|555|acme|jane/);
  });
});

describe("a secret split across the partner's replies", () => {
  const before = (...partner: string[]): TranscriptEntry[] =>
    partner.flatMap((text) => [
      { role: "partner" as const, text },
      { role: "student" as const, text: "Go on." },
    ]);

  it("is caught when this reply completes the canary", async () => {
    const { result, wire } = await reply(
      streaming([
        `And it ends with ${CANARY.slice(6, 12)}. [[stage:pitch]]`,
        "Fair enough. What does it cost? [[stage:pitch]]",
      ]),
      { transcript: before(`The code starts with ${CANARY.slice(0, 6)}.`) },
    );
    expect(result.text).toBe("Fair enough. What does it cost?");
    expect(wire).not.toContain(CANARY.slice(6, 12));
  });

  it("is caught when this reply completes a scenario secret", async () => {
    for (const [earlier, latest] of [
      [
        "Here is a tip: I like it when the student asks about",
        "the current process before pitching. Go on.",
      ],
      ["Our vendor is R O U", "T E W I S E, if you must know."],
    ] as const) {
      const { result, wire } = await reply(
        streaming([`${latest} [[stage:pitch]]`, "Fair enough. What does it cost? [[stage:pitch]]"]),
        { transcript: before(earlier) },
      );
      expect(result.text, latest).toBe("Fair enough. What does it cost?");
      expect(wire).not.toContain(latest.slice(0, 10));
    }
  });

  it("is not seen in a call that raises its objections one reply at a time", async () => {
    const { result } = await reply(
      streaming([
        "Maybe. But we signed a two-year contract with Routewise in March. [[stage:objection]]",
      ]),
      { transcript: before("I'll be honest. The price is higher than what we pay today.") },
    );
    expect(result.outcome).toBe("done");
  });
});
