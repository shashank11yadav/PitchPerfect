import type { Stage } from "@pitchperfect/shared";
import type { JobTopic, OfferTopic, SmallTalkTopic, Voice } from "./fake-intents.js";

/**
 * What each kind of person says, by kind of turn. A buyer's lines depend on their trade; a hiring
 * manager and a warm contact have their own. "%" in a line is where the student's name goes, as
 * ", Chris", when they gave one.
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
  quantity: readonly string[];
  /** "What time…" about their day. */
  timing: readonly string[];
  problemCost: readonly string[];
  cost: readonly string[];
  /** "How well does it work?" */
  quality: readonly string[];
  /** A yes-or-no question about how they work. */
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
  /** "What's behind that?" after an objection. */
  behind: readonly string[];
  /** A question the persona can't place. */
  unsure: readonly string[];
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
  /** The student names who's hiring (contact). */
  target: readonly string[];
  /** The student names a topic. */
  topic: readonly string[];
  busy: readonly string[];
  /** The student said something vague. */
  vague: readonly string[];
  /** A short "ok", "yeah", "sure": a neutral nudge for the stage. */
  short: Record<Stage, readonly string[]>;
  /** Nothing fit: a neutral line for the stage. */
  stages: Record<Stage, readonly string[]>;
  /** Hiring manager only: questions about the job. */
  job: Record<JobTopic, readonly string[]>;
  /** Contact only: how well they know the person. */
  relationship: readonly string[];
  /** Who they'd bring to a meeting, as "my dispatch lead". */
  colleague: string;
  /** "my" for a buyer, "our" for a hiring manager. */
  possessive: string;
}

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

type TradeLines = Pick<
  Lines,
  "process" | "tools" | "quantity" | "timing" | "problemCost" | "quality" | "yesNo" | "busiest"
>;

const BUYER_SHORT: Record<Stage, readonly string[]> = {
  opening: ["Okay. What can I do for you?", "Sorry, I missed that. What's the call about?"],
  discovery: [
    "Okay. What else did you want to know?",
    "Sure. What's your next question?",
    "Right. Where were we?",
    "Fair enough. What's your next question?",
  ],
  pitch: [
    "Okay. Keep it short, though. What's the main thing?",
    "Right. And what does it cost me?",
    "Alright. What's the pitch, in a sentence?",
  ],
  objection: [
    "I hear you. I'm just not convinced yet.",
    "Maybe. Give me a reason to believe it.",
    "Okay. So what do you say to that?",
  ],
  close: [
    "Okay. So what's the next step from your side?",
    "Sounds good. Send me the details.",
    "Okay. Let's see what you send over.",
  ],
};

