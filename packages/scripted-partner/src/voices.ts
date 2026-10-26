import type { Stage } from "@pitchperfect/shared";
import type {
  DetailTopic,
  JobTopic,
  OfferTopic,
  SmallTalkTopic,
  TargetTopic,
  Voice,
  QuantityKind,
} from "./intents.js";

/**
 * What each kind of person says, by kind of turn. A buyer's lines depend on their trade; a hiring
 * manager and a warm contact have their own. "%" in a line is where the student's name goes, as
 * ", Chris", when they gave one (or the booked day, in a goodbye).
 */

export type Trade = "logistics" | "clinic" | "retail" | "stores" | "other" | "hiring" | "contact";

export function tradeOf(who: string): Trade {
  const [title = ""] = who.split(" | ");
  if (/hiring|recruit|talent|head of sales development/.test(title)) return "hiring";
  if (/former|friend|mentor|alum|colleague|old manager|internship/.test(title)) return "contact";
  if (/logistic|freight|carrier|delivery|dispatch|fleet/.test(who)) return "logistics";
  if (/clinic|dental|health|medical|therap/.test(who)) return "clinic";
  if (/retail|online|shop|e-?commerce/.test(who)) return "retail";
  if (/store|hardware|chain/.test(who)) return "stores";
  return "other";
}

export const voiceOf = (trade: Trade): Voice =>
  trade === "hiring" ? "hiring" : trade === "contact" ? "contact" : "buyer";

export interface Lines {
  process: readonly string[];
  /** What they use today. The first line names a tool. */
  tools: readonly string[];
  /** "How many", "how long", "how often". */
  quantity: Record<QuantityKind, readonly string[]>;
  /** "What time…" about their day. */
  timing: readonly string[];
  problemCost: readonly string[];
  cost: readonly string[];
  /** "How well does it work?" */
  quality: readonly string[];
  /** A yes-or-no question the persona can't place: a hedged yes or no, then a grounded clause. */
  yesNo: readonly string[];
  /** "Are Mondays the worst?" */
  busiest: readonly string[];
  /** "Who works the front desk?" */
  staff: readonly string[];
  /** "Who runs it day to day?" */
  owner: readonly string[];
  /** "Who decides?" when the scenario has no sign-off objection. */
  decision: readonly string[];
  /** "What would it take…?" */
  conditions: readonly string[];
  /** "What if we started small?" */
  smallStart: readonly string[];
  /** "If it paid for itself in two months, would that help?" */
  hypothetical: readonly string[];
  /** Short answers about their situation, by topic. "pain" is also the answer to any other question. */
  detail: Record<DetailTopic, readonly string[]>;
  acknowledge: readonly string[];
  /** A concrete result from someone like them. */
  proof: readonly string[];
  /** When every hidden objection has been raised. */
  doubt: readonly string[];
  availability: readonly string[];
  /** A proposal with no time in it. */
  openProposal: readonly string[];
  /** "Would a trial help?" */
  trial: readonly string[];
  /** "Would that work for you?" with nothing on the table. */
  confirmNothing: readonly string[];
  /** "Should I include your dispatch lead on the invite?" */
  inviteGuest: readonly string[];
  smallTalk: Record<SmallTalkTopic, readonly string[]>;
  greeting: readonly string[];
  nameCheck: readonly string[];
  /** "Is this Maya?" when they're someone else; "%" is their name. */
  wrongName: readonly string[];
  /** Thanks at the very start of the call. */
  openingThanks: readonly string[];
  /** Thanks in the middle of the call. */
  thanksMidCall: readonly string[];
  /** Thanks at the end of a call with nothing booked. */
  thanks: readonly string[];
  /** Goodbyes once a meeting is booked; "%" is the booked day. */
  goodbye: readonly string[];
  /** "I'll send the invite." */
  inviteComing: readonly string[];
  /** "I'll send the invite" right after the persona offered another day; "%" is that day. */
  inviteForCounter: readonly string[];
  /** The student offers to send or write something. */
  offer: Record<OfferTopic, readonly string[]>;
  /** A favour asked of them. */
  favour: readonly string[];
  /** The student said who they are, by name or company. */
  opener: readonly string[];
  /** The student said what they do, without saying who they are. */
  openerUnnamed: readonly string[];
  /** The student names who's hiring (contact), or what they're after (hiring). */
  target: readonly string[];
  /** Hiring only: why the candidate wants the work. */
  motivation: readonly string[];
  /** The student names a topic. */
  topic: readonly string[];
  busy: readonly string[];
  /** The student said something vague. */
  vague: readonly string[];
  /** Words the persona can't place at all. */
  clarify: readonly string[];
  /** A short "ok", "yeah", "sure": a neutral nudge for the stage. */
  short: Record<Stage, readonly string[]>;
  /** Nothing fit: a neutral line for the stage. */
  stages: Record<Stage, readonly string[]>;
  /** Hiring manager only: questions about the job. */
  job: Record<JobTopic, readonly string[]>;
  /** Contact only: how well they know the person. */
  relationship: readonly string[];
  /** Contact only: what they know about the person the student wants to reach, by question. */
  aboutTarget: Record<TargetTopic, readonly string[]>;
  /** Who they'd bring to a meeting, as "my dispatch lead". */
  colleague: string;
  /** "my" for a buyer, "our" for a hiring manager. */
  possessive: string;
}

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** The detail answers a buyer's trade supplies; the rest are shared by every buyer. */
type TradeDetail = Pick<
  Record<DetailTopic, readonly string[]>,
  "pain" | "wish" | "more" | "impact" | "anythingElse" | "tried" | "picked"
>;

type TradeLines = Pick<
  Lines,
  "process" | "tools" | "quantity" | "timing" | "problemCost" | "quality" | "yesNo" | "busiest"
> & { detail: TradeDetail };

const BUYER_SHORT: Record<Stage, readonly string[]> = {
  opening: ["Okay. What can I do for you?", "Sorry, I missed that. What’s the call about?"],
  discovery: [
    "Okay. What else did you want to know?",
    "Sure. What’s your next question?",
    "Right. Where were we?",
    "Fair enough. What’s your next question?",
  ],
  pitch: [
    "Okay. Keep it short, though. What’s the main thing?",
    "Right. And what does it cost me?",
    "Alright. What’s the pitch, in a sentence?",
  ],
  objection: [
    "I hear you. I’m just not convinced yet.",
    "Maybe. Give me a reason to believe it.",
    "Okay. So what do you say to that?",
  ],
  close: [
    "Okay. So what’s the next step from your side?",
    "Sounds good. Send me the details.",
    "Okay. Let’s see what you send over.",
  ],
};

