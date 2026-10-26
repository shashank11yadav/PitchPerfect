import { buildPlanPrompt, buildTurnPrompt } from "@pitchperfect/partner";
import {
  type CoachTurnRequest,
  ScenarioPrivateSchema,
  ScenarioPublicSchema,
  type SkillSlug,
  type Stage,
  type TranscriptEntry,
  STAGES,
} from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type Intent, type Voice, readTurn } from "./intents.js";
import { personaReply, readBooking } from "./persona.js";
import { FakeProvider } from "./provider.js";

/**
 * A labelled corpus of student lines: what kind of turn each one is, and for many of them what
 * the demo persona must say back. Every line the reviewers flagged is here, next to the lines
 * from the probe scripts and the voice-style, terse and rambling turns a real demo gets.
 */

type Scenario = Pick<CoachTurnRequest, "scenarioPublic" | "scenarioPrivate">;

const BUYER: Scenario = {
  scenarioPublic: {
    personaName: "Maya Okonjo",
    personaTitle: "Operations manager",
    companyType: "A 40-person regional logistics firm",
    personality: "Busy and direct",
    openingLine: "Hi, this is Maya Okonjo. I have a few minutes. What can I do for you?",
  },
  scenarioPrivate: {
    hiddenObjections: [
      "The price is higher than what we pay today.",
      "We are mid-quarter and cannot take on a rollout now.",
      "I need sign-off from my manager before anything moves.",
    ],
    winConditions: ["The student proposes a specific next meeting."],
  },
};

const CLINIC: Scenario = {
  scenarioPublic: {
    personaName: "Ruth Lindgren",
    personaTitle: "Clinic director",
    companyType: "A small chain of physical therapy clinics",
    personality: "Warm but cautious",
    openingLine: "Hi, this is Ruth Lindgren. I have a few minutes. What can I do for you?",
  },
  scenarioPrivate: {
    hiddenObjections: [
      "We are mid-quarter and cannot take on a rollout now.",
      "We already use a tool that mostly works.",
    ],
    winConditions: ["The student proposes a specific next meeting."],
  },
};

const HIRING: Scenario = {
  scenarioPublic: {
    personaName: "Dana Whitfield",
    personaTitle: "Sales hiring manager",
    companyType: "A B2B software company hiring its first sales development reps",
    personality: "Friendly but probing",
    openingLine: "Hi, Dana here. Thanks for reaching out. What did you want to talk about?",
  },
  scenarioPrivate: {
    hiddenObjections: [
      "You don't have direct sales experience yet.",
      "We usually hire people with a year of quota-carrying experience.",
    ],
    winConditions: ["The student asks for a specific next step."],
  },
};

const CONTACT: Scenario = {
  scenarioPublic: {
    personaName: "Tom Becker",
    personaTitle: "Your former internship manager",
    companyType: "A regional marketing agency",
    personality: "Warm but busy",
    openingLine: "Hey, good to hear from you. It's Tom. What's up?",
  },
  scenarioPrivate: {
    hiddenObjections: [
      "I haven't talked to that person in a while.",
      "I'm not sure I know your work well enough to vouch for you.",
    ],
    winConditions: ["The student suggests a specific follow-up date."],
  },
};

const SCENARIOS: Record<Voice, Scenario> = { buyer: BUYER, hiring: HIRING, contact: CONTACT };
const SKILLS: Record<Voice, SkillSlug> = {
  buyer: "pitching",
  hiring: "introducing-yourself",
  contact: "referrals-networking",
};

const TAG = /\s*\[\[stage:(\w+)\]\]$/;
const stageOf = (reply: string) => TAG.exec(reply)?.[1] ?? "none";
const textOf = (reply: string) => reply.replace(TAG, "");

interface Row {
  line: string;
  intent: Intent;
  voice?: Voice;
  stage?: Stage;
  /** What the persona said just before this turn. */
  before?: string[];
  /** The persona's reply must match. */
  reply?: RegExp;
  /** The persona's reply must not match. */
  not?: RegExp;
  /** The stage after the reply: exact, or anything but the close. */
  after?: Stage | "not-close";
  /** A scenario other than the voice's usual one. */
  scenario?: Scenario;
}

const row = (line: string, intent: Intent, rest: Omit<Row, "line" | "intent"> = {}): Row => ({
  line,
  intent,
  ...rest,
});

/** The reviewer's probes open with a clinic buyer; everything else uses the voice's scenario. */
const scenarioFor = (voice: Voice, stage: Stage, own?: Scenario): Scenario =>
  own ?? (voice === "buyer" && stage === "opening" ? CLINIC : SCENARIOS[voice]);

/** The persona's reply to `line`, with the call so far as the turn prompt sends it. */
function replyTo({
  line,
  voice = "buyer",
  stage = "discovery",
  before = [],
  scenario: own,
}: Row): string {
  const scenario = scenarioFor(voice, stage, own);
  const transcript: TranscriptEntry[] = [
    { role: "partner", text: scenario.scenarioPublic.openingLine },
  ];
  before.forEach((text, index) => {
    transcript.push(
      { role: "student", text: `Earlier turn ${String(index + 1)}.` },
      { role: "partner", text },
    );
  });
  const prompt = buildTurnPrompt({
    skill: SKILLS[voice],
    ...scenario,
    transcript,
    studentText: line,
    currentStage: stage,
  });
  return personaReply(1, prompt);
}

const OPERATIONS = /front desk|spreadsheet|dispatcher|phones patients|skipped|depends who’s on/i;
const ACCEPT_OR_COUNTER = /works\.|is packed|I can do|should work|any better/i;
/** The persona asking for a repeat: only right when the words were noise. */
const NOT_HEARD = /say that again|once more|missed that/i;

const OPENER_REPLY =
  /why|what’s this about|what made you|reach out|calling|meet you|background|drew you|tell me|going on|what can I do/i;
const SMALL_TALK_REPLY =
  /thanks|busy|good|fine|not bad|quiet|highlights|weather|been a while|few minutes|go ahead|speaking/i;

const OBJECTED = ["Maybe. But we're mid-quarter and can't take on a rollout now."];
const HIRING_OBJECTED = [
  "I'll be honest. We usually hire people with a year of quota-carrying experience.",
];
const BOOKED_THURSDAY = ["Thursday at 2 works. Send the invite and I'll bring my dispatch lead."];

