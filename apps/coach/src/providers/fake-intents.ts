import type { Stage } from "@pitchperfect/shared";
import { ACKNOWLEDGE } from "./fake-patterns.js";

/**
 * What kind of turn the student just took, read the way a person on the call would read it: the
 * turn is split into sentences, each sentence is checked against small, named rules, and the kinds
 * are combined with a fixed precedence (a meeting proposal beats a question, a question beats a
 * pitch, an acknowledgement is only a lead-in when something else follows it).
 */

export type Voice = "buyer" | "hiring" | "contact";

export type Intent =
  | "identity"
  | "name_check"
  | "greeting"
  | "opener"
  | "small_talk"
  | "busy_remark"
  | "proposal"
  | "confirm"
  | "follow_up"
  | "open_proposal"
  | "availability_question"
  | "favour"
  | "offer_to_send"
  | "small_start"
  | "target"
  | "topic"
  | "process_question"
  | "quantity_question"
  | "timing_question"
  | "problem_cost_question"
  | "cost_question"
  | "quality_question"
  | "conditions_question"
  | "owner_question"
  | "staff_question"
  | "busiest_question"
  | "decision_question"
  | "tool_question"
  | "relationship_question"
  | "job_question"
  | "yes_no_question"
  | "other_question"
  | "acknowledgement"
  | "proof"
  | "pitch"
  | "wrap_up"
  | "thanks"
  | "short_reply"
  | "vague"
  | "unclear";

export type SmallTalkTopic = "time" | "weekend" | "weather" | "game" | "general";
export type JobTopic = "mix" | "best" | "fit" | "success" | "team" | "size";
export type OfferTopic = "caseStudy" | "passAlong" | "generic";

export interface TurnContext {
  voice: Voice;
  stage: Stage;
  firstName: string;
  /** What the persona has said so far in this call, oldest first. */
  said: readonly string[];
  objectionRaised: boolean;
}

export interface Reading {
  intent: Intent;
  /** The sentence that decided the kind of turn. */
  sentence: string;
  /** A day or time in that sentence, as the student wrote it. */
  time: string | undefined;
  /** The student's first name, when they gave it. */
  name: string | undefined;
  /** Whether an opener named the student or their company, rather than just what they do. */
  named: boolean;
  smallTalk: SmallTalkTopic | undefined;
  job: JobTopic | undefined;
  offer: OfferTopic | undefined;
  /** The student said they would send an invite. */
  invite: boolean;
  /** "Is this Maya?" when the persona is someone else. */
  wrongName: boolean;
}

/** Splits a turn into sentences; a turn with no punctuation is one sentence. */
const sentencesOf = (line: string): string[] =>
  line
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/** A day or a time, with its part of day: "Thursday morning", "next Tuesday at 2pm", "next week". */
const TIME =
  /\b(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|tomorrow)\b(?:\s+(?:morning|afternoon|evening))?(?:\s+at\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?)?|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:next|this) week\b/i;
const T = `(?:${TIME.source})`;

/** The day or time in a sentence, with "next" dropped from a day ("next Tuesday" is "Tuesday"). */
export function timeIn(text: string): string | undefined {
  const found = TIME.exec(text)?.[0].trim();
  if (!found) return undefined;
  return /^next\s+week/i.test(found) ? found : found.replace(/^next\s+/i, "");
}

const MEETING_NOUN =
  "(?:meeting|call|demo|chat|time|slot|session|invite|minutes?|coffee|walkthrough|walk-through|catch-up|catch up|conversation|zoom|video call|appointment|sit-down|huddle)";
const SETUP_VERB =
  "(?:set up|setup|book|grab|schedule|get|find|put|send|have|hold|block|lock in|pencil in|do|hop on|jump on|get on|arrange|fix|make|squeeze in|carve out|spare|free up|take|open to|up for)";
const MEASURE =
  "(?:a|an|the|some|another|that|this|our|\\d+|ten|fifteen|twenty|thirty|forty|forty-five|half an hour|quick|short|brief|proper|a couple of|a few)";

/** Setting up a meeting noun: "hop on a call", "grab 20 minutes", "do a 30-minute walkthrough". */
const MEETING_SETUP = new RegExp(
  `\\b${SETUP_VERB}\\b(?:\\s+[\\w'-]+){0,3}?\\s+${MEASURE}\\b(?:\\s+[\\w-]+){0,2}?\\s+${MEETING_NOUN}\\b(?!\\s+to\\b)`,
  "i",
);
const AVAILABLE = /\bare you (?:free|around|available|open|up for)\b/i;

const FITS =
  "(?:works?|suits?|sounds?|be|is|any good|good|ok|okay|fine|alright|possible|convenient|better|doable)";
const FITS_TAIL =
  `(?:\\s+(?:good|ok|okay|fine|alright|any good|possible|convenient|better|doable|best))?` +
  `(?:\\s+(?:(?:for|with) )?(?:you|everyone)\\b(?:\\s+(?:both|two|guys|at all|too))?)?` +
  `(?:\\s+for (?:a|an|the)(?:\\s+[\\w-]+){0,2}\\s+${MEETING_NOUN})?` +
  `(?:\\s+(?:instead|then|too|as well|at all|maybe))?(?:\\s+(?:with|and) [^?.!]+)?\\s*[?.!]*$`;