const BUYER_STAGES: Record<Stage, readonly string[]> = {
  opening: [
    "Sorry, who did you say you were with, and why the call?",
    "Okay. Remind me who you are and why you reached out?",
    "Right. What's the call about?",
  ],
  discovery: [
    "Okay. What is it you want to know?",
    "Right. Where are you going with this?",
    "Sure. And what does that have to do with us?",
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

const NO_JOB: Record<JobTopic, readonly string[]> = {
  mix: [],
  best: [],
  fit: [],
  success: [],
  team: [],
  size: [],
};

function buyer(colleague: string, lines: TradeLines): Lines {
  const who = capitalized(colleague);
  return {
    ...lines,
    cost: [
      "Somewhere around $900 a month for what we use now. I'd have to check the last invoice.",
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
    behind: [
      "Honestly, it's time more than anything. Every change costs the team a few weeks.",
      "Honestly, we've been burned before. Tell me why this one's different.",
    ],
    unsure: [
      "Honestly, I'd have to think about that. What's behind the question?",
      "Not sure I follow. Ask me that another way?",
    ],
    acknowledge: [
      "I appreciate that. Do you have an example from a company like ours?",
      "Okay, that helps a little. Who else like us has done this, and how did it go?",
    ],
    proof: [
      "Okay, that's a real result. How long did it take them to get there?",
      "That's more like it. Could I talk to them?",
      "Which company was that? I'd want to talk to them.",
    ],
    doubt: [
      "Okay, but how do I know it'll work for a business like ours?",
      "I've heard that before. What makes this one different?",
    ],
    availability: [
      "Next week's fairly open. Tuesday or Thursday morning would work.",
      "Thursday's my best day. Mornings, ideally.",
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
      "Depends what you're proposing. When were you thinking?",
      "Maybe. What exactly are you suggesting, and when?",
    ],
    smallTalk: {
      time: [
        "I've got a few minutes%. Go ahead.",
        "A few minutes, yes. Go ahead.",
        "Only a few minutes%. What's this about?",
      ],
      weekend: [
        "Quiet, thanks. Over too fast. What's this about?",
        "It was good, thanks. Nothing big planned. What can I do for you?",
      ],
      weather: [
        "It's been something, hasn't it. Anyway, what can I do for you?",
        "Wild, yes. Half my team came in late. What's this about?",
      ],
      game: [
        "Only the highlights, honestly. Busy week. What's this about?",
        "I missed it. Heard it was close. What can I do for you?",
      ],
      general: [
        "Busy, but fine, thanks. What's this about?",
        "Not bad. Long week already. What can I do for you?",
      ],
    },
    greeting: [
      "Hi. Who am I speaking with?",
      "Hello. What can I do for you?",
      "Hi there. Who's this?",
    ],
    nameCheck: ["Speaking. Who's this?", "It is. What can I do for you?"],
    wrongName: ["No, this is %. Who were you after?", "It's % here. Who's this?"],
    openingThanks: ["Sure. What's this about?", "No problem. What can I do for you?"],
    thanksMidCall: ["Sure. What else did you want to ask?", "No problem. What's next?"],
    thanks: ["Sounds good. Talk then.", "Sure thing. I'll keep an eye out for it."],
    goodbye: ["Great, talk %.", "Sounds good. Bye for now.", "Okay. Talk %.", "Bye now."],
    inviteComing: ["Thanks. I'll look out for it.", "Sure thing. I'll keep an eye out for it."],
    inviteForCounter: ["For %, yes? Send it and I'll be there.", "For %, then. Send it over."],
    offer: {
      caseStudy: [
        "A case study would help, yes. Something from a business like ours, ideally.",
        "Sure, send it. One from a company our size, if you have it.",
      ],
      passAlong: [
        "Yes, send it. If it's one page I'll pass it along.",
        "Sure. Keep it to a page and I'll get it in front of the right people.",
      ],
      generic: [
        "Sure, send it over and I'll take a look.",
        "Fine. Keep it short and I'll read it.",
      ],
    },
    favour: ["Sure, I can send that over.", "I can do that. Give me a day or two."],
    opener: [
      "Okay%. And why are you calling us, specifically?",
      "Alright%. What made you reach out to me?",
      "Hi%. What's this about?",
    ],
    openerUnnamed: [
      "Okay. What does that mean for us, exactly?",
      "Right. And what does that look like in practice?",
      "Sorry, I'm not following. What is it you actually do?",
    ],
    target: [],
    topic: ["Sure. What about it?", "Okay. What do you want to know?"],
    busy: ["I am, a bit. What's this about?", "Always. Go ahead, but quickly."],
    vague: [
      "Sorry, I'm not following. What is it you actually do?",
      "Okay, but what does that mean for us, exactly?",
    ],
    short: BUYER_SHORT,
    stages: BUYER_STAGES,
    job: NO_JOB,
    relationship: [],
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
    yesNo: ["Mostly, yes. It depends on the week.", "Usually. Some weeks are different."],
    busiest: [
      "The first month, honestly. After that it gets easier.",
      "End of quarter. Everyone's chasing the last few meetings.",
    ],
    staff: [
      "Our team lead, most days. She sits with the new reps.",
      "Whoever's ramping sits with the team lead.",
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
    behind: [
      "It's not personal. New reps without quota experience take longer to ramp, and I'm short on time to coach.",
      "Mostly ramp time. Tell me why you'd be quicker.",
    ],
    unsure: [
      "Good question. I'd have to think about it. Why do you ask?",
      "Not sure I follow. Ask it another way?",
    ],
    acknowledge: [
      "Fair enough. So what would you do in your first month here?",
      "I appreciate that. Tell me about a time you had to learn something fast.",
    ],
    proof: ["That's a real number. Who else can speak to it?", "Good. How did you get there?"],
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
      "We don't do trials, but a short project in the interview is normal. When would suit you?",
    ],
    confirmNothing: [
      "Depends what you're proposing. When were you thinking?",
      "Maybe. What exactly did you have in mind?",
    ],
    smallTalk: {
      time: ["I've got about twenty minutes%. Go ahead.", "Yes, now's fine. Go ahead."],
      weekend: ["Good, thanks. Mostly offline. So, what did you want to talk about?"],
      weather: ["It's been a lot, yes. Anyway, tell me about yourself."],
      game: ["I only caught the end. So, what's on your mind?"],
      general: [
        "Good, thanks. Busy hiring season. What's on your mind?",
        "Not bad at all. Thanks for asking. So, what brings you here?",
      ],
    },
    greeting: [
      "Hi there. Go ahead, tell me about yourself.",
      "Hello. What did you want to talk about?",
    ],
    nameCheck: ["Speaking. Who's this?", "It is. Go ahead."],
    wrongName: ["It's % here, actually. Who were you looking for?"],
    openingThanks: [
      "Happy to chat. What's your background?",
      "Sure. Tell me a bit about yourself.",
    ],
    thanksMidCall: ["Sure. What else did you want to ask?", "Of course. What's next?"],
    thanks: ["Thanks for reaching out. Talk soon.", "Of course. Good luck, and talk soon."],
    goodbye: ["Thanks for reaching out. Talk %.", "Good luck, and talk %.", "Bye for now."],
    inviteComing: ["Great. I'll look out for the invite.", "Thanks. I'll keep an eye out for it."],
    inviteForCounter: ["For %, yes? Send it and I'll be there."],
    offer: {
      caseStudy: ["Sure, send it over. I'll read it before we talk again."],
      passAlong: ["That would help. Send it and I'll pass it to our team lead."],
      generic: [
        "Sure, send it over. I'll read it before we talk again.",
        "That would help. Send it and I'll pass it to our team lead.",
      ],
    },
    favour: ["Sure. Send me the details and I'll see what I can do."],
    opener: ["Nice to meet you%. What drew you to sales?", "Good to meet you%. Why this role?"],
    openerUnnamed: [
      "Okay. Tell me a bit more about yourself.",
      "Right. And what's your background?",
    ],
    target: [
      "Okay. Why sales development, and why here?",
      "Good. What makes you think you'd be good at it?",
    ],
    topic: ["Sure. What about it?", "Go ahead, ask."],
    busy: ["A bit, yes. Go ahead.", "Always. Tell me what's on your mind."],
    vague: [
      "Everyone says that. Give me an example.",
      "Okay, but what does that look like in practice?",
    ],
    short: {
      opening: [
        "Sure. Tell me a bit about yourself.",
        "Go ahead. What did you want to talk about?",
      ],
      discovery: [
        "Okay. What else did you want to ask?",
        "Right. What's your question?",
        "Sure. Where were we?",
      ],
      pitch: ["Okay. So why this role, in a sentence?", "Right. What would you bring on day one?"],
      objection: ["Okay. I'm still weighing it, though.", "Right. So how would you answer that?"],
      close: [
        "Okay. What would you like to happen next?",
        "Alright. What's the best next step from your side?",
      ],
    },
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
    job: {
      mix: [
        "More phone than people expect. Mornings are calls, afternoons are email and research.",
        "About half and half, honestly. The calls are where the meetings come from.",
      ],
      best: [
        "They prepare. The best ones know who they're calling and why before they dial, and they don't take a no personally.",
        "Curiosity. The best ones ask the prospect real questions instead of reading a script.",
      ],
      fit: [
        "Someone who does the research before the call and keeps going after a no.",
        "Coachable, curious, and not precious about hearing no.",
      ],
      success: [
        "Eight to ten booked meetings a month once you're ramped, and a pipeline the account executives trust.",
        "Hitting ramp by month three and booking meetings the AEs actually want.",
      ],
      team: [
        "Small team, lots of feedback. We review calls together every Friday.",
        "Tight-knit. Everyone hears everyone's calls, which is how people get better fast.",
      ],
      size: [
        "Five SDRs, two account executives, and me. Everyone hears everyone's calls.",
        "Small. Five reps and a team lead, which is why I'm careful who joins.",
      ],
    },
    relationship: [],
    colleague: "our team lead",
    possessive: "our",
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
    yesNo: ["I think so, yes. I can check.", "Not sure, honestly. I can ask."],
    busiest: ["Hard to say. Probably end of quarter.", "No idea, honestly. I'd guess Mondays."],
    staff: [
      "I'm not sure who's on their team now. I can ask.",
      "No idea, honestly. Jess would know.",
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
    behind: [
      "I just don't want to send a note I can't stand behind.",
      "It's my name on the email. That's all.",
    ],
    unsure: [
      "Hm, not sure. What do you mean exactly?",
      "I'd have to think about that. Why do you ask?",
    ],
    acknowledge: [
      "That's fair. What exactly would you want me to say about you?",
      "Okay. Could you send me a few lines I can forward?",
    ],
    proof: [
      "That's a good line to put in the note.",
      "Nice. Put that in the draft and I'll send it.",
    ],
    doubt: [
      "I want to help, I just need to know what I'm vouching for.",
      "Remind me what you worked on when we overlapped?",
    ],
    availability: [
      "Next week's fine. Send me something I can forward and I'll do it then.",
      "I could do it Thursday. Send me the draft before then.",
    ],
    openProposal: ["Sure. When were you thinking?", "Happy to. What day works for you?"],
    trial: ["Sure. When were you thinking?"],
    confirmNothing: ["Depends what you mean. What are you asking me to do, exactly?"],
    smallTalk: {
      time: ["For you, sure. What's up?", "A few minutes, yes. What's going on?"],
      weekend: ["Good, lazy one. How about you?", "Quiet, which I needed. What's new with you?"],
      weather: ["Tell me about it. What's going on with you?"],
      game: ["I did, what a finish. Anyway, what's up?"],
      general: [
        "Good. Busy, but good. How about you, what's new?",
        "It really has been a while. All good here. What's up with you?",
      ],
    },
    greeting: ["Hey. What's up?", "Hi. Good to hear from you. What's going on?"],
    nameCheck: ["It's me. What's up?", "Yep. What's going on?"],
    wrongName: ["Nope, it's %. Who did you mean to call?"],
    openingThanks: ["Of course. What's going on?", "Anytime. What's up?"],
    thanksMidCall: ["Of course. What else?", "Sure. What else do you need?"],
    thanks: ["Of course. Happy to help. Keep me posted.", "Anytime. Let me know how it goes."],
    goodbye: [
      "Anytime. Talk %.",
      "Of course. Keep me posted.",
      "Bye for now. Let me know how it goes.",
    ],
    inviteComing: ["Sounds good. I'll look out for it."],
    inviteForCounter: ["For %, yes? Sounds good."],
    offer: {
      caseStudy: ["That would help a lot. Keep it to a few lines and I'll send it on."],
      passAlong: ["Perfect, that makes it easy. Send it over."],
      generic: [
        "That would help a lot. Keep it to a few lines and I'll send it on.",
        "Perfect, that makes it easy. Send it over.",
      ],
    },
    favour: [
      "Sure. Send me the draft and I'll forward it this week.",
      "Happy to. Send me a couple of lines first.",
    ],
    opener: ["Good to hear from you%. What's going on?", "Hey, nice. What can I do for you?"],
    openerUnnamed: [
      "Okay. And what are you hoping I can do?",
      "Right. So what do you need from me?",
    ],
    target: [
      "Oh nice. And you'd like me to put in a word?",
      "Good for you. What are you hoping I can do?",
    ],
    topic: ["Sure. What about it?", "Okay, go on. What's the question?"],
    busy: ["A bit, but go ahead.", "Always. What's up?"],
    vague: [
      "Let's keep it simple, then: two lines about you and what you want from her.",
      "Okay. What would make this easiest for you?",
    ],
    short: {
      opening: ["Hey. What's up?", "Okay. What's going on?"],
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
        "Okay. Send me a few lines and I'll do it.",
        "Sure. What do you need from me, and by when?",
      ],
    },
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
    job: NO_JOB,
    relationship: [
      "Pretty well. We worked together for two years, and we still grab coffee a couple of times a year.",
      "Well enough to send an email. We haven't talked in a few months, though.",
    ],
    colleague: "their sales director",
    possessive: "their",
  },
};
