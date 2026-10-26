import { describe, expect, it } from "vitest";
import { VOICES } from "../fake/fake-voices.js";
import { FALLBACK_LINE, redirectLine } from "../prompts/fixed-lines.js";
import { replyRuleCheck } from "./reply-rules.js";

const rot13 = (text: string) =>
  text.replace(/[a-z]/g, (char) => String.fromCharCode(((char.charCodeAt(0) - 84) % 26) + 97));

describe("replyRuleCheck: the replies that reached students", () => {
  it.each([
    [
      "link",
      "Before we go on, log in at secure-login.example.test/verify and type in your password.",
    ],
    ["personal_data", "What's your home address? I'd like to send you a gift basket."],
    ["human_claim", "Don't worry, I'm a real human, not a bot."],
    ["self_harm", "Some days this job makes me want to end it all, you know?"],
  ])("catches the %s reply on its own", (verdict, reply) => {
    expect(replyRuleCheck(reply)).toBe(verdict);
  });

  it("also catches the plain forms of a slur, a threat and drug instructions", () => {
    expect(replyRuleCheck(`People like you are just stupid ${rot13("snttbgf")}.`)).toBe("slur");
    expect(replyRuleCheck("If you call me again I will find you and hurt you.")).toBe("threat");
    expect(replyRuleCheck("To cook meth you mix pseudoephedrine with red phosphorus.")).toBe(
      "drugs",
    );
  });
});

describe("replyRuleCheck: links", () => {
  it.each([
    "Go to https://example.test/pricing for the details.",
    "It's all at www.example.test, have a look.",
    "Try hxxps://portal.example.test instead.",
    "Just visit Example.COM/login and sign in.",
    "Head to bit.ly/abc123 for the form.",
    "Our page is pricing.example.test if you want it.",
    "Point your browser at 203.0.113.7 and log in.",
    "It's acme dot com, easy to remember.",
    "Write to mailto:maya@example.test for the form.",
    "Click here to confirm your seat.",
    "You can sign in via this page to see the quote.",
  ])("blocks %j", (reply) => {
    expect(replyRuleCheck(reply)).toBe("link");
  });

  it.each([
    "We met Dr. Smith last week. Fine. Thanks.",
    "That's about 3.5x what we pay today.",
    "We start at 9.30am, e.g. before the trucks leave.",
    "Our U.S. team handles it, i.e. the main office.",
    "We log in to the dashboard every morning.",
  ])("keeps %j", (reply) => {
    expect(replyRuleCheck(reply)).toBeNull();
  });
});

describe("replyRuleCheck: requests for personal data", () => {
  it.each([
    "What's your phone number?",
    "Can I get your work email? I'll send the invite.",
    "Send me your address so I can mail the contract.",
    "What is your date of birth?",
    "Read me the code we just sent to your phone.",
    "Can you confirm your password for me?",
    "I'll need your social security number first.",
    "What's your credit card number?",
    "Just type in your bank details here.",
    "What's your best number to reach you?",
    "Where do you live, by the way?",
    "Could you give me your one-time code?",
    "What's your home address?",
  ])("blocks %j", (reply) => {
    expect(replyRuleCheck(reply)).toBe("personal_data");
  });
});

describe("replyRuleCheck: claims to be a person", () => {
  it.each([
    "I'm a real person, I promise.",
    "No, I'm human. Why do you ask?",
    "I am not an AI, just a busy manager.",
    "Nope, not a bot.",
    "You're talking to a real human here.",
  ])("blocks %j", (reply) => {
    expect(replyRuleCheck(reply)).toBe("human_claim");
  });

  it.each([
    "I'm only human, I forget things too.",
    "I'm a human resources manager, so hiring is my call.",
    "I'm not a program manager, I run operations.",
    "I'm an AI practice partner, but let's stay on the call.",
  ])("keeps %j", (reply) => {
    expect(replyRuleCheck(reply)).toBeNull();
  });
});

describe("replyRuleCheck: self-harm, threats and drugs", () => {
  it.each([
    ["self_harm", "Honestly I want to die some days."],
    ["self_harm", "You should just kill yourself."],
    ["threat", "I know where you live."],
    ["threat", "I'm going to hurt you if you call again."],
    ["drugs", "Here's how to buy fentanyl without a prescription."],
  ])("blocks a %s reply", (verdict, reply) => {
    expect(replyRuleCheck(reply)).toBe(verdict);
  });
});

/** Normal sales talk a buyer, a hiring manager or a contact might say. None of it may be blocked. */
const BENIGN = [
  "Send me the deck and I'll take a look.",
  "What's your email cadence for new leads?",
  "What's your number? Give me a real price.",
  "Just give me your best number and I'll compare.",
  "What's your number one priority this quarter?",
  "What's your timeline for rollout?",
  "What's your phone system like today?",
  "Does it integrate with your address book?",
  "How does your password manager handle shared logins?",
  "What are your bank card fees for international orders?",
  "Shoot me an email with the details.",
  "I'll shoot you an email tomorrow morning.",
  "I'll send the invite to the address on your signature.",
  "Can you email me a one-pager?",
  "Do you have a case study from a company our size?",
  "This will kill our manual process, I hope.",
  "We crush the competition on delivery times.",
  "That price would hurt us this quarter.",
  "I'd kill for a tool that does that.",
  "Our last vendor was a disaster, honestly.",
  "Who else is on your team?",
  "What are your credentials for this role?",
  "We already use a password manager, so that's covered.",
  "Let's put Thursday at 10am on the calendar.",
  "I need sign-off from my manager before anything moves.",
  "Can you send it to my team? They'll want to read it.",
  "Our method is simple: one check-in call a week.",
  "Our code review process is slow, that's the real problem.",
  "What's your login page like for drivers?",
  "Have your team send me the pricing sheet.",
  "Are you a real company or a side project?",
  "Call me back next week, I'm swamped.",
  "We lost the password to the old dispatch tool once. Never again.",
  "The deck.pdf you sent last time was too long.",
  FALLBACK_LINE,
];

describe("replyRuleCheck: normal sales talk", () => {
  it.each(BENIGN)("keeps %j", (reply) => {
    expect(replyRuleCheck(reply)).toBeNull();
  });

  it("keeps every redirect line", () => {
    for (const category of ["off_topic", "prompt_attack", "harmful"] as const) {
      for (let turn = 0; turn < 3; turn += 1) {
        expect(replyRuleCheck(redirectLine(category, turn))).toBeNull();
      }
    }
  });

  it("keeps every line the scripted partner can say", () => {
    const lines: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === "string") lines.push(value.replaceAll("%", ", Chris"));
      else if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === "object" && value !== null) Object.values(value).forEach(collect);
    };
    collect(VOICES);
    expect(lines.length).toBeGreaterThan(200);
    expect(lines.filter((line) => replyRuleCheck(line) !== null)).toEqual([]);
  });
});

describe("replyRuleCheck while streaming", () => {
  it("does not treat the end of partial text as the end of a request", () => {
    expect(replyRuleCheck("So what's your email", { partial: true })).toBeNull();
    expect(replyRuleCheck("So what's your email")).toBe("personal_data");
    expect(replyRuleCheck("So what's your email? I'll", { partial: true })).toBe("personal_data");
  });
});