/** This person's availability for a time: "would Thursday work for you", "how does 2pm sound". */
const TIME_FITS_YOU = new RegExp(
  `^(?:[\\w,' ]{0,24}?\\b)?(?:(?:how|and|or|so) )?(?:does|would|will|could|might|is|do|can)?\\s*${T}\\s+${FITS}${FITS_TAIL}`,
  "i",
);
/** "Would that work for you?" with no time: the time is whatever is on the table. */
const CONFIRM =
  /^(?:(?:so|and|ok(?:ay)?|great|perfect|cool),?\s+)*(?:would|does|will|could|is) (?:that|this|it) (?:work|suit|ok|okay|good|fine|be (?:ok|okay|good|fine|alright)) (?:for|with) you\b/i;

const LEAD =
  "(?:(?:so|ok|okay|or|maybe|and|alternatively|great|perfect|sure|alright|hmm|well|um),?\\s+)*";
const HOW_ABOUT = new RegExp(
  `^${LEAD}(?:how|what) about ${T}(?:\\s+(?:instead|then))?(?:\\s+(?:with|for) [^?.!]+)?\\s*[?.!]*$`,
  "i",
);
const BARE_TIME = new RegExp(
  `^${LEAD}${T}(?:\\s+(?:then|instead|works|would work|is better|is fine|it is|maybe|perhaps))?\\s*[?.!]*$`,
  "i",
);
const WE_MEET = new RegExp(
  `\\b(?:could|can|shall|should|will|would|do) (?:we|you and i|you) (?:do|meet|chat|connect|speak|talk|catch up|get together|reconnect|continue|pick (?:this|it) up|go through (?:this|it))(?:\\s+(?:this|it|again|then|more|properly|live|in person|over coffee|by phone|on the phone))?(?:\\s+(?:on|at|for))?\\s+${T}`,
  "i",
);
const LETS = new RegExp(
  `\\blet'?s (?:do|say|go with|make it|try|aim for|pencil in|lock in|plan on|plan for|meet|talk|chat|catch up|connect|pick (?:this|it) up|reconnect|touch base|circle back|regroup|do it|do this)(?:\\s+(?:again|then|on|at|for))?\\s+${T}`,
  "i",
);
/** "Would it be easier to talk again next Tuesday?": a meeting verb with the time right after. */
const TO_MEET = new RegExp(
  `\\bto (?:talk|meet|chat|speak|catch up|reconnect|regroup|go through (?:it|this)|walk through (?:it|this))(?:\\s+(?:again|more|properly|in person|live))?(?:\\s+(?:on|at))?\\s+${T}`,
  "i",
);
const WANT_TO =
  /\b(?:want to|wanna|fancy|up for|open to|keen to|happy to|able to|free to|willing to|like to) (?:hop on|jump on|grab|do|have|meet|talk|chat|catch up|connect|get on|set up|book)\b/i;

