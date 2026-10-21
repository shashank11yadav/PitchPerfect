import { STAGES, type Stage } from "@pitchperfect/shared";
import { ACKNOWLEDGE, mulberry32, TIME_PHRASE } from "./fake-patterns.js";
import { stageTag, type ChatMessage } from "./provider.js";

/**
 * The offline demo persona: a buyer, a hiring manager or a warm contact. It reads the scenario and
 * the student's last turn the way the turn prompt sends them, works out what kind of turn it was,
 * and answers in kind: a question gets an answer, a pitch gets the next hidden objection, a real
 * meeting proposal gets a yes or a counter. Same input, same reply; the stage only moves forward.
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

/**
 * Who the student is talking to: a buyer in one of a few trades, a hiring manager (introducing
 * yourself), or a warm contact (referrals and networking).
 */
type Trade = "logistics" | "clinic" | "retail" | "stores" | "other" | "hiring" | "contact";

function tradeOf(who: string): Trade {
  const [title = ""] = who.split(" | ");
  if (/hiring|recruit|talent|head of sales development/.test(title)) return "hiring";
  if (/former|friend|mentor|alum|colleague|old manager|internship/.test(title)) return "contact";
  if (/logistic|freight|carrier|delivery|dispatch|fleet/.test(who)) return "logistics";
  if (/clinic|dental|health|medical|therap/.test(who)) return "clinic";
  if (/retail|online|shop|e-?commerce/.test(who)) return "retail";
  if (/store|hardware|chain/.test(who)) return "stores";
  return "other";
}

/** What each kind of person says, by kind of turn. */
interface Voice {
  process: readonly string[];
  /** What they use today. The first line names a tool. */
  tools: readonly string[];
  quantity: readonly string[];
  /** "What time…" about their day. */
  timing: readonly string[];
  problemCost: readonly string[];
  cost: readonly string[];
  /** "How well does it work?" */
  quality: readonly string[];
  /** A yes-or-no question about how they work: "Do you call patients the day before?" */
  yesNo: readonly string[];
  /** "Are Mondays the worst?" */
  busiest: readonly string[];
  /** "Who runs it day to day?" */
  owner: readonly string[];
  /** "Who decides?" when the scenario has no sign-off objection. */
  decision: readonly string[];
  /** "What would it take…?" */
  conditions: readonly string[];
  /** "What if we started small?" */
  smallStart: readonly string[];
  acknowledge: readonly string[];
  /** When every hidden objection has been raised. */
  doubt: readonly string[];
  availability: readonly string[];
  smallTalk: readonly string[];
  /** Thanks at the end of a call. */
  thanks: readonly string[];
  /** The student offers to do something: "I could write the intro". */
  offer: readonly string[];
  /** The student said who they are. */
  intro: readonly string[];
  /** The student said something vague. */
  vague: readonly string[];
  /** Who they'd bring to a meeting, as "my dispatch lead". */
  colleague: string;
  /** Lines for where the call is, when nothing more specific fits. */
  stages: Record<Stage, readonly string[]>;
}

const BUYER_STAGES: Record<Stage, readonly string[]> = {
  opening: [
    "Sorry, who did you say you were with, and why the call?",
    "Okay. Remind me who you are and why you reached out?",
  ],
  discovery: [
    "It is, honestly. Mondays are the worst for it.",
    "It's not great. Why do you ask?",
    "Honestly, it works fine most days. What makes you think we need anything?",
  ],
  pitch: [
    "Alright, I'm listening. What would this actually change for a team like mine?",
    "Sure. So what is it you're offering, in a sentence?",
    "Okay. And how is that different from what we do now?",
  ],
  objection: [
    "I'm still not sure. Why would we switch from what we have?",
    "That's what everyone says. What's the catch?",
    "Maybe. I'd need to see it work somewhere like us first.",
  ],
  close: [
    "That's helpful. If we did move ahead, what would the next step look like?",
    "You've made a decent case. What would you suggest we do from here?",
    "Okay. What do you need from me to get this moving?",
  ],
};

type TradeLines = Pick<
  Voice,
  "process" | "tools" | "quantity" | "timing" | "problemCost" | "quality" | "yesNo" | "busiest"
>;

function buyer(colleague: string, lines: TradeLines): Voice {
  const who = capitalized(colleague);
  return {
    ...lines,
    cost: [
      "Somewhere around $900 a month for what we use now. I'd have to check the last invoice.",
      "About $1,200 a month, I think, though finance would know better than me.",
    ],
    owner: [
      `${who} runs it day to day.`,
      `Day to day, ${colleague}. Changing it would be my call, though.`,
    ],
    decision: [
      `Me, mostly. ${who} would want a say.`,
      `I'd decide, but I wouldn't do it without ${colleague}.`,
    ],
    conditions: [
      "Proof it works somewhere like us, and a price I don't have to take to the board.",
      "Seeing it work for a month without my team noticing the switch.",
    ],
    smallStart: [
      "One location would be easier to say yes to. Which one would you start with?",
      "Starting small helps. What would a first step look like, exactly?",
    ],
    acknowledge: [
      "I appreciate that. Do you have an example from a company like ours?",
      "Okay, that helps a little. Who else like us has done this, and how did it go?",
    ],
    doubt: [
      "Okay, but how do I know it'll work for a business like ours?",
      "I've heard that before. What makes this one different?",
    ],
    availability: [
      "Next week's fairly open. Tuesday or Thursday morning would work.",
      "Thursday's my best day. Mornings, ideally.",
    ],
    smallTalk: [
      "Busy, but fine, thanks. What's this about?",
      "Not bad. Long week already. What can I do for you?",
    ],
    thanks: ["Sounds good. Talk then.", "Sure thing. I'll keep an eye out for it."],
    offer: ["Sure, send it over and I'll take a look.", "Fine. Keep it short and I'll read it."],
    intro: [
      "Okay. And why are you calling us, specifically?",
      "Alright. What made you reach out to me?",
    ],
    vague: [
      "Sorry, I'm not following. What is it you actually do?",
      "Okay, but what does that mean for us, exactly?",
    ],
    colleague,
    stages: BUYER_STAGES,
  };
}

