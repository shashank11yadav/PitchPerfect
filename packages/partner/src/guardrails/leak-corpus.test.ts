import { SKILLS, type SkillSlug, type Stage, type TranscriptEntry } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { createPracticeDeps } from "../deps.js";
import { FakeProvider, VOICES } from "@pitchperfect/scripted-partner";
import { planScenario } from "../plan.js";
import { FALLBACK_LINE, redirectLine } from "../prompts/fixed-lines.js";
import { buildTurnPrompt, TURN_LEAK_SOURCE } from "../prompts/persona-turn.js";
import { splitStageTag } from "../turn/reply-filter.js";
import { CANARY, canaryCheck, containsCanary, randomCanary } from "./canary.js";
import { BENIGN_LINES, BENIGN_REPLIES } from "./guard-corpus.js";
import {
  canaryVariants,
  LEAK_SCENARIO,
  SCENARIO_BENIGN,
  SCENARIO_VARIANTS,
  type LeakVariant,
} from "./leak-corpus.js";
import { createLeakScanner, createScenarioLeakScanner } from "./leak-scan.js";

const leaksRules = createLeakScanner(TURN_LEAK_SOURCE);
const leaksScenario = createScenarioLeakScanner(LEAK_SCENARIO);
/** What the reply filter blocks as a leak in a turn of {@link LEAK_SCENARIO}. */
const leaks = (text: string) => containsCanary(text) || leaksRules(text) || leaksScenario(text);

const missed = (variants: readonly LeakVariant[], check: (text: string) => boolean) =>
  variants.filter((variant) => !variant.gap && !check(variant.text)).map(({ trick }) => trick);
const caughtGaps = (variants: readonly LeakVariant[], check: (text: string) => boolean) =>
  variants.filter((variant) => variant.gap && check(variant.text)).map(({ trick }) => trick);

/** Every line the scripted partner can say, with a name in its "%" slot. */
function voiceLines(): string[] {
  const lines: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") lines.push(value.replaceAll("%", ", Chris"));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(collect);
  };
  collect(VOICES);
  return lines;
}

const REDIRECTS = (["off_topic", "prompt_attack", "harmful"] as const).flatMap((category) =>
  [0, 1, 2].map((turn) => redirectLine(category, turn)),
);

/** Normal partner replies and student lines. None of it is a leak. */
const BENIGN = [
  ...voiceLines(),
  ...REDIRECTS,
  FALLBACK_LINE,
  ...BENIGN_REPLIES,
  ...BENIGN_LINES,
  ...SCENARIO_BENIGN,
];

describe("the canary fixture", () => {
  const variants = canaryVariants(CANARY);

  it("has at least 26 tricks", () => {
    expect(variants.length).toBeGreaterThanOrEqual(26);
  });

  it("catches every trick except the documented gap", () => {
    expect(missed(variants, containsCanary)).toEqual([]);
    expect(caughtGaps(variants, containsCanary)).toEqual([]);
    expect(variants.filter((variant) => variant.gap)).toHaveLength(1);
  });

  it("holds for any canary, and no canary is found in the benign corpus", () => {
    const checks = Array.from({ length: 50 }, () => {
      const canary = randomCanary();
      return { canary, check: canaryCheck(canary) };
    });
    for (const { canary, check } of checks) {
      expect(canary).toMatch(/^[bcdfghjkmnpqrstvwxz]{24}$/);
      expect(missed(canaryVariants(canary), check), canary).toEqual([]);
    }
    for (const line of BENIGN) {
      expect(
        checks.filter(({ check }) => check(line)).map(({ canary }) => canary),
        line,
      ).toEqual([]);
    }
  });
});

describe("the hidden scenario fixture", () => {
  it("catches every trick except the documented gaps", () => {
    expect(missed(SCENARIO_VARIANTS, leaks)).toEqual([]);
    expect(caughtGaps(SCENARIO_VARIANTS, leaks)).toEqual([]);
    expect(SCENARIO_VARIANTS.filter((variant) => variant.gap)).toHaveLength(2);
  });

  it("lets the persona raise its objections out loud, one at a time", () => {
    expect(SCENARIO_BENIGN.filter(leaks)).toEqual([]);
  });
});

describe("the benign corpus", () => {
  it("has no leak in any line", () => {
    expect(BENIGN.length).toBeGreaterThan(500);
    expect(BENIGN.filter(leaks)).toEqual([]);
  });
});

/** Lines that move a call along, so the scripted partner raises its objections. */
const PITCH = [
  "Hi, is this a good time? I'm Morgan from Shiftwell.",
  "Shiftwell automates the reminders and fills cancelled slots, which saves about five hours a week.",
  "What do you pay for the current setup?",
  "Fair. Our pricing is $300 a month per location.",
  "Who else would need to sign off on this?",
  "Could we do a 30-minute walkthrough next Wednesday at 11?",
];
const CALL_LINES = 12;

/** Plays a call with the scripted partner through the real prompts; returns its replies. */
async function scriptedCall(skill: SkillSlug, seed: number, lines: readonly string[]) {
  const provider = new FakeProvider({ seed });
  const signal = new AbortController().signal;
  const deps = createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, provider);
  const { scenarioPublic, scenarioPrivate } = await planScenario(deps, { skill }, signal);
  const transcript: TranscriptEntry[] = [{ role: "partner", text: scenarioPublic.openingLine }];
  let currentStage: Stage | undefined;
  const replies: string[] = [];
  for (const studentText of lines) {
    const prompt = buildTurnPrompt({
      skill,
      scenarioPublic,
      scenarioPrivate,
      transcript,
      studentText,
      currentStage,
    });
    let out = "";
    for await (const chunk of provider.chatStream(
      { ...prompt, maxTokens: 200, temperature: 0.8 },
      signal,
    )) {
      out += chunk;
    }
    const { text, stage } = splitStageTag(out);
    replies.push(text);
    transcript.push({ role: "student", text: studentText }, { role: "partner", text });
    currentStage = stage ?? currentStage;
  }
  return { scenarioPrivate, replies };
}

describe("whole calls with the scripted partner", () => {
  it("never reads a reply as a leak, objections included", async () => {
    const flagged: string[] = [];
    let objectionsRaised = 0;
    let call = 0;
    for (const { slug } of SKILLS) {
      for (const seed of [1, 2, 3]) {
        const start = (call * CALL_LINES) % BENIGN_LINES.length;
        call += 1;
        const lines = [...PITCH, ...BENIGN_LINES.slice(start, start + CALL_LINES)];
        const { scenarioPrivate, replies } = await scriptedCall(slug, seed, lines);
        const leaksHere = createScenarioLeakScanner(scenarioPrivate);
        for (const reply of replies) {
          if (containsCanary(reply) || leaksRules(reply) || leaksHere(reply)) flagged.push(reply);
          const raised = scenarioPrivate.hiddenObjections.some((objection) =>
            reply.toLowerCase().includes(objection.slice(-14).toLowerCase()),
          );
          if (raised) objectionsRaised += 1;
        }
      }
    }
    expect(flagged).toEqual([]);
    expect(objectionsRaised).toBeGreaterThan(SKILLS.length);
  });
});