const BUYER_STAGES: Record<Stage, readonly string[]> = {
  opening: [
    "Sorry, who did you say you were with, and why the call?",
    "Okay. Remind me who you are and why you reached out?",
    "Right. What’s the call about?",
  ],
  discovery: [
    "Okay. What is it you want to know?",
    "Right. Where are you going with this?",
    "Sure. And what does that have to do with us?",
  ],
  pitch: [
    "Alright, I’m listening. What would this actually change for a team like mine?",
    "Sure. So what is it you’re offering, in a sentence?",
    "Okay. And how is that different from what we do now?",
  ],
  objection: [
    "I’m still not sure. Why would we switch from what we have?",
    "That’s what everyone says. What’s the catch?",
    "Maybe. I’d need to see it work somewhere like us first.",
  ],
  close: [
    "That’s helpful. If we did move ahead, what would the next step look like?",
    "You’ve made a decent case. What would you suggest we do from here?",
    "Okay. What do you need from me to get this moving?",
  ],
};

const NO_JOB: Record<JobTopic, readonly string[]> = {
  mix: [],
  best: [],
  fit: [],
  success: [],
  team: [],
  size: [],
  timeline: [],
  challenge: [],
};

/** Only a contact is asked about someone else; everyone else falls back to a hedged yes or no. */
const NO_TARGET: Record<TargetTopic, readonly string[]> = {
  hiring: [],
  there: [],
  rightPerson: [],
  replies: [],
  other: [],
};

/** Detail answers every buyer shares, whatever the trade. */
const BUYER_DETAIL = {
  why: [
    "Honestly, because nobody’s had the time to fix it. It works, just barely.",
    "Mostly habit. It’s how we’ve always done it, and the days are full.",
  ],
  priorities: [
    "Cost, and not getting calls from customers. In that order.",
    "Numbers he can take upstairs: fewer complaints, less overtime.",
  ],
  quarter: [
    "End of the month, and then it’s budget season. That’s why timing matters.",
    "Three weeks. After that there’s a bit more room to look at things.",
  ],
  howBusy: [
    "Friday afternoons are quieter, mostly. Mornings are when it bites.",
    "Not bad by the afternoon. The mornings are the crunch.",
  ],
  checkBack: [
    "That’s it, yes. And the overtime that comes with it.",
    "Pretty much. Add the phone calls and you’ve got the whole picture.",
  ],
  behind: [
    "Honestly, it’s time more than anything. Every change costs the team a few weeks.",
    "Honestly, we’ve been burned before. Tell me why this one’s different.",
  ],
  enjoy: [],
  worries: [],
  story: [],
  graduates: [],
  nextStep: [],
  wants: [],
  trend: [
    "Worse, slowly. More volume, same number of people.",
    "About the same, honestly. It never got fixed, it just got normal.",
  ],
  coaching: [
    "The learning curve, honestly. If it takes a day of training, my team won’t use it.",
    "Not much, I’d hope. My team won’t sit through a day of training.",
    "As little as possible. If it needs a manual, it won’t get used.",
  ],
  opinion: [
    "Honestly? It sounds useful. I’ve just heard a lot of promises.",
    "Cautiously interested. Show me it works somewhere like us.",
  ],
};

function buyer(colleague: string, lines: TradeLines): Lines {
  const who = capitalized(colleague);
  const { detail, ...trade } = lines;
  return {
    ...trade,
    cost: [
      "Somewhere around $900 a month for what we use now. I’d have to check the last invoice.",
      "About $1,200 a month, I think, though finance would know better than me.",
    ],
    staff: [
      "Usually two people. On a quiet day, just one.",
      "It depends on the rota. One or two people most days.",
    ],
    owner: [
      `${who} runs it day to day.`,
      `Day to day, ${colleague}. Changing it would be my call, though.`,
    ],
    decision: [
      `Me, mostly. ${who} would want a say.`,
      `I’d decide, but I wouldn’t do it without ${colleague}.`,
    ],
    conditions: [
      "Proof it works somewhere like us, and a price I don’t have to take to the board.",
      "Seeing it work for a month without my team noticing the switch.",
      "Starting after the quarter closes, and a price I don’t have to take upstairs.",
    ],
    smallStart: [
      "One location would be easier to say yes to. Which one would you start with?",
      "Starting small helps. What would a first step look like, exactly?",
    ],
    hypothetical: [
      "It would help, yes. I’d still want to see it work somewhere like us first.",
      "Maybe. Show me that’s real and not a sales number.",
    ],
    detail: { ...BUYER_DETAIL, ...detail },
    acknowledge: [
      "I appreciate that. Do you have an example from a company like ours?",
      "Okay, that helps a little. Who else like us has done this, and how did it go?",
    ],
    proof: [
      "Okay, that’s a real result. How long did it take them to get there?",
      "That’s more like it. Could I talk to them?",
      "Which company was that? I’d want to talk to them.",
    ],
    doubt: [
      "Okay, but how do I know it’ll work for a business like ours?",
      "I’ve heard that before. What makes this one different?",
    ],
    availability: [
      "Next week’s fairly open. Tuesday or Thursday morning would work.",
      "Thursday’s my best day. Mornings, ideally.",
    ],
    openProposal: [
      "Maybe. What day were you thinking, and how long do you need?",
      "I could find some time. When, and who should be there?",
    ],
    trial: [
      "A trial might work. When would it start, and what would you need from us?",
      "Maybe a trial. What day were you thinking, and how long would it run?",
    ],
    confirmNothing: [
      "Depends what you’re proposing. When were you thinking?",
      "Maybe. What exactly are you suggesting, and when?",
    ],
    inviteGuest: [`Yes, please. And copy ${colleague}.`, `Do, yes. ${who} should hear this too.`],
    smallTalk: {
      time: [
        "I’ve got a few minutes%. Go ahead.",
        "A few minutes, yes. Go ahead.",
        "Only a few minutes%. What’s this about?",
      ],
      weekend: [
        "Quiet, thanks. Over too fast. What’s this about?",
        "It was good, thanks. Nothing big planned. What can I do for you?",
      ],
      weather: [
        "It’s been something, hasn’t it. Anyway, what can I do for you?",
        "Wild, yes. Half my team came in late. What’s this about?",
      ],
      game: [
        "Only the highlights, honestly. Busy week. What’s this about?",
        "I missed it. Heard it was close. What can I do for you?",
      ],
      general: [
        "Busy, but fine, thanks. What’s this about?",
        "Not bad. Long week already. What can I do for you?",
      ],
    },
    greeting: [
      "Hi. Who am I speaking with?",
      "Hello. What can I do for you?",
      "Hi there. Who’s this?",
    ],
    nameCheck: ["Speaking. Who’s this?", "It is. What can I do for you?"],
    wrongName: ["No, this is %. Who were you after?", "It’s % here. Who’s this?"],
    openingThanks: ["Sure. What’s this about?", "No problem. What can I do for you?"],
    thanksMidCall: ["Sure. What else did you want to ask?", "No problem. What’s next?"],
    thanks: ["Sounds good. Talk then.", "Sure thing. I’ll keep an eye out for it."],
    goodbye: [
      "Great, talk %.",
      "Sounds good. Bye for now.",
      "Okay. Talk %.",
      "No problem. Talk %.",
      "Bye now.",
    ],
    inviteComing: ["Thanks. I’ll look out for it.", "Sure thing. I’ll keep an eye out for it."],
    inviteForCounter: ["For %, yes? Send it and I’ll be there.", "For %, then. Send it over."],
    offer: {
      caseStudy: [
        "A case study would help, yes. Something from a business like ours, ideally.",
        "Sure, send it. One from a company our size, if you have it.",
      ],
      passAlong: [
        "Yes, send it. If it’s one page I’ll pass it along.",
        "Sure. Keep it to a page and I’ll get it in front of the right people.",
      ],
      generic: [
        "Sure, send it over and I’ll take a look.",
        "Fine. Keep it short and I’ll read it.",
      ],
    },
    favour: ["Sure, I can send that over.", "I can do that. Give me a day or two."],
    opener: [
      "Okay%. And why are you calling us, specifically?",
      "Alright%. What made you reach out to me?",
      "Hi%. What’s this about?",
    ],
    openerUnnamed: [
      "Okay. What does that mean for us, exactly?",
      "Right. And what does that look like in practice?",
      "Okay. And who’s this for, exactly?",
    ],
    target: [],
    motivation: [],
    topic: ["Sure. What about it?", "Okay. What do you want to know?"],
    busy: ["I am, a bit. What’s this about?", "Always. Go ahead, but quickly."],
    vague: [
      "Sorry, I’m not following. What is it you actually do?",
      "Okay, but what does that mean for us, exactly?",
    ],
    clarify: ["Sorry, say that again?", "Sorry, I missed that. Once more?"],
    short: BUYER_SHORT,
    stages: BUYER_STAGES,
    job: NO_JOB,
    relationship: [],
    aboutTarget: NO_TARGET,
    colleague,
    possessive: "my",
  };
}

