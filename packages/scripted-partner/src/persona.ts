import { stageTag, type ChatMessage } from "@pitchperfect/partner";
import { STAGES, type Stage } from "@pitchperfect/shared";
import { type Booking, type Reading, type Voice, readTurn, timeIn } from "./intents.js";
import { mulberry32 } from "./patterns.js";
import { type Lines, tradeOf, VOICES, voiceOf } from "./voices.js";

/**
 * The offline demo persona: a buyer, a hiring manager or a warm contact. It reads the scenario and
 * the student's last turn the way the turn prompt sends them, works out what kind of turn it was
 * (`intents.ts`), and answers in that person's voice (`voices.ts`): a question gets an
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

/**
 * The persona's lines are written with curly apostrophes. Its own earlier lines are read back in
 * that form, so one sent with straight ones (an older transcript) still counts as said.
 */
const curly = (text: string) => text.replace(/(?<=\p{L})'(?=\p{L})/gu, "’");

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
    said: messages
      .filter((m) => m.role === "assistant")
      .map((m) => curly(m.content.replace(TAG, ""))),
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
    .replace(/\bWe are\b/g, "We’re")
    .replace(/\bI am\b/g, "I’m")
    .replace(/\bcannot\b/g, "can’t")
    .replace(/\bdo not\b/g, "don’t")
    .replace(/\bis not\b/g, "isn’t")
    .trim();
  return curly(/[.!?]$/.test(said) ? said : `${said}.`);
}

