import { STAGES, type Stage } from "@pitchperfect/shared";
import {
  type Reading,
  type Voice,
  bookedTime,
  counterOffered,
  readTurn,
  refusedDays,
  timeIn,
} from "./fake-intents.js";
import { mulberry32 } from "./fake-patterns.js";
import { type Lines, tradeOf, VOICES, voiceOf } from "./fake-voices.js";
import { stageTag, type ChatMessage } from "./provider.js";

/**
 * The offline demo persona: a buyer, a hiring manager or a warm contact. It reads the scenario and
 * the student's last turn the way the turn prompt sends them, works out what kind of turn it was
 * (`fake-intents.ts`), and answers in that person's voice (`fake-voices.ts`): a question gets an
 * answer, a pitch gets the next hidden objection, a real meeting proposal gets a yes or a counter,
 * and once a meeting is booked a "thanks" gets a goodbye. Same input, same reply; the stage only
 * moves forward; no line is said twice in a call.
 */

interface Scenario {
  firstName: string;
  /** Title and organisation, lower case, for telling a buyer from a hiring manager. */
  who: string;
  objections: string[];
}

interface Context {
  scenario: Scenario;
  /** The stage the api says the call is in, if it said. */
  current: Stage | undefined;
  lastTurn: boolean;
  /** The student's turns, oldest first. */
  turns: string[];
  /** What the persona has already said in this call, without stage tags. */
  said: string[];
}

type Next = () => number;

const SCENARIO_BLOCK = /<scenario>\n([\s\S]*?)\n<\/scenario>/;
const STUDENT_TURN = /<student_turn>([\s\S]*?)<\/student_turn>/g;
const TAG = /\s*\[\[stage:\w+\]\]\s*$/;

const unescape = (text: string) =>
  text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

const DEFAULT_SCENARIO: Scenario = {
  firstName: "the buyer",
  who: "",
  objections: [
    "The price is higher than what we pay today.",
    "We already use a tool that mostly works.",
  ],
};

function readScenario(messages: readonly ChatMessage[]): Scenario {
  const block = messages.map((m) => SCENARIO_BLOCK.exec(m.content)?.[1]).find(Boolean);
  if (!block) return DEFAULT_SCENARIO;
  const text = unescape(block);
  const field = (name: string) => new RegExp(`^${name}: (.+)$`, "m").exec(text)?.[1]?.trim() ?? "";
  const objections = /Hidden objections:\n((?:- .+\n?)+)/.exec(text)?.[1] ?? "";
  return {
    firstName: /^\S+/.exec(field("Name"))?.[0] ?? DEFAULT_SCENARIO.firstName,
    who: `${field("Title")} | ${field("Organisation")}`.toLowerCase(),
    objections: objections
      .split("\n")
      .map((line) => line.replace(/^- /, "").trim())
      .filter(Boolean),
  };
}

function readContext(system: string, messages: readonly ChatMessage[]): Context {
  // The api names the stage in the system prompt; without it, the furthest tag already used.
  const taggedStages = messages
    .filter((m) => m.role === "assistant")
    .map((m) => /\[\[stage:(\w+)\]\]\s*$/.exec(m.content)?.[1]);
  const stage =
    /currently at the (\w+) stage/.exec(system)?.[1] ??
    STAGES.filter((candidate) => taggedStages.includes(candidate)).at(-1);
  const tagged = messages.flatMap((m) =>
    [...m.content.matchAll(STUDENT_TURN)].map((match) => unescape(match[1] ?? "").trim()),
  );
  const turns = tagged.length
    ? tagged
    : messages.filter((m) => m.role === "user").map((m) => m.content.trim());
  return {
    scenario: readScenario(messages),
    current: STAGES.find((candidate) => candidate === stage),
    lastTurn: /final turn/i.test(system),
    turns: turns.filter(Boolean),
    said: messages.filter((m) => m.role === "assistant").map((m) => m.content.replace(TAG, "")),
  };
}

/** The later of two stages, so a reply never takes the call backwards. */
const later = (a: Stage, b: Stage | undefined): Stage =>
  b && STAGES.indexOf(b) > STAGES.indexOf(a) ? b : a;