const VOICES: Record<Trade, Voice> = {
  logistics: buyer("my dispatch lead", {
    process: [
      "Spreadsheets and a lot of phone calls. When a driver calls in sick, someone rebuilds the routes by hand.",
      "One of our dispatchers does it first thing every morning, mostly from a spreadsheet and the carrier sites.",
    ],
    tools: [
      "A routing add-on that came with our fleet software. It mostly works, until someone calls in sick.",
      "Spreadsheets, honestly, and the carrier portals. We looked at proper software once and it was too much.",
    ],
    quantity: [
      "Probably two hours every morning, and longer on Mondays.",
      "Three or four reroutes a day, and each one eats twenty minutes.",
    ],
    timing: [
      "Most drivers are out by 6:30. The first reroutes come in around 7.",
      "Dispatch starts at 5:30, and the phones are going by 6.",
    ],
    problemCost: [
      "A missed delivery window can cost us the customer. Day to day, it's a few hundred dollars in overtime.",
      "Overtime, mostly. Call it $400 on a bad day, and we have a couple of those a week.",
    ],
    quality: [
      "It does the job most days. When two drivers call out, it falls apart and we're back on the phones.",
      "Fine, until something changes after 6am. Then it's spreadsheets again.",
    ],
    yesNo: [
      "Some of them do, yes. It depends who's on that morning.",
      "Not always. When we're short, that's the first thing that gets skipped.",
    ],
    busiest: [
      "Mondays, easily. Everyone's back and half the routes change.",
      "Mondays and the day after a holiday. Those are rough.",
    ],
  }),
  clinic: buyer("our practice manager", {
    process: [
      "The front desk phones patients the day before. If nobody picks up, we just hope they show.",
      "It's mostly the front desk and a shared calendar. Every clinic does it a little differently.",
    ],
    tools: [
      "The reminder feature in our booking system. Half the patients ignore the texts.",
      "Our practice software sends reminders, but nobody trusts it, so the front desk calls anyway.",
    ],
    quantity: [
      "Maybe five or six no-shows a week per clinic.",
      "The front desk spends about an hour a day on it.",
    ],
    timing: [
      "First patients are at 7:30, so the front desk is in by 7.",
      "Reminder calls go out after lunch, when it's quieter.",
    ],
    problemCost: [
      "An empty chair is about $200 an hour for us, so one bad afternoon adds up fast.",
      "Each no-show is maybe $150 we don't get back, and the staff are paid either way.",
    ],
    quality: [
      "It sends the texts. Whether anyone reads them is another story.",
      "Okay, I suppose. No-shows haven't really moved since we turned it on.",
    ],
    yesNo: [
      "Usually, yes. When it's busy, it doesn't happen.",
      "Sometimes. It depends who's on the desk.",
    ],
    busiest: [
      "Mondays and Fridays. Fridays are the worst for no-shows.",
      "Monday mornings, easily. Everyone wants to move their appointment.",
    ],
  }),
  retail: buyer("our head of operations", {
    process: [
      "Our support team answers delivery questions by email, and orders live in a shared spreadsheet.",
      "Honestly, it's a few people, a spreadsheet and a lot of copying between tabs.",
    ],
    tools: [
      "Our store platform, plus a help desk inbox and a lot of spreadsheets.",
      "The shipping plugin that came with the shop. It does the basics.",
    ],
    quantity: [
      "A few hundred orders a week, and maybe one in twenty goes sideways.",
      "Two people spend most of Monday on it.",
    ],
    timing: [
      "Orders cut off at 2pm and go out by 5.",
      "Mornings are emails about yesterday's deliveries.",
    ],
    problemCost: [
      "Every late order is a refund or a discount, so maybe $40 a time, plus the review.",
      "Hard to say exactly. A few thousand a month once you count refunds.",
    ],
    quality: [
      "It does the basics. Anything unusual and someone has to step in.",
      "Fine for normal weeks. Sale weeks, not so much.",
    ],
    yesNo: ["Mostly, yes. Sale weeks are different.", "When we remember to. Which isn't always."],
    busiest: ["Sale weeks, without question.", "Mondays, with the weekend's orders."],
  }),
  stores: buyer("the owner", {
    process: [
      "Each store manager does it their own way. Some use a notebook, some use the till system.",
      "It's paper at two stores and a spreadsheet at the others. We've talked about fixing it for years.",
    ],
    tools: [
      "The till system at four stores and paper at the other two.",
      "Whatever each manager likes. That's the problem, really.",
    ],
    quantity: [
      "Each manager loses half a day a week to it, give or take.",
      "Across six stores? Probably ten hours a week.",
    ],
    timing: [
      "Stores open at 8, and deliveries land before that.",
      "Managers do the orders Monday mornings, mostly.",
    ],
    problemCost: [
      "A stock-out on a Saturday probably costs a store $1,000 in sales.",
      "Mostly people's time. Half a day a week, per store, at $25 an hour.",
    ],
    quality: [
      "Depends on the manager. Two stores run tight, the rest don't.",
      "It works because people work around it.",
    ],
    yesNo: [
      "Some stores do. Others, not really.",
      "In theory, yes. In practice it depends on the manager.",
    ],
    busiest: ["Saturdays, easily.", "Spring. Everyone starts a project at once."],
  }),
  other: buyer("my manager", {
    process: [
      "Honestly, it's a mix of spreadsheets and email, and it depends who's in that day.",
      "We have a process, mostly. It lives in a couple of people's heads.",
    ],
    tools: [
      "A tool we bought a few years ago. It mostly works.",
      "Mostly spreadsheets and email, if I'm honest.",
    ],
    quantity: [
      "Six or seven hours a week across the team, give or take.",
      "More than I'd like. Call it a day a week.",
    ],
    timing: [
      "Most of it happens first thing in the morning.",
      "Usually Mondays, when the week is planned.",
    ],
    problemCost: [
      "Hard to put a number on it. A few thousand a month, if I'm honest.",
      "More than it should. Probably a person's whole Friday, every week.",
    ],
    quality: ["Well enough that nobody's complained loudly.", "It does the job, mostly."],
    yesNo: ["Mostly, yes.", "Usually. Not always."],
    busiest: ["Mondays, usually.", "End of the month, when everything's due."],
  }),
  hiring: {
    process: [
      "Mornings are outreach, afternoons are calls. Once someone's ramped, they book about eight meetings a week.",
      "It's a lot of research and short emails, then first calls with the people who answer. Fridays we review the pipeline together.",
    ],
    tools: [
      "A CRM, a sequencing tool and a lot of LinkedIn. We'd train you on all of it.",
      "Our CRM and a dialer. Nothing you can't learn in a week.",
    ],
    quantity: [
      "Ramp takes about three months. We hire two or three SDRs a year.",
      "The team books around thirty meetings a week between five of them.",
    ],
    timing: [
      "Most of the team is in by 8:30, and calls start around 9.",
      "Mornings are for outreach, so we keep meetings to the afternoon.",
    ],
    problemCost: [
      "A bad hire costs us a quarter, honestly. That's why I ask so many questions.",
      "Mostly time. Every seat that sits empty is meetings we don't book.",
    ],
    cost: [
      "The range is in the posting. Most people start near the middle of it.",
      "It's base plus commission, and the posting has the numbers.",
    ],
    quality: [
      "Pretty well. Most of our reps get promoted within two years.",
      "It works for people who like hearing no and trying again.",
    ],
    owner: [
      "Our team lead runs the SDRs day to day. You'd sit next to her for the first month.",
      "Our team lead does. She was an SDR here three years ago.",
    ],
    decision: [
      "You'd meet our team lead and one of the account executives, then me again.",
      "Our team lead has a say, and so does one of the account executives you'd support.",
    ],
    conditions: [
      "Show me you can take a no and keep going. A real example would do it.",
      "Some sign you've done the work before you applied. Most people haven't.",
    ],
    smallStart: [
      "We don't really do trial runs, but a short project in the interview is normal.",
      "That's not how we hire, but I like that you asked.",
    ],
    acknowledge: [
      "Fair enough. So what would you do in your first month here?",
      "I appreciate that. Tell me about a time you had to learn something fast.",
    ],
    doubt: [
      "Okay. What makes you want sales rather than something safer?",
      "Why this team, though, and not somewhere bigger?",
    ],
    availability: [
      "I keep Thursday afternoons for interviews. Does that suit you?",
      "Next week is busy, but I can find thirty minutes on Thursday.",
    ],
    smallTalk: [
      "Good, thanks. Busy hiring season. What's on your mind?",
      "Not bad at all. Thanks for asking. So, what brings you here?",
    ],
    thanks: ["Thanks for reaching out. Talk soon.", "Of course. Good luck, and talk soon."],
    offer: [
      "Sure, send it over. I'll read it before we talk again.",
      "That would help. Send it and I'll pass it to our team lead.",
    ],
    yesNo: ["Mostly, yes. It depends on the week.", "Usually. Some weeks are different."],
    busiest: [
      "The first month, honestly. After that it gets easier.",
      "End of quarter. Everyone's chasing the last few meetings.",
    ],
    intro: ["Nice to meet you. What drew you to sales?", "Good to meet you. Why this role?"],
    vague: [
      "Everyone says that. Give me an example.",
      "Okay, but what does that look like in practice?",
    ],
    colleague: "our team lead",
    stages: {
      opening: ["Sure. Tell me a bit about yourself.", "Happy to chat. What's your background?"],
      discovery: [
        "Everyone says that. Give me an example.",
        "That's a start. What's a time it actually paid off?",
        "What do you know about what we do here?",
      ],
      pitch: ["So why this role, and why now?", "What would you bring to the team on day one?"],
      objection: [
        "What would you say to someone who worries you're too new to this?",
        "How would you handle hearing no forty times a day?",
      ],
      close: [
        "What would you like to happen next?",
        "This was useful. What's the best next step from your side?",
      ],
    },
  },
  contact: {
    process: [
      "Honestly, I'm not sure how they hire these days. It's been a while since I talked shop with them.",
      "Last I heard they hire through referrals first, then the job board.",
    ],
    tools: [
      "Email, mostly. They're not big on LinkedIn messages.",
      "I'd just forward your note with a line from me.",
    ],
    quantity: [
      "I've known them about five years, but we only catch up a couple of times a year.",
      "We worked together for two years before they moved.",
    ],
    timing: [
      "They're usually quickest to answer first thing in the morning.",
      "Mornings, usually.",
    ],
    problemCost: [
      "It doesn't cost me anything, but I do care what my name gets attached to.",
      "Nothing really. I just want it to go well for both of you.",
    ],
    cost: [
      "Ha, nothing. I'm happy to help if it's a good fit.",
      "You don't owe me anything. Buy me a coffee if it works out.",
    ],
    quality: [
      "Pretty well. We worked together for two years, and we still grab coffee a couple of times a year.",
      "Well enough to send an email. We haven't talked in a few months, though.",
    ],
    owner: [
      "Their sales director, last I heard. I can double-check.",
      "The head of sales runs hiring, I think. Jess would know for sure.",
    ],
    decision: [
      "That'd be their sales director, I think. I can ask.",
      "Probably the head of sales. I know them a little.",
    ],
    conditions: [
      "Just a clear note about what you want, so I'm not guessing.",
      "A couple of lines I can forward without rewriting. That's all.",
    ],
    smallStart: [
      "Sure, keep it small. A short intro email is easy for me.",
      "That works. One email first, and we'll see how she replies.",
    ],
    acknowledge: [
      "That's fair. What exactly would you want me to say about you?",
      "Okay. Could you send me a few lines I can forward?",
    ],
    doubt: [
      "I want to help, I just need to know what I'm vouching for.",
      "Remind me what you worked on when we overlapped?",
    ],
    availability: [
      "Next week's fine. Send me something I can forward and I'll do it then.",
      "I could do it Thursday. Send me the draft before then.",
    ],
    smallTalk: [
      "Good! Busy, but good. How about you, what's new?",
      "It really has been a while. All good here. What's up with you?",
    ],
    thanks: ["Of course. Happy to help. Keep me posted.", "Anytime. Let me know how it goes."],
    offer: [
      "That would help a lot. Keep it to a few lines and I'll send it on.",
      "Perfect, that makes it easy. Send it over.",
    ],
    yesNo: ["I think so, yes. I can check.", "Not sure, honestly. I can ask."],
    busiest: ["Hard to say. Probably end of quarter.", "No idea, honestly. I'd guess Mondays."],
    intro: ["Good to hear from you. What's going on?", "Hey, nice. What can I do for you?"],
    vague: [
      "Let's keep it simple, then: two lines about you and what you want from her.",
      "Okay. What would make this easiest for you?",
    ],
    colleague: "their sales director",
    stages: {
      opening: [
        "Good to hear from you. What's going on?",
        "Hey, it's been a while. What can I do for you?",
      ],
      discovery: ["So what are you hoping I can do?", "Who are you trying to reach, exactly?"],
      pitch: [
        "Okay, and what would you want me to say about you?",
        "What makes you a good fit for them?",
      ],
      objection: [
        "I'd want to be sure I can actually vouch for you.",
        "I don't want to push it if it isn't a fit.",
      ],
      close: [
        "Send me a few lines I can forward and I'll see what I can do.",
        "Okay. What do you need from me, and by when?",
      ],
    },
  },
};

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