function lowerFirst(text: string): string {
  return /^(?:I\b|I['’]|[A-Z]{2})/.test(text)
    ? text
    : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** An objection after a lead-in that runs into it ("Maybe. But we're…"); "I" keeps its capital. */
const OBJECTION_LEADS: readonly ((objection: string) => string)[] = [
  (objection) => `I’ll be honest. ${objection}`,
  (objection) => `Sounds fine on paper. ${objection}`,
  (objection) => `Maybe. But ${lowerFirst(objection)}`,
];

/** Money has come up, so a price objection fits. */
const MONEY =
  /\b(?:price|pricing|budget|expensive|cheap|afford|roi|subscription|fee)\b|\$\d|\b\d[\d,]* (?:dollars|a month|per month|a year)\b|\bcosts? (?:less|more|about|around|under)\b|\bpay (?:for|per|about|around|less|more)\b|\bwe charge\b/i;
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
/** "thursday at 9" as the persona would write it: "Thursday at 9". */
const tidy = (when: string) =>
  when.replace(/\b(monday|tuesday|wednesday|thursday|friday|tomorrow)\b/gi, (day) =>
    capitalized(day.toLowerCase()),
  );
const dayOf = (when: string | undefined) => (when ? DAY.exec(when)?.[1] : undefined);
/** A time inside a sentence: "next week" loses its capital, a day keeps it. */
const midSentence = (when: string) =>
  /^(?:next|this) week|^tomorrow/i.test(when) ? when.toLowerCase() : when;

/** "%" in a line becomes ", Chris" when the student gave a name, or nothing. */
const withName = (lines: readonly string[], name: string | undefined) =>
  lines.map((line) => line.replace("%", name ? `, ${name}` : ""));

/** Whoever the student asked to bring, in the person's words, or their own pick. */
function guestFor(voice: Lines, line: string): string {
  const named = /\byour ((?:\w+ )?(?:lead|manager|director|boss|partner|owner))\b/i.exec(line)?.[1];
  return named ? `${voice.possessive} ${named.toLowerCase()}` : voice.colleague;
}

/**
 * The lines that move a meeting along, each with the shape that reads it back. The booking state
 * of a call is derived from these, so a line is never both said and misread.
 */
const BOOKING_LINES = {
  accept: {
    make: (When: string, guest: string) =>
      `${When} works. Send the invite and I’ll bring ${guest}.`,
    shape: /^(.+?) works\. Send the invite/,
  },
  acceptPlain: {
    make: (When: string) => `${When} works. Send me the details first.`,
    shape: /^(.+?) works\. Send me the details first/,
  },
  acceptMaybe: {
    make: (When: string, colleague: string) =>
      `${When} should work. Send me the details and I’ll check with ${colleague}.`,
    shape: /^(.+?) should work\. Send me the details/,
  },
  acceptBetter: {
    make: (When: string, guest: string) =>
      `${When} works better for me. Send the invite and I’ll bring ${guest}.`,
    shape: /^(.+?) works better for me\./,
  },
  counter: {
    make: (When: string, other: string) =>
      `${When} is packed for me. Could we do ${other} at the same time instead?`,
    shape: /^(.+?) is packed for me\. Could we do (\w+day)/,
  },
  refuseAgain: {
    make: (Day: string, offered: string, time: string) =>
      `Like I said, ${Day}’s no good for me. ${offered}${time} I can do.`,
    shape: /^Like I said, (\w+day)’s no good for me\. (\w+day)/,
  },
  refuseShort: {
    make: (Day: string, offered: string) => `${Day} still doesn’t work. ${offered}?`,
    shape: /^(\w+day) still doesn’t work\. (\w+day)\?/,
  },
  forDay: {
    make: (day: string) => `For ${day}, yes? Send it and I’ll be there.`,
    shape: /^For (\w+day), yes\?/,
  },
  forDayShort: {
    make: (day: string) => `For ${day}, then. Send it over.`,
    shape: /^For (\w+day), then\./,
  },
  followUp: {
    make: (When: string) => `${When} works. Talk then.`,
    shape: /^(.+?) works\. Talk then\./,
  },
  followUpSoft: {
    make: (when: string) => `Sounds good. Talk ${when}.`,
    shape: /^Sounds good\. Talk (.+?)\./,
  },
  same: {
    make: (When: string) => `Yes, ${When}. See you then.`,
    shape: /^Yes, (.+?)\. See you then/,
  },
  sameShort: {
    make: (Day: string) => `That’s the one. Talk ${Day}.`,
    shape: /^That’s the one\. Talk (\w+day)/,
  },
  switchTo: {
    make: (When: string) => `${When} is fine too. Send the new invite.`,
    shape: /^(.+?) is fine too\./,
  },
  switchShort: {
    make: (when: string) => `Okay, ${when} it is. Update the invite.`,
    shape: /^Okay, (.+?) it is\./,
  },
  keep: {
    make: (booked: string) =>
      `Let’s keep it to ${midSentence(booked)}, if that’s all the same to you. Send me the invite.`,
    shape: /^Let’s keep it to (.+?), if/,
  },
  keepShort: {
    make: (booked: string) => `We’ve got ${midSentence(booked)} already. One meeting is plenty.`,
    shape: /^We’ve got (.+?) already\./,
  },
  confirmTable: {
    make: (When: string) => `${When} works, yes. Send the invite.`,
    shape: /^(.+?) works, yes\./,
  },
  confirmSoft: {
    make: (when: string) => `Yes, ${when} is fine. Send me the details.`,
    shape: /^Yes, (.+?) is fine\. Send me the details/,
  },
} as const;

const ACCEPTS = [
  BOOKING_LINES.accept,
  BOOKING_LINES.acceptPlain,
  BOOKING_LINES.acceptMaybe,
  BOOKING_LINES.acceptBetter,
  BOOKING_LINES.forDay,
  BOOKING_LINES.forDayShort,
  BOOKING_LINES.followUp,
  BOOKING_LINES.followUpSoft,
  BOOKING_LINES.same,
  BOOKING_LINES.sameShort,
  BOOKING_LINES.switchTo,
  BOOKING_LINES.switchShort,
  BOOKING_LINES.keep,
  BOOKING_LINES.keepShort,
  BOOKING_LINES.confirmTable,
  BOOKING_LINES.confirmSoft,
];
const COUNTERS = [BOOKING_LINES.counter, BOOKING_LINES.refuseAgain, BOOKING_LINES.refuseShort];

/** Lines of the persona's that put a day on the table: its availability, or asking for a day. */
const DAY_ASKED = new Set(
  Object.values(VOICES).flatMap((voice) => [
    ...voice.availability,
    ...voice.openProposal,
    ...voice.trial,
    ...voice.confirmNothing,
  ]),
);

/** Where the call stands on a meeting, from what the persona has said. */
export function readBooking(said: readonly string[]): Booking {
  let booked: string | undefined;
  let countered: string | undefined;
  const refused: string[] = [];
  for (const line of said.map(curly)) {
    const accepted = ACCEPTS.map((entry) => entry.shape.exec(line)?.[1]).find(Boolean);
    if (accepted !== undefined) {
      booked = /^\w+day|^next week|^tomorrow|^\d/i.test(accepted)
        ? accepted
        : (timeIn(accepted) ?? accepted);
      countered = undefined;
      continue;
    }
    const counter = COUNTERS.map((entry) => entry.shape.exec(line)).find(Boolean);
    if (counter) {
      const [, turnedDown = "", offered = ""] = counter;
      const day = dayOf(turnedDown);
      if (day) refused.push(day.toLowerCase());
      countered = offered;
      booked = undefined;
    }
  }
  const last = curly(said.at(-1) ?? "");
  const dayAsked =
    DAY_ASKED.has(last) ||
    COUNTERS.some((entry) => entry.shape.test(last)) ||
    ACCEPTS.some((entry) => entry.shape.test(last));
  const offered = DAY_ASKED.has(last) ? dayOf(last) : undefined;
  return { booked, countered, refused, offered, dayAsked };
}

/**
 * A meeting proposed with a day or time: yes, a counter, a reminder that the day was already
 * turned down, or, once something is booked, a nudge to keep it to one meeting.
 */
function proposalReply(voice: Lines, reading: Reading, booking: Booking): Reply {
  const { booked, countered, refused, offered } = booking;
  const when = tidy(reading.orTime ?? reading.time ?? "");
  const When = capitalized(when);
  const day = dayOf(when);
  const guest = guestFor(voice, reading.sentence);
  const bookedDay = dayOf(booked);
  const other = day && /thursday/i.test(day) ? "Friday" : "Thursday";
  const stage: Stage = "close";
  const L = BOOKING_LINES;

  // A day after a vague "next week works" pins the meeting down rather than adding a second one.
  if (booked && !(day && !bookedDay)) {
    const sameDay = day !== undefined && day.toLowerCase() === bookedDay?.toLowerCase();
    const sameTime = when.toLowerCase() === booked.toLowerCase() || !/\bat\b/i.test(when);
    if (sameDay && sameTime) {
      return { stage, lines: [L.same.make(When), L.sameShort.make(capitalized(day))] };
    }
    if (
      sameDay ||
      /\b(?:instead|actually|rather|move|change|push|switch|make (?:it|that)|it is|then)\b/i.test(
        reading.sentence,
      )
    ) {
      return { stage, lines: [L.switchTo.make(When), L.switchShort.make(when)] };
    }
    return { stage, lines: [L.keep.make(booked), L.keepShort.make(booked)] };
  }
  if (day && refused.includes(day.toLowerCase())) {
    const offered = countered ?? other;
    const time = /\bat [\w:]+/i.exec(when)?.[0];
    return {
      stage,
      lines: [
        L.refuseAgain.make(capitalized(day), offered, time ? ` ${time}` : ""),
        L.refuseShort.make(capitalized(day), offered),
      ],
    };
  }
  // "Monday or Tuesday?" picks one; a day the persona itself offered, or any day after it has
  // already turned one down, is taken rather than haggled over.
  if (reading.orTime) return { stage, lines: [L.acceptBetter.make(When, guest)] };
  const yes = day ? L.accept.make(When, guest) : L.acceptPlain.make(When);
  const offeredByMe = day !== undefined && day.toLowerCase() === offered?.toLowerCase();
  if (offeredByMe || countered !== undefined || refused.length > 0) return { stage, lines: [yes] };
  return {
    stage,
    lines: [yes, day ? L.counter.make(When, other) : L.acceptMaybe.make(When, voice.colleague)],
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
        `My manager, in the end. I’d want ${voice.colleague} in the room as well.`,
      ]
    : [spoken(signOff), `${spoken(signOff)} ${who} would want a say too.`];
}

/** "Is there anything about my background that worries you?": the next objection, said kindly. */
function worriesReply(context: Context, voice: Lines): Reply {
  const objection = nextObjection(context);
  const here = context.current ?? byProgress(context.turns.length);
  if (!objection) return { stage: here, lines: voice.doubt };
  return {
    stage: later("objection", context.current),
    lines: [`Honestly? ${spoken(objection)}`, `Only the obvious one. ${spoken(objection)}`],
  };
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
  const booking = readBooking(said);

  if (context.lastTurn) {
    return {
      stage: "close",
      lines: [
        "I need to jump onto another call. Send me a short email with what we covered and I’ll take it from there.",
        "I have to run, but this was useful. Put it in an email and I’ll pass it along.",
      ],
    };
  }

  const reading = readTurn(line, {
    voice: kind,
    stage: here,
    firstName: scenario.firstName,
    turn: context.turns.length,
    booking,
    objectionRaised,
  });
  const when = tidy(reading.time ?? "");
  const When = capitalized(when);
  const L = BOOKING_LINES;

  switch (reading.intent) {
    case "identity":
      return {
        stage: current ?? "opening",
        // The scripted demo has no live model behind it, and must not claim to be one.
        lines: [
          `I’m PitchPerfect’s scripted practice partner playing ${scenario.firstName}, a demo with no live model behind it. But go on, what were you saying?`,
          `I’m PitchPerfect’s scripted practice partner, playing ${scenario.firstName} for this call. There’s no live model here, just a demo. Carry on.`,
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
      return proposalReply(voice, reading, booking);
    case "confirm": {
      const onTheTable = booking.countered ?? dayOf(said.at(-1)) ?? timeIn(said.at(-1) ?? "");
      return onTheTable
        ? {
            stage: at("close"),
            lines: [L.confirmTable.make(capitalized(onTheTable)), L.confirmSoft.make(onTheTable)],
          }
        : { stage: at("close"), lines: voice.confirmNothing };
    }
    case "follow_up": {
      // Once a meeting is booked, "talk Thursday" is a goodbye, not a new plan; the wrong day
      // gets a gentle correction.
      const settled = booking.booked ?? booking.countered;
      if (settled) {
        const settledDay = dayOf(settled);
        const day = dayOf(when);
        const wrongDay = day && settledDay && day.toLowerCase() !== settledDay.toLowerCase();
        return {
          stage: at("close"),
          lines: wrongDay
            ? [
                `${capitalized(settledDay)}, you mean. Talk then.`,
                `We said ${capitalized(settledDay)}. Bye for now.`,
              ]
            : [`Talk ${when}.`, `See you ${when}.`, "Bye for now."],
        };
      }
      return { stage: at("close"), lines: [L.followUp.make(When), L.followUpSoft.make(when)] };
    }
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
              `${When} is fine. Send me the draft tonight and I’ll forward it.`,
              `I can do ${when}. Send me what you want it to say first.`,
            ]
          : voice.favour,
      };
    case "offer_to_send":
      return {
        stage: at(kind === "contact" ? "close" : here),
        lines: when
          ? [
              `${When} is fine. Send it when it’s ready.`,
              `${When} works. I’ll read it when it lands.`,
            ]
          : voice.offer[reading.offer ?? "generic"],
      };
    case "small_start":
      return { stage: at("close"), lines: voice.smallStart };
    case "hypothetical":
      return { stage: here, lines: voice.hypothetical };
    case "invite_guest":
      return { stage: at("close"), lines: voice.inviteGuest };
    case "target":
      return {
        stage: at("discovery"),
        lines: reading.motivation && voice.motivation.length > 0 ? voice.motivation : voice.target,
      };
    case "topic":
      return { stage: at("discovery"), lines: [...echoTopic(line), ...voice.topic] };
    case "quantity_question":
      return { stage: at("discovery"), lines: voice.quantity[reading.quantity ?? "count"] };
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
    case "target_question": {
      // What the contact knows about the person; a hedged yes or no when it knows nothing fitting.
      const known = voice.aboutTarget[reading.about ?? "other"];
      return { stage: at("discovery"), lines: known.length > 0 ? known : voice.yesNo };
    }
    case "detail_question": {
      const topic = reading.detail ?? "pain";
      if (topic === "worries") return worriesReply(context, voice);
      const lines = voice.detail[topic];
      const fallback = topic === "picked" ? voice.detail.tried : voice.detail.pain;
      return { stage: here, lines: lines.length > 0 ? lines : fallback };
    }
    case "process_question":
      return { stage: at("discovery"), lines: voice.process, lead: echo(line, next) };
    case "yes_no_question":
      return { stage: at("discovery"), lines: voice.yesNo };
    case "other_question":
      // A question the persona can't place still gets a plausible answer about its own situation.
      return { stage: here, lines: voice.detail.pain };
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
      // "I'll send the invite" right after a counter-offer books the day the persona offered; a
      // goodbye after one takes that day as settled.
      const { booked, countered } = booking;
      if (reading.invite && !booked && countered) {
        return {
          stage: at("close"),
          lines: voice.inviteForCounter.map((text) => text.replace("%", countered)),
        };
      }
      const settled = booked ?? countered;
      const day = dayOf(settled) ?? settled ?? "then";
      const goodbyes = voice.goodbye.map((text) => text.replace("%", tidy(day)));
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
      return reading.nonsense
        ? { stage: here, lines: voice.clarify }
        : { stage: here, lines: [...echoTopic(line), ...voice.stages[here]] };
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
