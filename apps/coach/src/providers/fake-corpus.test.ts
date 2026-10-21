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
import { buildPlanPrompt } from "../prompts/persona-plan.js";
import { buildTurnPrompt } from "../prompts/persona-turn.js";
import { type Intent, type Voice, readTurn } from "./fake-intents.js";
import { personaReply } from "./fake-persona.js";
import { FakeProvider } from "./fake.js";

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
}

const row = (line: string, intent: Intent, rest: Omit<Row, "line" | "intent"> = {}): Row => ({
  line,
  intent,
  ...rest,
});

/** The reviewer's probes open with a clinic buyer; everything else uses the voice's scenario. */
const scenarioFor = (voice: Voice, stage: Stage): Scenario =>
  voice === "buyer" && stage === "opening" ? CLINIC : SCENARIOS[voice];

/** The persona's reply to `line`, with the call so far as the turn prompt sends it. */
function replyTo({ line, voice = "buyer", stage = "discovery", before = [] }: Row): string {
  const scenario = scenarioFor(voice, stage);
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

const OPERATIONS = /front desk|spreadsheet|dispatcher|phones patients|skipped|depends who's on/i;
const ACCEPT_OR_COUNTER = /works\.|is packed|I can do|should work|any better/i;

const OPENER_REPLY =
  /why|what's this about|what made you|reach out|calling|meet you|background|drew you|tell me|going on|what can I do/i;
const SMALL_TALK_REPLY =
  /thanks|busy|good|fine|not bad|quiet|highlights|weather|been a while|few minutes|go ahead|speaking/i;

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
  row("Is this Ruth?", "name_check", { stage: "opening", reply: /speaking|it is|who's this/i }),
  row("Thanks for taking my call.", "thanks", {
    stage: "opening",
    reply: /what's this about|what can I do|go ahead/i,
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
    reply: /highlights|game|missed|didn't|no\b|busy/i,
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
    reply: /been a while|good|busy|what's new|what's up/i,
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
    reply: /AI practice partner/,
  }),
  row("is this a bot", "identity", { reply: /AI practice partner/ }),
  row("am I speaking with a real person", "identity", { reply: /AI practice partner/ }),
  row("wait is this AI", "identity", { reply: /AI practice partner/ }),
  row("Are you a person or a recording?", "identity", {
    stage: "opening",
    reply: /AI practice partner/,
    after: "opening",
  }),
  row("are you real", "identity", { reply: /AI practice partner/ }),

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
  row("Can I ask what's behind that?", "other_question", {
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
    reply: /\b(two|three|four|hours?|hundred|\d+)\b/i,
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
    reply: /sure|few minutes|what's up|going on/i,
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
];

describe("the demo persona's turn corpus", () => {
  it("has well over a hundred labelled lines", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(210);
  });

  it.each(CORPUS.map((entry) => [entry.line, entry]))("hears %j for what it is", (_line, entry) => {
    const { voice = "buyer", stage = "discovery", before = [] } = entry;
    const scenario = scenarioFor(voice, stage);
    // Raised when a previous line ends the way the hidden objection does ("…a rollout now.").
    const reading = readTurn(entry.line, {
      voice,
      stage,
      firstName: scenario.scenarioPublic.personaName.split(" ")[0] ?? "",
      said: before,
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
    expect(turns[5]?.partner).toMatch(/call|phone|email/i);
    expect(turns[6]?.partner).toMatch(/posting|base|range/i);
    expect(turns[7]?.partner).toMatch(/team lead|me\b/i);
    expect(turns[8]?.partner).toMatch(/Tuesday/);
    const refused = /is packed|no good|can't do/i.test(turns[8]?.partner ?? "");
    if (refused) {
      expect(turns[9]?.partner).not.toMatch(/Tuesday at 3pm works/);
      expect(turns[9]?.partner).toMatch(/Tuesday|Thursday/);
    } else {
      expect(turns[9]?.partner).toMatch(/Tuesday at 3pm/);
    }
    expect(turns[10]?.partner).toMatch(/talk|bye|see you|look out|thanks|good luck/i);
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
    expect(turns[3]?.partner).toMatch(/highlights|game|missed|didn't|no\b|busy/i);
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