/** An objection after a lead-in that runs into it ("Maybe. But we're…"); "I" keeps its capital. */
const OBJECTION_LEADS: readonly ((objection: string) => string)[] = [
  (objection) => `I'll be honest. ${objection}`,
  (objection) => `Sounds fine on paper. ${objection}`,
  (objection) => `Maybe. But ${lowerFirst(objection)}`,
];

function lowerFirst(text: string): string {
  return /^(?:I\b|I'|[A-Z]{2})/.test(text)
    ? text
    : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

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

function echo(line: string, next: Next): string {
  const word = echoWord(line);
  if (!word || next() < 0.5) return "";
  return `${capitalized(word)}, right. `;
}

interface Reply {
  lines: readonly string[];
  stage: Stage;
  /** Prepended to whichever line is picked, when it isn't empty. */
  lead?: string;
}

const sentencesOf = (line: string) =>
  line
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/** A question, with or without its question mark. */
const QUESTION_SHAPE =
  /\?\s*$|^(?:so,? |and |but |okay,? |ok,? |sorry,? |hey,? )*(?:what|how|who|when|where|why|which)\b|^(?:can you |could you )?(?:walk me through|tell me about)\b|^(?:and |so )?(?:do|does|did|is|are|can|could|would|should|will|have|has) (?:you|your|we|it|this|that|the|they)\b|\b(?:learn|know|understand|hear|ask) (?:how|what|why|who|when)\b/i;

const IDENTITY =
  /\b(?:are|r) (?:you|u) (?:a |an )?(?:real|actual|live)?\s*(?:person|human|bot|robot|ai|machine|recording|real)\b|\bis this (?:a |an )?(?:real |actual |live )?(?:person|human|bot|robot|ai|machine|recording)\b|\b(?:am i|are we) (?:talking|speaking) (?:to|with) (?:a |an )?(?:real |actual |live )?(?:person|human|bot|robot|ai|machine|recording)\b/i;

const SMALL_TALK =
  /\bhow are (?:you|things)(?: doing| going)?(?: today| this week)?\b|\bhow(?:'s| is) (?:your )?(?:week|day|morning|everything|it|life)(?: been)? going\b|\bhow have you been\b|\bit'?s been (?:forever|a while|ages)\b|\bis (?:now|this) an? (?:ok(?:ay)?|good|bad) time\b|\bgot (?:a minute|two minutes|a sec)\b/i;
const THANKS =
  /^(?:great|perfect|awesome|ok(?:ay)?|cool|sounds good)?[,!.]?\s*(?:thanks?(?: you)?(?: so much)?|i appreciate (?:it|that|your time)|really appreciate it)\b|\bappreciate (?:it|your time)\b|\b(?:i'll|i will) send (?:it|that|the invite|them)(?: over)?\b|\btalk (?:soon|then)\b/i;

const TIME = `(?:${TIME_PHRASE.source})`;

/**
 * A meeting with this person, proposed: setting up a meeting noun, the person's own availability
 * for a time, a time offered on its own ("how about…"), or a promise to call or follow up at a
 * time. Questions about their operations that mention a day are never proposals.
 */
const PROPOSALS: readonly RegExp[] = [
  /\b(?:set up|book|grab|schedule|get|find|put|send|have|hold|block|lock in|pencil in|open to|up for)\b(?:\s+[\w'-]+){0,4}?\s+(?:meeting|call|demo|chat|time|slot|session|invite|minutes|coffee|walkthrough|catch-up)\b/i,
  /\bare you (?:free|around|available|open)\b/i,
  new RegExp(`${TIME}\\s+(?:work|works|suit|suits)(?:\\s+for)?\\s+you\\b`, "i"),
  /\b(?:does|would|will|could|should) (?:that|this|it|\w+day|\d{1,2}(?::\d{2})?\s?(?:am|pm)?|(?:\w+ )?at \d{1,2}(?::\d{2})?\s?(?:am|pm)?)\s+(?:work|suit)(?: for)? you\b/i,
  new RegExp(
    `^(?:so,? |ok(?:ay)?,? )?(?:how|what) about ${TIME}(?:\\s+(?:with|for) [^,.?]+)?\\s*[?.]?$`,
    "i",
  ),
  new RegExp(
    `\\b(?:could|can|shall|should) we (?:do|meet|chat|connect|speak|talk|catch up)(?: (?:this|it|again|then))?(?: on| at)? ${TIME}`,
    "i",
  ),
  /\b(?:let'?s|we could|can i|i'd love to)\b(?:\s+[\w'-]+){0,4}?\s+(?:call (?:you|back)|ring you|pick (?:this|it) up|touch base)\b/i,
];

/** The student says when they'll be back in touch: nothing to schedule, just agree. */
const FOLLOW_UP =
  /\b(?:i'll|i will|let me|i can|i'd love to)\b(?:\s+[\w'-]+){0,4}?\s+(?:call (?:you|back)|ring you|follow up|check in|circle back|touch base|reach out)\b/i;

/** "What does next week look like for you": this person's own time, not their team's. */
const AVAILABILITY =
  /\bwhat does (?:next week|this week|tomorrow|\w+day)(?: morning| afternoon)? look like for you\b|\bhow(?:'s| is| does) your (?:week|calendar|schedule|\w+day)(?: morning| afternoon)? look(?:ing)?\b|\bwhen (?:are|would|will) you (?:be )?(?:free|available|around)\b|\bwhat (?:day|time)s? (?:work|works|suit|suits)(?: for you| best)?\b/i;
/** A proposal with no time yet: a meeting word with an ask around it. */
const OPEN_PROPOSAL =
  /\b(?:could|can|shall|should) we (?:set up|book|schedule|do|have|grab|get|run|try)\b.*\b(?:call|chat|demo|meeting|pilot|trial|time|minutes)\b|\bwould you be (?:open|up) (?:to|for) (?:a |an )?(?:[\w-]+ ){0,2}(?:call|chat|demo|meeting|pilot|trial)\b|\bwould a (?:trial|pilot|demo|call|meeting|chat)\b/i;
const SMALL_START =
  /\bwould it help if\b|\bwhat if we (?:started|start|tried|try)\b|\bstart(?:ed|ing)? (?:with|small|on) (?:one|a single|just one|small)\b/i;
const FAVOUR =
  /\b(?:could|can|would) you (?:send|forward|introduce|pass|make|do|share|put)\b|\bwould you be (?:comfortable|willing|open to|happy to) (?:introduc|send|forward|connect|pass)|\bwould you (?:mind|be willing to) (?:send|forward|introduc|pass)/i;
const QUANTITY_QUESTION = /\bhow (?:much time|long|many|often)\b/i;
const TIMING_QUESTION = /\bwhat time\b|\bwhen do (?:they|you|your \w+)\b/i;
const QUALITY_QUESTION =
  /\bhow well (?:does|do|is|has|did) (?:it|that|this|the \w+)\b|\bdoes (?:it|that) (?:work well|work for you|do the job)\b|\bhow (?:happy|satisfied) are you\b|\bhow well do you know\b|\bare you (?:still )?in touch\b|\bdo you (?:still )?talk to (?:her|him|them)\b/i;
/** What the problem costs them, rather than what they pay for a tool today. */
const PROBLEM_COST =
  /\bwhat (?:does|would|did) .+ cost\b|\bcosts? (?:you|us|them)\b|\bwhat(?:'s| is) that costing\b/i;
/** Money, in a money context: "spend their day" isn't a cost question. */
const COST_QUESTION =
  /\bhow much (?:does|do|is|would|did) .+ (?:cost|costing|run|running|charge|charging|set you back)\b|\bwhat (?:do|does) (?:you|your \w+) pay\b|\b(?:budget|salary|compensation|pay range|price|pricing)\b|\b(?:cost|spend|spending|pay|paying)\b.*\b(?:money|dollars|\$|per month|a month|a year|licen[cs]e|subscription|tool|software|vendor|for (?:it|this|that))\b/i;
const CONDITIONS_QUESTION =
  /\bwhat would (?:it take|make (?:it|you|this|that)|you need|need to happen|change your mind|get you|get your)\b/i;
const OWNER_QUESTION =
  /\bwho (?:owns|runs|looks after|is in charge of|handles)\b|\bwho (?:would|will|do) I (?:be )?(?:work(?:ing)?|report(?:ing)?|sit(?:ting)?) (?:with|to|next to)\b/i;
/** "Who works the front desk on Tuesday?" */
const STAFF_QUESTION = /\bwho (?:works|staffs|covers|is on|answers)\b/i;
const BUSIEST_QUESTION = /\b(?:worst|busiest|hardest|toughest|slowest)\b/i;
/** A yes-or-no question about how they work, after the more specific kinds. */
const YES_NO_QUESTION =
  /^(?:and |so |sorry,? )?(?:do|does|did|is|are|have|has|was|were) (?:you|your|they|the|it|that|those|these|[\w-]+s)\b/i;
const TOPIC =
  /\blet'?s talk about\b|\bcan we talk about\b|\bi(?:'d| would) like to (?:talk|ask) about\b/i;
const BUSY_REMARK =
  /\byou(?:'re| are| sound| seem) (?:busy|swamped|slammed|rushed)\b|\bcaught you at a bad time\b/i;
const OFFER =
  /\bI (?:could|can|will|'ll|'d be happy to) (?:write|draft|send you|put together|share)\b/i;
/** The student wants an introduction, or names who's hiring. */
const TARGET =
  /\b(?:is hiring|are hiring|looking at (?:\w+ )?roles|applying (?:to|for)|want(?:ed)? to (?:meet|talk to|reach)|intro(?:duction)? to)\b/i;
const DECISION_QUESTION =
  /\bwho (?:decides|else|signs|approves|makes the call)\b|\bwho on your (?:side|team|end)\b|\bwho (?:would|should|will|needs? to|has to|gets to|is)\b.*\b(?:sign|decide|approve|involved|say|weigh|buy|see|know|meet)\b|\bsign[- ]?off\b|\bdecision\b/i;
const TOOL_QUESTION =
  /\bwhat (?:are|is) (?:you|your [\w-]+) using\b|\bwhat (?:tool|tools|system|software|platform)\b|\bwhat do you use\b/i;
const PROCESS_QUESTION =
  /\bhow (?:do|does|did|are|is|you|your)\b|\bwalk me through\b|\btell me about\b|\bwhat does .+ look like\b|\bwhat .+ is like\b|\bwhat happens\b|\bhow you\b|\bspend (?:most of )?(?:their|your|the|a) (?:day|time|week|morning)\b|\bspend (?:most of )?(?:their|your) \w+ on\b/i;
/** A claim about what the offer does for them: "our planner rebuilds…", "we help…". */
const BENEFIT_CLAIM =
  /\b(?:we|our [\w-]+|it|this|that tool|the (?:tool|planner|platform|app|service))\s+(?:\w+\s+)?(?:cuts?|saves?|reduces?|rebuilds?|reshuffles?|fills?|frees?|stops?|removes?|handles?|automates?|texts?|sends?|lets? you|helps? (?:you|your|teams?|clinics|carriers|dispatch|the))\b|\bwe help\b|\bhelps? (?:you|your)\b|\bmeans (?:the|your|you)\b|\bso your\b|\bso nobody\b/i;
/** A candidate's own record, for a hiring manager: "I ran…", "I booked 40…". */
const SELF_PITCH =
  /\bI (?:ran|led|built|booked|sold|managed|hit|grew|started|organi[sz]ed|raised|closed|worked|interned|made|won|doubled)\b/i;
/** The student says who they are: a capitalised name, what their company does, or school. */
const INTRO =
  /\b(?:[Ii]'m|[Ii] am|[Tt]his is|[Mm]y name is|[Ii]t's) [A-Z][a-z]+\b|\b[A-Z][a-z]+ (?:from|with) [A-Z]\w+|\b[Ww]e (?:do|build|make|sell|offer|provide)\b|\b[Ii] graduate\b|\b[Ii]'m (?:a|an) (?:senior|junior|student|graduate)\b/;
/** A concrete result someone else got: "went from twelve no-shows to five", "cut $2,500 a month". */
const PROOF_CLAIM =
  /\b(?:went from|cut|reduced|saved|lowered|dropped|increased|doubled)\b.*(?:\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half)\b)|\b\d+ ?(?:percent|%)/i;
const VAGUE = /\b(?:kind of|sort of|a bunch of|stuff|i guess|whatever you think)\b/i;

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

/** "Wednesday at 3pm" or "next week", from whichever sentence holds it. */
function timeIn(line: string): string | undefined {
  const found = TIME_PHRASE.exec(line)?.[0].trim();
  if (!found) return undefined;
  return /^next\s+week/i.test(found) ? found : found.replace(/^next\s+/i, "");
}

/** The person's last line asked for a day, or said one works. */
const DAY_ON_THE_TABLE =
  /what day|when, and who|when would it start|\bworks\b|should work|my best day|fairly open|is packed|suit you|thirty minutes on/i;

function isProposal(sentence: string, dayOnTheTable: boolean): boolean {
  if (!timeIn(sentence)) return false;
  if (PROPOSALS.some((pattern) => pattern.test(sentence))) return true;
  // A short answer with a day in it, right after a day came up: "Thursday at 2pm?"
  return (
    dayOnTheTable &&
    sentence.split(/\s+/).length <= 8 &&
    !QUESTION_SHAPE.test(sentence.replace(/\?\s*$/, ""))
  );
}

function proposalReply(voice: Voice, line: string, when: string): Reply {
  const day = /monday|tuesday|wednesday|thursday|friday/i.exec(when)?.[0];
  const other = day && /thursday/i.test(day) ? "Friday" : "Thursday";
  // Whoever the student asked to bring, in the person's words, or their own pick.
  const named = /\byour ((?:\w+ )?(?:lead|manager|director|boss|partner|owner))\b/i.exec(line)?.[1];
  const guest = named ? `my ${named.toLowerCase()}` : voice.colleague;
  const When = capitalized(when);
  return {
    stage: "close",
    lines: [
      day
        ? `${When} works. Send the invite and I'll bring ${guest}.`
        : `${When} works. Send me the details first.`,
      day
        ? `${When} is packed for me. Could we do ${other} at the same time instead?`
        : `${When} should work. Send me the details and I'll check with ${voice.colleague}.`,
    ],
  };
}

/** The kinds of turn the person tells apart, first match wins. */
function replyFor(context: Context, line: string, next: Next): Reply {
  const { scenario, current, said } = context;
  const trade = tradeOf(scenario.who);
  const voice = VOICES[trade];
  const here = current ?? byProgress(context.turns.length);
  const at = (stage: Stage) => later(stage, current);
  const sentences = sentencesOf(line);
  // Questions are read from the question itself, so a word in the sentence before it doesn't
  // decide the answer ("…spend hours a week. How do you plan routes today?").
  const asked = sentences.filter((sentence) => QUESTION_SHAPE.test(sentence)).at(-1);

  if (context.lastTurn) {
    return {
      stage: "close",
      lines: [
        "I need to jump onto another call. Send me a short email with what we covered and I'll take it from there.",
        "I have to run, but this was useful. Put it in an email and I'll pass it along.",
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
  const dayOnTheTable = DAY_ON_THE_TABLE.test(said.at(-1) ?? "");
  const proposal = sentences.find((sentence) => isProposal(sentence, dayOnTheTable));
  // A favour the contact can do ("could you send it by Friday?"), with its day if it has one.
  const favourDay = timeIn(line);
  if (trade === "contact" && FAVOUR.test(line) && favourDay) {
    return {
      stage: at("close"),
      lines: [
        `${capitalized(favourDay)} is fine. Send me the draft tonight and I'll forward it.`,
        `I can do ${favourDay}. Send me what you want it to say first.`,
      ],
    };
  }
  const followUp = sentences.find((sentence) => timeIn(sentence) && FOLLOW_UP.test(sentence));
  if (followUp) {
    const when = timeIn(followUp) ?? "";
    return {
      stage: at("close"),
      lines: [`${capitalized(when)} works. Talk then.`, `Sounds good. Talk ${when}.`],
    };
  }
  if (proposal) {
    // Never turn down a day the person just offered.
    const when = timeIn(proposal) ?? "";
    const day = /monday|tuesday|wednesday|thursday|friday/i.exec(when)?.[0];
    const offered = day !== undefined && new RegExp(day, "i").test(said.at(-1) ?? "");
    const reply = proposalReply(voice, proposal, when);
    return offered ? { ...reply, lines: reply.lines.slice(0, 1) } : reply;
  }
  if (FAVOUR.test(line)) {
    return {
      stage: at(trade === "contact" ? "close" : here),
      lines:
        trade === "contact"
          ? [
              "Sure. Send me the draft and I'll forward it this week.",
              "Happy to. Send me a couple of lines first.",
            ]
          : ["Sure, I can send that over.", "I can do that. Give me a day or two."],
    };
  }
  if (AVAILABILITY.test(line)) return { stage: at("close"), lines: voice.availability };
  if (OPEN_PROPOSAL.test(line)) {
    return {
      stage: at("close"),
      lines: /trial|pilot/i.test(line)
        ? [
            "A trial might work. When would it start, and what would you need from us?",
            "Maybe a trial. What day were you thinking, and how long would it run?",
          ]
        : [
            "Maybe. What day were you thinking, and how long do you need?",
            "I could find some time. When, and who should be there?",
          ],
    };
  }
  if (SMALL_TALK.test(line) && !BENEFIT_CLAIM.test(line)) {
    return {
      stage: here,
      lines: /\b(?:now|this) an? \w+ time\b|\bgot (?:a minute|two minutes|a sec)\b/i.test(line)
        ? ["I've got a few minutes. Go ahead.", "A few minutes, yes. Go ahead."]
        : voice.smallTalk,
    };
  }
  if (SMALL_START.test(line)) return { stage: at("close"), lines: voice.smallStart };
  if (BUSY_REMARK.test(line)) {
    return {
      stage: here,
      lines: ["I am, a bit. What's this about?", "Always. Go ahead, but quickly."],
    };
  }
  if (OFFER.test(line))
    return { stage: at(trade === "contact" ? "close" : here), lines: voice.offer };
  if (trade === "contact" && TARGET.test(line)) {
    return {
      stage: at("discovery"),
      lines: [
        "Oh nice. And you'd like me to put in a word?",
        "Good for you. What are you hoping I can do?",
      ],
    };
  }
  if (asked) {
    if (QUANTITY_QUESTION.test(asked)) return { stage: at("discovery"), lines: voice.quantity };
    if (QUALITY_QUESTION.test(asked)) return { stage: here, lines: voice.quality };
    if (BUSIEST_QUESTION.test(asked)) return { stage: at("discovery"), lines: voice.busiest };
    if (TIMING_QUESTION.test(asked)) return { stage: at("discovery"), lines: voice.timing };
    if (PROBLEM_COST.test(asked)) return { stage: at("discovery"), lines: voice.problemCost };
    if (COST_QUESTION.test(asked)) return { stage: at("discovery"), lines: voice.cost };
    if (CONDITIONS_QUESTION.test(asked)) return { stage: here, lines: voice.conditions };
    if (OWNER_QUESTION.test(asked)) return { stage: at("discovery"), lines: voice.owner };
    if (STAFF_QUESTION.test(asked)) {
      return {
        stage: at("discovery"),
        lines: [
          "Usually two people. On a quiet day, just one.",
          "It depends on the rota. One or two people most days.",
        ],
      };
    }
    if (DECISION_QUESTION.test(asked)) {
      const signOff = scenario.objections.find((objection) =>
        /sign[- ]?off|approv/i.test(objection),
      );
      const repeated = signOff !== undefined && alreadySaid(said, spoken(signOff));
      const who = capitalized(voice.colleague);
      return {
        stage: at("discovery"),
        lines: !signOff
          ? voice.decision
          : repeated
            ? [
                `Like I said, my manager has the final word. ${who} would want a say too.`,
                `My manager, in the end. I'd want ${voice.colleague} in the room as well.`,
              ]
            : [spoken(signOff), `${spoken(signOff)} ${who} would want a say too.`],
      };
    }
    if (TOOL_QUESTION.test(asked)) {
      // The first answer names a tool, so it agrees with an "already use a tool" objection.
      const hasTool = scenario.objections.some((objection) =>
        /already (?:use|have)/i.test(objection),
      );
      return { stage: at("discovery"), lines: hasTool ? voice.tools.slice(0, 1) : voice.tools };
    }
    if (PROCESS_QUESTION.test(asked)) {
      return { stage: at("discovery"), lines: voice.process, lead: echo(line, next) };
    }
    if (YES_NO_QUESTION.test(asked)) return { stage: at("discovery"), lines: voice.yesNo };
  }
  if (TOPIC.test(line)) {
    return {
      stage: at("discovery"),
      lines: ["Sure. What about them?", "Okay. What do you want to know?"],
    };
  }
  if (THANKS.test(line)) {
    return {
      stage: here,
      lines:
        here === "close"
          ? voice.thanks
          : ["Sure. What else did you want to ask?", "No problem. What's next?"],
    };
  }
  // An acknowledgement answers pushback; before any objection it's just a reply to small talk.
  const objectionRaised = scenario.objections.some((objection) =>
    alreadySaid(said, spoken(objection)),
  );
  if (INTRO.test(line) && here === "opening") return { stage: at("discovery"), lines: voice.intro };
  if (PROOF_CLAIM.test(line) && !asked) {
    return {
      stage: at(objectionRaised ? "objection" : "pitch"),
      lines: [
        "Okay, that's a real result. How long did it take them to get there?",
        "That's more like it. Could I talk to them?",
      ],
    };
  }
  if (ACKNOWLEDGE.test(line) && objectionRaised) {
    return { stage: at("objection"), lines: voice.acknowledge };
  }
  // A claim about what the offer does, money brought up in a statement, or a candidate's record.
  const pitched =
    BENEFIT_CLAIM.test(line) ||
    MONEY.test(line) ||
    ((trade === "hiring" || trade === "contact") && SELF_PITCH.test(line));
  if (pitched) {
    const objection = nextObjection(context);
    return {
      stage: at("objection"),
      lines: objection ? OBJECTION_LEADS.map((lead) => lead(spoken(objection))) : voice.doubt,
    };
  }
  if (VAGUE.test(line)) return { stage: here, lines: voice.vague };
  if (INTRO.test(line)) return { stage: at("discovery"), lines: voice.intro };
  // Nothing more specific: answer for where the call is now, picking up the student's topic.
  const word = echoWord(line);
  return {
    stage: here,
    lines: word
      ? [
          `${capitalized(word)}, yes. That's a real headache here.`,
          `${capitalized(word)}? Say more.`,
        ]
      : voice.stages[here],
  };
}

/** Kept for when every other option has been used in this call: still a reply, never "go on". */
const LAST_RESORT: Record<Stage, readonly string[]> = {
  opening: ["Sorry, I missed that. What's the call about?", "Okay. What can I do for you?"],
  discovery: [
    "Sorry, say that another way?",
    "Okay. What else do you want to know?",
    "Right. Where are you going with this?",
    "Mm, fair. What's your next question?",
  ],
  pitch: [
    "Okay. Keep it short, though. What's the main thing?",
    "Right. And what does it cost me?",
  ],
  objection: ["I hear you. I'm just not convinced yet.", "Maybe. Give me a reason to believe it."],
  close: ["Sounds good. Send me the details.", "Okay. Let's see what you send over."],
};

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
  const options = reply.lines.map((text) => `${lead}${text}`).filter(unsaid);
  const fallback = voice.stages[stage].filter(unsaid);
  const lastResort = LAST_RESORT[stage].filter(unsaid);
  const pool = options.length ? options : fallback.length ? fallback : lastResort;
  const text =
    pool[Math.floor(next() * pool.length)] ?? LAST_RESORT[stage][0] ?? "Sorry, say that again?";
  return `${text} ${stageTag(stage)}`;
}