const CORPUS: Row[] = [
  // Openers: thanks plus who they are and where from. The persona asks why they called.
  row("Thanks for taking my call. I'm Chris from Fleetline.", "opener", {
    stage: "opening",
    reply: OPENER_REPLY,
    not: /what else did you want to ask/i,
    after: "discovery",
  }),
  row(
    "Thanks for picking up. I'm Priya from Routekeep, we help carriers replan routes when drivers call in sick.",
    "opener",
    { stage: "opening", reply: OPENER_REPLY, not: /what else did you want to ask/i },
  ),
  row(
    "Hi Maya, I'm Jordan from Routewise. We build a route planner for regional carriers.",
    "opener",
    {
      stage: "opening",
      reply: OPENER_REPLY,
    },
  ),
  row(
    "good good so I'm Chris with Fleetline we do route planning for regional carriers",
    "opener",
    {
      stage: "opening",
      reply: OPENER_REPLY,
    },
  ),
  row(
    "Hi, this is Alex from Remindly. I'll be quick. We help teams stop losing hours to manual reminders.",
    "opener",
    { stage: "opening", reply: OPENER_REPLY, not: /mid-quarter|already use/i },
  ),
  row("Let me introduce myself first. I'm Taylor from Brightdesk.", "opener", {
    stage: "opening",
    after: "not-close",
  }),
  row("Hi Priya, let me introduce myself.", "opener", { stage: "opening", after: "not-close" }),
  row(
    "ha, fair. so I'm Sam, I'm with Routewise, we help carriers replan routes when things change",
    "opener",
    {
      stage: "opening",
      not: /who else like us|example from a company/i,
    },
  ),
  row("we work with teams like yours on the boring scheduling stuff", "opener", {
    stage: "opening",
    reply: /what|mean|do/i,
  }),
  row(
    "Hi Dana, I'm Sam. I'm finishing a marketing degree and I'm really interested in your SDR opening.",
    "opener",
    {
      voice: "hiring",
      stage: "opening",
      reply: /meet you|drew you|why this role|tell me|background/i,
    },
  ),
  row(
    "Hi, thanks for taking the time. I'm Riley, I graduate in May with a business degree.",
    "opener",
    {
      voice: "hiring",
      stage: "opening",
    },
  ),
  row(
    "I'm Jordan, I'm a senior studying communications, and I want to start in sales development",
    "opener",
    {
      voice: "hiring",
      stage: "opening",
    },
  ),
  row(
    "haha anyway the weather's been wild here, we got like a foot of snow and my car is still buried and honestly I've been meaning to call for a while but things kept coming up and anyway I work at a company that does software for, well, scheduling and routing and reminders and a few other things depending on who you are",
    "opener",
    { stage: "opening", reply: OPENER_REPLY, not: OPERATIONS },
  ),
  row("hi", "greeting", { stage: "opening", reply: /who|what can I do|hello|hi/i }),
  row("hello?", "greeting", { stage: "opening", reply: /who|what can I do|hello|hi/i }),
  row("Hello there.", "greeting", { stage: "opening" }),
  row("Is this Ruth?", "name_check", { stage: "opening", reply: /speaking|it is|who’s this/i }),
  row("Thanks for taking my call.", "thanks", {
    stage: "opening",
    reply: /what’s this about|what can I do|go ahead/i,
    not: /what else did you want to ask/i,
  }),
  row("hi! thanks so much for making time", "thanks", {
    voice: "hiring",
    stage: "opening",
    reply: /tell me|background|happy to|go ahead/i,
    not: /what else did you want to ask/i,
  }),
  row("Thanks, that helps.", "thanks", {
    reply: /what else|next|sure|no problem/i,
    after: "not-close",
  }),

  // Small talk, answered briefly and steered back.
  row("How are you doing today?", "small_talk", {
    stage: "opening",
    reply: SMALL_TALK_REPLY,
    not: OPERATIONS,
  }),
  row("how's your week going", "small_talk", {
    stage: "opening",
    reply: SMALL_TALK_REPLY,
    not: OPERATIONS,
  }),
  row("did you have a good weekend?", "small_talk", {
    reply: /weekend|quiet|short|good|fine|busy|not bad/i,
    not: OPERATIONS,
  }),
  row("did you catch the game last night", "small_talk", {
    reply: /highlights|game|missed|didn’t|no\b|busy/i,
    not: OPERATIONS,
  }),
  row("any plans for the weekend?", "small_talk", {
    reply: /weekend|plans|nothing|quiet|sleep/i,
    not: OPERATIONS,
  }),
  row("nice weather today, right?", "small_talk", {
    reply: /weather|is\b|it is|nice|been/i,
    not: OPERATIONS,
  }),
  row("hey maya how are you doing today", "small_talk", {
    stage: "opening",
    reply: SMALL_TALK_REPLY,
  }),
  row("how was your weekend?", "small_talk", { reply: /weekend|quiet|short|good|fine|not bad/i }),
  row("happy Friday, how's it going", "small_talk", { reply: SMALL_TALK_REPLY }),
  row("hope you're doing well", "small_talk", { reply: SMALL_TALK_REPLY }),
  row("hi, is this Ruth? great. how's your morning going", "small_talk", {
    stage: "opening",
    reply: SMALL_TALK_REPLY,
  }),
  row("Is this Maya?", "name_check", { stage: "opening", reply: /Ruth/ }),
  row("Hey! It's been forever, how's everything going", "small_talk", {
    voice: "contact",
    stage: "opening",
    reply: /been a while|good|busy|what’s new|what’s up/i,
  }),
  row("hey! long time. how have you been", "small_talk", {
    voice: "contact",
    stage: "opening",
    reply: SMALL_TALK_REPLY,
  }),
  row("Hi! Thanks for picking up, how are you?", "small_talk", {
    voice: "contact",
    stage: "opening",
    reply: SMALL_TALK_REPLY,
  }),
  row("Is now an okay time?", "small_talk", { stage: "opening", reply: /few minutes|go ahead/i }),
  row("hey, thanks for picking up. got two minutes?", "small_talk", {
    stage: "opening",
    reply: /few minutes|go ahead/i,
  }),
  row("Hi, is this a good time? I'm Morgan from Shiftwell.", "small_talk", {
    stage: "opening",
    reply: /few minutes|go ahead/i,
  }),
  row(
    "Hi Maya, I'm Jordan from Routewise. We build a route planner for regional carriers. Got two minutes?",
    "small_talk",
    { stage: "opening", reply: /few minutes|go ahead/i },
  ),
  row("I can't help but notice you're busy", "busy_remark", { reply: /busy|bit|quickly|always/i }),
  row("Sorry, I can't help but notice you sound busy.", "busy_remark", { after: "not-close" }),
  row("you sound busy", "busy_remark", { reply: /busy|bit|quickly|always/i }),

  // Identity, sincerely asked.
  row("Sorry, quick question first: are you a real person?", "identity", {
    reply: /scripted practice partner/,
  }),
  row("is this a bot", "identity", { reply: /scripted practice partner/ }),
  row("am I speaking with a real person", "identity", { reply: /scripted practice partner/ }),
  row("wait is this AI", "identity", { reply: /scripted practice partner/ }),
  row("Are you a person or a recording?", "identity", {
    stage: "opening",
    reply: /scripted practice partner/,
    after: "opening",
  }),
  row("are you real", "identity", { reply: /scripted practice partner/ }),

  // Proposals: a meeting being set up with this person, or their availability for a time.
  row("Could we do a 30-minute walkthrough next Wednesday at 11?", "proposal", {
    reply: /Wednesday at 11/,
    not: /why are you calling/i,
    after: "close",
  }),
  row("Want to hop on a call Thursday?", "proposal", { reply: /Thursday/, after: "close" }),
  row("Would Thursday morning be good for a quick call?", "proposal", {
    reply: /Thursday/,
    after: "close",
  }),
  row("Let's do Thursday at 2.", "proposal", { reply: /Thursday at 2/, after: "close" }),
  row("How does Thursday at 2pm sound?", "proposal", { reply: /Thursday at 2pm/, after: "close" }),
  row("Is Thursday at 2 any good for you?", "proposal", { reply: /Thursday at 2/, after: "close" }),
  row(
    "Could we set up 20 minutes on Thursday at 10am with you and your dispatch lead?",
    "proposal",
    {
      reply: /Thursday at 10am/,
      after: "close",
    },
  ),
  row("can we grab 20 minutes thursday at 10 with you and your dispatch lead", "proposal", {
    reply: /^Thursday at 10 (?:works|is packed)/,
    after: "close",
  }),
  row("Could we set up a 20-minute demo Thursday at 10am?", "proposal", {
    reply: /Thursday at 10am/,
    after: "close",
  }),
  row("Would Thursday at 10 work for you?", "proposal", {
    reply: /Thursday at 10/,
    after: "close",
  }),
  row("Are you free Monday at 9am?", "proposal", { reply: /Monday at 9am/, after: "close" }),
  row("Does 2pm suit you?", "proposal", { reply: /2pm/, after: "close" }),
  row("thursday at 2 work for you", "proposal", {
    reply: /^Thursday at 2 (?:works|is packed)/,
    after: "close",
  }),
  row("How about Wednesday at 3pm?", "proposal", { reply: /Wednesday at 3pm/, after: "close" }),
  row("Can we do this Wednesday?", "proposal", { reply: /Wednesday/, after: "close" }),
  row("Are you around Tuesday afternoon at 2pm for a quick demo?", "proposal", {
    reply: /Tuesday/,
    after: "close",
  }),
  row("Can we find some time on Thursday to go through this properly?", "proposal", {
    reply: /Thursday/,
    after: "close",
  }),
  row("Should we set up a call Friday at 1pm with your manager?", "proposal", {
    reply: /Friday at 1pm/,
    after: "close",
  }),
  row("Would you have 20 minutes next Tuesday afternoon to talk more?", "proposal", {
    voice: "hiring",
    reply: /Tuesday/,
    after: "close",
  }),
  row("Could we set up a 15 minute chat with your team lead on Friday at 11am?", "proposal", {
    voice: "hiring",
    reply: /Friday at 11am/,
    after: "close",
  }),
  row("would you be open to a quick call next week with your team lead", "proposal", {
    voice: "hiring",
    reply: /^Next week/,
    after: "close",
  }),
  row("Could we book a demo next Tuesday at 2pm with your operations lead?", "proposal", {
    reply: /Tuesday at 2pm/,
    after: "close",
  }),
  row("Do you have 20 minutes Thursday?", "proposal", { reply: /Thursday/, after: "close" }),
  row("Can we meet Thursday?", "proposal", { reply: /Thursday/, after: "close" }),
  row(
    "could we set up 20 minutes next Tuesday at 10 with you and whoever plans routes",
    "proposal",
    {
      reply: /Tuesday at 10/,
      after: "close",
    },
  ),
  row("Let's pick this up next week.", "proposal", { reply: /^Next week/, after: "close" }),
  row("Thursday at 9 then?", "proposal", { reply: /Thursday at 9/, after: "close" }),
  row("Would that work for you?", "confirm", {
    before: ["Thursday's my best day. Mornings, ideally."],
    reply: /Thursday/,
    after: "close",
  }),
  row("Would that work for you?", "confirm", { stage: "pitch", reply: /when|what day|depends/i }),
  row("Tuesday at 3pm?", "proposal", {
    before: ["What day were you thinking, and how long do you need?"],
    reply: /Tuesday at 3pm/,
    after: "close",
  }),
  row("Wednesday works, 3pm?", "proposal", {
    before: ["Maybe a trial. What day were you thinking, and how long would it run?"],
    reply: /Wednesday/,
    not: /what day/i,
    after: "close",
  }),

  // Follow-ups: the student says when they'll be back in touch. The persona agrees.
  row("I'll call you next week.", "follow_up", { reply: /next week/i, after: "close" }),
  row("I'll follow up next week.", "follow_up", { reply: /next week/i, after: "close" }),
  row("I'll check in Thursday to see if he replied.", "follow_up", {
    voice: "contact",
    reply: /Thursday/,
    after: "close",
  }),
  row("I'll send you an invite for Tuesday.", "follow_up", { reply: /Tuesday/, after: "close" }),
  row("Perfect, see you Thursday at 10.", "follow_up", { reply: /Thursday/, after: "close" }),
  row("thank you, seriously. I'll check in next Monday to see if it went out", "follow_up", {
    voice: "contact",
    reply: /Monday/,
    after: "close",
  }),
  row("I'd love to send you a one-pager and follow up next Tuesday at 2pm.", "follow_up", {
    reply: /Tuesday at 2pm/,
    after: "close",
  }),

  // Proposals with no time yet: the persona asks when.
  row("Could we set up a call?", "open_proposal", { reply: /when|what day/i, after: "close" }),
  row("Would you be open to a two-week pilot?", "open_proposal", {
    reply: /trial|when|day/i,
    after: "close",
  }),
  row("Want to hop on a call?", "open_proposal", { reply: /when|what day/i, after: "close" }),
  row("Our reminders cut no-shows. Would a trial next month help?", "open_proposal", {
    stage: "opening",
    reply: /trial/i,
    after: "close",
  }),

  // Their own availability.
  row("What does next week look like for you?", "availability_question", {
    reply: /open|Tuesday|Thursday/i,
    not: OPERATIONS,
    after: "close",
  }),
  row("How's your Thursday looking?", "availability_question", {
    reply: /open|Thursday|morning/i,
    after: "close",
  }),
  row("When are you free?", "availability_question", {
    reply: /open|Tuesday|Thursday|morning/i,
    after: "close",
  }),
  row("What day works for you?", "availability_question", {
    reply: /Tuesday|Thursday|open/i,
    after: "close",
  }),
  row("when would be a good time for you", "availability_question", { after: "close" }),

  // Favours a contact can do, and offers to send something.
  row("would you be comfortable introducing me by email", "favour", {
    voice: "contact",
    reply: /send|draft|forward/i,
    after: "close",
  }),
  row("Would you be willing to introduce me by email?", "favour", {
    voice: "contact",
    reply: /send|draft|forward/i,
  }),
  row("Could you send it by Wednesday?", "favour", {
    voice: "contact",
    reply: /Wednesday/,
    after: "close",
  }),
  row("Can I get that over to you by Friday?", "offer_to_send", {
    reply: /Friday|send|sure/i,
    not: ACCEPT_OR_COUNTER,
  }),
  row("Would it help if I sent over a short case study?", "offer_to_send", {
    reply: /send|case study|sure|help/i,
    not: /one location|first step/i,
  }),
  row("Would it help if I sent a one-page summary your manager could read?", "offer_to_send", {
    reply: /send|manager|page/i,
    not: /one location|first step/i,
  }),
  row("I can send you my resume and the two projects I did on your team.", "offer_to_send", {
    voice: "contact",
    reply: /send|few lines|help|read/i,
  }),
  row("I could draft it for you, just three lines about me and the role", "offer_to_send", {
    voice: "contact",
    reply: /few lines|send|easy|help/i,
  }),
  row(
    "I totally get that you don't want to vouch blind. I can send you my resume and the two projects I did on your team.",
    "offer_to_send",
    { voice: "contact", reply: /send|help|read/i },
  ),
  row("What if we started with just one location for a month?", "small_start", {
    reply: /one location|small|first step/i,
    after: "close",
  }),
  row("Would it help if we started with one location?", "small_start", {
    reply: /one location|small|first step/i,
  }),

  // Questions about how they work. Mentioning a day or a time doesn't make them proposals.
  row("Do you call patients at 9am the day before?", "yes_no_question", {
    reply: /yes|sometimes|usually|depends|not always/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("How does that work on a busy Friday?", "process_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("What about Monday mornings, are those the worst?", "busiest_question", {
    reply: /Mondays?/,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Who works the front desk on Tuesday?", "staff_question", {
    reply: /two people|one or two/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Do you meet with your managers on Mondays?", "yes_no_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Let's talk about Monday mornings for a sec.", "topic", {
    reply: /what about|what do you want|Mondays/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Can we talk about what happens on Friday afternoons?", "topic", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("do your dispatchers call drivers at 6am to confirm", "yes_no_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Do you have a lot of no-shows on Thursday?", "yes_no_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Are you busiest on Mondays?", "busiest_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Can we talk about Thursday's schedule?", "topic", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Does Thursday work for your front desk to do reminder calls?", "yes_no_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("What time works best for your patients?", "timing_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("What does Monday morning look like for your dispatchers?", "process_question", {
    reply: /spreadsheet|dispatcher|driver|route/i,
    after: "discovery",
  }),
  row("What does Monday morning look like for the front desk?", "process_question", {
    after: "not-close",
  }),
  row("I'd pay attention to Mondays.", "unclear", { not: ACCEPT_OR_COUNTER, after: "not-close" }),
  row("Let's say a patient cancels at 8am. What happens?", "process_question", {
    not: ACCEPT_OR_COUNTER,
  }),
  row("How do you schedule your drivers each morning?", "process_question", {
    not: ACCEPT_OR_COUNTER,
  }),
  row("How do patients book appointments today?", "process_question", { not: ACCEPT_OR_COUNTER }),
  row("Should we start with how your front desk works?", "process_question", {
    not: ACCEPT_OR_COUNTER,
  }),
  row("What happens when someone cancels at 7am?", "process_question", { not: ACCEPT_OR_COUNTER }),

  // The rest of discovery.
  row("How do your dispatchers plan routes today?", "process_question", {
    reply: /driver|route|spreadsheet/i,
  }),
  row(
    "I work with teams whose dispatchers spend hours a week on reroutes. How do your dispatchers plan routes today?",
    "process_question",
    { reply: /driver|route|spreadsheet/i, not: /\$\d/ },
  ),
  row("walk me through your reminder process", "process_question"),
  row("tell me about your dispatch team", "process_question"),
  row("I want to understand how you handle sick calls", "process_question", {
    reply: /spreadsheet|phone|route|dispatcher/i,
  }),
  row("can I ask how you handle it today when a driver calls in sick", "process_question", {
    reply: /spreadsheet|phone|route|dispatcher/i,
  }),
  row("I'm a student at State. I'd like to learn how you run scheduling.", "process_question", {
    stage: "opening",
    reply: /front desk|calendar/i,
  }),
  row("How much time does that take each morning?", "quantity_question", {
    reply: /\b(two|three|four|hours?|\d+)\b/i,
  }),
  row("oof. and how often is that happening", "quantity_question", {
    reply: /\b(two|three|four|hours?|\d+)\b/i,
  }),
  row("how many people touch that each week", "quantity_question"),
  row("sorry what time do drivers usually head out", "timing_question", {
    reply: /\d|morning|dispatch/i,
  }),
  row("What does one late delivery cost you?", "problem_cost_question", {
    reply: /\$\d|overtime|customer/i,
    not: /a month for what we use|finance would know/,
  }),
  row("what does that cost you on a bad week, roughly", "problem_cost_question", {
    reply: /\$\d|overtime|customer/i,
  }),
  row("What do you pay today, roughly?", "cost_question", { reply: /\$\d/ }),
  row("What's your budget for this?", "cost_question", { reply: /\$\d/ }),
  row("how much is the current tool running you, if you don't mind me asking", "cost_question", {
    reply: /\$\d/,
  }),
  row("What do you pay for the reminder tool?", "cost_question", { reply: /\$\d/ }),
  row("What do you pay for the current setup?", "cost_question", { reply: /\$\d/ }),
  row("and how well does that work for you", "quality_question", {
    reply: /works|job|fine|well|falls apart|phones/i,
  }),
  row("That makes sense. Can I ask what the current tool does well?", "quality_question", {
    reply: /works|job|fine|well|falls apart|phones|story/i,
    not: /who else like us|example from a company/i,
  }),
  row("What are you using today?", "tool_question", {
    reply: /add-on|spreadsheets|software|portals/i,
  }),
  row("totally fair. what are you using right now", "tool_question", {
    reply: /add-on|spreadsheets|software|portals/i,
  }),
  row("Totally get it. What tool are you using now?", "tool_question", {
    reply: /add-on|spreadsheets|software|portals/i,
  }),
  row("Who owns that check right now?", "owner_question", { reply: /dispatch lead|manager/i }),
  row("Who runs the SDR team day to day?", "owner_question", {
    voice: "hiring",
    reply: /team lead/i,
    not: /my call/i,
  }),
  row("who would I be working with day to day", "owner_question", {
    voice: "hiring",
    reply: /team lead/i,
  }),
  row("Who would I report to?", "owner_question", { voice: "hiring", reply: /team lead|me\b/i }),
  row("Who else would need to sign off?", "decision_question", { reply: /sign|manager/i }),
  row("Who decides on new software at your clinics?", "decision_question", {
    stage: "opening",
    reply: /practice manager|decide|sign/i,
    after: "not-close",
  }),
  row("who else would weigh in on something like this", "decision_question", {
    reply: /sign|manager|dispatch lead/i,
  }),
  row("who approves purchases like this", "decision_question", {
    reply: /sign|manager|dispatch lead/i,
  }),
  row("Who else would need to be comfortable before you'd try it?", "decision_question", {
    reply: /sign|manager|dispatch lead/i,
  }),
  row(
    "That makes sense. If reroutes took minutes, who on your side would want to see that first?",
    "decision_question",
    {
      reply: /dispatch lead|manager/i,
    },
  ),
  row("Who else would I meet in the process?", "decision_question", {
    voice: "hiring",
    reply: /team lead|account executive/i,
  }),
  row("what would it take for you to want to try it", "conditions_question", {
    reply: /proof|price|month|switch/i,
  }),
  row("I understand. What would you need to see to feel good about it?", "conditions_question", {
    reply: /proof|price|month|switch/i,
  }),
  row("what would it take to get your manager comfortable", "conditions_question"),

  // A hiring manager's own questions.
  row("How much of the job is cold calling versus email?", "job_question", {
    voice: "hiring",
    reply: /call|phone|email/i,
    not: /too new|forty times/i,
  }),
  row("what separates your best SDRs from the rest?", "job_question", {
    voice: "hiring",
    reply: /prepar|research|personally|best|curious/i,
    not: /what do you know about what we do/i,
  }),
  row("What are you looking for in this hire?", "job_question", { voice: "hiring" }),
  row("What does success look like in the first six months?", "job_question", {
    voice: "hiring",
    reply: /meeting|pipeline|ramp/i,
  }),
  row("What does a typical day look like for an SDR on your team?", "process_question", {
    voice: "hiring",
    reply: /outreach|calls|meetings/i,
    not: /front desk|patients/i,
  }),
  row("what do your SDRs spend most of their day on", "process_question", {
    voice: "hiring",
    reply: /outreach|calls|emails/i,
    not: /commission|posting|\$/i,
  }),
  row("what does a new SDR's first month look like on your team", "process_question", {
    voice: "hiring",
    reply: /outreach|calls|emails|research/i,
  }),
  row("how do new reps usually ramp", "process_question", {
    voice: "hiring",
    reply: /month|ramp|week|research|calls/i,
  }),
  row("What's the salary range for the role?", "cost_question", {
    voice: "hiring",
    reply: /posting|base|range/i,
  }),
  row("I saw the SDR opening and I'd love to learn what the team is like.", "process_question", {
    voice: "hiring",
    reply: /outreach|calls|meetings|research/i,
  }),

  // A contact's relationship with the person they'd introduce.
  row("Are you still in touch with Marcus?", "relationship_question", {
    voice: "contact",
    reply: /touch|email|months|years|coffee|well enough/i,
  }),
  row("do you still talk to her", "relationship_question", {
    voice: "contact",
    reply: /touch|email|months|years|coffee|well enough/i,
  }),
  row("how well do you know her these days", "relationship_question", {
    voice: "contact",
    reply: /worked|known|years|coffee|touch|well enough/i,
  }),
  row("who runs hiring over there", "owner_question", { voice: "contact", not: /my call/i }),
  row("So I'm looking at sales roles and I saw Jess at Northfield is hiring SDRs", "target", {
    voice: "contact",
    reply: /put in a word|hoping I can do/i,
  }),
  row(
    "I'm good. I wanted to ask you something. I'm applying to Brightline and saw Marcus is hiring for their SDR team.",
    "target",
    { voice: "contact", reply: /put in a word|hoping I can do/i },
  ),
  row(
    "good, good. so I'm applying for SDR roles and I noticed Priya at Corvane is hiring",
    "target",
    {
      voice: "contact",
    },
  ),

  // Pitches draw the next hidden objection.
  row(
    "Our planner rebuilds routes in minutes when a driver calls in sick, so your team saves hours.",
    "pitch",
    {
      reply: /mid-quarter|rollout/i,
      after: "objection",
    },
  ),
  row(
    "Got it. So Shiftwell automates the reminders and fills cancelled slots, which saves about five hours a week.",
    "pitch",
    { reply: /mid-quarter|rollout|sign-off|manager/i, not: /real headache/i, after: "objection" },
  ),
  row("Our tool rebuilds routes in two minutes and texts drivers.", "pitch", {
    after: "objection",
  }),
  row(
    "ok so basically our planner reshuffles the routes in a couple minutes so nobody's redoing it by hand",
    "pitch",
    {
      after: "objection",
    },
  ),
  row("Less time on the phone means the front desk can focus on patients in the room.", "pitch", {
    after: "objection",
  }),
  row("We help teams stop losing hours to manual reminders.", "pitch", {
    stage: "pitch",
    after: "objection",
  }),
  row("Fair. Our pricing is $300 a month per location.", "pitch", {
    reply: /price|mid-quarter|sign-off/i,
    after: "objection",
  }),
  row("And it's about $400 a month.", "pitch", { after: "objection" }),
  row("It also texts drivers their new stops automatically.", "pitch", { after: "objection" }),
  row("Our reminders cut no-shows by a third.", "pitch", { after: "objection" }),
  row("we fill cancelled appointments from a waitlist automatically", "pitch", {
    after: "objection",
  }),
  row(
    "Sorry, let me be clearer. We text patients and fill cancelled slots from a waitlist.",
    "pitch",
    { after: "objection" },
  ),
  row(
    "I ran our club's fundraising and booked 40 meetings with local businesses last spring.",
    "pitch",
    {
      voice: "hiring",
      reply: /sales experience|quota/i,
      after: "objection",
    },
  ),
  row(
    "last summer I sold memberships at a gym and closed about 30 a month, second on the team",
    "pitch",
    {
      voice: "hiring",
      reply: /sales experience|quota/i,
    },
  ),
  row("I led a team of six volunteers and we raised 12000 dollars for the food bank", "pitch", {
    voice: "hiring",
  }),
  row(
    "I ran the phone bank for a campus campaign and we made 2,000 calls in three weeks.",
    "pitch",
    { voice: "hiring" },
  ),

  // Acknowledging pushback, with or without proof.
  row("That's fair, I hear you.", "acknowledgement", {
    stage: "objection",
    before: ["Maybe. But we're mid-quarter and can't take on a rollout now."],
    reply: /example|company like ours|who else like us/i,
    after: "objection",
  }),
  row(
    "yeah, I get that. one carrier your size cut overtime by about 2500 a month in their first quarter",
    "proof",
    {
      stage: "objection",
      before: ["Maybe. But we're mid-quarter and can't take on a rollout now."],
      reply: /result|how long|talk to them/i,
    },
  ),
  row(
    "I hear you on timing. One firm your size started in the slow week after a holiday and was live in five days.",
    "proof",
    {
      stage: "objection",
      before: ["Maybe. But we're mid-quarter and can't take on a rollout now."],
      reply: /result|how long|talk to them|five days/i,
      not: /example from a company|who else like us/i,
    },
  ),
  row("a clinic group about your size went from twelve no-shows a week to five", "proof", {
    reply: /result|how long|talk to them/i,
  }),
  row(
    "Totally understand. One practice like yours cut no-shows by 30 percent in two months.",
    "proof",
    {
      reply: /result|how long|talk to them/i,
    },
  ),
  row(
    "I hear you on price. One carrier your size cut overtime by $3,000 a month in the first quarter.",
    "proof",
    {
      reply: /result|how long|talk to them/i,
    },
  ),
  row("That makes sense. Teams like yours usually see results within a month.", "proof", {
    reply: /which|talk to|how long|result/i,
  }),
  row("I get that. One carrier your size cut overtime by $2,500 a month.", "proof"),
  row(
    "That's fair. I don't have quota experience yet, but I hit every target the club set.",
    "acknowledgement",
    {
      voice: "hiring",
      stage: "objection",
      before: ["I'll be honest. We usually hire people with a year of quota-carrying experience."],
      reply: /first month|learn something fast|example/i,
    },
  ),
  row(
    "That's a fair worry. I picked marketing before I knew sales roles existed for new grads.",
    "acknowledgement",
    {
      voice: "hiring",
      stage: "objection",
      before: ["I'll be honest. You don't have direct sales experience yet."],
    },
  ),
  row(
    "I understand. That's a fair concern. What would make it worth switching for you?",
    "conditions_question",
    {
      reply: /proof|price|month|switch/i,
    },
  ),
  row("Can I ask what's behind that?", "detail_question", {
    stage: "objection",
    before: ["Maybe. But we're mid-quarter and can't take on a rollout now."],
    reply: /quarter|rollout|team|time|honestly/i,
  }),

  // Wrapping up once a meeting is booked.
  row("sounds good", "wrap_up", {
    stage: "close",
    before: ["Thursday at 10 works. Send the invite and I'll bring my dispatch lead."],
    reply: /talk Thursday|bye|see you|talk then|look out/i,
    not: /next step|get this moving|from here/i,
  }),
  row("ok bye", "wrap_up", {
    stage: "close",
    before: ["Thursday at 10 works. Send the invite and I'll bring my dispatch lead."],
    reply: /talk Thursday|bye|see you|talk then|look out/i,
  }),
  row("cool", "wrap_up", {
    stage: "close",
    before: ["Monday at 9am works. Send the invite and I'll bring my dispatch lead."],
    reply: /talk Monday|bye|see you|talk then|look out/i,
    not: /next step|get this moving|from here/i,
  }),
  row("thx", "wrap_up", {
    stage: "close",
    before: ["Monday at 9am works. Send the invite and I'll bring my dispatch lead."],
    reply: /talk Monday|bye|see you|talk then|look out|thanks/i,
  }),
  row("Thanks Maya.", "wrap_up", {
    stage: "close",
    before: ["Friday at 1pm works. Send the invite and I'll bring my manager."],
    reply: /talk Friday|bye|see you|talk then|look out|thanks/i,
  }),
  row("Thank you, I'll send a calendar invite.", "wrap_up", {
    stage: "close",
    before: ["Tuesday at 3pm works. Send the invite and I'll bring our team lead."],
    voice: "hiring",
    reply: /talk Tuesday|bye|see you|talk then|look out|thanks|good luck/i,
  }),
  row("Great, I'll send the invite tonight.", "wrap_up", {
    stage: "close",
    before: ["Wednesday at 11 works. Send the invite and I'll bring my dispatch lead."],
    reply: /look out|keep an eye|talk Wednesday|see you|sounds good/i,
  }),
  row("perfect, I'll send the invite. thanks Maya", "wrap_up", {
    stage: "close",
    before: ["Tuesday at 10 works. Send the invite and I'll bring my dispatch lead."],
    reply: /look out|keep an eye|talk Tuesday|see you|sounds good/i,
  }),
  row("thanks so much, really appreciate it", "thanks", {
    stage: "close",
    reply: /talk|welcome|sounds good|course|thanks|sure|keep an eye|send/i,
  }),
  row("Thanks so much, I owe you one.", "wrap_up", {
    voice: "contact",
    stage: "close",
    before: ["Thursday works. Talk then."],
    reply: /anytime|course|talk Thursday|keep me posted|let me know/i,
  }),

  // Lines from fresh calls that the first corpus missed.
  row("Hi Daniel, Casey here from Packline. Did I catch you at an okay time?", "small_talk", {
    stage: "opening",
    reply: /few minutes, Casey|go ahead/i,
  }),
  row("and roughly how many orders are we talking about a week", "quantity_question", {
    reply: /\b(two|three|four|forty|dozen|hundred|\d+)\b/i,
  }),
  row(
    "What does one of those late orders end up costing you, with the refund and all?",
    "problem_cost_question",
    {
      reply: /\$\d|overtime|customer|refund/i,
    },
  ),
  row(
    "Would next Thursday at 11 work for a 20-minute walkthrough with you and your head of operations?",
    "proposal",
    { reply: /Thursday at 11/, after: "close" },
  ),
  row("Thanks Daniel, talk Thursday.", "follow_up", {
    stage: "close",
    before: ["Thursday at 11 works. Send the invite and I'll bring my head of operations."],
    reply: /Thursday|bye/i,
    not: /is packed|works\. Send/i,
  }),
  row("Thanks Daniel, talk Thursday.", "follow_up", {
    stage: "close",
    before: [
      "Thursday at 11 is packed for me. Could we do Friday at the same time instead?",
      "For Friday, yes? Send it and I'll be there.",
    ],
    reply: /Friday/,
    not: /Thursday works|is packed/i,
  }),
  row("Would it be easier to talk again next Tuesday at 9, once you've both seen it?", "proposal", {
    reply: /Tuesday at 9/,
    after: "close",
  }),
  row(
    "That's fair, mid-quarter is a bad time for anything new. What if the first location only went live after quarter end?",
    "small_start",
    { reply: /one location|small|first step/i },
  ),
  row(
    "Totally understand. Can I send over a two-page summary your practice manager could skim?",
    "offer_to_send",
    {
      reply: /send|page|pass/i,
    },
  ),
  row("Perfect. Thanks, Sam.", "thanks", {
    stage: "objection",
    before: ["Sure. Keep it to a page and I'll get it in front of the right people."],
    reply: /what else|next|sure|no problem/i,
    not: /bye|talk then/i,
  }),
  row(
    "I'm hoping to start in sales development, ideally at a company that sells into logistics.",
    "target",
    {
      voice: "hiring",
      reply: /why sales development|good at it/i,
    },
  ),
  row(
    "I spent two summers on a phone line for a university fundraiser and ended up top of the group for pledges.",
    "pitch",
    { voice: "hiring", reply: /sales experience|quota/i, after: "objection" },
  ),
  row("How big is the team at the moment?", "job_question", {
    voice: "hiring",
    reply: /five|small/i,
  }),
  row("Hi Lena! Hope you're doing well. Got a minute?", "small_talk", {
    voice: "contact",
    stage: "opening",
    reply: /sure|few minutes|what’s up|going on/i,
  }),
  row("I'll send the draft Thursday morning and check in with you next Monday.", "follow_up", {
    voice: "contact",
    reply: /Monday/,
    after: "close",
  }),
  row("is this maya", "name_check", { stage: "opening", reply: /Ruth/ }),
  row("our thing does it in like two minutes", "pitch", { after: "objection" }),
  row("Does that happen more on Fridays, or is it spread out?", "yes_no_question", {
    not: ACCEPT_OR_COUNTER,
  }),

  // Round 5: the reviewer's fresh calls and single-line probes, every line quoted.
  // Call A, a dispatch buyer.
  row(
    "Hi Maya, this is Jordan with Laneshift. Have I caught you in the middle of something?",
    "small_talk",
    {
      stage: "opening",
      reply: /few minutes|go ahead/i,
      not: /think about that|not sure I follow/i,
    },
  ),
  row("Thanks. I work with regional carriers on same-day route changes.", "opener", {
    stage: "opening",
    reply: /mean for us|in practice|who’s this for/i,
    not: /not following/i,
  }),
  row("Before I go on, how are routes planned at your place each morning?", "process_question", {
    reply: /spreadsheet|dispatcher|route/i,
  }),
  row("And when a driver calls out, who ends up fixing the plan?", "owner_question", {
    reply: /dispatch lead|dispatcher|manager/i,
    not: /not sure I follow|think about that/i,
  }),
  row("How many times a week does that happen, roughly?", "quantity_question"),
  row(
    "Got it. Laneshift rebuilds the affected routes in a couple of minutes and pushes the new stops to each driver's phone.",
    "pitch",
    { after: "objection" },
  ),
  row(
    "That's a fair point. Most teams keep their current fleet software and just plug us in on top.",
    "acknowledgement",
    {
      stage: "objection",
      before: OBJECTED,
      reply: /example|who else|company like ours/i,
    },
  ),
  row("It's $450 a month for a fleet your size.", "pitch", {
    stage: "objection",
    before: OBJECTED,
    reply: /price|sign-off|manager|already use|rollout/i,
    not: /talk to them|which company|real result/i,
  }),
  row("Would you be up for a 20 minute demo with your dispatch lead on Tuesday?", "proposal", {
    reply: /Tuesday/,
    after: "close",
  }),
  row("Wednesday at 10 then?", "proposal", {
    stage: "close",
    before: ["Tuesday is packed for me. Could we do Thursday at the same time instead?"],
    reply: /^Wednesday at 10 works/,
  }),
  row("Brilliant, I'll send that over now. Have a good one.", "wrap_up", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /talk|bye|look out|see you/i,
    not: /keep it short|read it/i,
  }),
  // Call B, a price-sensitive retail buyer.
  row("Hi Daniel, Riya from Parcelwise. Thanks for picking up.", "opener", {
    stage: "opening",
    reply: /Riya|why|what made|this about/i,
  }),
  row("What's the current setup costing you each month?", "cost_question", { reply: /\$\d/ }),
  row("Okay. And what do late deliveries cost you in refunds?", "problem_cost_question", {
    reply: /\$\d|overtime|customer|refund/i,
  }),
  row(
    "So for about $600 a month we'd catch most of those before the customer complains.",
    "pitch",
    {
      after: "objection",
    },
  ),
  row(
    "I completely understand. If it paid for itself in the first two months, would that change things?",
    "hypothetical",
    {
      stage: "objection",
      before: OBJECTED,
      reply: /help|show me|see it|maybe|would/i,
      not: /burned before|not sure I follow/i,
    },
  ),
  row("Who besides you would have to approve the spend?", "decision_question", {
    reply: /sign|manager|dispatch lead|say/i,
  }),
  row(
    "Makes sense. Would a two-week pilot on one product line help you make the case?",
    "open_proposal",
    {
      reply: /trial|pilot|when|day/i,
      after: "close",
    },
  ),
  row("How does next Thursday look for you?", "availability_question", {
    stage: "objection",
    before: OBJECTED,
    reply: /Thursday|open|Tuesday|morning/i,
    not: /spreadsheet|phone calls/i,
    after: "close",
  }),
  row("Let's say Thursday at 10 with your manager.", "proposal", {
    reply: /Thursday at 10/,
    after: "close",
  }),
  row("Perfect, cheers Daniel.", "wrap_up", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /talk|bye|see you/i,
  }),
  // Call C, discovery with a clinic IT lead.
  row("Hello Sam, it's Priyanka from Seatfill.", "opener", {
    stage: "opening",
    reply: /Priyanka|why|what made|this about/i,
  }),
  row("Can I ask a few questions about how your clinics handle appointments?", "process_question"),
  row("Walk me through what happens when a patient doesn't show up.", "process_question"),
  row("How often would you say that happens across the group?", "quantity_question"),
  row("Is that worse on certain days of the week?", "busiest_question", {
    reply: /Mondays|Fridays|holiday|Saturdays|weeks|month/i,
  }),
  row("Interesting. What tool are you using for reminders right now?", "tool_question"),
  row("And how well is it working for you?", "quality_question"),
  row("If you could change one thing about it, what would it be?", "detail_question", {
    reply: /I’d want|wish|minutes|reach|change|one thing/i,
    not: /not sure I follow|think about that/i,
  }),
  row("What would it mean for the clinics if no-shows dropped by half?", "detail_question", {
    reply: /fewer|calmer|money|hours|overtime|real|would/i,
    not: /not sure I follow|think about that|behind the question/i,
  }),
  row(
    "Would you be open to a follow-up call so I can show you what that could look like?",
    "open_proposal",
    {
      after: "close",
    },
  ),
  row("Friday morning?", "proposal", { reply: /Friday morning/, after: "close" }),
  row("Great, thanks Sam. Talk Friday.", "follow_up", {
    stage: "close",
    before: ["Friday morning works. Send the invite and I'll bring our practice manager."],
    reply: /Friday|bye/i,
  }),
  // Call D, a hiring manager.
  row("Hi Elena, my name is Theo Park. I'm a senior at State studying economics.", "opener", {
    voice: "hiring",
    stage: "opening",
    reply: /Theo/,
  }),
  row("I saw the SDR posting and I'd really like to be considered for it.", "target", {
    voice: "hiring",
    reply: /why sales|good at it|why here/i,
    not: /what kind of conversations/i,
  }),
  row(
    "Last year I led fundraising for our club and we brought in $12,000 from local businesses.",
    "pitch",
    {
      voice: "hiring",
      after: "objection",
    },
  ),
  row(
    "I get that. I don't have a quota yet, but I made about 300 cold calls for that fundraiser.",
    "acknowledgement",
    {
      voice: "hiring",
      stage: "objection",
      before: HIRING_OBJECTED,
      reply: /first month|learn something fast|example/i,
    },
  ),
  row(
    "Why sales over marketing? I like the conversations. I'd rather talk to people than write about them.",
    "target",
    {
      voice: "hiring",
      stage: "objection",
      before: HIRING_OBJECTED,
      reply: /what kind of conversations|conversation that went well/i,
      not: /not personal|ramp time|why sales development/i,
    },
  ),
  row("What does a great first quarter look like for a new SDR here?", "job_question", {
    voice: "hiring",
    reply: /meetings|pipeline|ramp/i,
  }),
  row("What's the team like day to day?", "job_question", {
    voice: "hiring",
    reply: /team|feedback|calls|Friday|tight/i,
    not: /not sure I follow|ramp time/i,
  }),
  row("Is there anything about my background that worries you?", "detail_question", {
    voice: "hiring",
    reply: /honestly|quota|experience|only|worr/i,
    not: /mostly, yes|depends on the week/i,
  }),
  row("Could we set up a time for me to meet the team lead?", "open_proposal", {
    voice: "hiring",
    after: "close",
  }),
  row("Thursday afternoon at 3 would work for me.", "proposal", {
    voice: "hiring",
    reply: /Thursday/,
    after: "close",
  }),
  row("Thank you so much, Elena. Have a great week.", "wrap_up", {
    voice: "hiring",
    stage: "close",
    before: [
      "Thursday afternoon at 3 is packed for me. Could we do Friday at the same time instead?",
    ],
    reply: /Friday|talk|luck|bye/i,
    not: /talk then/i,
  }),
  // Call E, a warm contact.
  row("Hey Lena, it's Aisha! How's everything going?", "opener", {
    voice: "contact",
    stage: "opening",
    reply: /Aisha|good|what’s going on|what’s up/i,
  }),
  row("Good! So I'm graduating in May and I'm looking at SDR roles.", "target", {
    voice: "contact",
  }),
  row("My cousin mentioned Ravi at Northpay is building out his sales team.", "target", {
    voice: "contact",
    reply: /put in a word|hoping I can do/i,
    not: /good to hear from you/i,
  }),
  row("Do you two still talk much?", "relationship_question", {
    voice: "contact",
    reply: /now and then|lunch|months|coffee|well enough|years|spring/i,
    not: /not sure, honestly|I can ask/i,
  }),
  row(
    "No pressure at all. I can write a short blurb about myself so you're not stuck writing it.",
    "offer_to_send",
    {
      voice: "contact",
      reply: /few lines|send|easy|help/i,
    },
  ),
  row("Would you be comfortable sending him a quick intro?", "favour", {
    voice: "contact",
    reply: /send|draft|forward/i,
  }),
  row("Could you do it by Friday?", "favour", { voice: "contact", reply: /Friday/ }),
  row("Amazing. I'll ping you Monday to see if he got back.", "follow_up", {
    voice: "contact",
    reply: /Monday/,
    after: "close",
  }),
  row("Thanks Lena, you're the best.", "wrap_up", {
    voice: "contact",
    stage: "close",
    before: ["Monday works. Talk then."],
    reply: /anytime|course|talk Monday|keep me posted|let me know/i,
  }),
  // Call F, voice-style and adversarial.
  row("hey uh is this maya", "name_check", {
    stage: "opening",
    scenario: BUYER,
    reply: /speaking|it is/i,
  }),
  row("hi maya um so yeah my name is kevin im with routebird we do like routing stuff", "opener", {
    stage: "opening",
    reply: /Kevin|why|this about|made you/i,
  }),
  row(
    "so how do u guys deal with it when a driver calls out sick in the morning",
    "process_question",
  ),
  row("ok and how long does that usually take you", "quantity_question"),
  row(
    "right yeah so basically our app just does all that automatically and your drivers get the new route on there phone and you dont need the spreadsheet anymore and it works with whatever you have now",
    "pitch",
    { after: "objection" },
  ),
  row("yeah no totally i get it", "acknowledgement", {
    stage: "objection",
    before: OBJECTED,
    reply: /example|who else|company like ours/i,
  }),
  row("oh by the way did you see the game last night", "small_talk", {
    reply: /highlights|game|missed|didn’t|no\b|busy/i,
  }),
  row("anyway um what does your boss care about most", "detail_question", {
    reply: /cost|calls|deliver|numbers|budget|overtime|customers/i,
    not: /have to do with us|not sure I follow/i,
  }),
  row("ok cool so like could we jump on a quick call thursday or something", "proposal", {
    reply: /Thursday/,
    after: "close",
  }),
  row("thursday works for me too then", "proposal", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /Thursday|see you|that’s the one/i,
  }),
  row("ok sweet talk then bye", "wrap_up", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /talk|bye/i,
  }),
  // Single lines, opening.
  row("Did I catch you at a bad time?", "small_talk", {
    stage: "opening",
    reply: /few minutes|go ahead|fine/i,
  }),
  row("Is now an okay moment to talk?", "small_talk", {
    stage: "opening",
    reply: /few minutes|go ahead|fine/i,
  }),
  row("Hey Maya, quick one, do you have two minutes?", "small_talk", {
    stage: "opening",
    reply: /few minutes|go ahead/i,
  }),
  row("Hi, it's Ben over at Cartwise, we spoke at the expo last month.", "opener", {
    stage: "opening",
    reply: /Ben/,
  }),
  row("Morning! Sorry for the cold call.", "unclear", {
    stage: "opening",
    reply: /who|call about|what can I do|what’s this/i,
  }),
  row("I'll keep this short, I promise.", "unclear", {
    stage: "opening",
    reply: /who|call about|what can I do|what’s this|go ahead/i,
  }),
  // Single lines, discovery.
  row("Who ends up fixing the routes when that happens?", "owner_question", {
    reply: /dispatch lead|dispatcher|manager/i,
  }),
  row("If you could wave a magic wand, what would you change?", "detail_question", {
    reply: /I’d want|wish|minutes|change|one thing/i,
  }),
  row("What's the biggest headache in dispatch right now?", "detail_question", {
    reply: /reroutes|sick calls|time|mornings|honestly/i,
    not: /not sure I follow|think about that/i,
  }),
  row("Tell me more about that.", "detail_question", {
    reply: /take a|monday|driver|calls out|example|well/i,
  }),
  row("Why is that?", "detail_question", { reply: /because|nobody|time|honestly|mostly/i }),
  row("What have you tried so far?", "detail_question", {
    reply: /looked at|tried|spreadsheet|software|once/i,
  }),
  row("How do your drivers find out about changes?", "process_question"),
  row("Is there anything else I should know?", "detail_question", {
    reply: /only that|mondays|worth knowing|one more|out the/i,
    not: /not always|skipped/i,
  }),
  row("Has anyone looked at fixing this before?", "detail_question", {
    reply: /looked|tried|once|years|software|tweaked|not really/i,
    not: /not always|skipped/i,
  }),
  row("What made you pick the tool you have now?", "detail_question", {
    reply: /came with|cheap|price|habit|chose|picked/i,
  }),
  row("What happens to the customer when a delivery is late?", "problem_cost_question", {
    reply: /customer|\$|overtime|refund/i,
  }),
  row("So the main issue is the Monday reroutes, is that right?", "detail_question", {
    reply: /that’s it|yes|right|exactly|and the|pretty much/i,
    not: /not sure I follow/i,
  }),
  row(
    "Our app does all of that automatically and drivers get the new route on their phone.",
    "pitch",
    { after: "objection" },
  ),
  row("Basically you'd never touch a spreadsheet again.", "pitch", { after: "objection" }),
  row("We charge per driver, around $15 each.", "pitch", { after: "objection" }),
  // Single lines, after an objection.
  row("Any chance you're free Wednesday afternoon?", "proposal", {
    stage: "objection",
    before: OBJECTED,
    reply: /Wednesday afternoon/,
    after: "close",
  }),
  row("Can I get 15 minutes on your calendar next Tuesday?", "proposal", {
    reply: /Tuesday/,
    after: "close",
  }),
  row("Shall I send an invite for Thursday at 10?", "proposal", {
    reply: /Thursday at 10/,
    after: "close",
  }),
  row("Would Monday or Tuesday be better?", "proposal", {
    reply: /^Tuesday/,
    not: /packed/i,
    after: "close",
  }),
  row("Totally understand. What would make the timing easier?", "conditions_question", {
    stage: "objection",
    before: OBJECTED,
    reply: /proof|price|month|switch|quarter|after|setup/i,
  }),
  row(
    "Understandable. Lots of our customers said the same thing before they switched.",
    "acknowledgement",
    {
      stage: "objection",
      before: OBJECTED,
      reply: /example|who else|company like ours/i,
    },
  ),
  row("What's driving the timing concern?", "detail_question", {
    stage: "objection",
    before: OBJECTED,
    reply: /time|honestly|burned|weeks|quarter/i,
  }),
  row("Fair. If we could have you live in a week, would that help?", "hypothetical", {
    stage: "objection",
    before: OBJECTED,
    reply: /help|show me|see it|maybe|week/i,
  }),
  row("What time do your dispatchers start in the morning on Thursdays?", "timing_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Do your drivers check their phones at 6am on Mondays?", "yes_no_question", {
    reply: /yes|no\b|mostly|not really|depends|usually/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("When does the quarter end for you, next week?", "detail_question", {
    reply: /end of|month|weeks|quarter/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("How busy are you guys on Friday afternoons usually?", "detail_question", {
    reply: /friday|quiet|busy|afternoons?|mornings/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  // Single lines, booked.
  row("Thanks so much, really appreciate your time.", "wrap_up", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /talk|bye|problem|welcome/i,
  }),
  row("Speak soon!", "wrap_up", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /talk|bye|soon|Thursday/i,
  }),
  row("Actually, could we push it to Friday?", "proposal", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /Friday/,
  }),
  row("Should I include your dispatch lead on the invite?", "invite_guest", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /yes|please|add|copy|do\b/i,
  }),
  row("Sounds good, talk then.", "wrap_up", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /talk|bye/i,
  }),
  // Single lines, hiring manager.
  row("What do you enjoy most about working there?", "detail_question", {
    voice: "hiring",
    reply: /people|watching|first meeting|honestly/i,
    not: /think about it|why do you ask/i,
  }),
  row("What would my first week look like?", "process_question", {
    voice: "hiring",
    reply: /outreach|calls|research|emails/i,
  }),
  row("How did you get into sales?", "detail_question", {
    voice: "hiring",
    reply: /accident|summer|never left|started/i,
  }),
  row("Do you hire many people straight out of college?", "detail_question", {
    voice: "hiring",
    reply: /couple a year|a few|when they|most years/i,
    not: /some weeks are different/i,
  }),
  row("Totally understand. I'm a fast learner though.", "acknowledgement", {
    voice: "hiring",
    stage: "objection",
    before: HIRING_OBJECTED,
    reply: /first month|learn something fast|example/i,
  }),
  row("What's the next step in your process?", "detail_question", {
    voice: "hiring",
    stage: "objection",
    before: HIRING_OBJECTED,
    reply: /team lead|account executive|then me/i,
    not: /not personal|ramp time/i,
  }),
  // Single lines, contact.
  row("My cousin said Ravi at Northpay is building out his sales team.", "target", {
    voice: "contact",
    reply: /put in a word|hoping I can do/i,
  }),
  row("Ravi works at Northpay and I think he's hiring.", "target", { voice: "contact" }),
  row("Have you spoken to Ravi recently?", "relationship_question", {
    voice: "contact",
    reply: /now and then|lunch|months|coffee|well enough|years|spring/i,
  }),
  row("I can write a short blurb about myself.", "offer_to_send", {
    voice: "contact",
    reply: /few lines|send|easy|help/i,
  }),
  row("I'll ping you Monday to see if he got back.", "follow_up", {
    voice: "contact",
    reply: /Monday/,
    after: "close",
  }),
  row("What do you think he'd want to see from me?", "detail_question", {
    voice: "contact",
    reply: /numbers|result|sold|run|short|clear/i,
    not: /think about that|why do you ask/i,
  }),
  // Single lines, the reviewer's regression set.
  row("Does Thursday work for your front desk to make the calls?", "yes_no_question", {
    not: ACCEPT_OR_COUNTER,
  }),
  row("Do your dispatchers call drivers at 6am?", "yes_no_question", { not: ACCEPT_OR_COUNTER }),
  row("I hear you. One firm your size was live in five days.", "proof", {
    stage: "objection",
    before: OBJECTED,
    reply: /result|how long|talk to them/i,
  }),
  row("Hey how are you doing today?", "small_talk", { stage: "opening", reply: SMALL_TALK_REPLY }),
  row("asdf qwerty", "unclear", { reply: /say that again|once more|missed that/i }),
  row("Bananas are yellow.", "short_reply", {
    reply: /what else|where were we|question|say that|again|do with us/i,
  }),
  // Single lines, more ways to propose a time.
  row("How's Thursday looking?", "availability_question", {
    reply: /Thursday|open|Tuesday|morning/i,
    after: "close",
  }),
  row("You free Thursday at 2?", "proposal", { reply: /Thursday at 2/, after: "close" }),
  row("Can you do Thursday at 2?", "proposal", { reply: /Thursday at 2/, after: "close" }),
  row("Could you do Tuesday morning?", "proposal", { reply: /Tuesday morning/, after: "close" }),
  row("Are you able to meet Thursday?", "proposal", { reply: /Thursday/, after: "close" }),
  row("I'd love to set up 20 minutes with you on Thursday.", "proposal", {
    reply: /Thursday/,
    after: "close",
  }),
  row("Can I put something in your calendar for Thursday?", "proposal", {
    reply: /Thursday/,
    after: "close",
  }),
  row("Does Tuesday at 10 work?", "proposal", { reply: /Tuesday at 10/, after: "close" }),
  row("What about a quick demo on Friday?", "proposal", { reply: /Friday/, after: "close" }),
  row("How about we talk again on Monday?", "proposal", { reply: /Monday/, after: "close" }),
  row("Maybe we could chat more on Thursday?", "proposal", { reply: /Thursday/, after: "close" }),
  row("I was thinking Thursday at 2, if that works.", "proposal", {
    reply: /Thursday at 2/,
    after: "close",
  }),
  row("Can I book you in for Tuesday at 3pm?", "proposal", {
    reply: /Tuesday at 3pm/,
    after: "close",
  }),
  row("Would you have time on Wednesday?", "proposal", { reply: /Wednesday/, after: "close" }),
  row("Do you have any time Thursday afternoon?", "proposal", {
    reply: /Thursday afternoon/,
    after: "close",
  }),
  row("Let me send you an invite for Wednesday at 9.", "follow_up", {
    reply: /Wednesday at 9/,
    after: "close",
  }),
  row("Could I steal 15 minutes of your time on Thursday?", "proposal", {
    reply: /Thursday/,
    after: "close",
  }),
  row("Next Tuesday, 10am, does that suit?", "proposal", { reply: /Tuesday/, after: "close" }),
  row("Can we pencil in Friday at 11?", "proposal", { reply: /Friday at 11/, after: "close" }),
  row("do you have time tomorrow", "proposal", { reply: /Tomorrow/, after: "close" }),

  // Round 5, lines from the author's own fresh calls that the reviewer's set didn't cover.
  row("Morning Ruth, Dev calling from Shelfwise. Is this a terrible moment?", "small_talk", {
    stage: "opening",
    reply: /few minutes, Dev|go ahead/i,
  }),
  row("Great. We work with multi-site retailers on stock counts and reordering.", "opener", {
    before: ["I've got a few minutes, Dev. Go ahead."],
    reply: /mean for us|in practice|who’s this for/i,
  }),
  row(
    "And what does a stock-out on a weekend actually cost one of your stores?",
    "problem_cost_question",
    {
      reply: /\$\d|overtime|customer|refund|chair|sales|time/i,
      not: /weekend|quiet/i,
    },
  ),
  row("Who would I need to convince besides you?", "decision_question", {
    reply: /sign|manager|dispatch lead|say/i,
  }),
  row("Great, invite's on its way. Enjoy the rest of your day.", "wrap_up", {
    stage: "close",
    before: ["Monday at 9 is packed for me. Could we do Thursday at the same time instead?"],
    reply: /For Thursday/,
  }),
  row(
    "Before anything else, how many empty slots would you guess you get in a week?",
    "quantity_question",
    {
      reply: /\b(two|three|four|five|six|hours?|\d+)\b/i,
      not: /one more thing|only that/i,
    },
  ),
  row(
    "I understand the hesitation. What did the last tool promise you that it didn't deliver?",
    "detail_question",
    {
      reply: /looked|tried|tweaked|not really|came with|once/i,
    },
  ),
  row(
    "Fair enough. If we ran it at a single clinic for a month at no cost, would that take the risk out?",
    "small_start",
    {
      reply: /one location|small|first step/i,
    },
  ),
  row("And who at head office would need to look at it?", "decision_question", {
    reply: /sign|manager|dispatch lead|say/i,
  }),
  row("What does your morning look like when everything goes to plan?", "process_question"),
  row("Last one: what would a good fix look like from where you sit?", "conditions_question", {
    reply: /proof|price|month|switch|quarter/i,
  }),
  row(
    "That's really helpful. Can I come back to you Tuesday with something concrete?",
    "follow_up",
    {
      reply: /Tuesday/,
      after: "close",
    },
  ),
  row(
    "I'm finishing a psychology degree and I've been running the student job board's advertiser outreach for two years.",
    "pitch",
    {
      voice: "hiring",
      before: ["Good to meet you, Jess. Why this role?"],
      after: "objection",
    },
  ),
  row("How much coaching does a new rep get in week one?", "detail_question", {
    voice: "hiring",
    reply: /week one|team lead|daily|month|calls/i,
  }),
  row(
    "I know I haven't carried a quota. I did bring in nineteen paying advertisers last year from cold outreach, though.",
    "pitch",
    {
      voice: "hiring",
      after: "objection",
    },
  ),
  row("Is the role mostly outbound, or is there inbound too?", "job_question", {
    voice: "hiring",
    reply: /outbound|phone|calls|half/i,
  }),
  row("What day would suit you for that?", "availability_question", {
    voice: "hiring",
    reply: /Thursday/,
    after: "close",
  }),
  row(
    "I'm good. So I'm finishing up in May and I'm chasing SDR roles at software companies.",
    "target",
    {
      voice: "contact",
      reply: /put in a word|hoping I can do/i,
    },
  ),
  row("I remember you knew someone at Fathom who runs their sales team.", "target", {
    voice: "contact",
    reply: /put in a word|hoping I can do/i,
  }),
  row(
    "That's completely fair, it's been a while. Would a two-line note from me make it easy for you to pass along?",
    "offer_to_send",
    {
      voice: "contact",
      reply: /few lines|send|easy|help/i,
    },
  ),
  row("What would you want me to put in it?", "detail_question", {
    voice: "contact",
    reply: /numbers|result|short|specific|did/i,
  }),
  row(
    "Brilliant. I'll let you know what comes back. Thanks Tom, give my best to the team.",
    "wrap_up",
    {
      voice: "contact",
      stage: "close",
      reply: /course|anytime|keep me posted|let me know|talk then|bye/i,
    },
  ),
  row("cool cool its ravi from boxroute sorry if its a bad time", "small_talk", {
    stage: "opening",
    reply: /few minutes, Ravi|go ahead/i,
  }),
  row("ok and whats that costing you a month roughly", "problem_cost_question", {
    reply: /\$\d|overtime|customer|refund|chair/i,
  }),
  row(
    "so like with us the customer gets a text before they even notice its late and support stops getting those emails",
    "pitch",
    {
      after: "objection",
    },
  ),
  row("yeah fair fair", "short_reply", { not: /say that again|once more/i }),
  row("so whats your take on it honestly", "detail_question", {
    reply: /honestly|interested|promises|useful/i,
  }),
  row("ok what if we did a quick 15 min screen share friday morning", "proposal", {
    reply: /Friday morning/,
    after: "close",
  }),

  // Round 5, paraphrases of the patterns the author's measurement calls missed.
  row("What percentage of orders show up late?", "quantity_question", {
    reply: /\b(two|three|four|forty|dozen|hundred|\d+|one in)\b/i,
  }),
  row("What's a typical afternoon like when two people don't turn up?", "process_question"),
  row("We flag the late ones to your customers before they chase you.", "pitch", {
    stage: "pitch",
    after: "objection",
  }),
  row(
    "Understood. If setup took an afternoon and nobody changed how they work, would that be different?",
    "hypothetical",
    {
      stage: "objection",
      before: OBJECTED,
      reply: /help|show me|see it|maybe|real/i,
    },
  ),
  row("Who would you want on the call before you'd say yes to a trial?", "decision_question", {
    reply: /sign|manager|dispatch lead|say/i,
  }),
  row("Would sometime early next week work for a follow-up, say Monday morning?", "proposal", {
    reply: /Monday morning/,
    after: "close",
  }),
  row("Has it got better or worse over the last year?", "detail_question", {
    reply: /worse|better|same|slowly|volume/i,
  }),
  row("What would good look like for you here?", "detail_question", {
    reply: /I’d want|one thing|wish|reach|minutes/i,
  }),
  row("Anything I should have asked and didn't?", "detail_question", {
    reply: /only that|one more|worth|out the/i,
  }),
  row("Would it be alright if I rang you back Friday with a couple of ideas?", "follow_up", {
    reply: /Friday/,
    after: "close",
  }),
  row("I've run the fundraising committee for two years and brought in about $8,000.", "pitch", {
    voice: "hiring",
    before: ["Good to meet you, Jess. Why this role?"],
    after: "objection",
  }),
  row("I set my own targets on that work and hit them most weeks.", "pitch", {
    voice: "hiring",
    after: "objection",
  }),
  row("I'm drawn to it because I like figuring out what people actually need.", "target", {
    voice: "hiring",
    reply: /what kind of conversations|conversation that went well/i,
  }),
  row("How many reps are you planning to bring on this year?", "detail_question", {
    voice: "hiring",
    reply: /couple a year|a few|when they/i,
  }),
  row("Could I come in and shadow the team one afternoon?", "open_proposal", {
    voice: "hiring",
    reply: /what day|when works/i,
    after: "close",
  }),
  row("Which morning works best for you?", "availability_question", {
    reply: /Thursday|Tuesday|open/i,
    after: "close",
  }),
  row("Thursday is perfect.", "proposal", {
    stage: "close",
    before: ["I keep Thursday afternoons for interviews. Does that suit you?"],
    voice: "hiring",
    reply: /^Thursday works/,
  }),
  row("Hey, it's Dan. How've things been at the agency?", "opener", {
    voice: "contact",
    stage: "opening",
    reply: /Dan|good|what’s going on/i,
    not: /how they hire/i,
  }),
  row("Are you still in contact with Grace?", "relationship_question", {
    voice: "contact",
    reply: /now and then|lunch|months|coffee|well enough|years/i,
  }),
  row("I think you mentioned your old colleague Grace leads sales at Harbourline now.", "target", {
    voice: "contact",
    reply: /put in a word|hoping I can do/i,
  }),
  row("how was your weekend anyway", "small_talk", {
    reply: /weekend|quiet|good|short/i,
    not: OPERATIONS,
  }),
  row("so what do you reckon, honestly", "detail_question", {
    reply: /honestly|interested|promises|useful/i,
  }),
  row("Which bit worries your team most, the learning curve or the setup?", "detail_question", {
    reply: /learning curve|training|manual/i,
  }),
  row("thursday at 9 then", "proposal", {
    stage: "close",
    before: ["Thursday morning works. Send the invite and I'll bring our practice manager."],
    reply: /Thursday at 9/,
    not: /thursday/,
  }),

  row(
    "How many patients would you say miss an appointment in a normal week?",
    "quantity_question",
    {
      scenario: CLINIC,
      reply: /no-shows|thirty/i,
      not: /hour a day|minutes a call/i,
    },
  ),
  row("roughly how long does the desk spend ringing round for that", "quantity_question", {
    scenario: CLINIC,
    reply: /hour|minutes/i,
    not: /no-shows a week/i,
  }),
  row("How often does a driver call in sick?", "quantity_question", {
    reply: /times a day|most days|mondays/i,
  }),
  row("Friday afternoon is perfect.", "proposal", {
    stage: "close",
    before: ["Next week's fairly open. Tuesday or Thursday morning would work."],
    reply: /^Friday afternoon (?:works|is packed)/,
  }),
  row("Thursday morning then.", "proposal", {
    stage: "close",
    before: ["Thursday's my best day. Mornings, ideally."],
    reply: /^Thursday morning works/,
  }),

  // Short turns, filler and the plainly unclear: neutral replies for the stage.
  row("ok", "short_reply", {
    reply: /what else|question|where were we|what can I do|next/i,
    not: /Mondays are the worst|It is, honestly|not great/i,
    after: "discovery",
  }),
  row("yeah", "short_reply", { not: /Mondays are the worst|It is, honestly/i, after: "discovery" }),
  row("sure", "short_reply", { not: /Mondays are the worst|It is, honestly/i }),
  row("so", "short_reply", { stage: "opening", not: OPERATIONS, after: "opening" }),
  row("right", "short_reply"),
  row("got it", "short_reply"),
  row("yeah that sounds rough", "short_reply", {
    not: /next step|from here|what would you suggest|Mondays are the worst/i,
    after: "discovery",
  }),
  row("I'll be quick.", "short_reply", { stage: "opening", after: "not-close" }),
  row("um so yeah we kind of do a bunch of stuff around scheduling i guess", "vague", {
    stage: "opening",
    reply: /what is it you actually do|what does that mean|example|not following/i,
  }),
  row("sorry, I mean, I've been kind of thinking about it for a while I guess", "vague", {
    voice: "hiring",
    reply: /example|in practice/i,
  }),
  row("I'm not sure, I guess whatever you think is best", "vague", {
    voice: "contact",
    reply: /simple|two lines|easiest/i,
  }),
  row("honestly I just really like talking to people", "unclear", {
    voice: "hiring",
    reply: /example|paid off|what do you know|why/i,
  }),
  row("I've always liked the competitive side of things.", "unclear", {
    voice: "hiring",
    reply: /example|paid off|what do you know|why/i,
  }),
  row("I'm calling because a few clinics I spoke with this week mentioned no-shows.", "topic", {
    stage: "opening",
    reply: /no-shows|what about|what do you want/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  // Final review: short acknowledgements and sign-offs are turns, not noise.
  ...[
    "Gotcha.",
    "Interesting.",
    "Absolutely.",
    "Yeah definitely.",
    "No worries.",
    "No problem.",
    "Sure thing.",
    "Cheers mate.",
    "Noted.",
    "Fantastic.",
    "Definitely.",
  ].map((line) => row(line, "short_reply", { not: NOT_HEARD, after: "discovery" })),
  row("Noted.", "short_reply", { voice: "hiring", not: NOT_HEARD }),
  row("Definitely.", "wrap_up", {
    stage: "close",
    before: BOOKED_THURSDAY,
    reply: /Thursday|bye|talk|see you|send/i,
    not: NOT_HEARD,
  }),
  row("Awesome!", "wrap_up", { stage: "close", before: BOOKED_THURSDAY, not: NOT_HEARD }),
  // "Understand" only acknowledges pushback when the student says they do; wanting to understand
  // the buyer's process is a question about it.
  row("I want to understand your process a bit better.", "process_question", {
    stage: "objection",
    before: OBJECTED,
    not: /fair enough|appreciate that|say that again/i,
    after: "not-close",
  }),
  row("I'd love to understand your setup better.", "process_question", {
    stage: "objection",
    before: OBJECTED,
    not: /fair enough|appreciate that|say that again/i,
    after: "not-close",
  }),
  // "Monday or Friday" is only a proposal inside a scheduling frame.
  row("Which is busier, Monday or Friday?", "busiest_question", {
    reply: /Monday|Friday|holiday|worst/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Is it usually Monday or Tuesday that's the worst?", "busiest_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Is it worse on Monday or Friday?", "busiest_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Do the reroutes pile up more on Monday or Friday?", "yes_no_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  // Checking it's a good time is never a meeting proposal.
  ...[
    "Do you have a minute?",
    "Do you have a quick minute?",
    "Have I called at a bad time?",
    "Hi there, Leo from Stockwise, have I called at an ok time?",
    "Hi Maya, it's Leo from Stockwise. Do you have a minute?",
  ].map((line) =>
    row(line, "small_talk", {
      stage: "opening",
      reply: /few minutes|go ahead|fine|what’s this about/i,
      not: ACCEPT_OR_COUNTER,
      after: "opening",
    }),
  ),
  // A contact hears a favour asked in any of the usual ways.
  ...[
    "Would you mind reaching out to him for me?",
    "Would you feel comfortable vouching for me?",
    "Could you maybe mention me to her?",
    "Would you mind putting in a good word for me?",
    "Any chance you could connect us?",
    "Is there any way you could pass my name along?",
  ].map((line) =>
    row(line, "favour", {
      voice: "contact",
      reply: /send me|draft|few lines|couple of lines|forward|happy to|sure/i,
      after: "close",
    }),
  ),
  // Yes-or-no questions about the person the student wants to reach get what the contact knows.
  row("Is he still hiring?", "target_question", {
    voice: "contact",
    reply: /hiring|roles|openings|reps|last I heard|as far as I know/i,
    after: "not-close",
  }),
  row("Do you know if she's hiring?", "target_question", {
    voice: "contact",
    reply: /hiring|roles|openings|reps|last I heard|as far as I know/i,
  }),
  row("Is he the one doing the hiring?", "target_question", {
    voice: "contact",
    reply: /hiring|right person|runs through|start there|make the call/i,
  }),
  row("Does she still work there?", "target_question", {
    voice: "contact",
    reply: /still there|same team|as far as I know|nothing had changed/i,
  }),
  row("Is she still at Brightpath, do you know?", "target_question", {
    voice: "contact",
    reply: /still there|same team|as far as I know|nothing had changed/i,
  }),
  row("Is she the right person to talk to?", "target_question", {
    voice: "contact",
    reply: /right person|runs through|start there|make the call/i,
  }),
  row("Does he usually reply to emails?", "target_question", {
    voice: "contact",
    reply: /repl|respond|short|week|chase/i,
  }),
  // A hiring manager answers timeline and process questions in kind.
  ...[
    "When are you hoping to fill the role?",
    "What's the timeline for hiring?",
    "how soon are you hoping to have people start",
  ].map((line) =>
    row(line, "job_question", {
      voice: "hiring",
      reply: /start|month|quarter|soon|weeks|quickly|openings/i,
      not: /ramp time|finding people/i,
    }),
  ),
  row("What does the interview process look like?", "detail_question", {
    voice: "hiring",
    reply: /team lead|account executive|project|call with/i,
    not: /outreach|afternoons are calls/i,
  }),
  row("What's the biggest challenge for new reps?", "job_question", {
    voice: "hiring",
    reply: /hearing no|research|dial|take it personally/i,
    not: /tight-knit|small team|review calls/i,
  }),
  row("What's the biggest mistake new SDRs make?", "job_question", {
    voice: "hiring",
    reply: /hearing no|research|dial|take it personally/i,
  }),
  // Either day offered is a proposal: "how about", "what about", "we could meet", or the bare pair.
  ...[
    "How about Monday or Tuesday?",
    "What about Monday or Tuesday?",
    "How about Monday or Tuesday next week?",
    "We could meet Monday or Tuesday.",
    "Monday or Tuesday?",
    "Monday or Tuesday at 10?",
  ].map((line) => row(line, "proposal", { reply: /^Tuesday/, not: /packed/i, after: "close" })),
  row("How about Monday or Tuesday at 10?", "proposal", {
    stage: "objection",
    before: OBJECTED,
    reply: /^Tuesday at 10/,
    after: "close",
  }),
  row("How about Monday or Tuesday?", "proposal", {
    before: ["Maybe. What day were you thinking, and how long do you need?"],
    reply: /^Tuesday/,
    after: "close",
  }),
  row("Monday or Tuesday?", "proposal", {
    before: ["Maybe. What day were you thinking, and how long do you need?"],
    reply: /^Tuesday/,
    after: "close",
  }),
  // A question about which day is busier for them is still a question, even with a day on the table.
  row("Is Monday or Tuesday busier for the dispatch team?", "busiest_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Are calls heavier Monday or Tuesday?", "yes_no_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  // "Call in sick" is the buyer's own pain, not a call being set up.
  row("Do more drivers call in sick on Monday or Friday?", "other_question", {
    reply: /sick|reroute|monday|friday/i,
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Is Monday or Tuesday quieter for you?", "busiest_question", {
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  row("Is Monday or Tuesday quieter for you?", "busiest_question", {
    before: ["Maybe. What day were you thinking, and how long do you need?"],
    not: ACCEPT_OR_COUNTER,
    after: "not-close",
  }),
  // A bare "Understand" agrees the concern is fair; wanting to understand something asks about it.
  ...[
    "Understand.",
    "Understand completely.",
    "Understand, mid-quarter is a tough time to change anything.",
    "Understand. Many of our clients said the same thing.",
  ].map((line) =>
    row(line, "acknowledgement", {
      stage: "objection",
      before: OBJECTED,
      reply: /example|who else|appreciate|helps a little|see it work/i,
      not: NOT_HEARD,
    }),
  ),
  row("Understand.", "short_reply", { not: NOT_HEARD, after: "not-close" }),
  row(
    "Understand, and I ran outbound for my club's sponsorships, booking 12 meetings.",
    "acknowledgement",
    {
      voice: "hiring",
      stage: "objection",
      before: HIRING_OBJECTED,
      reply: /first month|learn something fast|example/i,
    },
  ),
  row("I need to understand what's driving the timing.", "detail_question", {
    stage: "objection",
    before: OBJECTED,
    not: /appreciate that|who else like us|say that again/i,
    after: "not-close",
  }),
  row("I'd like to understand your concerns about the rollout.", "other_question", {
    stage: "objection",
    before: OBJECTED,
    not: /appreciate that|who else like us|say that again/i,
    after: "not-close",
  }),
  // Asking a contact to talk, say or speak about someone is a question, not a favour.
  row("Can you talk me through how she hires?", "process_question", {
    voice: "contact",
    reply: /hire|referrals|talked shop/i,
    after: "not-close",
  }),
  row("Could you talk a bit about the team she runs?", "process_question", {
    voice: "contact",
    not: /draft|forward|couple of lines/i,
    after: "not-close",
  }),
  row("Can you speak to what the culture is like there?", "process_question", {
    voice: "contact",
    not: /draft|forward|couple of lines/i,
    after: "not-close",
  }),
  row("Would you say she's approachable?", "target_question", {
    voice: "contact",
    reply: /I think so|not that I know/i,
    after: "not-close",
  }),
  row("Can you say why she left her last job?", "yes_no_question", {
    voice: "contact",
    not: /draft|forward|couple of lines|still there/i,
    after: "not-close",
  }),
  row("Would you recommend I reach out by email?", "yes_no_question", {
    voice: "contact",
    reply: /I think so|not that I know/i,
    after: "not-close",
  }),
  row("Could you possibly introduce me to her?", "favour", {
    voice: "contact",
    reply: /send me|draft|couple of lines|forward/i,
    after: "close",
  }),
  row("Could you pass my note to her?", "favour", {
    voice: "contact",
    reply: /send me|draft|couple of lines|forward/i,
    after: "close",
  }),
  // Talking, speaking, saying or recommending is a favour when it's aimed at the person or at me.
  ...[
    "Can you recommend me to her?",
    "Could you recommend me to the hiring manager?",
    "Could you talk to her about me?",
    "Would you mind speaking to her about me?",
    "Could you speak to her on my behalf?",
    "Would you say a word to her for me?",
    "Can you say something to her about me?",
    "Could you message her and let her know I'll reach out?",
  ].map((line) =>
    row(line, "favour", {
      voice: "contact",
      reply: /send me|draft|couple of lines|forward/i,
      after: "close",
    }),
  ),
  row("Do you know if he's still at Brightpath?", "target_question", {
    voice: "contact",
    reply: /still there|same team|as far as I know|nothing had changed/i,
  }),
  row("Is she the one who makes hiring decisions?", "target_question", {
    voice: "contact",
    reply: /right person|runs through|start there|make the call/i,
  }),
  row("Could you tell me how you know her?", "relationship_question", {
    voice: "contact",
    reply: /lunch|worked together|coffee|few months|send an email/i,
    after: "not-close",
  }),
  // Who runs a team is an owner question, even asked as a yes-or-no about the person.
  row("Is he the person who runs the SDR team?", "owner_question", {
    voice: "contact",
    reply: /sales director|head of sales/i,
    after: "not-close",
  }),
];

describe("the demo persona's turn corpus", () => {
  it("has well over a hundred labelled lines", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(415);
  });

  it.each(CORPUS.map((entry) => [entry.line, entry]))("hears %j for what it is", (_line, entry) => {
    const { voice = "buyer", stage = "discovery", before = [] } = entry;
    const scenario = scenarioFor(voice, stage, entry.scenario);
    // Raised when a previous line ends the way the hidden objection does ("…a rollout now.").
    const reading = readTurn(entry.line, {
      voice,
      stage,
      firstName: scenario.scenarioPublic.personaName.split(" ")[0] ?? "",
      turn: before.length + 1,
      booking: readBooking(before),
      objectionRaised: before.some((line) =>
        scenario.scenarioPrivate.hiddenObjections.some((objection) =>
          line.toLowerCase().includes(objection.slice(-14).toLowerCase()),
        ),
      ),
    });
    expect(reading.intent, entry.line).toBe(entry.intent);

    const reply = replyTo(entry);
    const text = textOf(reply);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(80);
    expect(text).not.toMatch(/^(?:Go on\.|Mm\. Keep going\.|Okay, and then\?)/);
    expect(text).not.toMatch(
      /Not sure I follow|behind the question|Why do you ask|think about (?:that|it)\./i,
    );
    expect(text).not.toMatch(/ {2}|make week work/);
    if (entry.reply) expect(text, entry.line).toMatch(entry.reply);
    if (entry.not) expect(text, entry.line).not.toMatch(entry.not);
    if (entry.after === "not-close") expect(stageOf(reply), entry.line).not.toBe("close");
    else if (entry.after) expect(stageOf(reply), entry.line).toBe(entry.after);
    expect(STAGES.indexOf(stageOf(reply) as Stage), entry.line).toBeGreaterThanOrEqual(
      STAGES.indexOf(stage),
    );
  });
});

/** Plays a whole call through the plan and turn prompts, the way the api does. */
async function play(skill: SkillSlug, seed: number, lines: readonly string[]) {
  const provider = new FakeProvider({ seed });
  const scenario = await provider.structured<Scenario>(
    {
      ...buildPlanPrompt({ skill }),
      maxTokens: 600,
      schema: z.object({
        scenarioPublic: ScenarioPublicSchema,
        scenarioPrivate: ScenarioPrivateSchema,
      }),
      schemaName: "scenario",
    },
    new AbortController().signal,
  );
  const transcript: TranscriptEntry[] = [
    { role: "partner", text: scenario.scenarioPublic.openingLine },
  ];
  let stage: Stage | undefined = "opening";
  const turns: { student: string; partner: string; stage: Stage }[] = [];
  for (const studentText of lines) {
    const prompt = buildTurnPrompt({
      skill,
      ...scenario,
      transcript,
      studentText,
      currentStage: stage,
    });
    let out = "";
    for await (const chunk of provider.chatStream(
      { ...prompt, maxTokens: 200, temperature: 0.7 },
      new AbortController().signal,
    )) {
      out += chunk;
    }
    const next = stageOf(out) as Stage;
    const text = textOf(out);
    turns.push({ student: studentText, partner: text, stage: next });
    transcript.push({ role: "student", text: studentText }, { role: "partner", text });
    stage = next;
  }
  return { scenario, turns };
}

const stagesNeverGoBack = (turns: readonly { stage: Stage }[]) => {
  let last = 0;
  for (const turn of turns) {
    const index = STAGES.indexOf(turn.stage);
    expect(index).toBeGreaterThanOrEqual(last);
    last = index;
  }
};

const noRepeats = (turns: readonly { partner: string }[]) => {
  const lines = turns.map((turn) => turn.partner);
  expect(new Set(lines).size).toBe(lines.length);
};

describe("whole calls through the real prompts", () => {
  it("runs a cold call from opener to a booked meeting and a goodbye", async () => {
    const { turns } = await play("pitching", 14, [
      "Hi, is this a good time? I'm Morgan from Shiftwell.",
      "we work with teams like yours on the boring scheduling stuff",
      "What does a normal Tuesday look like for your team?",
      "how many people touch that each week",
      "and what happens when it goes wrong",
      "Got it. So Shiftwell automates the reminders and fills cancelled slots, which saves about five hours a week.",
      "I understand. What would you need to see to feel good about it?",
      "What do you pay for the current setup?",
      "Fair. Our pricing is $300 a month per location.",
      "Could we do a 30-minute walkthrough next Wednesday at 11?",
      "Great, I'll send the invite tonight.",
      "ok bye",
    ]);
    stagesNeverGoBack(turns);
    noRepeats(turns);
    expect(turns[0]?.partner).toMatch(/few minutes|go ahead/i);
    expect(turns[0]?.stage).toBe("opening");
    expect(turns[5]?.stage).toBe("objection");
    expect(turns[9]?.partner).toMatch(/Wednesday at 11/);
    expect(turns[9]?.stage).toBe("close");
    // Either the day was accepted, or the buyer offered Thursday and the invite is for that.
    const day = turns[9]?.partner.includes("Could we do Thursday") ? "Thursday" : "Wednesday";
    expect(turns[10]?.partner).toMatch(
      new RegExp(`look out|keep an eye|${day}|see you|sounds good`, "i"),
    );
    expect(turns[11]?.partner).toMatch(new RegExp(`talk ${day}|bye|see you|talk then`, "i"));
    expect(turns[11]?.partner).not.toMatch(/next step|get this moving|from here/i);
  });

  it("handles objections, an offer to send material, and a booked call", async () => {
    const { turns } = await play("objection-handling", 6, [
      "Thanks for picking up. I'm Priya from Routekeep, we help carriers replan routes when drivers call in sick.",
      "How do you handle sick calls right now?",
      "Our tool rebuilds routes in two minutes and texts drivers.",
      "That makes sense. Can I ask what the current tool does well?",
      "I hear you on timing. One firm your size started in the slow week after a holiday and was live in five days.",
      "Who else would need to be comfortable before you'd try it?",
      "Would it help if I sent a one-page summary your manager could read?",
      "Should we set up a call Friday at 1pm with your manager?",
      "Thanks Maya.",
    ]);
    stagesNeverGoBack(turns);
    noRepeats(turns);
    expect(turns[0]?.partner).toMatch(OPENER_REPLY);
    expect(turns[0]?.partner).not.toMatch(/what else did you want to ask/i);
    expect(turns[2]?.stage).toBe("objection");
    expect(turns[3]?.partner).toMatch(/works|job|fine|well|falls apart|phones|story|sick/i);
    expect(turns[4]?.partner).toMatch(/result|how long|talk to them|five days/i);
    expect(turns[6]?.partner).toMatch(/send|manager|page/i);
    expect(turns[6]?.partner).not.toMatch(/one location/i);
    expect(turns[7]?.partner).toMatch(/Friday at 1pm/);
    expect(turns[8]?.partner).toMatch(/talk Friday|bye|see you|talk then|look out|thanks/i);
  });

  it("interviews like a hiring manager and never accepts a day it just refused", async () => {
    const { turns } = await play("introducing-yourself", 5, [
      "Hi Dana, I'm Sam. I'm finishing a marketing degree and I'm really interested in your SDR opening.",
      "I've always liked the competitive side of things.",
      "Can I ask what separates your best SDRs from the rest?",
      "I ran the phone bank for a campus campaign and we made 2,000 calls in three weeks.",
      "That's a fair worry. I picked marketing before I knew sales roles existed for new grads.",
      "How much of the job is cold calling versus email?",
      "What's the salary range for the role?",
      "Who would I report to?",
      "Would you have 20 minutes next Tuesday afternoon to talk more?",
      "Tuesday at 3pm?",
      "Thank you, I'll send a calendar invite.",
    ]);
    stagesNeverGoBack(turns);
    noRepeats(turns);
    expect(turns[2]?.partner).toMatch(/prepar|research|personally|best|curious/i);
    expect(turns[3]?.stage).toBe("objection");
    expect(turns[5]?.partner).toMatch(/call|phone|email|outbound/i);
    expect(turns[6]?.partner).toMatch(/posting|base|range/i);
    expect(turns[7]?.partner).toMatch(/team lead|me\b/i);
    expect(turns[8]?.partner).toMatch(/Tuesday/);
    const refused = /is packed|no good|can’t do/i.test(turns[8]?.partner ?? "");
    if (refused) {
      expect(turns[9]?.partner).not.toMatch(/Tuesday at 3pm works/);
      expect(turns[9]?.partner).toMatch(/Tuesday|Thursday/);
    } else {
      expect(turns[9]?.partner).toMatch(/Tuesday at 3pm/);
    }
    expect(turns[10]?.partner).toMatch(/talk|bye|see you|look out|thanks|good luck|For Thursday/i);
  });

  it("helps like a contact: relationship, favour, follow-up date, goodbye", async () => {
    const { turns } = await play("referrals-networking", 7, [
      "Hi! Thanks for picking up, how are you?",
      "I'm good. I wanted to ask you something. I'm applying to Brightline and saw Marcus is hiring for their SDR team.",
      "Are you still in touch with Marcus?",
      "I totally get that you don't want to vouch blind. I can send you my resume and the two projects I did on your team.",
      "Would you be willing to introduce me by email?",
      "Could you send it by Wednesday?",
      "I'll check in Thursday to see if he replied.",
      "Thanks so much, I owe you one.",
    ]);
    stagesNeverGoBack(turns);
    noRepeats(turns);
    expect(turns[0]?.partner).toMatch(SMALL_TALK_REPLY);
    expect(turns[1]?.partner).toMatch(/put in a word|hoping I can do/i);
    expect(turns[2]?.partner).toMatch(/touch|email|months|years|coffee|well enough/i);
    expect(turns[3]?.partner).toMatch(/send|help|read/i);
    expect(turns[5]?.partner).toMatch(/Wednesday/);
    expect(turns[6]?.partner).toMatch(/Thursday/);
    expect(turns[7]?.partner).toMatch(/anytime|course|talk Thursday|keep me posted|let me know/i);
  });

  it("stays human through an awkward call of fragments and small talk", async () => {
    const { turns } = await play("pitching", 3, [
      "hi",
      "yeah",
      "so",
      "did you catch the game last night",
      "haha anyway the weather's been wild here, we got like a foot of snow and my car is still buried and honestly I've been meaning to call for a while but things kept coming up and anyway I work at a company that does software for, well, scheduling and routing and reminders and a few other things depending on who you are",
      "ok",
      "Can we find some time on Thursday to go through this properly?",
      "How about Monday at 10?",
      "Are you around Tuesday afternoon at 2pm for a quick demo?",
      "cool",
      "thx",
    ]);
    stagesNeverGoBack(turns);
    noRepeats(turns);
    for (const turn of turns.slice(0, 6)) {
      expect(turn.partner).not.toMatch(OPERATIONS);
      expect(turn.partner).not.toMatch(/Mondays are the worst|It is, honestly|Say more/i);
    }
    expect(turns[3]?.partner).toMatch(/highlights|game|missed|didn’t|no\b|busy/i);
    expect(turns[4]?.partner).toMatch(OPENER_REPLY);
    expect(turns[6]?.partner).toMatch(/Thursday/);
    expect(turns[6]?.stage).toBe("close");
    // Two more days after a booked one: the persona keeps it to one meeting.
    expect(turns[7]?.partner).toMatch(/Thursday|Monday/);
    expect(turns[8]?.partner).toMatch(/Thursday|Monday|Tuesday/);
    expect(turns[9]?.partner).toMatch(/talk|bye|see you|look out|sounds good|thanks/i);
    expect(turns[9]?.partner).not.toMatch(/next step|get this moving|from here|decent case/i);
    expect(turns[10]?.partner).toMatch(/talk|bye|see you|look out|sounds good|thanks/i);
    expect(turns[10]?.partner).not.toMatch(/next step|get this moving|from here|decent case/i);
  });

  it("turns a day down once, then books the next one offered", async () => {
    for (const seed of [71, 80, 81]) {
      const { turns } = await play("next-steps", seed, [
        "Hi Maya, I'm Alex from Routekeep.",
        "Routekeep rebuilds routes in two minutes, which saves your dispatchers hours.",
        "Could we set up a 20-minute call Tuesday at 10?",
        "Hmm, what about Tuesday at 3 then?",
        "Okay, Thursday at 10 it is.",
        "Great, I'll send the invite.",
      ]);
      stagesNeverGoBack(turns);
      noRepeats(turns);
      const refusedTuesday = turns[2]?.partner.includes("is packed") ?? false;
      if (refusedTuesday) {
        expect(turns[3]?.partner).toMatch(/Tuesday|Thursday/);
        expect(turns[3]?.partner).not.toMatch(/Tuesday at 3 works/);
        expect(turns[4]?.partner).toMatch(/^Thursday at 10 works/);
      } else {
        expect(turns[2]?.partner).toMatch(/^Tuesday at 10 works/);
      }
      expect(turns[5]?.partner).toMatch(/look out|keep an eye|talk|bye|invite/i);
    }
  });

  it("keeps the README practice-room exchange", async () => {
    const { scenario, turns } = await play("pitching", 1, [
      "Hi Sam, thanks for making time. I work with clinic groups whose front desks spend hours a week on appointment reminders. How do your clinics handle reminders today?",
      "Got it, so the front desk phones everyone the day before. Groups like yours usually get most of that time back once reminders go out on their own. Who owns that process right now?",
    ]);
    expect(scenario.scenarioPublic.personaName).toBe("Sam Achterberg");
    expect(turns[0]?.partner).toBe(
      "The front desk phones patients the day before. If nobody picks up, we just hope they show.",
    );
    expect(turns[1]?.partner).toBe("Our practice manager runs it day to day.");
  });
});