/** A promise to be back in touch: "I'll call you next week", "see you Thursday". */
const FOLLOW_UP =
  /\b(?:i'll|i will|let me|i can|i'd love to|i'd like to|i'm going to|i'm gonna|we'll)\b(?:\s+[\w'-]+){0,8}?\s*\b(?:call (?:you|back|again)|ring you|follow up|check in|circle back|touch base|reach out|send (?:you |over )?(?:an |the |a )?(?:calendar )?invite|get back to you|be in touch|talk (?:to you )?(?:then|on|next|again)|speak (?:to you )?(?:then|on|next|again)|come back to you|chase)\b|\b(?:see you|catch you|talk to you|speak to you|talk|speak)\s+(?:then|soon|next week|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|tomorrow))\b/i;
/** The verb of the follow-up, so the time right after it is the one that counts. */
const FOLLOW_UP_VERB =
  /\b(?:call (?:you|back|again)|ring you|follow up|check in|circle back|touch base|reach out|send (?:you |over )?(?:an |the |a )?(?:calendar )?invite|get back to you|be in touch|talk (?:to you )?(?:then|on|next|again)|speak (?:to you )?(?:then|on|next|again)|come back to you|chase|see you|catch you)\b/i;

const OPEN_PROPOSAL = new RegExp(
  [
    `\\bwould you be (?:open|up|willing|able|free|available) (?:to|for) (?:a |an |another )?(?:[\\w-]+ ){0,2}(?:call|chat|demo|meeting|pilot|trial|coffee|conversation|walkthrough|catch-up)\\b`,
    `\\bwould a (?:trial|pilot|demo|call|meeting|chat)(?:\\s+[\\w-]+){0,3}? (?:help|work|make sense|be useful|be worth)\\b`,
    `\\b(?:could|can|shall|should) we (?:set up|book|schedule|do|have|grab|get|run|try|find|start) [^?.!]*\\b(?:call|chat|demo|meeting|pilot|trial|time|minutes)\\b`,
    `${WANT_TO.source}[^?.!]*\\b${MEETING_NOUN}\\b`,
    `\\bwhen (?:can|could|should) we (?:meet|talk|chat|do (?:this|that|it))\\b`,
  ].join("|"),
  "i",
);
const SEND_INVITE =
  /\bi'?ll (?:send|get|put|shoot) (?:you |over |across )?(?:the |an |a |that )?(?:calendar )?(?:invite|invitation)\b|\bsend (?:you |over )?(?:the |an |a )?(?:calendar )?invite\b|\binvite (?:is )?on (?:its|the) way\b|\bi'?ll (?:put|get) (?:it|that|something) (?:on|in) (?:the|your) calendar\b/i;

/** "What does next week look like for you": this person's own time, not their team's. */
const AVAILABILITY_QUESTION =
  /\bwhat does (?:next week|this week|tomorrow|\w+day)(?: morning| afternoon)? look like for you\b|\bhow(?:'s| is| does) your (?:week|calendar|schedule|diary|\w+day)(?: morning| afternoon)? look(?:ing)?\b|\bwhen (?:are|would|will|might|could) you (?:be )?(?:free|available|around|open|able)\b|\bwhat (?:day|time)s? (?:work|works|suit|suits|is best|are best|is good|would work)(?: best)?(?: for you)?\s*[?.!]*$|\bwhen(?:'s| is| would be) (?:a )?good (?:time|day)?(?: for you)?\b|\bhow(?:'s| is) (?:next week|this week|\w+day)(?: morning| afternoon)? (?:looking|for you)\b/i;

/** Something a contact can do for the student. */
const FAVOUR =
  /\b(?:could|can|would) you (?:send|forward|introduce|pass|make|do|share|put|connect|mention|flag|vouch)\b|\bwould you be (?:comfortable|willing|open to|happy to|okay|ok|up for) (?:introduc|send|forward|connect|pass|vouch|put|mak|flag)|\bwould you (?:mind|be willing to) (?:send|forward|introduc|pass|connect|mak)|\bcould i get an intro|\bput me in touch\b|\bput in a (?:good )?word\b/i;

const MATERIAL =
  "(?:case stud(?:y|ies)|summary|one-pager|one pager|one-page|page|deck|resume|résumé|cv|draft|intro(?:duction)?|note|email|details|info(?:rmation)?|numbers|proposal|pricing|examples?|references?|portfolio|writing samples?|samples?|links?|overview|brochure|quote|figures|breakdown|comparison|calculator|video|recording|it|that|something|a few lines|two lines|three lines|my [\\w-]+)";
/** The student offers to send or write something. */
const OFFER_TO_SEND = new RegExp(
  `\\b(?:would it help if|what if|how about if|do you mind if|mind if|could|can|shall|should|may|want me to|happy to|i could|i can|i'll|i will|i'd be happy to|i'd love to|i would love to|i was going to|i'm happy to|let me|i'd be glad to) (?:i )?(?:sent|send|shoot|forward|share|put together|draft|write|get|email|pass|fire|drop)\\b(?:\\s+(?:you|over|across|along|through))?(?:\\s+[\\w'-]+){0,3}?\\s+${MATERIAL}\\b`,
  "i",
);
const SMALL_START =
  /\bwhat if we (?:started|start|tried|try|ran|run|began|begin)\b|\bwhat if (?:the first|one|a single|just one) (?:location|site|clinic|store|team|branch|depot|pilot)\b|\bstart(?:ed|ing)? (?:with|small|on|at) (?:one|a single|just one|small|a pilot)\b|\bone (?:location|site|clinic|store|team|branch|depot) (?:first|to start|to begin with)\b|\bpilot (?:at|in|with) one\b|\bstart small\b|\bjust one (?:location|site|clinic|store|team|branch)\b/i;
/** The student names who is hiring or who they want to reach. */
const TARGET =
  /\b(?:is|are|'s) hiring\b|\blooking at (?:\w+ )?roles\b|\bapplying (?:to|for)\b|\bwant(?:ed)? to (?:meet|talk to|reach|get in front of)\b|\bintro(?:duction)? to\b|\bsaw (?:that )?\w+ (?:is|has) (?:hiring|an opening)|\bopening at\b/i;
/** The student names what they want to talk about. */
const TOPIC_ASK =
  /\blet'?s talk about\b|\b(?:can|could) we talk about\b|\bi(?:'d| would) like to (?:talk|ask) about\b|\bi wanted to (?:talk|ask) (?:to you )?about\b|\bquick question about\b/i;
/** A candidate says what they're after: "I'm hoping to start in sales development". */
const GOAL =
  /\bi(?:'m| am) (?:hoping|looking|aiming|trying) to\b|\bi want to (?:start|work|get into|move into|break into)\b|\bi'?d (?:like|love) to (?:start|work|get into|move into|break into)\b|\blooking for (?:a|an|my first) (?:role|job|position)\b/i;
const TOPIC = new RegExp(
  `${TOPIC_ASK.source}|\\bi(?:'m| am) calling (?:because|about)\\b|\\bthe reason i(?:'m| am) calling\\b|\\bi noticed\\b`,
  "i",
);
const BUSY_REMARK =
  /\byou(?:'re| are| sound| seem) (?:busy|swamped|slammed|rushed)\b|\bcaught you at a bad time\b/i;

const IDENTITY =
  /\b(?:are|r) (?:you|u) (?:a |an )?(?:real|actual|live)?\s*(?:person|human|bot|robot|ai|machine|recording|real)\b|\bis this (?:a |an )?(?:real |actual |live )?(?:person|human|bot|robot|ai|machine|recording)\b|\b(?:am i|are we) (?:talking|speaking) (?:to|with) (?:a |an )?(?:real |actual |live )?(?:person|human|bot|robot|ai|machine|recording)\b/i;

const SMALL_TALK: readonly { topic: SmallTalkTopic; pattern: RegExp }[] = [
  {
    topic: "time",
    pattern:
      /\bis (?:now|this) (?:an? )?(?:ok(?:ay)?|good|bad|alright|decent) time\b|\b(?:got|do you have|have you got|you have) (?:a |two |2 |five |5 |a couple of |a few |a quick )?(?:minute|minutes|min|sec|second|moment)s?\b|\bcatch you at an? (?:good|ok(?:ay)?|alright|decent) time\b/i,
  },
  {
    topic: "weekend",
    pattern:
      /\bweekend\b|\bany (?:fun |big |nice )?plans\b|\bday off\b|\bholidays?\b|\bvacation\b|\btime off\b/i,
  },
  {
    topic: "weather",
    pattern:
      /\bweather\b|\b(?:snow|snowing|rain|raining|heatwave|storm|cold out|hot out|sunny|freezing)\b/i,
  },
  {
    topic: "game",
    pattern: /\bthe game\b|\bthe match\b|\blast night'?s game\b|\bplayoffs?\b|\bthe finals?\b/i,
  },
  {
    topic: "general",
    pattern:
      /\bhow(?:'s| is| are|'re) (?:you|things|it|everything|life|stuff)(?: (?:doing|going|been|holding up|treating you))?(?: (?:today|this week|these days|so far|lately|over there))?\s*[?!.,]*$|\bhow have you been\b|\bhow(?:'s| is| has| was) (?:your )?(?:week|day|morning|afternoon|\w+day|month|quarter)(?: been| going| treating you| so far)?\s*[?!.,]*$|\bit'?s been (?:forever|a while|ages|too long|a minute)\b|\blong time\b|\bhope (?:you'?re|you are|all is|everything'?s|everything is) (?:well|good|doing well|having|okay|ok|great)|\bhappy (?:friday|monday|tuesday|wednesday|thursday|new year|holidays|belated)\b|\bgood to (?:hear|talk to|catch up with) you\b|\bnice to (?:hear from|talk to) you\b/i,
  },
];

const GREETING =
  /^(?:hi|hey|hello|hiya|yo|good (?:morning|afternoon|evening)|morning|afternoon)\b[\w ,!.?']{0,20}$/i;

/** The student's first name: "I'm Chris", "this is Alex". Common words after "I'm" don't count. */
const INTRO_NAME =
  /\b(?:I'm|I am|[Tt]his is|[Mm]y name is|[Ii]t's|[Nn]ame's) ([A-Z][a-z]+)\b|\b([A-Z][a-z]+) here(?:,| from| with| at)\b/;
const NOT_A_NAME = new Set([
  "Sorry",
  "Good",
  "Fine",
  "Happy",
  "Calling",
  "Here",
  "Not",
  "Just",
  "Really",
  "Glad",
  "Looking",
  "Interested",
  "Finishing",
  "Applying",
  "Reaching",
  "Hoping",
  "Curious",
  "Sure",
  "Okay",
  "Actually",
  "Also",
  "So",
  "Going",
  "Trying",
  "Great",
  "Afraid",
  "Pretty",
  "Still",
  "Doing",
  "Working",
  "With",
  "From",
  "The",
  "A",
  "An",
  "Done",
  "Back",
  "Only",
  "All",
]);

function nameIn(line: string): string | undefined {
  const match = INTRO_NAME.exec(line);
  const name = match?.[1] ?? match?.[2];
  return name && !NOT_A_NAME.has(name) ? name : undefined;
}

const INTRO_FROM =
  /\b(?:i'm|i am|this is|calling|i work|here) (?:from|with|at|for) [A-Z]\w+|\b[A-Z][a-z]+ (?:from|with|at) [A-Z]\w+/;
const INTRO_FROM_LOOSE =
  /\bi'?m \w+,? (?:i'm )?(?:from|with|at) \w+|\bi'?m (?:calling|here) (?:from|with|on behalf of)\b/i;
const INTRO_SELF =
  /\blet me introduce myself\b|\bi graduate\b|\bi'?m (?:a|an) (?:senior|junior|sophomore|student|graduate|recent grad|final-year|first-year)\b|\bi'?m (?:finishing|studying|wrapping up|about to finish|graduating)\b|\bmy (?:background|degree) is\b|\bi work (?:at|for|with) (?:a|an) (?:company|firm|startup|team|business)\b|\bi'?m (?:calling|reaching out|getting in touch) (?:from|on behalf of|with)\b|\bmy name is\b/i;
const COMPANY_DESCRIPTION =
  /\bwe (?:do|build|make|sell|offer|provide|work with|help|run|specialise in|specialize in|focus on)\b/i;

const THIRD_PARTY =
  /\b(?:one|a|another|the last|our last|a similar|a comparable) (?:[\w-]+ ){0,2}(?:firm|carrier|clinic|group|team|company|practice|customer|client|store|retailer|shop|chain|operator|dealer|agency|school|business|hospital|fleet|distributor|manufacturer|office)\b|\b(?:teams?|clinics|carriers|companies|groups|customers|clients|firms|practices|stores|businesses|operators|fleets|shops) (?:like|about|around|of) yours?\b|\byour size\b|\bcase stud(?:y|ies)\b|\bother (?:clinics|carriers|customers|clients|teams|companies)\b|\bmost of our (?:customers|clients)\b/i;
const RESULT =
  /\b(?:went from|cut|reduced|saved|lowered|dropped|increased|doubled|tripled|halved|grew|was live|were live|went live|booked|closed|recovered|got back|freed up|see results|saw results|results|took them)\b/i;
const NUMBERISH =
  /\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|a third|a quarter|double|percent)\b/i;

/** A claim about what the offer does for them: "our planner rebuilds…", "Shiftwell automates…". */
const BENEFIT_VERB =
  "(?:also\\s+|just\\s+|basically\\s+|then\\s+)?(?:cuts?|saves?|reduces?|rebuilds?|reshuffles?|fills?|frees?|stops?|removes?|handles?|automates?|texts?|sends?|lets? you|helps? (?:you|your|teams?|clinics|carriers|dispatch|the|people|front desks))\\b";
const PRONOUN_BENEFIT = new RegExp(
  `\\b(?:we|our [\\w-]+|it|this|that tool|the (?:tool|planner|platform|app|service|system|software)|which)\\s+${BENEFIT_VERB}|\\bwe help\\b|\\bhelps? (?:you|your)\\b|\\bmeans (?:the|your|you)\\b|\\bso your\\b|\\bso nobody\\b|\\bno more\\b|\\bwithout (?:anyone|someone) having to\\b`,
  "i",
);
/** A company as the subject: "Shiftwell automates the reminders". */
const PROPER_BENEFIT = new RegExp(`\\b[A-Z][a-z]+(?:[A-Z][a-z]+)?\\s+${BENEFIT_VERB}`);
/** "Our thing does it in two minutes": the offer doing the job, fast. */
const DOES_IT =
  /\b(?:our|the) [\w-]+ (?:does|takes|gets|turns|makes|sorts|covers) (?:it|that|this|them|all of it)\b|\bin (?:about |under |like |around |roughly )?(?:a couple of |two|three|four|five|ten|\d+) (?:minutes|seconds)\b/i;
const isBenefitClaim = (text: string) =>
  PRONOUN_BENEFIT.test(text) || PROPER_BENEFIT.test(text) || DOES_IT.test(text);
const MONEY =
  /\b(?:price|pricing|budget|expensive|cheap|afford|roi|subscription|fee)\b|\$\d|\b\d[\d,]* (?:dollars|a month|per month|a year)\b|\bcosts? (?:less|more|about|around|under)\b|\bpay (?:for|per|about|around|less|more)\b/i;
/** A candidate's or student's own record: "I ran…", "I booked 40…". */
const SELF_PITCH =
  /\bI (?:ran|led|built|booked|sold|managed|hit|grew|started|organi[sz]ed|raised|closed|worked|interned|made|won|doubled|tracked|founded|coached|trained|spent|ended up|finished|placed|came (?:first|second|third|top)|was (?:top|first|second|named)|earned|achieved|delivered|brought in|generated|handled|carried|exceeded|beat|reached)\b/i;

const GOODBYE =
  /\b(?:bye|goodbye|see you(?: then| there| soon)?|talk (?:soon|then|later|to you (?:then|soon|later))|take care|have a (?:good|great|nice) (?:one|day|week|weekend|afternoon)|cheers|ciao|catch you later)\b/i;
const SIGN_OFF =
  /^(?:ok(?:ay)?|cool|great|perfect|awesome|sounds good|sounds great|alright|will do|thx|thanks|thank you|ty|cheers|nice|good|got it|sure|yep|yes|no problem|all good|k|fine|deal|done|love it|brilliant|lovely|wonderful|excellent|that works|works for me)\b[\w ,.!']{0,30}$/i;
const THANKS =
  /\b(?:thanks?|thank you|thx|ty|appreciate (?:it|that|this|your time|you)|grateful)\b/i;
const VAGUE = /\b(?:kind of|sort of|a bunch of|stuff|i guess|whatever you think|you know)\b/i;

/** A question, with or without its question mark. */
const QUESTION_SHAPE =
  /\?\s*$|^(?:(?:so|and|but|ok(?:ay)?|sorry|hey|um|also|quick question|one more|last one|great|right|cool|oh|roughly|just|now|then|basically|honestly|actually|first|next|finally|lastly|maybe|like),?\s+){0,3}(?:what|how|who|when|where|why|which|whose)\b|^(?:(?:so|and|but|ok(?:ay)?|sorry|um|also),?\s+)*(?:can you |could you |would you |will you |please )?(?:walk me through|tell me about|talk me through|give me a sense of|help me understand|remind me)\b|^(?:(?:so|and|but|ok(?:ay)?|sorry|um|also),?\s+)*(?:do|does|did|is|are|can|could|would|should|will|have|has|was|were|am)\s+(?:you|your|we|i|it|this|that|the|they|there|anyone|anybody|someone|somebody|\w+day)\b|\b(?:learn|know|understand|hear|ask|wonder(?:ing)?|curious|find out) (?:about )?(?:how|what|why|who|when|where|which)\b|\b(?:can|could|may) i ask\b|\bi'?d (?:love|like) to (?:learn|know|hear|understand|ask)\b/i;

const isQuestion = (sentence: string) => QUESTION_SHAPE.test(sentence);

/** Small talk is short. A long sentence that mentions a holiday or a game is about something else. */
const SMALL_TALK_WORDS = 14;
const smallTalkTopic = (text: string): SmallTalkTopic | undefined =>
  words(text) <= SMALL_TALK_WORDS
    ? SMALL_TALK.find(({ pattern }) => pattern.test(text))?.topic
    : undefined;

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_CHECK = /^(?:(?:hi|hey|hello|um|so|sorry),?\s+)*is (?:this|that|it) ([a-z]+)\s*[?.!]*$/i;
/** Words after "is this" that aren't a name: "is this real", "is this okay". */
const NOT_A_NAME_CHECK = new Set([
  "it",
  "that",
  "okay",
  "ok",
  "right",
  "true",
  "correct",
  "real",
  "possible",
  "fine",
  "good",
  "bad",
  "you",
  "the",
  "a",
  "an",
  "still",
  "all",
  "everything",
  "something",
  "working",
  "normal",
  "typical",
  "common",
  "new",
  "so",
  "why",
  "how",
  "what",
  "usual",
  "different",
  "better",
  "worse",
  "enough",
  "urgent",
  "recorded",
  "live",
]);
/** "Is this Ruth?": the persona's own name, or a wrong one. */
function nameCheck(text: string, firstName: string): "right" | "wrong" | undefined {
  if (
    firstName.length > 0 &&
    new RegExp(
      `\\bis (?:this|that|it) ${escaped(firstName)}\\b|^${escaped(firstName)}\\?$`,
      "i",
    ).test(text)
  ) {
    return "right";
  }
  const other = NAME_CHECK.exec(text)?.[1]?.toLowerCase();
  return other !== undefined && !NOT_A_NAME_CHECK.has(other) ? "wrong" : undefined;
}

/** The persona's last line asked for a day, or said one works. */
const DAY_ON_THE_TABLE =
  /what day|when, and who|when would it start|were you thinking|\bworks\b|should work|my best day|fairly open|is packed|suit you|thirty minutes on|could we do \w+day|any better|is fine|no good/i;

/** A yes-or-no question about how they work: "Do you call patients the day before?" */
const YES_NO_QUESTION =
  /^(?:(?:and|so|sorry|but|ok(?:ay)?|um),?\s+)*(?:do|does|did|is|are|have|has|was|were|would|will|can|could)\s+(?:you|your|they|the|it|that|those|these|there|anyone|[\w-]+s|\w+day)\b/i;
const WH_QUESTION =
  /^(?:(?:so|and|but|ok(?:ay)?|sorry|um),?\s+)*(?:what|how|who|when|where|why|which)\b/i;
const OPERATIONS_QUESTION = new RegExp(`${YES_NO_QUESTION.source}|${WH_QUESTION.source}`, "i");

function isProposal(sentence: string, dayOnTheTable: boolean): boolean {
  if (!timeIn(sentence)) return false;
  if (
    MEETING_SETUP.test(sentence) ||
    AVAILABLE.test(sentence) ||
    TIME_FITS_YOU.test(sentence) ||
    HOW_ABOUT.test(sentence) ||
    BARE_TIME.test(sentence) ||
    WE_MEET.test(sentence) ||
    LETS.test(sentence) ||
    WANT_TO.test(sentence) ||
    (TO_MEET.test(sentence) && isQuestion(sentence))
  ) {
    return true;
  }
  // A short answer with a day in it, right after a day came up: "Wednesday works, 3pm?"
  return (
    dayOnTheTable &&
    sentence.split(/\s+/).length <= 8 &&
    !OPERATIONS_QUESTION.test(sentence.replace(/\?\s*$/, ""))
  );
}

const isOpenProposal = (sentence: string) =>
  OPEN_PROPOSAL.test(sentence) ||
  (!timeIn(sentence) &&
    (MEETING_SETUP.test(sentence) || AVAILABLE.test(sentence)) &&
    isQuestion(sentence));

const RELATIONSHIP_QUESTION =
  /\bhow well do you know\b|\bin touch\b|\bdo you (?:still )?(?:talk|speak) to\b|\bwhen did you last\b|\bhow do you know\b|\bhow close are you\b|\bare you (?:two |guys )?(?:close|friendly|tight)\b/i;
const JOB_QUESTIONS: readonly { topic: JobTopic; pattern: RegExp }[] = [
  {
    topic: "mix",
    pattern:
      /\bcold calling\b|\bversus\b|\bvs\.?\b|\bhow much of the (?:job|role|day|week)\b|\bsplit between\b/i,
  },
  {
    topic: "best",
    pattern:
      /\bseparates? (?:your|the) (?:best|top)\b|\bbest (?:sdrs|reps|people)\b|\btop (?:performers|reps)\b|\bwhat makes someone\b/i,
  },
  {
    topic: "fit",
    pattern:
      /\blooking for in\b|\bwhat (?:are|do) you look(?:ing)? for\b|\bgood fit\b|\bwhat (?:kind|type) of (?:person|people|candidate)\b/i,
  },
  {
    topic: "success",
    pattern:
      /\bsuccess look like\b|\bfirst (?:six|6|three|3|twelve|12) months\b|\btargets?\b|\bquota\b|\bmeasured\b/i,
  },
  {
    topic: "size",
    pattern: /\bhow big\b|\bhow many (?:people|reps|sdrs|folks)\b|\bteam size\b|\bheadcount\b/i,
  },
  {
    topic: "team",
    pattern:
      /\bculture\b|\bhow (?:is|are) the team (?:structured|organi[sz]ed|set up)\b|\bbiggest challenge\b|\bhow big is the team\b/i,
  },
];
const QUALITY_QUESTION =
  /\bhow well (?:does|do|is|has|did|are) (?:it|that|this|the|your)\b|\bdoes (?:it|that) (?:work well|work for you|do the job|hold up)\b|\bhow (?:happy|satisfied) are you\b|\bwhat (?:(?:does|do) )?(?:it|that|the (?:current )?[\w-]+(?: [\w-]+)?) (?:do|does) well\b|\bwhat do you like about\b|\bwhat'?s (?:good|working|not working) about\b|\bhow(?:'s| is) that (?:working|going)\b|\bis that working\b/i;
const QUANTITY_QUESTION =
  /\bhow (?:much time|long|many|often|frequently|big|large)\b|\bhow much (?:of your|of the|of their) (?:day|time|week)\b/i;
const TIMING_QUESTION =
  /\bwhat time\b|\bwhen do (?:they|you|your \w+|the \w+)\b|\bhow early\b|\bhow late\b/i;
const BUSIEST_QUESTION = /\b(?:worst|busiest|hardest|toughest|slowest|quietest|peak)\b/i;
const STAFF_QUESTION = /\bwho (?:works|staffs|covers|is on|answers|mans|sits at)\b/i;
const COST_SUBJECT =
  /\b(?:tool|system|setup|software|subscription|vendor|licen[cs]e|platform|current|existing|today|now|salary|budget|pay|price|pricing|charge|invoice|contract|plan|service|compensation|range)\b/i;
const MONEY_VERB =
  /\b(?:cost|costing|costs|pay|paying|run|running|charge|charging|budget|salary|price|pricing|spend|spending|compensation|range)\b/i;
const PROBLEM_COST =
  /\bwhat (?:does|would|did|do) [^?]*? cost(?:ing)?\b|\bcosts? (?:you|us|them|the business|the clinic|the company)\b|\bwhat(?:'s| is) that costing\b|\bwhat (?:does|would) (?:a|an|one|each) [\w-]+ (?:cost|run)\b/i;
const CONDITIONS_QUESTION =
  /\bwhat would (?:it take|make (?:it|you|this|that)|you need|need to happen|change your mind|get you|get your|convince you|help you)\b|\bwhat (?:do|would) you need to (?:see|hear|know)\b|\bwhat would (?:you )?(?:have|need) to (?:be true|happen)\b|\bwhat would (?:a |the )?(?:good|right|ideal) (?:outcome|result|setup) look like\b/i;
const OWNER_QUESTION =
  /\bwho (?:owns|runs|looks after|is in charge of|handles|manages|is responsible for|leads|heads)\b|\bwho (?:would|will|do|'d) I (?:be )?(?:work(?:ing)?|report(?:ing)?|sit(?:ting)?) (?:with|to|next to|under|for)\b|\bwho(?:'s| is) (?:my|the) (?:manager|boss|lead)\b/i;
const DECISION_QUESTION =
  /\bwho (?:decides|else|signs|approves|makes the call|has the final say|green-?lights|would need to|needs to|has to)\b|\bwho on your (?:side|team|end)\b|\bwho (?:would|should|will|needs? to|has to|gets to|is|would have to|'d)\b[^?]*\b(?:sign|decide|approve|involved|say|weigh|buy|see|know|meet|comfortable|convinced|on board|bless|okay)\b|\bsign[- ]?off\b|\bdecision\b/i;
const TOOL_QUESTION =
  /\bwhat (?:are|is) (?:you|your [\w-]+(?: [\w-]+)?) (?:using|on|running)\b|\bwhat (?:tool|tools|system|software|platform|vendor|product)s?\b|\bwhat do you use\b|\bwhich (?:tool|system|software|platform|vendor)\b/i;
const PROCESS_QUESTION =
  /\bhow (?:do|does|did|are|is|you|your|would|has|have)\b|\bwalk me through\b|\btell me about\b|\btalk me through\b|\bwhat does [^?]* look like\b|\bwhat [^?]* is like\b|\bwhat happens\b|\bhow you\b|\bspend (?:most of )?(?:their|your|the|a) (?:day|time|week|morning)\b|\bspend (?:most of )?(?:their|your) \w+ on\b|\bwhat(?:'s| is) (?:the|your) (?:process|setup|routine|workflow)\b|\bwhat (?:do|does) (?:you|your \w+|the \w+) do (?:when|if|about|with|first|today|now)\b|\bgive me a sense of\b|\bhelp me understand\b|\bwhat(?:'s| is) (?:a |the )?(?:typical|normal|usual|average) (?:day|week|morning)\b|\bramp\b|\bfirst (?:month|week|day)\b|\bwhat'?s (?:it|that) like\b/i;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

function questionIntent(
  question: string,
  voice: Voice,
): { intent: Intent; job: JobTopic | undefined } {
  const job =
    voice === "hiring" ? JOB_QUESTIONS.find(({ pattern }) => pattern.test(question)) : undefined;
  const intent = ((): Intent => {
    if (voice === "contact" && RELATIONSHIP_QUESTION.test(question)) return "relationship_question";
    if (job) return "job_question";
    if (QUALITY_QUESTION.test(question)) return "quality_question";
    if (QUANTITY_QUESTION.test(question)) return "quantity_question";
    if (TIMING_QUESTION.test(question)) return "timing_question";
    if (BUSIEST_QUESTION.test(question)) return "busiest_question";
    if (STAFF_QUESTION.test(question)) return "staff_question";
    if (COST_SUBJECT.test(question) && MONEY_VERB.test(question)) return "cost_question";
    if (PROBLEM_COST.test(question)) return "problem_cost_question";
    if (CONDITIONS_QUESTION.test(question)) return "conditions_question";
    if (OWNER_QUESTION.test(question)) return "owner_question";
    if (DECISION_QUESTION.test(question)) return "decision_question";
    if (TOOL_QUESTION.test(question)) return "tool_question";
    if (PROCESS_QUESTION.test(question)) return "process_question";
    if (YES_NO_QUESTION.test(question)) return "yes_no_question";
    return "other_question";
  })();
  return { intent, job: job?.topic };
}

const offerTopic = (text: string): OfferTopic =>
  /\bcase stud|example|reference|result/i.test(text)
    ? "caseStudy"
    : /\b(?:manager|boss|board|team|director|owner)\b/i.test(text)
      ? "passAlong"
      : "generic";

/** The kind of turn the student just took, with what the reply needs from it. */
export function readTurn(line: string, context: TurnContext): Reading {
  const { voice, stage, firstName, said, objectionRaised } = context;
  const sentences = sentencesOf(line);
  const lastSaid = said.at(-1) ?? "";
  const dayOnTheTable = DAY_ON_THE_TABLE.test(lastSaid);
  const closing = stage === "close";
  const name = nameIn(line);
  const invite = SEND_INVITE.test(line);
  const reading = (
    intent: Intent,
    sentence: string = line,
    extra: Partial<Reading> = {},
  ): Reading => ({
    intent,
    sentence,
    time: timeIn(sentence),
    name,
    named: false,
    smallTalk: undefined,
    job: undefined,
    offer: undefined,
    invite,
    wrongName: false,
    ...extra,
  });
  const find = (test: (sentence: string) => boolean) => sentences.find(test);

  if (IDENTITY.test(line)) return reading("identity");

  // A meeting, proposed or promised: the one thing that beats a question in the same turn.
  const followUp = find(
    (sentence) =>
      timeIn(sentence) !== undefined && FOLLOW_UP.test(sentence) && !isQuestion(sentence),
  );
  if (followUp) {
    // "I'll send the draft Thursday and check in Monday": the time that goes with the follow-up.
    const tail = followUp.slice(FOLLOW_UP_VERB.exec(followUp)?.index ?? 0);
    return reading("follow_up", followUp, { time: timeIn(tail) ?? timeIn(followUp) });
  }
  const proposal = find((sentence) => isProposal(sentence, dayOnTheTable));
  if (proposal) return reading("proposal", proposal);
  if (voice === "contact" && FAVOUR.test(line)) return reading("favour");
  const availability = find((sentence) => AVAILABILITY_QUESTION.test(sentence));
  if (availability) return reading("availability_question", availability);
  const confirm = find((sentence) => CONFIRM.test(sentence) && timeIn(sentence) === undefined);
  if (confirm) return reading("confirm", confirm);
  const open = find(isOpenProposal);
  if (open) return reading("open_proposal", open);
  if (!closing && invite) return reading("open_proposal");
  if (SMALL_START.test(line)) return reading("small_start");
  if (OFFER_TO_SEND.test(line)) return reading("offer_to_send", line, { offer: offerTopic(line) });
  if (voice === "contact" && TARGET.test(line)) return reading("target");
  // Questions: small talk and "is this Maya?" only count when nothing substantive was asked.
  const questions = sentences.filter(isQuestion);
  const substantive = questions.filter(
    (question) =>
      !smallTalkTopic(question) &&
      !nameCheck(question, firstName) &&
      !TOPIC_ASK.test(question) &&
      !GREETING.test(question),
  );
  const topics = sentences.map(smallTalkTopic);
  const smallTalk = topics.includes("time") ? "time" : topics.find((topic) => topic !== undefined);
  const opener =
    INTRO_NAME.test(line) ||
    INTRO_FROM.test(line) ||
    INTRO_FROM_LOOSE.test(line) ||
    INTRO_SELF.test(line) ||
    (stage === "opening" && COMPANY_DESCRIPTION.test(line));
  if (substantive.length === 0 && smallTalk && (smallTalk === "time" || !opener)) {
    return reading("small_talk", line, { smallTalk });
  }
  const checked = nameCheck(line, firstName);
  if (substantive.length === 0 && checked)
    return reading("name_check", line, { wrongName: checked === "wrong" });
  if (substantive.length === 0 && TOPIC_ASK.test(line)) return reading("topic");
  const question = substantive.at(-1);
  if (question) {
    const { intent, job } = questionIntent(question, voice);
    return reading(intent, question, { job });
  }

  // Statements.
  if (BUSY_REMARK.test(line)) return reading("busy_remark");
  const booked = said.some((text) => BOOKED.test(text));
  const goodbye = GOODBYE.test(line) || invite;
  if ((booked && (goodbye || THANKS.test(line) || SIGN_OFF.test(line))) || (closing && goodbye)) {
    return reading("wrap_up");
  }
  if (opener) {
    const named =
      INTRO_NAME.test(line) ||
      INTRO_FROM.test(line) ||
      INTRO_FROM_LOOSE.test(line) ||
      INTRO_SELF.test(line);
    return reading("opener", line, { named });
  }
  if (voice === "hiring" && GOAL.test(line)) return reading("target");
  if (TOPIC.test(line)) return reading("topic");
  const acknowledging = ACKNOWLEDGE.test(line) && objectionRaised;
  if (voice !== "buyer") {
    if (acknowledging) return reading("acknowledgement");
    if (SELF_PITCH.test(line)) return reading("pitch");
  }
  if (THIRD_PARTY.test(line) && (RESULT.test(line) || NUMBERISH.test(line))) {
    return reading("proof");
  }
  if (acknowledging && !MONEY.test(line)) return reading("acknowledgement");
  if (isBenefitClaim(line) || MONEY.test(line)) return reading("pitch");
  if (GREETING.test(line)) return reading("greeting");
  if (THANKS.test(line)) return reading("thanks");
  if (SIGN_OFF.test(line) || words(line) <= 4) return reading("short_reply");
  if (VAGUE.test(line)) return reading("vague");
  return reading("unclear");
}

/** A line of the persona's that agreed to a time, so the call is booked. */
const BOOKED =
  /\b(?:works|should work|is fine too)\. (?:Send|Talk)|\bTalk (?:then|\w+day|next week|tomorrow)\.$|^Yes, .*See you then\.|One meeting is plenty|^Let's keep it to (?:next week|this week|tomorrow|\w+day)|^For \w+day, yes\?/i;

/** The day the persona offered instead, in its last line, when it turned a proposal down. */
export const counterOffered = (lastSaid: string): string | undefined =>
  /Could we do (\w+day)/i.exec(lastSaid)?.[1];

/** Days the persona has turned down in this call, lower case. */
export function refusedDays(said: readonly string[]): Set<string> {
  const days = new Set<string>();
  for (const text of said) {
    const day =
      /^(\w+day)(?: \w+)*? is packed for me|^Like I said, (\w+day)'s no good|^(\w+day) still doesn't work/i.exec(
        text,
      );
    const found = day?.[1] ?? day?.[2] ?? day?.[3];
    if (found) days.add(found.toLowerCase());
  }
  return days;
}

/** The time the persona agreed to, from its latest booking line. */
export function bookedTime(said: readonly string[]): string | undefined {
  const line = [...said].reverse().find((text) => BOOKED.test(text));
  return line ? timeIn(line) : undefined;
}
