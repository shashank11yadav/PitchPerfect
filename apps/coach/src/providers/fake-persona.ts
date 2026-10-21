import { STAGES, type Stage } from "@pitchperfect/shared";
import { ACKNOWLEDGE, ASK, BENEFIT, mulberry32, TIME_PHRASE } from "./fake-patterns.js";
import { stageTag, type ChatMessage } from "./provider.js";

/**
 * The offline demo buyer. It reads the scenario and the student's last turn the way the turn
 * prompt sends them, works out what kind of turn it was, and answers in kind: a question gets an
 * answer, a pitch gets the next hidden objection, a meeting request gets a yes or a counter. Same
 * input, same reply; the stage only moves forward.
 */

interface Scenario {
  firstName: string;
  company: string;
  objections: string[];
}

interface Context {
  scenario: Scenario;
  /** The stage the api says the call is in, if it said. */
  current: Stage | undefined;
  lastTurn: boolean;
  /** The student's turns, oldest first. */
  turns: string[];
  /** What the buyer has already said in this call, without stage tags. */
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
  company: "",
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
    company: field("Organisation").toLowerCase(),
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

/** What kind of business the buyer runs, for answers that sound like theirs. */
type Trade = "logistics" | "clinic" | "retail" | "stores" | "other";

function tradeOf(company: string): Trade {
  if (/logistic|freight|carrier|delivery|dispatch|fleet/.test(company)) return "logistics";
  if (/clinic|dental|health|medical|therap/.test(company)) return "clinic";
  if (/retail|online|shop|e-?commerce/.test(company)) return "retail";
  if (/store|hardware|chain/.test(company)) return "stores";
  return "other";
}

const PROCESS: Record<Trade, readonly string[]> = {
  logistics: [
    "Spreadsheets and a lot of phone calls. When a driver calls in sick, someone rebuilds the routes by hand.",
    "One of our dispatchers does it first thing every morning, mostly from a spreadsheet and the carrier sites.",
  ],
  clinic: [
    "The front desk phones patients the day before. If nobody picks up, we just hope they show.",
    "It's mostly the front desk and a shared calendar. Every clinic does it a little differently.",
  ],
  retail: [
    "Our support team answers delivery questions by email, and orders live in a shared spreadsheet.",
    "Honestly, it's a few people, a spreadsheet and a lot of copying between tabs.",
  ],
  stores: [
    "Each store manager does it their own way. Some use a notebook, some use the till system.",
    "It's paper at two stores and a spreadsheet at the others. We've talked about fixing it for years.",
  ],
  other: [
    "Honestly, it's a mix of spreadsheets and email, and it depends who's in that day.",
    "We have a process, mostly. It lives in a couple of people's heads.",
  ],
};

const QUANTITY: Record<Trade, readonly string[]> = {
  logistics: [
    "Probably two hours every morning, and longer on Mondays.",
    "Three or four reroutes a day, and each one eats twenty minutes.",
  ],
  clinic: [
    "Maybe five or six no-shows a week per clinic.",
    "The front desk spends about an hour a day on it.",
  ],
  retail: [
    "A few hundred orders a week, and maybe one in twenty goes sideways.",
    "Two people spend most of Monday on it.",
  ],
  stores: [
    "Each manager loses half a day a week to it, give or take.",
    "Across six stores? Probably ten hours a week.",
  ],
  other: [
    "Six or seven hours a week across the team, give or take.",
    "More than I'd like. Call it a day a week.",
  ],
};

const PROBLEM_COSTS: Record<Trade, readonly string[]> = {
  logistics: [
    "A missed delivery window can cost us the customer. Day to day, it's a few hundred dollars in overtime.",
    "Overtime, mostly. Call it $400 on a bad day, and we have a couple of those a week.",
  ],
  clinic: [
    "An empty chair is about $200 an hour for us, so one bad afternoon adds up fast.",
    "Each no-show is maybe $150 we don't get back, and the staff are paid either way.",
  ],
  retail: [
    "Every late order is a refund or a discount, so maybe $40 a time, plus the review.",
    "Hard to say exactly. A few thousand a month once you count refunds.",
  ],
  stores: [
    "A stock-out on a Saturday probably costs a store $1,000 in sales.",
    "Mostly people's time. Half a day a week, per store, at $25 an hour.",
  ],
  other: [
    "Hard to put a number on it. A few thousand a month, if I'm honest.",
    "More than it should. Probably a person's whole Friday, every week.",
  ],
};

const COST = [
  "Somewhere around $900 a month for what we use now. I'd have to check the last invoice.",
  "About $1,200 a month, I think, though finance would know better than me.",
];

const CO_DECIDER: Record<Trade, string> = {
  logistics: "my dispatch lead",
  clinic: "our practice manager",
  retail: "our head of operations",
  stores: "the owner",
  other: "my manager",
};

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** A hidden objection as the buyer would say it out loud. */
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

const OBJECTION_LEADS = ["I'll be honest.", "Sounds fine on paper.", "Maybe. But"];

/** Words worth repeating back from the student's line; anything else would read oddly. */
const ECHO_WORDS = [
  "dispatchers",
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
];

function echo(line: string, next: Next): string {
  const word = ECHO_WORDS.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(line));
  if (!word || next() < 0.5) return "";
  return `${capitalized(word)}, right. `;
}