export const VOICES: Record<Trade, Lines> = {
  logistics: buyer("my dispatch lead", {
    process: [
      "Spreadsheets and a lot of phone calls. When a driver calls in sick, someone rebuilds the routes by hand.",
      "One of our dispatchers does it first thing every morning, mostly from a spreadsheet and the carrier sites.",
    ],
    tools: [
      "A routing add-on that came with our fleet software. It mostly works, until someone calls in sick.",
      "Spreadsheets, honestly, and the carrier portals. We looked at proper software once and it was too much.",
    ],
    quantity: {
      count: [
        "Three or four reroutes a day, and each one eats twenty minutes.",
        "About forty drivers, and a dozen of them get rerouted on a bad morning.",
      ],
      duration: [
        "Probably two hours every morning, and longer on Mondays.",
        "Twenty minutes a reroute when it goes smoothly. Longer when it doesn’t.",
      ],
      frequency: ["Three or four times a day.", "Most days. Mondays are the worst for it."],
    },
    timing: [
      "Most drivers are out by 6:30. The first reroutes come in around 7.",
      "Dispatch starts at 5:30, and the phones are going by 6.",
    ],
    problemCost: [
      "A missed delivery window can cost us the customer. Day to day, it’s a few hundred dollars in overtime.",
      "Overtime, mostly. Call it $400 on a bad day, and we have a couple of those a week.",
    ],
    quality: [
      "It does the job most days. When two drivers call out, it falls apart and we’re back on the phones.",
      "Fine, until something changes after 6am. Then it’s spreadsheets again.",
    ],
    yesNo: [
      "Mostly, yes. Mornings are when it bites.",
      "Not really, no. Nobody’s had the time to set that up.",
      "Usually, yes. It slips when we’re short-staffed.",
    ],
    busiest: [
      "Mondays, easily. Everyone’s back and half the routes change.",
      "Mondays and the day after a holiday. Those are rough.",
    ],
    detail: {
      pain: [
        "Honestly, it’s the reroutes. Mornings are the worst for it.",
        "The sick calls, mostly. Everything else we can plan around.",
      ],
      wish: [
        "I’d want the reroutes to take minutes, not a morning.",
        "One thing? The drivers finding out about changes without a phone call.",
      ],
      more: [
        "Well, take a Monday. Two drivers call out, and one dispatcher spends the morning on the phone redoing routes.",
        "Say a driver calls in at 6. Someone pulls up the spreadsheet, moves stops around by hand, and rings the other drivers.",
      ],
      impact: [
        "Fewer phone calls and a calmer morning. Real money too, in overtime.",
        "A couple of hours back every morning, and fewer missed windows.",
      ],
      anythingElse: [
        "Only that Mondays are the worst for it, and I’m out the last week of the month.",
        "One more thing: whatever we use has to work on a driver’s phone.",
      ],
      tried: [
        "We looked at proper software once and it was too much. The add-on came with the fleet system.",
        "Not really. We tweaked the spreadsheet a few times and left it.",
      ],
      picked: [
        "It came with the fleet software, honestly. Nobody picked it.",
        "Price, and it was already there. Not a careful decision.",
      ],
    },
  }),
  clinic: buyer("our practice manager", {
    process: [
      "The front desk phones patients the day before. If nobody picks up, we just hope they show.",
      "It’s mostly the front desk and a shared calendar. Every clinic does it a little differently.",
    ],
    tools: [
      "The reminder feature in our booking system. Half the patients ignore the texts.",
      "Our practice software sends reminders, but nobody trusts it, so the front desk calls anyway.",
    ],
    quantity: {
      count: [
        "Maybe five or six no-shows a week per clinic.",
        "Across the group, thirty-odd a week. More in winter.",
      ],
      duration: [
        "The front desk spends about an hour a day on it.",
        "Ten minutes a call, and a lot of calls.",
      ],
      frequency: ["Daily, honestly. Fridays are the worst for it.", "Every day. Some days twice."],
    },
    timing: [
      "First patients are at 7:30, so the front desk is in by 7.",
      "Reminder calls go out after lunch, when it’s quieter.",
    ],
    problemCost: [
      "An empty chair is about $200 an hour for us, so one bad afternoon adds up fast.",
      "Each no-show is maybe $150 we don’t get back, and the staff are paid either way.",
    ],
    quality: [
      "It sends the texts. Whether anyone reads them is another story.",
      "Okay, I suppose. No-shows haven’t really moved since we turned it on.",
    ],
    yesNo: [
      "Mostly, yes. It slips when the desk is busy.",
      "Not really, no. Nobody’s had the time.",
      "Usually, yes. Fridays are the exception.",
    ],
    busiest: [
      "Mondays and Fridays. Fridays are the worst for no-shows.",
      "Monday mornings, easily. Everyone wants to move their appointment.",
    ],
    detail: {
      pain: [
        "Honestly, it’s the no-shows. Fridays are the worst for it.",
        "The phone calls, mostly. The front desk never gets through the list.",
      ],
      wish: [
        "I’d want the reminders to actually reach people.",
        "One thing? Knowing by lunchtime who isn’t coming tomorrow.",
      ],
      more: [
        "Well, take a Friday afternoon. Three patients don’t show, the chairs sit empty, and the staff are paid either way.",
        "Say someone cancels at 7am. The front desk tries the waitlist by phone, and most of the time the slot stays empty.",
      ],
      impact: [
        "Fewer empty chairs, and the front desk gets its afternoons back. Real money, too.",
        "A calmer front desk and a fuller schedule. I’d take that.",
      ],
      anythingElse: [
        "Only that each clinic does it a bit differently, and the practice manager will have opinions.",
        "One more thing: whatever we use has to work for an older patient on a basic phone.",
      ],
      tried: [
        "We turned on the reminder feature in the booking system. It didn’t move the numbers.",
        "Not much. We tried calling two days ahead instead of one, and it made no difference.",
      ],
      picked: [
        "It came with the booking system. Nobody chose it, exactly.",
        "Price, and the practice manager liked the calendar. That was about it.",
      ],
    },
  }),
  retail: buyer("our head of operations", {
    process: [
      "Our support team answers delivery questions by email, and orders live in a shared spreadsheet.",
      "Honestly, it’s a few people, a spreadsheet and a lot of copying between tabs.",
    ],
    tools: [
      "Our store platform, plus a help desk inbox and a lot of spreadsheets.",
      "The shipping plugin that came with the shop. It does the basics.",
    ],
    quantity: {
      count: [
        "A few hundred orders a week, and maybe one in twenty goes sideways.",
        "Twenty or so late ones a week. More in a sale week.",
      ],
      duration: ["Two people spend most of Monday on it.", "An hour or two a day, between them."],
      frequency: ["Every week. Sale weeks are the worst.", "Daily, in a bad week."],
    },
    timing: [
      "Orders cut off at 2pm and go out by 5.",
      "Mornings are emails about yesterday’s deliveries.",
    ],
    problemCost: [
      "Every late order is a refund or a discount, so maybe $40 a time, plus the review.",
      "Hard to say exactly. A few thousand a month once you count refunds.",
    ],
    quality: [
      "It does the basics. Anything unusual and someone has to step in.",
      "Fine for normal weeks. Sale weeks, not so much.",
    ],
    yesNo: [
      "Mostly, yes. Sale weeks are the exception.",
      "Not really, no. Nobody’s had the time to set that up.",
      "Usually, yes. It slips when the orders pile up.",
    ],
    busiest: ["Sale weeks, without question.", "Mondays, with the weekend’s orders."],
    detail: {
      pain: [
        "The late orders, honestly. Every one turns into an email and a refund.",
        "Sale weeks. Everything that’s slightly broken breaks properly.",
      ],
      wish: [
        "I’d want to know an order is late before the customer does.",
        "One thing? Fewer emails that start with ‘where is my order’.",
      ],
      more: [
        "Well, take a sale week. A few hundred orders go out, twenty run late, and support spends two days writing apologies.",
        "Say a courier misses a pickup. We find out when the customer emails, and by then it’s a refund.",
      ],
      impact: [
        "Fewer refunds and a support team that isn’t apologising all day. Real money, too.",
        "Better reviews, mostly. The refunds hurt, but the one-star reviews hurt more.",
      ],
      anythingElse: [
        "Only that sale weeks are the real test, and the next one’s in a month.",
        "One more thing: finance signs off anything over a few hundred a month.",
      ],
      tried: [
        "We tried a different courier last year. Same problems, different logo.",
        "Not much. We added a tracking page, and people still email.",
      ],
      picked: [
        "It came with the shop platform. We never really chose it.",
        "Price, honestly. It was the cheap option when we were small.",
      ],
    },
  }),
  stores: buyer("the owner", {
    process: [
      "Each store manager does it their own way. Some use a notebook, some use the till system.",
      "It’s paper at two stores and a spreadsheet at the others. We’ve talked about fixing it for years.",
    ],
    tools: [
      "The till system at four stores and paper at the other two.",
      "Whatever each manager likes. That’s the problem, really.",
    ],
    quantity: {
      count: [
        "Six stores, and each manager does it their own way.",
        "A dozen stock-outs a week across the stores, give or take.",
      ],
      duration: [
        "Each manager loses half a day a week to it, give or take.",
        "Across six stores? Probably ten hours a week.",
      ],
      frequency: ["Weekly, mostly on Mondays.", "Every Saturday, somewhere."],
    },
    timing: [
      "Stores open at 8, and deliveries land before that.",
      "Managers do the orders Monday mornings, mostly.",
    ],
    problemCost: [
      "A stock-out on a Saturday probably costs a store $1,000 in sales.",
      "Mostly people’s time. Half a day a week, per store, at $25 an hour.",
    ],
    quality: [
      "Depends on the manager. Two stores run tight, the rest don’t.",
      "It works because people work around it.",
    ],
    yesNo: [
      "Mostly, yes. It depends on the store.",
      "Not really, no. Nobody’s had the time.",
      "In theory, yes. In practice it depends on the manager.",
    ],
    busiest: ["Saturdays, easily.", "Spring. Everyone starts a project at once."],
    detail: {
      pain: [
        "Stock-outs, mostly. Saturdays are the worst for it.",
        "Honestly, it’s that every store does it differently.",
      ],
      wish: [
        "I’d want one way of doing it across all six stores.",
        "One thing? Knowing what’s on the shelves without driving over.",
      ],
      more: [
        "Well, take a Saturday. A store runs out of something basic, the manager finds out from a customer, and the sale walks out.",
        "Say a delivery lands short. One manager writes it in a notebook, another emails, and the third forgets.",
      ],
      impact: [
        "Fewer empty shelves on a Saturday. That’s real money for us.",
        "Managers on the floor instead of in the back office. I’d take that.",
      ],
      anythingElse: [
        "Only that the owner will want to see it in one store before anywhere else.",
        "One more thing: two of our managers aren’t keen on screens.",
      ],
      tried: [
        "We tried a shared spreadsheet. Two stores kept it up, the rest didn’t.",
        "Not really. We’ve talked about it for years and never got round to it.",
      ],
      picked: [
        "The till system came with the tills. Nobody picked it for this.",
        "Habit, mostly. Each manager kept whatever they started with.",
      ],
    },
  }),
  other: buyer("my manager", {
    process: [
      "Honestly, it’s a mix of spreadsheets and email, and it depends who’s in that day.",
      "We have a process, mostly. It lives in a couple of people’s heads.",
    ],
    tools: [
      "A tool we bought a few years ago. It mostly works.",
      "Mostly spreadsheets and email, if I’m honest.",
    ],
    quantity: {
      count: ["Six or seven people touch it, give or take.", "A handful a week. Enough to notice."],
      duration: [
        "Six or seven hours a week across the team, give or take.",
        "More than I’d like. Call it a day a week.",
      ],
      frequency: ["Most weeks.", "Weekly, roughly. Monthly when we’re lucky."],
    },
    timing: [
      "Most of it happens first thing in the morning.",
      "Usually Mondays, when the week is planned.",
    ],
    problemCost: [
      "Hard to put a number on it. A few thousand a month, if I’m honest.",
      "More than it should. Probably a person’s whole Friday, every week.",
    ],
    quality: ["Well enough that nobody’s complained loudly.", "It does the job, mostly."],
    yesNo: ["Mostly, yes. It depends on the week.", "Not really, no. Nobody’s had the time."],
    busiest: ["Mondays, usually.", "End of the month, when everything’s due."],
    detail: {
      pain: [
        "Honestly, it’s the manual work. Mondays are the worst for it.",
        "Time, mostly. Nobody has spare hours for it.",
      ],
      wish: [
        "I’d want it to run without someone babysitting it.",
        "One thing? Fewer spreadsheets.",
      ],
      more: [
        "Well, take a Monday. The week gets planned by hand, something changes by Tuesday, and we redo it.",
        "Say someone’s off sick. Whatever lived in their head is gone for the day.",
      ],
      impact: [
        "A day a week back, roughly. And fewer things falling through the cracks.",
        "Less firefighting. That alone would be worth something.",
      ],
      anythingElse: [
        "Only that my manager will want a say before anything changes.",
        "One more thing: we’re short-staffed until the end of the quarter.",
      ],
      tried: [
        "We bought a tool a few years ago. It mostly works, so nobody’s touched it since.",
        "Not really. It’s been on the list for a while.",
      ],
      picked: [
        "Price, mostly, and it was there when I started.",
        "Someone before me chose it. It mostly works, so it stayed.",
      ],
    },
  }),
  hiring: {
    process: [
      "Mornings are outreach, afternoons are calls. Once someone’s ramped, they book about eight meetings a week.",
      "It’s a lot of research and short emails, then first calls with the people who answer. Fridays we review the pipeline together.",
    ],
    tools: [
      "A CRM, a sequencing tool and a lot of LinkedIn. We’d train you on all of it.",
      "Our CRM and a dialer. Nothing you can’t learn in a week.",
    ],
    quantity: {
      count: [
        "The team books around thirty meetings a week between five of them.",
        "We hire two or three SDRs a year.",
      ],
      duration: [
        "Ramp takes about three months.",
        "About an hour a day on the phone, once you’re ramped.",
      ],
      frequency: ["Weekly call reviews, and daily check-ins in the first month.", "Every Friday."],
    },
    timing: [
      "Most of the team is in by 8:30, and calls start around 9.",
      "Mornings are for outreach, so we keep meetings to the afternoon.",
    ],
    problemCost: [
      "A bad hire costs us a quarter, honestly. That’s why I ask so many questions.",
      "Mostly time. Every seat that sits empty is meetings we don’t book.",
    ],
    cost: [
      "The range is in the posting. Most people start near the middle of it.",
      "It’s base plus commission, and the posting has the numbers.",
    ],
    quality: [
      "Pretty well. Most of our reps get promoted within two years.",
      "It works for people who like hearing no and trying again.",
    ],
    yesNo: [
      "Mostly, yes. It depends on the quarter.",
      "Not really, no. Not for a first sales role.",
      "Usually, yes. The first month is the exception.",
    ],
    busiest: [
      "The first month, honestly. After that it gets easier.",
      "End of quarter. Everyone’s chasing the last few meetings.",
    ],
    staff: [
      "Our team lead, most days. She sits with the new reps.",
      "Whoever’s ramping sits with the team lead.",
    ],
    owner: [
      "Our team lead runs the SDRs day to day. You’d sit next to her for the first month.",
      "Our team lead does. She was an SDR here three years ago.",
    ],
    decision: [
      "You’d meet our team lead and one of the account executives, then me again.",
      "Our team lead has a say, and so does one of the account executives you’d support.",
    ],
    conditions: [
      "Show me you can take a no and keep going. A real example would do it.",
      "Some sign you’ve done the work before you applied. Most people haven’t.",
    ],
    smallStart: [
      "We don’t really do trial runs, but a short project in the interview is normal.",
      "That’s not how we hire, but I like that you asked.",
    ],
    hypothetical: [
      "It would help. Show me, though, rather than tell me.",
      "It would, yes. A half-day with the team is how we’d do it anyway.",
    ],
    detail: {
      pain: [
        "Honestly, it’s finding people who keep going after a no.",
        "Ramp time, mostly. The first three months decide it.",
      ],
      wish: [
        "I’d want every new rep to do the research before they dial.",
        "One thing? Fewer people who want sales until they hear their first no.",
      ],
      more: [
        "Well, take a new rep’s first month. Lots of research, lots of short emails, and the first few calls that go nowhere.",
        "Say it’s a Friday. We sit down together, listen to a few calls, and talk about what we’d do differently.",
      ],
      impact: [
        "A rep who ramps a month early is worth a lot of meetings to us.",
        "Fewer empty seats, mostly. Every one is meetings we don’t book.",
      ],
      anythingElse: [
        "Only that we move fast. If we like you, you’d hear within the week.",
        "One more thing: the first month is mostly listening to calls.",
      ],
      tried: [
        "We’ve hired people with no sales background before. It worked when they’d done the research.",
        "We tried hiring only experienced reps for a year. They were quicker, but they left sooner.",
      ],
      picked: [],
      why: [
        "Honestly, because ramp is where it goes wrong. The first three months decide it.",
        "Mostly because the job is hearing no. Not everyone wants that.",
      ],
      priorities: [
        "Meetings that turn into pipeline. That’s what the account executives care about.",
        "Numbers, and whether the AEs trust what you book.",
      ],
      quarter: [
        "End of the month. Hiring slows for a couple of weeks after that.",
        "Three weeks. We’d want someone starting the quarter after.",
      ],
      howBusy: [
        "Busy, mostly. The end of the quarter is the crunch.",
        "Afternoons are calls, so fairly. Mornings are quieter.",
      ],
      checkBack: [
        "That’s it, yes. And whether you can take a no.",
        "Pretty much. Add the research before the call and you’ve got it.",
      ],
      behind: [
        "It’s not personal. New reps without quota experience take longer to ramp, and I’m short on time to coach.",
        "Mostly ramp time. Tell me why you’d be quicker.",
      ],
      enjoy: [
        "The people, honestly. And watching someone book their first meeting.",
        "Watching a new rep get good. That never gets old.",
      ],
      worries: [],
      story: [
        "By accident. I took a summer job on a phone team and never left.",
        "I started as an SDR, same as this role. Ten years ago now.",
      ],
      graduates: [
        "A couple a year, when they show they’ve done the work.",
        "A few, yes. The ones who do their homework before the first call tend to stay.",
      ],
      nextStep: [
        "You’d meet our team lead, then one of the account executives, then me again.",
        "A call with our team lead, then a short project you’d present back to us.",
      ],
      wants: [],
      trend: [
        "Better, slowly. The team’s more experienced than it was a year ago.",
        "Busier. We’ve doubled the pipeline and kept the same number of reps.",
      ],
      coaching: [
        "A lot in week one. You’d sit with the team lead and listen to calls before you make any.",
        "Daily for the first month, then a weekly call review with the team.",
      ],
      opinion: [
        "Honestly? You ask better questions than most. I’d still want to see you take a no.",
        "Too early to say. Tell me about a time something didn’t go your way.",
      ],
    },
    acknowledge: [
      "Fair enough. So what would you do in your first month here?",
      "I appreciate that. Tell me about a time you had to learn something fast.",
    ],
    proof: ["That’s a real number. Who else can speak to it?", "Good. How did you get there?"],
    doubt: [
      "Okay. What makes you want sales rather than something safer?",
      "Why this team, though, and not somewhere bigger?",
    ],
    availability: [
      "I keep Thursday afternoons for interviews. Does that suit you?",
      "Next week is busy, but I can find thirty minutes on Thursday.",
    ],
    openProposal: ["Probably. What day were you thinking?", "I can find time. When works for you?"],
    trial: [
      "We don’t do trials, but a short project in the interview is normal. When would suit you?",
    ],
    confirmNothing: [
      "Depends what you’re proposing. When were you thinking?",
      "Maybe. What exactly did you have in mind?",
    ],
    inviteGuest: ["Yes, add our team lead.", "Please do. She’ll want to be there."],
    smallTalk: {
      time: ["I’ve got about twenty minutes%. Go ahead.", "Yes, now’s fine. Go ahead."],
      weekend: ["Good, thanks. Mostly offline. So, what did you want to talk about?"],
      weather: ["It’s been a lot, yes. Anyway, tell me about yourself."],
      game: ["I only caught the end. So, what’s on your mind?"],
      general: [
        "Good, thanks. Busy hiring season. What’s on your mind?",
        "Not bad at all. Thanks for asking. So, what brings you here?",
      ],
    },
    greeting: [
      "Hi there. Go ahead, tell me about yourself.",
      "Hello. What did you want to talk about?",
    ],
    nameCheck: ["Speaking. Who’s this?", "It is. Go ahead."],
    wrongName: ["It’s % here, actually. Who were you looking for?"],
    openingThanks: [
      "Happy to chat. What’s your background?",
      "Sure. Tell me a bit about yourself.",
    ],
    thanksMidCall: ["Sure. What else did you want to ask?", "Of course. What’s next?"],
    thanks: ["Thanks for reaching out. Talk soon.", "Of course. Good luck, and talk soon."],
    goodbye: ["Thanks for reaching out. Talk %.", "Good luck, and talk %.", "Bye for now."],
    inviteComing: ["Great. I’ll look out for the invite.", "Thanks. I’ll keep an eye out for it."],
    inviteForCounter: ["For %, yes? Send it and I’ll be there."],
    offer: {
      caseStudy: ["Sure, send it over. I’ll read it before we talk again."],
      passAlong: ["That would help. Send it and I’ll pass it to our team lead."],
      generic: [
        "Sure, send it over. I’ll read it before we talk again.",
        "That would help. Send it and I’ll pass it to our team lead.",
      ],
    },
    favour: ["Sure. Send me the details and I’ll see what I can do."],
    opener: ["Nice to meet you%. What drew you to sales?", "Good to meet you%. Why this role?"],
    openerUnnamed: [
      "Okay. Tell me a bit more about yourself.",
      "Right. And what’s your background?",
    ],
    target: [
      "Okay. Why sales development, and why here?",
      "Good. What makes you think you’d be good at it?",
    ],
    motivation: [
      "That’s a better answer than most. What kind of conversations?",
      "Fair. Most people say the money. Tell me about a conversation that went well.",
    ],
    topic: ["Sure. What about it?", "Go ahead, ask."],
    busy: ["A bit, yes. Go ahead.", "Always. Tell me what’s on your mind."],
    vague: [
      "Everyone says that. Give me an example.",
      "Okay, but what does that look like in practice?",
    ],
    clarify: ["Sorry, say that again?", "I missed that. Once more?"],
    short: {
      opening: [
        "Sure. Tell me a bit about yourself.",
        "Go ahead. What did you want to talk about?",
      ],
      discovery: [
        "Okay. What else did you want to ask?",
        "Right. What’s your question?",
        "Sure. Where were we?",
      ],
      pitch: ["Okay. So why this role, in a sentence?", "Right. What would you bring on day one?"],
      objection: ["Okay. I’m still weighing it, though.", "Right. So how would you answer that?"],
      close: [
        "Okay. What would you like to happen next?",
        "Alright. What’s the best next step from your side?",
      ],
    },
    stages: {
      opening: ["Sure. Tell me a bit about yourself.", "Happy to chat. What’s your background?"],
      discovery: [
        "Everyone says that. Give me an example.",
        "That’s a start. What’s a time it actually paid off?",
        "What do you know about what we do here?",
      ],
      pitch: ["So why this role, and why now?", "What would you bring to the team on day one?"],
      objection: [
        "What would you say to someone who worries you’re too new to this?",
        "How would you handle hearing no forty times a day?",
      ],
      close: [
        "What would you like to happen next?",
        "This was useful. What’s the best next step from your side?",
      ],
    },
    job: {
      mix: [
        "More phone than people expect. Mornings are calls, afternoons are email and research.",
        "About half and half, honestly. The calls are where the meetings come from.",
        "Mostly outbound. A few inbound leads get shared around, but you’d earn your meetings.",
      ],
      best: [
        "They prepare. The best ones know who they’re calling and why before they dial, and they don’t take a no personally.",
        "Curiosity. The best ones ask the prospect real questions instead of reading a script.",
      ],
      fit: [
        "Someone who does the research before the call and keeps going after a no.",
        "Coachable, curious, and not precious about hearing no.",
      ],
      success: [
        "Eight to ten booked meetings a month once you’re ramped, and a pipeline the account executives trust.",
        "Hitting ramp by month three and booking meetings the AEs actually want.",
      ],
      team: [
        "Small team, lots of feedback. We review calls together every Friday.",
        "Tight-knit. Everyone hears everyone’s calls, which is how people get better fast.",
      ],
      size: [
        "Five SDRs, two account executives, and me. Everyone hears everyone’s calls.",
        "Small. Five reps and a team lead, which is why I’m careful who joins.",
      ],
      timeline: [
        "I’d like someone starting by the end of next month. We move quickly for the right person.",
        "Soon. Two openings now, and I’d rather fill them before the quarter ends.",
      ],
      challenge: [
        "Hearing no forty times a day and dialling again. The ones who last don’t take it personally.",
        "Doing the research before the call. New reps want to dial first and read later.",
      ],
    },
    relationship: [],
    aboutTarget: NO_TARGET,
    colleague: "our team lead",
    possessive: "our",
  },
  contact: {
    process: [
      "Honestly, I’m not sure how they hire these days. It’s been a while since I talked shop with them.",
      "Last I heard they hire through referrals first, then the job board.",
    ],
    tools: [
      "Email, mostly. They’re not big on LinkedIn messages.",
      "I’d just forward your note with a line from me.",
    ],
    quantity: {
      count: ["A team of six or seven, last I heard.", "Two or three roles, I think."],
      duration: [
        "We worked together for two years before they moved.",
        "About five years, on and off.",
      ],
      frequency: ["A couple of times a year.", "Now and then. Less than I’d like."],
    },
    timing: [
      "They’re usually quickest to answer first thing in the morning.",
      "Mornings, usually.",
    ],
    problemCost: [
      "It doesn’t cost me anything, but I do care what my name gets attached to.",
      "Nothing really. I just want it to go well for both of you.",
    ],
    cost: [
      "Ha, nothing. I’m happy to help if it’s a good fit.",
      "You don’t owe me anything. Buy me a coffee if it works out.",
    ],
    quality: [
      "Pretty well. We worked together for two years, and we still grab coffee a couple of times a year.",
      "Well enough to send an email. We haven’t talked in a few months, though.",
    ],
    yesNo: ["I think so, yes. I can check.", "Not that I know of, no. I can ask."],
    busiest: ["Hard to say. Probably end of quarter.", "No idea, honestly. I’d guess Mondays."],
    staff: [
      "I’m not sure who’s on their team now. I can ask.",
      "No idea, honestly. Jess would know.",
    ],
    owner: [
      "Their sales director, last I heard. I can double-check.",
      "The head of sales runs hiring, I think. Jess would know for sure.",
    ],
    decision: [
      "That’d be their sales director, I think. I can ask.",
      "Probably the head of sales. I know them a little.",
    ],
    conditions: [
      "Just a clear note about what you want, so I’m not guessing.",
      "A couple of lines I can forward without rewriting. That’s all.",
    ],
    smallStart: [
      "Sure, keep it small. A short intro email is easy for me.",
      "That works. One email first, and we’ll see how she replies.",
    ],
    hypothetical: [
      "It would, yes. Send me the note and I’ll do my bit.",
      "Sure, that would make it easy.",
    ],
    detail: {
      pain: [
        "Honestly, I just want to put you in front of the right person.",
        "Mostly whether I know your work well enough to say so.",
      ],
      wish: [
        "I’d want a note I can forward without rewriting it.",
        "Honestly? A clear ask. That’s it.",
      ],
      more: [
        "Well, last time I made an intro the person never followed up, and I looked silly.",
        "Say I send a note. If it’s vague, it sits in their inbox. If it’s two clear lines, they answer.",
      ],
      impact: ["It would make it easy for me to say yes.", "It’d mean I can send it today."],
      anythingElse: [
        "Only that they reply faster to short emails. Keep it to a few lines.",
        "One more thing: mention where we worked together. That’ll help.",
      ],
      tried: [
        "I’ve introduced a couple of people before. It worked when they followed up.",
        "Not for a while, honestly.",
      ],
      picked: [],
      why: [
        "Honestly, because my name’s on it.",
        "Mostly because I haven’t talked to them in a while.",
      ],
      priorities: [
        "Someone who’ll actually show up prepared. That’s what they’d care about.",
        "Numbers, probably, and whether you’ll stick around.",
      ],
      quarter: ["No idea, honestly. End of the month, I’d guess.", "I’d have to ask."],
      howBusy: [
        "Hard to say. Probably busy, it’s that time of year.",
        "I’d guess fairly. Sales teams always are.",
      ],
      checkBack: [
        "That’s it, yes. A short intro, and you take it from there.",
        "Pretty much. Give me two lines and I’ll send it.",
      ],
      behind: [
        "I just don’t want to send a note I can’t stand behind.",
        "It’s my name on the email. That’s all.",
      ],
      enjoy: [],
      worries: [],
      story: [],
      graduates: [],
      nextStep: [],
      wants: [
        "Numbers, probably. Anything you’ve sold or run, with a result next to it.",
        "Something short and specific. What you did, and what came of it.",
      ],
      trend: ["Hard to say from where I sit. Busier, I’d guess."],
      coaching: [
        "They’re good about that, from what I hear. New reps sit with someone for a month.",
      ],
      opinion: [
        "Honestly? Go for it. Just make the note easy for me to forward.",
        "I think you’d be good at it. Send me the two lines.",
      ],
    },
    acknowledge: [
      "That’s fair. What exactly would you want me to say about you?",
      "Okay. Could you send me a few lines I can forward?",
    ],
    proof: [
      "That’s a good line to put in the note.",
      "Nice. Put that in the draft and I’ll send it.",
    ],
    doubt: [
      "I want to help, I just need to know what I’m vouching for.",
      "Remind me what you worked on when we overlapped?",
    ],
    availability: [
      "Next week’s fine. Send me something I can forward and I’ll do it then.",
      "I could do it Thursday. Send me the draft before then.",
    ],
    openProposal: ["Sure. When were you thinking?", "Happy to. What day works for you?"],
    trial: ["Sure. When were you thinking?"],
    confirmNothing: ["Depends what you mean. What are you asking me to do, exactly?"],
    inviteGuest: ["Sure, add them.", "Yes, go ahead."],
    smallTalk: {
      time: ["For you, sure. What’s up?", "A few minutes, yes. What’s going on?"],
      weekend: ["Good, lazy one. How about you?", "Quiet, which I needed. What’s new with you?"],
      weather: ["Tell me about it. What’s going on with you?"],
      game: ["I did, what a finish. Anyway, what’s up?"],
      general: [
        "Good. Busy, but good. How about you, what’s new?",
        "It really has been a while. All good here. What’s up with you?",
      ],
    },
    greeting: ["Hey. What’s up?", "Hi. Good to hear from you. What’s going on?"],
    nameCheck: ["It’s me. What’s up?", "Yep. What’s going on?"],
    wrongName: ["Nope, it’s %. Who did you mean to call?"],
    openingThanks: ["Of course. What’s going on?", "Anytime. What’s up?"],
    thanksMidCall: ["Of course. What else?", "Sure. What else do you need?"],
    thanks: ["Of course. Happy to help. Keep me posted.", "Anytime. Let me know how it goes."],
    goodbye: [
      "Anytime. Talk %.",
      "Of course. Keep me posted.",
      "Bye for now. Let me know how it goes.",
    ],
    inviteComing: ["Sounds good. I’ll look out for it."],
    inviteForCounter: ["For %, yes? Sounds good."],
    offer: {
      caseStudy: ["That would help a lot. Keep it to a few lines and I’ll send it on."],
      passAlong: ["Perfect, that makes it easy. Send it over."],
      generic: [
        "That would help a lot. Keep it to a few lines and I’ll send it on.",
        "Perfect, that makes it easy. Send it over.",
      ],
    },
    favour: [
      "Sure. Send me the draft and I’ll forward it this week.",
      "Happy to. Send me a couple of lines first.",
    ],
    opener: [
      "Good to hear from you%. What’s going on?",
      "Hey%, nice to hear from you. What can I do for you?",
    ],
    openerUnnamed: [
      "Okay. And what are you hoping I can do?",
      "Right. So what do you need from me?",
    ],
    target: [
      "Oh nice. And you’d like me to put in a word?",
      "Good for you. What are you hoping I can do?",
    ],
    motivation: [],
    topic: ["Sure. What about it?", "Okay, go on. What’s the question?"],
    busy: ["A bit, but go ahead.", "Always. What’s up?"],
    vague: [
      "Let’s keep it simple, then: two lines about you and what you want from her.",
      "Okay. What would make this easiest for you?",
    ],
    clarify: ["Sorry, say that again?", "Missed that. Once more?"],
    short: {
      opening: ["Hey. What’s up?", "Okay. What’s going on?"],
      discovery: ["Okay. What do you need from me?", "Sure. Who are you trying to reach?"],
      pitch: [
        "Okay. What would you want me to say about you?",
        "Right. What makes you a fit for them?",
      ],
      objection: [
        "Okay. I just want to be sure I can vouch for you.",
        "Right. Remind me what you worked on with us?",
      ],
      close: [
        "Okay. Send me a few lines and I’ll do it.",
        "Sure. What do you need from me, and by when?",
      ],
    },
    stages: {
      opening: [
        "Good to hear from you. What’s going on?",
        "Hey, it’s been a while. What can I do for you?",
      ],
      discovery: ["So what are you hoping I can do?", "Who are you trying to reach, exactly?"],
      pitch: [
        "Okay, and what would you want me to say about you?",
        "What makes you a good fit for them?",
      ],
      objection: [
        "I’d want to be sure I can actually vouch for you.",
        "I don’t want to push it if it isn’t a fit.",
      ],
      close: [
        "Send me a few lines I can forward and I’ll see what I can do.",
        "Okay. What do you need from me, and by when?",
      ],
    },
    job: NO_JOB,
    relationship: [
      "Now and then. We grabbed lunch in the spring.",
      "Well enough to send an email. We haven’t talked in a few months, though.",
      "Pretty well. We worked together for two years, and we still grab coffee a couple of times a year.",
    ],
    aboutTarget: {
      hiring: [
        "Still hiring, as far as I know. They were adding a couple of reps last I heard.",
        "I think so. Last I heard there were two or three openings on that team.",
      ],
      there: [
        "Still there, last I checked. Same team, I think.",
        "As far as I know, yes. We spoke a few months back and nothing had changed.",
      ],
      rightPerson: [
        "That’s the right person, yes. Hiring on that team runs through them.",
        "I’d start there, yes. They make the call on who joins.",
      ],
      replies: [
        "Usually, if it’s short. Give it a week before you chase.",
        "To me, yes. Keep it to a few lines and you’ll hear back.",
      ],
      other: ["I think so, yes. I can check.", "Not that I know of, no. I can ask."],
    },
    colleague: "their sales director",
    possessive: "their",
  },
};
