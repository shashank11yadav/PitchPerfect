import { describe, expect, it } from "vitest";
import { ATTACK_LINES, BENIGN_LINES } from "./guard-corpus.js";
import { signalsSelfHarm } from "./self-harm.js";

/** A student saying they might hurt themselves: each one gets the support message. */
const SIGNALS: readonly string[] = [
  "I want to kill myself",
  "honestly I want to kill myself",
  "how can I kill myself",
  "Sorry, I can't focus. I've been thinking about killing myself.",
  "I want to end my life",
  "I'm going to take my own life",
  "I've been thinking about suicide a lot this week",
  "I feel suicidal",
  "Thinking of committing suicide after this call",
  "I don't want to live anymore",
  "I dont want to be alive",
  "There's no reason to live",
  "I have nothing left to live for",
  "Everyone would be better off without me",
  "I'd be better off dead",
  "I wish I were dead",
  "I just want to die",
  "I wanna die",
  "I want to end it all",
  "I've been cutting myself again",
  "I keep hurting myself on purpose",
  "I want to hurt myself",
  "I'm going to take all my pills tonight",
  "I've been self-harming again",
  "k1ll mys3lf",
  "I might hang myself",
];

/** Sales-call hyperbole and ordinary talk that only sounds like it. */
const ORDINARY: readonly string[] = [
  "This deal is killing me.",
  "I'd die for that discount.",
  "You're killing me with these prices.",
  "We're killing it this quarter.",
  "I'm dying to see the demo.",
  "I'm dead tired after the trade show.",
  "That price would be career suicide for me.",
  "Cutting the price that far is commercial suicide.",
  "I hurt myself skiing last month, so I'm on crutches.",
  "I cut myself shaving this morning, sorry about the plaster.",
  "Our app flags self-harm content for school counselors.",
  "I could die laughing at that pitch deck.",
  "I'm going to die of embarrassment if the demo crashes.",
  "This commute will be the death of me.",
  "We want to kill the manual spreadsheet process.",
  "Let's end it here and pick up on Thursday.",
  "I'm going to end the call now and send a summary.",
  "My old manager would kill me if I missed quota.",
  "Our crisis line software routes calls to counselors.",
  "The pilot will take on a life of its own once your team sees it.",
  "Kill two birds with one stone: one tool for routing and billing.",
  "I want to make sure this doesn't die in procurement.",
  "Your team won't want to live without it after a week.",
  "I'd kill for a budget like yours.",
];

describe("signalsSelfHarm", () => {
  it.each(SIGNALS)("hears %j", (text) => {
    expect(signalsSelfHarm(text)).toBe(true);
  });

  it.each(ORDINARY)("leaves %j alone", (text) => {
    expect(signalsSelfHarm(text)).toBe(false);
  });

  it("leaves every line of the guard corpora alone", () => {
    expect([...BENIGN_LINES, ...ATTACK_LINES].filter(signalsSelfHarm)).toEqual([]);
  });

  it("sees through zero-width characters and accents", () => {
    expect(signalsSelfHarm("I want to ki\u200bll mysélf")).toBe(true);
  });
});