interface Reply {
  lines: readonly string[];
  stage: Stage;
  /** Prepended to whichever line is picked, when it isn't empty. */
  lead?: string;
}

const IDENTITY =
  /\b(?:are|r) (?:you|u) (?:a |an )?(?:real )?(?:person|human|bot|robot|ai|machine)\b|\b(?:am i|are we) (?:talking|speaking) (?:to|with) (?:a |an )?(?:real )?(?:person|human|bot|robot|ai)\b/i;
const PROCESS_QUESTION =
  /\bhow (?:do|does|are|is) (?:you|your)\b|\bwalk me through\b|\bwhat does .+ look like\b|\bwhat happens when\b/i;
const QUANTITY_QUESTION = /\bhow (?:much time|long|many|often)\b/i;
const COST_QUESTION = /\b(?:cost|pay|paying|spend|budget|price|pricing)\b/i;
/** What the problem costs them, rather than what they pay for a tool today. */
const PROBLEM_COST =
  /\bwhat (?:does|would|did) .+ cost\b|\bcosts? (?:you|us|them)\b|\bwhat(?:'s| is) that costing\b/i;
const DECISION_QUESTION =
  /\bwho on your (?:side|team|end)\b|\bwho (?:else )?(?:would|should) (?:want|need) to (?:see|know|be)\b|\bwho (?:else )?(?:would|will|needs?|has to|gets to|is)\b.*\b(?:sign|decide|approve|involved|say|weigh|buy)|\bsign[- ]?off\b|\bdecision\b/i;
const OWNER_QUESTION = /\bwho (?:owns|runs|looks after|is in charge of|handles)\b/i;
const PITCH =
  /\b(?:we help|our (?:tool|platform|product|software|planner|service|team|app)|helps? you)\b/i;

/** The kinds of turn the buyer tells apart, first match wins. */
function replyFor(context: Context, line: string, next: Next): Reply {
  const { scenario, current, said } = context;
  const trade = tradeOf(scenario.company);
  const progress = later(byProgress(context.turns.length), current);
  // Questions are read from the question itself, so a word in the sentence before it doesn't
  // decide the answer ("…spend hours a week. How do you plan routes today?").
  const question = line
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.includes("?"))
    .at(-1);
  const isQuestion = question !== undefined;
  const asked = question ?? "";

  if (context.lastTurn) {
    return {
      stage: "close",
      lines: [
        "I need to jump onto another call. Send me a short email with what we covered and I'll take it from there.",
        "I have to run, but this was useful. Put it in an email and I'll share it with the team.",
      ],
    };
  }
  if (IDENTITY.test(line)) {
    return {
      stage: current ?? "opening",
      lines: [
        `I'm an AI practice partner playing ${scenario.firstName}, but go on. What were you saying?`,
        `I'm an AI practice partner, playing ${scenario.firstName} for this call. Carry on.`,
      ],
    };
  }
  const time = TIME_PHRASE.exec(line)?.[0];
  if (ASK.test(line) && time) {
    const when = time.replace(/^next\s+/i, "");
    const day = /monday|tuesday|wednesday|thursday|friday/i.exec(when)?.[0];
    const other = day && /thursday/i.test(day) ? "Friday" : "Thursday";
    // Whoever the student asked to bring, in the buyer's words, or the buyer's own pick.
    const named = /\byour ((?:\w+ )?(?:lead|manager|director|boss|partner|owner))\b/i.exec(
      line,
    )?.[1];
    const guest = named ? `my ${named.toLowerCase()}` : CO_DECIDER[trade];
    return {
      stage: "close",
      lines: [
        `${capitalized(when)} works. Send the invite and I'll bring ${guest}.`,
        day
          ? `${capitalized(when)} is packed for me. Could we do ${other} at the same time instead?`
          : `I can probably make ${when} work. Send me the details first.`,
      ],
    };
  }
  if (ASK.test(line)) {
    return {
      stage: later("close", current),
      lines: [
        "Maybe. What day were you thinking, and how long do you need?",
        "I could find some time. When, and who should be there?",
      ],
    };
  }
  if (isQuestion && QUANTITY_QUESTION.test(asked)) {
    return { stage: later("discovery", current), lines: QUANTITY[trade] };
  }
  if (isQuestion && PROBLEM_COST.test(asked)) {
    return { stage: later("discovery", current), lines: PROBLEM_COSTS[trade] };
  }
  if (isQuestion && COST_QUESTION.test(asked)) {
    return { stage: later("discovery", current), lines: COST };
  }
  if (isQuestion && OWNER_QUESTION.test(asked)) {
    return {
      stage: later("discovery", current),
      lines: [
        `${capitalized(CO_DECIDER[trade])} runs it day to day.`,
        `Day to day, ${CO_DECIDER[trade]}. Changing it would be my call, though.`,
      ],
    };
  }
  if (isQuestion && DECISION_QUESTION.test(asked)) {
    const signOff = scenario.objections.find((objection) => /sign[- ]?off|approv/i.test(objection));
    const coDecider = capitalized(CO_DECIDER[trade]);
    const alreadySaid =
      signOff !== undefined && said.some((reply) => reply.includes(spoken(signOff)));
    return {
      stage: later("discovery", current),
      lines: !signOff
        ? [
            `Me, mostly. ${coDecider} would want a say.`,
            `I'd decide, but I wouldn't do it without ${CO_DECIDER[trade]}.`,
          ]
        : alreadySaid
          ? [
              `Like I said, my manager has the final word. ${coDecider} would want a say too.`,
              `My manager, in the end. I'd want ${CO_DECIDER[trade]} in the room as well.`,
            ]
          : [spoken(signOff), `${spoken(signOff)} ${coDecider} would want a say too.`],
    };
  }
  if (isQuestion && PROCESS_QUESTION.test(asked)) {
    return { stage: later("discovery", current), lines: PROCESS[trade], lead: echo(line, next) };
  }
  if (ACKNOWLEDGE.test(line)) {
    return {
      stage: later("objection", current),
      lines: [
        "I appreciate that. Do you have an example from a company like ours?",
        "Okay, that helps a little. Who else like us has done this, and how did it go?",
      ],
    };
  }
  if (!isQuestion && (PITCH.test(line) || BENEFIT.test(line))) {
    const raised = (objection: string) => said.some((reply) => reply.includes(spoken(objection)));
    const fresh = scenario.objections.find((objection) => !raised(objection));
    return {
      stage: later("objection", current),
      lines: fresh
        ? OBJECTION_LEADS.map((lead) => `${lead} ${spoken(fresh)}`)
        : [
            "Okay, but how do I know it'll work for a business like ours?",
            "I've heard that before. What makes this one different?",
          ],
    };
  }
  return { stage: progress, lines: STAGE_LINES[progress] };
}