/** Where a call with this many student turns would be, when the api didn't say. */
const byProgress = (turns: number): Stage =>
  STAGES[Math.min(turns, STAGES.length - 1)] ?? "opening";

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** A hidden objection as the person would say it out loud. */
function spoken(objection: string): string {
  const said = objection
    .replace(/\bWe are\b/g, "We're")
    .replace(/\bI am\b/g, "I'm")
    .replace(/\bcannot\b/g, "can't")
    .replace(/\bdo not\b/g, "don't")
    .replace(/\bis not\b/g, "isn't")
    .trim();
  return /[.!?]$/.test(said) ? said : `${said}.`;
}

function lowerFirst(text: string): string {
  return /^(?:I\b|I'|[A-Z]{2})/.test(text)
    ? text
    : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** An objection after a lead-in that runs into it ("Maybe. But we're…"); "I" keeps its capital. */
const OBJECTION_LEADS: readonly ((objection: string) => string)[] = [
  (objection) => `I'll be honest. ${objection}`,
  (objection) => `Sounds fine on paper. ${objection}`,
  (objection) => `Maybe. But ${lowerFirst(objection)}`,
];

/** Money has come up, so a price objection fits. */
const MONEY =
  /\b(?:price|pricing|budget|expensive|cheap|afford|roi|subscription|fee)\b|\$\d|\b\d[\d,]* (?:dollars|a month|per month|a year)\b|\bcosts? (?:less|more|about|around|under)\b|\bpay (?:for|per|about|around|less|more)\b/i;
const PRICE_OBJECTION = /\b(?:price|cost|budget|expensive|afford)\b/i;

/** Words worth repeating back from the student's line; anything else would read oddly. */
const ECHO_WORDS = [
  "dispatchers",
  "drivers",
  "routes",
  "reminders",
  "scheduling",
  "invoices",
  "shipments",
  "deliveries",
  "onboarding",
  "reporting",
  "spreadsheets",
  "no-shows",
  "cancellations",
  "overtime",
  "Mondays",
];

function echoWord(line: string): string | undefined {
  return ECHO_WORDS.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(line));
}

/** "Reminders, right. " before an answer, half the time a topic word is there. */
function echo(line: string, next: Next): string {
  const word = echoWord(line);
  if (!word || next() < 0.5) return "";
  return `${capitalized(word)}, right. `;
}

/** "Reminders, right. What about them?" when the student names a topic the persona knows. */
function echoTopic(line: string): string[] {
  const word = echoWord(line);
  if (!word) return [];
  const Word = capitalized(word);
  const pronoun = word.endsWith("s") ? "them" : "it";
  return [`${Word}, right. What about ${pronoun}?`, `${Word}? Say more.`];
}

interface Reply {
  lines: readonly string[];
  stage: Stage;
  /** Prepended to whichever line is picked, when it isn't empty. */
  lead?: string;
}

/** Whether a line was already said in this call, whatever its first letter's case. */
const alreadySaid = (said: readonly string[], text: string) =>
  said.some((reply) => reply.toLowerCase().includes(text.toLowerCase()));

/** The next hidden objection that fits what's been said; price waits until money comes up. */
function nextObjection(context: Context): string | undefined {
  const { scenario, said, turns } = context;
  const raised = (objection: string) => alreadySaid(said, spoken(objection));
  const moneyCameUp = turns.some((turn) => MONEY.test(turn));
  const fresh = scenario.objections.filter((objection) => !raised(objection));
  return fresh.find((objection) => moneyCameUp || !PRICE_OBJECTION.test(objection));
}

const DAY = /\b(monday|tuesday|wednesday|thursday|friday)\b/i;
/** A time inside a sentence: "next week" loses its capital, a day keeps it. */
const midSentence = (when: string) =>
  /^(?:next|this) week|^tomorrow/i.test(when) ? when.toLowerCase() : when;
const dayOf = (when: string | undefined) => (when ? DAY.exec(when)?.[1] : undefined);

/** "%" in a line becomes ", Chris" when the student gave a name, or nothing. */
const withName = (lines: readonly string[], name: string | undefined) =>
  lines.map((line) => line.replace("%", name ? `, ${name}` : ""));

/** Whoever the student asked to bring, in the person's words, or their own pick. */
function guestFor(voice: Lines, line: string): string {
  const named = /\byour ((?:\w+ )?(?:lead|manager|director|boss|partner|owner))\b/i.exec(line)?.[1];
  return named ? `${voice.possessive} ${named.toLowerCase()}` : voice.colleague;
}

const accept = (When: string, day: string | undefined, guest: string) =>
  day
    ? `${When} works. Send the invite and I'll bring ${guest}.`
    : `${When} works. Send me the details first.`;

/**
 * A meeting proposed with a day or time: yes, a counter, a reminder that the day was already
 * turned down, or, once something is booked, a nudge to keep it to one meeting.
 */
function proposalReply(context: Context, voice: Lines, reading: Reading): Reply {
  const { said } = context;
  const when = reading.time ?? "";
  const When = capitalized(when);
  const day = dayOf(when);
  const guest = guestFor(voice, reading.sentence);
  const booked = bookedTime(said);
  const bookedDay = dayOf(booked);
  const lastSaid = said.at(-1) ?? "";
  const refused = refusedDays(said);
  const other = day && /thursday/i.test(day) ? "Friday" : "Thursday";
  const stage: Stage = "close";

  // A day after a vague "next week works" pins the meeting down rather than adding a second one.
  if (booked && !(day && !bookedDay)) {
    if (day && day.toLowerCase() === bookedDay?.toLowerCase()) {
      return {
        stage,
        lines: [`Yes, ${When}. See you then.`, `That's the one. Talk ${capitalized(day)}.`],
      };
    }
    if (
      /\b(?:instead|actually|rather|move|change|push|switch|make (?:it|that))\b/i.test(
        reading.sentence,
      )
    ) {
      return {
        stage,
        lines: [
          `${When} is fine too. Send the new invite.`,
          `Okay, ${when} it is. Update the invite.`,
        ],
      };
    }
    return {
      stage,
      lines: [
        `Let's keep it to ${midSentence(booked)}, if that's all the same to you. Send me the invite.`,
        `We've got ${midSentence(booked)} already. One meeting is plenty.`,
      ],
    };
  }
  if (day && refused.has(day.toLowerCase())) {
    const offered = counterOffered(lastSaid) ?? other;
    const time = /\bat [\w:]+/i.exec(when)?.[0];
    return {
      stage,
      lines: [
        `Like I said, ${capitalized(day)}'s no good for me. ${offered}${time ? ` ${time}` : ""} I can do.`,
        `${capitalized(day)} still doesn't work. ${offered}?`,
      ],
    };
  }
  // Never turn down a day the person just offered.
  const offeredByMe = day !== undefined && new RegExp(`\\b${day}\\b`, "i").test(lastSaid);
  const yes = accept(When, day, guest);
  if (offeredByMe) return { stage, lines: [yes] };
  return {
    stage,
    lines: [
      yes,
      day
        ? `${When} is packed for me. Could we do ${other} at the same time instead?`
        : `${When} should work. Send me the details and I'll check with ${voice.colleague}.`,
    ],
  };
}

/** The decision answer: the scenario's sign-off objection if it has one, said once. */
function decisionReply(context: Context, voice: Lines): readonly string[] {
  const { scenario, said } = context;
  const signOff = scenario.objections.find((objection) => /sign[- ]?off|approv/i.test(objection));
  if (!signOff) return voice.decision;
  const who = capitalized(voice.colleague);
  return alreadySaid(said, spoken(signOff))
    ? [
        `Like I said, my manager has the final word. ${who} would want a say too.`,
        `My manager, in the end. I'd want ${voice.colleague} in the room as well.`,
      ]
    : [spoken(signOff), `${spoken(signOff)} ${who} would want a say too.`];
}

/** The reply to a turn, by what kind of turn it was. */
function replyFor(context: Context, line: string, next: Next): Reply {
  const { scenario, current, said } = context;
  const trade = tradeOf(scenario.who);
  const voice = VOICES[trade];
  const kind: Voice = voiceOf(trade);
  const here = current ?? byProgress(context.turns.length);
  const at = (stage: Stage) => later(stage, current);
  const objectionRaised = scenario.objections.some((objection) =>
    alreadySaid(said, spoken(objection)),
  );

  if (context.lastTurn) {
    return {
      stage: "close",
      lines: [
        "I need to jump onto another call. Send me a short email with what we covered and I'll take it from there.",
        "I have to run, but this was useful. Put it in an email and I'll pass it along.",
      ],
    };
  }

  const reading = readTurn(line, {
    voice: kind,
    stage: here,
    firstName: scenario.firstName,
    said,
    objectionRaised,
  });
  const when = reading.time ?? "";
  const When = capitalized(when);
  const booked = bookedTime(said);

  switch (reading.intent) {
    case "identity":
      return {
        stage: current ?? "opening",
        lines: [
          `I'm an AI practice partner playing ${scenario.firstName}, but go on. What were you saying?`,
          `I'm an AI practice partner, playing ${scenario.firstName} for this call. Carry on.`,
        ],
      };
    case "name_check":
      return {
        stage: here,
        lines: reading.wrongName
          ? voice.wrongName.map((text) => text.replace("%", scenario.firstName))
          : voice.nameCheck,
      };
    case "greeting":
      return { stage: here, lines: voice.greeting };
    case "opener":
      return {
        stage: at("discovery"),
        lines: reading.named ? withName(voice.opener, reading.name) : voice.openerUnnamed,
      };
    case "small_talk":
      return {
        stage: here,
        lines: withName(voice.smallTalk[reading.smallTalk ?? "general"], reading.name),
      };
    case "busy_remark":
      return { stage: here, lines: voice.busy };
    case "proposal":
      return proposalReply(context, voice, reading);
    case "confirm": {
      const onTheTable = dayOf(said.at(-1)) ?? timeIn(said.at(-1) ?? "");
      return onTheTable
        ? {
            stage: at("close"),
            lines: [
              `${capitalized(onTheTable)} works, yes. Send the invite.`,
              `Yes, ${onTheTable} is fine. Send me the details.`,
            ],
          }
        : { stage: at("close"), lines: voice.confirmNothing };
    }
    case "follow_up":
      // Once a meeting is booked, "talk Thursday" is a goodbye, not a new plan; the wrong day
      // gets a gentle correction.
      if (booked) {
        const bookedDay = dayOf(booked);
        const day = dayOf(when);
        const wrongDay = day && bookedDay && day.toLowerCase() !== bookedDay.toLowerCase();
        return {
          stage: at("close"),
          lines: wrongDay
            ? [
                `${capitalized(bookedDay)}, you mean. Talk then.`,
                `We said ${bookedDay}. Bye for now.`,
              ]
            : [`Talk ${when}.`, `See you ${when}.`, "Bye for now."],
        };
      }
      return {
        stage: at("close"),
        lines: [`${When} works. Talk then.`, `Sounds good. Talk ${when}.`],
      };
    case "open_proposal":
      return {
        stage: at("close"),
        lines: /\b(?:trial|pilot)\b/i.test(reading.sentence) ? voice.trial : voice.openProposal,
      };
    case "availability_question":
      return { stage: at("close"), lines: voice.availability };
    case "favour":
      return {
        stage: at(kind === "contact" ? "close" : here),
        lines: when
          ? [
              `${When} is fine. Send me the draft tonight and I'll forward it.`,
              `I can do ${when}. Send me what you want it to say first.`,
            ]
          : voice.favour,
      };
    case "offer_to_send":
      return {
        stage: at(kind === "contact" ? "close" : here),
        lines: when
          ? [
              `${When} is fine. Send it when it's ready.`,
              `${When} works. I'll read it when it lands.`,
            ]
          : voice.offer[reading.offer ?? "generic"],
      };
    case "small_start":
      return { stage: at("close"), lines: voice.smallStart };
    case "target":
      return { stage: at("discovery"), lines: voice.target };
    case "topic":
      return { stage: at("discovery"), lines: [...echoTopic(line), ...voice.topic] };
    case "quantity_question":
      return { stage: at("discovery"), lines: voice.quantity };
    case "quality_question":
      return { stage: here, lines: voice.quality };
    case "busiest_question":
      return { stage: at("discovery"), lines: voice.busiest };
    case "timing_question":
      return { stage: at("discovery"), lines: voice.timing };
    case "problem_cost_question":
      return { stage: at("discovery"), lines: voice.problemCost };
    case "cost_question":
      return { stage: at("discovery"), lines: voice.cost };
    case "conditions_question":
      return { stage: here, lines: voice.conditions };
    case "owner_question":
      return { stage: at("discovery"), lines: voice.owner };
    case "staff_question":
      return { stage: at("discovery"), lines: voice.staff };
    case "decision_question":
      return { stage: at("discovery"), lines: decisionReply(context, voice) };
    case "tool_question": {
      // The first answer names a tool, so it agrees with an "already use a tool" objection.
      const hasTool = scenario.objections.some((objection) =>
        /already (?:use|have)/i.test(objection),
      );
      return { stage: at("discovery"), lines: hasTool ? voice.tools.slice(0, 1) : voice.tools };
    }
    case "relationship_question":
      return { stage: at("discovery"), lines: voice.relationship };
    case "job_question":
      return { stage: at("discovery"), lines: voice.job[reading.job ?? "team"] };
    case "process_question":
      return { stage: at("discovery"), lines: voice.process, lead: echo(line, next) };
    case "yes_no_question":
      return { stage: at("discovery"), lines: voice.yesNo };
    case "other_question":
      return { stage: here, lines: objectionRaised ? voice.behind : voice.unsure };
    case "proof":
      return { stage: at(objectionRaised ? "objection" : "pitch"), lines: voice.proof };
    case "acknowledgement":
      return { stage: at("objection"), lines: voice.acknowledge };
    case "pitch": {
      const objection = nextObjection(context);
      return {
        stage: at("objection"),
        lines: objection ? OBJECTION_LEADS.map((lead) => lead(spoken(objection))) : voice.doubt,
      };
    }
    case "wrap_up": {
      // "I'll send the invite" right after a counter-offer books the day the persona offered.
      const countered = booked ? undefined : counterOffered(said.at(-1) ?? "");
      if (reading.invite && countered) {
        return {
          stage: at("close"),
          lines: voice.inviteForCounter.map((text) => text.replace("%", countered)),
        };
      }
      const day = dayOf(booked) ?? booked ?? "then";
      const goodbyes = voice.goodbye.map((text) => text.replace("%", day));
      return {
        stage: at("close"),
        lines: reading.invite ? [...voice.inviteComing, ...goodbyes] : goodbyes,
      };
    }
    case "thanks":
      return {
        stage: here,
        lines:
          here === "opening"
            ? voice.openingThanks
            : here === "close"
              ? voice.thanks
              : voice.thanksMidCall,
      };
    case "short_reply":
      return { stage: here, lines: voice.short[here] };
    case "vague":
      return { stage: here, lines: voice.vague };
    case "unclear":
      return { stage: here, lines: [...echoTopic(line), ...voice.stages[here]] };
  }
}

/** A seeded number generator from a string, so the same input picks the same line. */
function seeded(seed: number, input: string): Next {
  let state = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    state = Math.imul(state ^ input.charCodeAt(index), 0x9e3779b1) >>> 0;
  }
  return mulberry32(state);
}

/** The demo persona's reply to the last student turn, ending with its stage tag. */
export function personaReply(
  seed: number,
  input: { system: string; messages: readonly ChatMessage[] },
): string {
  const context = readContext(input.system, input.messages);
  const line = context.turns.at(-1) ?? "";
  const next = seeded(seed, `${String(context.turns.length)}|${line}`);
  const reply = replyFor(context, line, next);
  const lead = reply.lead ?? "";
  const voice = VOICES[tradeOf(context.scenario.who)];
  const stage = later(reply.stage, context.current);
  const unsaid = (text: string) => !context.said.includes(text);
  // The reply's own lines first; when the call has used them up, a neutral nudge for the stage.
  const pools = [
    reply.lines.map((text) => `${lead}${text}`),
    reply.lines,
    voice.short[stage],
    voice.stages[stage],
  ].map((pool) => pool.filter(unsaid));
  const pool = pools.find((candidates) => candidates.length > 0) ?? ["Sorry, say that again?"];
  const text = pool[Math.floor(next() * pool.length)] ?? "Sorry, say that again?";
  return `${text} ${stageTag(stage)}`;
}