/** When nothing more specific fits: a line for where the call is. */
const STAGE_LINES: Record<Stage, readonly string[]> = {
  opening: [
    "Sorry, who did you say you were with, and why the call?",
    "Okay. Remind me who you are and why you reached out?",
  ],
  discovery: [
    "Fair enough. Honestly, things work fine as they are. What makes you think we need anything?",
    "Okay. What exactly do you want to know about how we work?",
  ],
  pitch: [
    "Alright, I'm listening. What would this actually change for a team like mine?",
    "Sure. So what is it you're offering, in a sentence?",
  ],
  objection: [
    "I'm still not sure. Why would we switch from what we have?",
    "That's what everyone says. What's the catch?",
  ],
  close: [
    "That's helpful. If we did move ahead, what would the next step look like?",
    "You've made a decent case. What would you suggest we do from here?",
  ],
};

/** Lines kept for when every other option has been used in this call. */
const LAST_RESORT = ["Go on.", "Mm. Keep going.", "Okay, and then?"];

/** A seeded number generator from a string, so the same input picks the same line. */
function seeded(seed: number, input: string): Next {
  let state = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    state = Math.imul(state ^ input.charCodeAt(index), 0x9e3779b1) >>> 0;
  }
  return mulberry32(state);
}

/** The demo buyer's reply to the last student turn, ending with its stage tag. */
export function personaReply(
  seed: number,
  input: { system: string; messages: readonly ChatMessage[] },
): string {
  const context = readContext(input.system, input.messages);
  const line = context.turns.at(-1) ?? "";
  const next = seeded(seed, `${String(context.turns.length)}|${line}`);
  const reply = replyFor(context, line, next);
  const lead = reply.lead ?? "";
  const unsaid = (text: string) => !context.said.includes(text);
  const options = reply.lines.map((text) => `${lead}${text}`).filter(unsaid);
  const fallback = STAGE_LINES[reply.stage].filter(unsaid);
  const pool = options.length ? options : fallback.length ? fallback : LAST_RESORT.filter(unsaid);
  const text = pool[Math.floor(next() * pool.length)] ?? "Go on.";
  return `${text} ${stageTag(later(reply.stage, context.current))}`;
}
