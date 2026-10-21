import type { Stage } from "@pitchperfect/shared";
import { ACKNOWLEDGE } from "./fake-patterns.js";

/**
 * What kind of turn the student just took, read the way a person on the call would read it: the
 * turn is split into sentences, leading filler is set aside, each sentence is checked against
 * small named rules, and the kinds combine with a fixed precedence (a meeting proposal beats a
 * question, a question beats a pitch, an acknowledgement is only a lead-in when something else
 * follows it).
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
  | "hypothetical"
  | "invite_guest"
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
  | "target_question"
  | "detail_question"
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
export type JobTopic =
  "mix" | "best" | "fit" | "success" | "team" | "size" | "timeline" | "challenge";
/** What a contact is asked about the person the student wants to reach. */
export type TargetTopic = "hiring" | "there" | "rightPerson" | "replies" | "other";
export type OfferTopic = "caseStudy" | "passAlong" | "generic";
export type QuantityKind = "count" | "duration" | "frequency";
/** A question about the person's situation that has its own short answer. */
export type DetailTopic =
  | "pain"
  | "wish"
  | "tried"
  | "picked"
  | "more"
  | "why"
  | "impact"
  | "priorities"
  | "quarter"
  | "howBusy"
  | "anythingElse"
  | "checkBack"
  | "behind"
  | "enjoy"
  | "worries"
  | "story"
  | "graduates"
  | "nextStep"
  | "wants"
  | "coaching"
  | "opinion"
  | "trend";

/** Where the call stands on a meeting, derived from what the persona has agreed or turned down. */
export interface Booking {
  /** The time agreed, if any. */
  booked: string | undefined;
  /** The day the persona offered instead, when its last answer was a counter. */
  countered: string | undefined;
  /** Days turned down in this call, lower case. */
  refused: readonly string[];
  /** The day the persona itself put forward in its last line, if any. */
  offered: string | undefined;
  /** The persona's last line asked for a day or offered one. */
  dayAsked: boolean;
}

const NO_BOOKING: Booking = {
  booked: undefined,
  countered: undefined,
  refused: [],
  offered: undefined,
  dayAsked: false,
};

export interface TurnContext {
  voice: Voice;
  stage: Stage;
  firstName: string;
  /** Which student turn this is, counting from 1. */
  turn?: number;
  booking?: Booking;
  objectionRaised: boolean;
}

export interface Reading {
  intent: Intent;
  /** The sentence that decided the kind of turn. */
  sentence: string;
  /** A day or time in that sentence, as the student wrote it. */
  time: string | undefined;
  /** A second day offered as an alternative: "Monday or Tuesday". */
  orTime: string | undefined;
  /** The student's first name, when they gave it. */
  name: string | undefined;
  /** Whether an opener named the student or their company, rather than just what they do. */
  named: boolean;
  smallTalk: SmallTalkTopic | undefined;
  job: JobTopic | undefined;
  /** Contact only: which fact about the referral target a yes-or-no question asks for. */
  about: TargetTopic | undefined;
  offer: OfferTopic | undefined;
  detail: DetailTopic | undefined;
  quantity: QuantityKind | undefined;
  /** The student said they would send an invite. */
  invite: boolean;
  /** A candidate says why they want the work, not just that they want it. */
  motivation: boolean;
  /** "Is this Maya?" when the persona is someone else. */
  wrongName: boolean;
  /** Not words the persona can place at all: "asdf qwerty". */
  nonsense: boolean;
}

// Words and shapes shared by several rules.

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Splits a turn into sentences; a turn with no punctuation is one sentence. */
const sentencesOf = (line: string): string[] =>
  line
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const FILLER_WORDS =
  "anyway|um|uh|erm|ah|oh|so|ok|okay|right|yeah|yep|yes|no|well|like|cool|sweet|great|perfect|alright|hmm|hm|mm|look|listen|also|and|but|basically|honestly|totally|sure|by the way|quick one|hey|hi|hello";

/** "whats that costing" reads as "what's that costing": spoken turns often drop the apostrophe. */
const CONTRACTIONS: readonly [RegExp, string][] = [
  [/\bwhats\b/gi, "what's"],
  [/\bthats\b/gi, "that's"],
  [/\bhows\b/gi, "how's"],
  [/\bwhos\b/gi, "who's"],
  [/\bwheres\b/gi, "where's"],
  [/\btheres\b/gi, "there's"],
  [/\bdont\b/gi, "don't"],
  [/\bdoesnt\b/gi, "doesn't"],
  [/\bdidnt\b/gi, "didn't"],
  [/\bcant\b/gi, "can't"],
  [/\bwouldnt\b/gi, "wouldn't"],
  [/\bisnt\b/gi, "isn't"],
  [/\byoure\b/gi, "you're"],
  [/\btheyre\b/gi, "they're"],
  [/\bive\b/gi, "i've"],
  [/\blets\b/gi, "let's"],
];
const withApostrophes = (text: string) =>
  CONTRACTIONS.reduce((out, [pattern, fixed]) => out.replace(pattern, fixed), text);

/** "anyway um what does…" without the filler, so the question underneath can be read. */
function stripFillers(sentence: string, firstName: string): string {
  const name = firstName ? `|${firstName.toLowerCase()}` : "";
  const lead = new RegExp(`^(?:(?:${FILLER_WORDS}${name}),?\\s+)+`, "i");
  const trail = /(?:,?\s+(?:anyway|though|honestly|mate|man|lol|haha|tbh))+([?.!]*)$/i;
  const stripped = withApostrophes(sentence.replace(lead, "").replace(trail, "$1"));
  return stripped.length > 0 ? stripped : withApostrophes(sentence);
}

/** A day or a time, with its part of day: "Thursday morning", "next Tuesday at 2pm", "next week". */
const TIME =
  /\b(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|tomorrow)\b(?:\s+(?:morning|afternoon|evening))?(?:\s+at\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?)?|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:next|this) week\b/i;
const T = `(?:${TIME.source})`;
/** A time, or two days offered as alternatives: "Monday or Tuesday at 10". */
const T_OR = `${T}(?:\\s+or\\s+${T})?`;
const DAY_WORD = "(?:next\\s+)?(?:monday|tuesday|wednesday|thursday|friday|tomorrow)";

/** The day or time in a sentence, with "next" dropped from a day ("next Tuesday" is "Tuesday"). */
export function timeIn(text: string): string | undefined {
  const all = [...text.matchAll(new RegExp(TIME.source, "gi"))].map((match) => match[0].trim());
  const found = all.find((candidate) => !/^(?:next|this) week$/i.test(candidate)) ?? all[0];
  if (!found) return undefined;
  return /^next\s+week/i.test(found) ? found : found.replace(/^next\s+/i, "");
}

/** "Monday or Tuesday at 10": the second day, with its time of day if one follows it. */
const EITHER_OR = new RegExp(
  `\\b${DAY_WORD}\\b\\s+or\\s+(${DAY_WORD}\\b(?:\\s+(?:morning|afternoon|evening))?(?:\\s+at\\s+\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)?)?)`,
  "i",
);
const orTimeIn = (text: string): string | undefined =>
  EITHER_OR.exec(text)?.[1]?.replace(/^next\s+/i, "");
/**
 * The frame that makes "Monday or Tuesday" an offer of either day: this person's fit ("better",
 * "work for you", "suit", "free", "good for you") or a meeting noun. "Which is busier, Monday or
 * Friday?" has neither and is a question about their week.
 */
const EITHER_OR_FRAME =
  /\b(?:better|best|easier|works?|suits?|free|available|convenient|prefer|good|ok(?:ay)?|fine)\b(?:\s+(?:for|with) (?:you|everyone))?|\b(?:for|with) you\b/i;

// Meeting proposals.

const MEETING_NOUN =
  "(?:meeting|call|demo|chat|time|slot|session|invite|minutes?|mins?|coffee|walkthrough|walk-through|catch-up|catch up|conversation|zoom|video call|video chat|screen ?share|screen-share|google meet|teams meeting|sync|check-in|intro call|discovery call|appointment|sit-down|huddle)";
const MEETING_NOUN_IN = new RegExp(`\\b${MEETING_NOUN}\\b`, "i");
const SETUP_VERB =
  "(?:set up|setup|book|grab|schedule|get|find|put|send|have|hold|block|lock in|pencil in|do|did|run|hop on|jump on|get on|arrange|fix|make|squeeze in|carve out|spare|free up|take|open to|up for)";
const MEASURE =
  "(?:a|an|the|some|another|that|this|our|\\d+|ten|fifteen|twenty|thirty|forty|forty-five|half an hour|quick|short|brief|proper|a couple of|a few)";

/** Setting up a meeting noun: "hop on a call", "grab 20 minutes", "do a 30-minute walkthrough". */
const MEETING_SETUP = new RegExp(
  `\\b${SETUP_VERB}\\b(?:\\s+[\\w'-]+){0,3}?\\s+${MEASURE}\\b(?:\\s+[\\w-]+){0,2}?\\s+${MEETING_NOUN}\\b(?!\\s+to\\b)`,
  "i",
);
/** "Are you free Thursday", "any chance you're around", "you free at 2?" */
const FREE_YOU =
  /\b(?:are you|you're|you are|you|any chance you(?:'re| are)) (?:free|around|available|open|up for)\b/i;
/** "Would you have time Wednesday", "do you have any time Thursday afternoon". */
const HAVE_TIME =
  /\b(?:have|got|find|spare|free up) (?:any |some |a bit of |a little |\d+ |fifteen |twenty |thirty )?(?:time|minutes|a slot|a window|an hour|half an hour)\b/i;
/** "Can you do Thursday at 2", "could you make Tuesday morning". */
const CAN_YOU_DO = new RegExp(
  `\\b(?:can|could|would|will) you (?:do|make|manage|swing|fit in|squeeze in|meet|talk|chat)(?: (?:a |another )?(?:quick |short )?(?:call|chat|meeting|demo|coffee))?(?: (?:on|at|for))? ${T}`,
  "i",
);
/** "Put something in your calendar", "book you in", "steal 15 minutes", "pencil in Friday". */
const CALENDAR =
  /\b(?:calendar|diary|book you|put (?:something|it|time|us|that) (?:in|on)|pencil|steal|borrow|grab|block out)\b/i;
/** "I was thinking Thursday at 2", "maybe we could chat more on Thursday". */
const THINKING = /\b(?:i was thinking|i'm thinking|thinking maybe|maybe we|perhaps we)\b/i;
/** "What about a quick demo on Friday", "how about we talk again on Monday". */
const WHAT_ABOUT_MEETING = new RegExp(
  `\\b(?:what|how) about (?:a |an |another |we |maybe )?(?:[\\w-]+ ){0,2}(?:${MEETING_NOUN}|talk|meet|chat|catch up|reconnect)\\b`,
  "i",
);
/** "…a quick follow-up, say Tuesday afternoon?": a time floated inside a scheduling question. */
const SAY_TIME = new RegExp(`\\b(?:say|ideally|maybe|perhaps|possibly) ${T}`, "i");
/** "Next Tuesday, 10am, does that suit?" */
const DOES_THAT_SUIT = /\b(?:does|would) (?:that|this) (?:suit|work)(?: for you)?\s*[?.!]*$/i;

const FITS =
  "(?:works?|suits?|sounds?|be|is|any good|good|ok|okay|fine|alright|possible|convenient|better|doable)";
const FITS_TAIL =
  `(?:\\s+(?:good|ok|okay|fine|alright|any good|possible|convenient|better|doable|best))?` +
  `(?:\\s+(?:(?:for|with) )?(?:you|everyone)\\b(?:\\s+(?:both|two|guys|at all|too))?)?` +
  `(?:\\s+for (?:a|an|the)(?:\\s+[\\w-]+){0,2}\\s+${MEETING_NOUN})?` +
  `(?:\\s+(?:instead|then|too|as well|at all|maybe))?(?:\\s+(?:with|and) [^?.!]+)?\\s*[?.!]*$`;
/** This person's availability for a time: "would Thursday work for you", "how does 2pm sound". */
const TIME_FITS_YOU = new RegExp(
  `^(?:[\\w,' ]{0,24}?\\b)?(?:(?:how|and|or|so) )?(?:does|would|will|could|might|is|do|can)?\\s*(?:(?:early|late|sometime|around) )?${T}\\s+${FITS}${FITS_TAIL}`,
  "i",
);
/** "Would that work for you?" with no time: the time is whatever is on the table. */
const CONFIRM =
  /^(?:(?:so|and|ok(?:ay)?|great|perfect|cool),?\s+)*(?:would|does|will|could|is) (?:that|this|it) (?:work|suit|ok|okay|good|fine|be (?:ok|okay|good|fine|alright)) (?:for|with) you\b/i;

const LEAD =
  "(?:(?:so|ok|okay|or|maybe|and|alternatively|great|perfect|sure|alright|hmm|well|um),?\\s+)*";
const HOW_ABOUT = new RegExp(
  `^${LEAD}(?:how|what) about ${T_OR}(?:\\s+(?:next|this) week)?(?:\\s+(?:instead|then))?(?:\\s+(?:with|for) [^?.!]+)?\\s*[?.!]*$`,
  "i",
);
const BARE_TIME = new RegExp(
  `^${LEAD}${T_OR}(?:\\s+(?:then|instead|works|would work|is better|is fine|it is|maybe|perhaps|would be great|would be good|would work for me|works for me|is perfect|is great|would be perfect|sounds good|sounds great|is good))?\\s*[?.!]*$`,
  "i",
);
const WE_MEET = new RegExp(
  `\\b(?:could|can|shall|should|will|would|do) (?:we|you and i|you) (?:do|meet|chat|connect|speak|talk|catch up|get together|reconnect|continue|pick (?:this|it) up|go through (?:this|it))(?:\\s+(?:this|it|again|then|more|properly|live|in person|over coffee|by phone|on the phone))?(?:\\s+(?:on|at|for))?\\s+${T}`,
  "i",
);
/** "We could meet Monday or Tuesday.", "we can talk Thursday": the same offer, said as a statement. */
const WE_COULD = new RegExp(
  `\\bwe (?:could|can|should) (?:do|meet|chat|connect|speak|talk|catch up|get together|reconnect)(?:\\s+(?:again|then|more|properly|in person))?(?:\\s+(?:on|at))?\\s+${T}`,
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

/**
 * A question about their operations that happens to name a time: "do your drivers check their
 * phones at 6am", "when does the quarter end". Never a proposal.
 */
const OPERATIONS_SUBJECT =
  /^(?:(?:what|how|who|when|where|why|which|do|does|did|is|are|have|has|was|were|would|will|can|could)\s+)(?:time\s+)?(?:do\s+|does\s+)?(?:your|the|they|them|their|patients|drivers|dispatchers|customers|clinics|stores|orders|managers|staff|reps)\b/i;

/** "I'll call you next week", "see you Thursday", "I'll ping you Monday". */
const FOLLOW_UP_VERB =
  /\b(?:call (?:you|back|again)|ring you|ping you|text you|email you|message you|nudge you|drop you a (?:line|note)|give you a (?:call|ring|shout)|follow up|check in|circle back|touch base|reach out|send (?:you |over )?(?:an |the |a )?(?:calendar )?invite|get back to you|be in touch|talk (?:to you )?(?:then|on|next|again)|speak (?:to you )?(?:then|on|next|again)|come back to you|chase|see you|catch you)\b/i;
const FOLLOW_UP = new RegExp(
  `\\b(?:i'll|i will|let me|i can|i'd love to|i'd like to|i'm going to|i'm gonna|we'll)\\b(?:\\s+[\\w'-]+){0,8}?\\s*${FOLLOW_UP_VERB.source}|\\b(?:see you|catch you|talk to you|speak to you|talk|speak)\\s+(?:then|soon|next week|${DAY_WORD})\\b`,
  "i",
);

/** "Can I call you back Thursday?": a follow-up asked for, which still gets a yes. */
const FOLLOW_UP_ASK = new RegExp(
  `\\b(?:can|could|may|shall|should|mind if|okay if|alright if|fine if) i\\b(?:\\s+[\\w'-]+){0,4}?\\s*\\b(?:call(?:ed)? you(?: back)?|r(?:ing|ang) you(?: back)?|ping(?:ed)? you|text(?:ed)? you|email(?:ed)? you|message you|c(?:o|a)me back to you|g(?:e|o)t back to you|check(?:ed)? in|follow(?:ed)? up|circle(?:d)? back)\\b`,
  "i",
);

const OPEN_PROPOSAL = new RegExp(
  [
    `\\bwould you be (?:open|up|willing|able|free|available) (?:to|for) (?:a |an |another )?(?:[\\w-]+ ){0,2}(?:call|chat|demo|meeting|pilot|trial|coffee|conversation|walkthrough|catch-up)\\b`,
    `\\bwould a (?:[\\w-]+ ){0,2}(?:trial|pilot|demo|call|meeting|chat)(?:\\s+[\\w-]+){0,6}? (?:help|work|make sense|be useful|be worth)\\b`,
    `\\b(?:could|can|shall|should) we (?:set up|book|schedule|do|have|grab|get|run|try|find|start) [^?.!]*\\b(?:call|chat|demo|meeting|pilot|trial|time|minutes)\\b`,
    `${WANT_TO.source}[^?.!]*\\b${MEETING_NOUN}\\b`,
    `\\bwhen (?:can|could|should) we (?:meet|talk|chat|do (?:this|that|it))\\b`,
    `\\b(?:would it be possible|is there a way|any chance) (?:for me )?to (?:come in|shadow|sit with|visit|meet the team|spend (?:an|a) (?:afternoon|morning|day))\\b`,
    `\\b(?:could|can) i (?:come in|shadow|sit with|visit|meet the team|spend (?:an|a) (?:afternoon|morning|day))\\b`,
  ].join("|"),
  "i",
);
const SEND_INVITE =
  /\bi'?ll (?:send|get|put|shoot) (?:you |over |across )?(?:the |an |a |that )?(?:calendar )?(?:invite|invitation)\b|\bsend (?:you |over )?(?:the |an |a )?(?:calendar )?invite\b|\binvite(?:'s| is)? on (?:its|the) way\b|\bi'?ll (?:put|get) (?:it|that|something) (?:on|in) (?:the|your) calendar\b/i;
/** "Should I include your dispatch lead on the invite?" */
const INVITE_GUEST =
  /\b(?:should|shall|can|could|do you want me to|want me to) i (?:include|add|cc|copy|loop in|invite)\b/i;

/** "What does next week look like for you": this person's own time, not their team's. */
const AVAILABILITY_QUESTION = new RegExp(
  [
    `\\bwhat does (?:next week|this week|tomorrow|\\w+day)(?: morning| afternoon)? look like for you\\b`,
    `\\bhow(?:'s| is| does) your (?:week|calendar|schedule|diary|\\w+day)(?: morning| afternoon)? look(?:ing)?\\b`,
    `\\bhow(?:'s| is| does) (?:next week|this week|${DAY_WORD})(?: morning| afternoon)? (?:look(?:ing)?|for you)\\b`,
    `\\bwhen (?:are|would|will|might|could) you (?:be )?(?:free|available|around|open|able)\\b`,
    `\\bwhat (?:day|time)s? (?:work|works|suit|suits|would work|would suit|is best|are best|is good)(?: best)?(?: (?:for )?you)?(?: for (?:that|this))?\\s*[?.!]*$`,
    `\\bwhen(?:'s| is| would be) (?:a )?good (?:time|day)?(?: for you)?\\b`,
    `\\bwhich (?:day|afternoon|morning|time|slot) (?:suits|works|is best|would suit|would work)\\b`,
  ].join("|"),
  "i",
);

/** "If it paid for itself in two months, would that change things?" */
const HYPOTHETICAL =
  /\bif \b[^?]*?,? (?:would|does|will) (?:that|it|this) (?:help|change (?:things|anything|your mind|the picture)|make a difference|work|matter|be enough|move things|get us|take the risk out|be worth|get you over the line|ease|make it easier|be a start|help you decide|be different|change your answer|sit better|be okay|be fine)\b|\bwould (?:that|it) (?:help|change things|make a difference|take the risk out)\s*[?.!]*$/i;

// Favours, offers and small starts.

/**
 * What a contact can do for the student. Talking, saying, speaking and recommending are left out:
 * "can you talk me through how she hires" asks a question, it doesn't ask for a favour.
 */
const FAVOUR_VERB =
  "(?:send|forward|introduc|pass|make|mak|do|share|put|connect|mention|flag|vouch|reach|refer|email|ping|writ|drop)";
const FAVOUR = new RegExp(
  [
    `\\b(?:could|can|would|will) you (?:maybe |possibly |perhaps |please |just |quickly )?${FAVOUR_VERB}`,
    `\\bwould you (?:mind|be (?:comfortable|willing|open to|happy to|okay|ok|up for|able to)|feel (?:comfortable|okay|ok|able))(?: (?:to|with))? (?:maybe |possibly |perhaps |just |quickly )?${FAVOUR_VERB}`,
    `\\b(?:any chance|is there any way|is there a chance|do you think|would it be possible|would it be ok(?:ay)?|would you say) (?:that )?you(?:'d| would| could| can| might)? (?:maybe |possibly |perhaps |be (?:able|willing|happy) to )?${FAVOUR_VERB}`,
    `\\bcould i get an intro\\b`,
    `\\bput(?:ting)? me in touch\\b`,
    `\\bput(?:ting)? in a (?:good |quick |kind )?word\\b`,
    `\\bvouch(?:ing)? for me\\b`,
    `\\bmention(?:ing)? me\\b`,
    `\\bconnect(?:ing)? us\\b`,
    `\\bmak(?:e|ing) (?:an |the )?intro(?:duction)?\\b`,
    `\\bpass(?:ing)? my name\\b`,
  ].join("|"),
  "i",
);

const MATERIAL =
  "(?:case stud(?:y|ies)|summary|one-pager|one pager|one-page|page|deck|resume|résumé|cv|draft|intro(?:duction)?|note|email|details|info(?:rmation)?|numbers|proposal|pricing|examples?|references?|portfolio|writing samples?|samples?|links?|overview|brochure|quote|figures|breakdown|comparison|calculator|video|recording|blurb|bio|paragraph|write-?up|it|that|something|a few lines|two lines|three lines|my [\\w-]+)";
const OFFER_TO_SEND = new RegExp(
  [
    `\\b(?:would it help if|what if|how about if|do you mind if|mind if|could|can|shall|should|may|want me to|happy to|i could|i can|i'll|i will|i'd be happy to|i'd love to|i would love to|i was going to|i'm happy to|let me|i'd be glad to) (?:i )?(?:sent|send|shoot|forward|share|put together|draft|write|get|email|pass|fire|drop)\\b(?:\\s+(?:you|over|across|along|through))?(?:\\s+[\\w'-]+){0,3}?\\s+${MATERIAL}\\b`,
    `\\bwould a (?:[\\w-]+ ){0,2}(?:note|blurb|summary|email|paragraph|one-pager|write-up|case study|deck) (?:from me )?(?:help|make|be|work)\\b`,
  ].join("|"),
  "i",
);
const SMALL_START =
  /\bwhat if we (?:started|start|tried|try|ran|run|began|begin)\b|\bif we (?:ran|started|tried|began|piloted) (?:it |this )?(?:at|with|in|on) (?:one|a single|just one)\b|\bwhat if (?:the first|one|a single|just one) (?:location|site|clinic|store|team|branch|depot|pilot)\b|\bstart(?:ed|ing)? (?:with|small|on|at) (?:one|a single|just one|small|a pilot)\b|\bone (?:location|site|clinic|store|team|branch|depot) (?:first|to start|to begin with)\b|\bpilot (?:at|in|with) one\b|\bstart small\b|\bjust one (?:location|site|clinic|store|team|branch)\b/i;

// Who the student is, and what they're after.

/** The student names who is hiring or who they want to reach. */
const TARGET =
  /\b(?:is|are|'s) hiring\b|\blooking at (?:\w+ )?roles\b|\bapplying (?:to|for)\b|\bwant(?:ed)? to (?:meet|talk to|reach|get in front of)\b|\bintro(?:duction)? to\b|\bsaw (?:that )?\w+ (?:is|has) (?:hiring|an opening)|\bopening at\b|\bbuilding out (?:his|her|their|the) (?:sales )?team\b|\bgrowing (?:his|her|their|the) (?:sales )?team\b|\bthink (?:he|she|they)(?:'s| is| are) hiring\b|\b(?:chasing|hunting|after|looking for) (?:\w+ )?(?:roles|jobs|positions)\b|\bjob (?:hunting|search)\b|\bsdr roles\b|\byou (?:knew|know) someone at\b|\bruns (?:their|the) sales team\b|\b(?:leads|heads|runs) sales at\b|\byour (?:old |former )?colleague \w+\b/i;
/** A candidate says what they're after, or why: "I'm hoping to start in sales development". */
const GOAL =
  /\bi'?m drawn to\b|\bwhat draws me\b|\bbecause i (?:like|enjoy|love)\b|\bi(?:'m| am) (?:hoping|looking|aiming|trying) to\b|\bi want to (?:start|work|get into|move into|break into)\b|\bi'?d (?:like|love|really like) to (?:start|work|get into|move into|break into|be considered)\b|\blooking for (?:a|an|my first) (?:role|job|position)\b|\bbe considered\b|\bthrow my hat\b|\binterested in the (?:role|position|opening)\b|\bi (?:like|enjoy|love) the (?:conversations|people|challenge|pace)\b|\bi'?d rather (?:talk|be|work)\b/i;
/** Why they want it: "I like the conversations", "I'd rather talk to people". */
const MOTIVATION =
  /\bi (?:like|enjoy|love) the (?:conversations|people|challenge|pace)\b|\bi'?d rather (?:talk|be|work)\b|\bi'?m drawn to\b|\bwhat draws me\b|\bi (?:like|enjoy|love) (?:finding|talking|working|solving|figuring)\b|\bbecause i (?:like|enjoy|love)\b/i;
const TOPIC_ASK =
  /\blet'?s talk about\b|\b(?:can|could) we talk about\b|\bi(?:'d| would) like to (?:talk|ask) about\b|\bi wanted to (?:talk|ask) (?:to you )?about\b|\bquick question about\b/i;
const TOPIC = new RegExp(
  `${TOPIC_ASK.source}|\\bi(?:'m| am) calling (?:because|about)\\b|\\bthe reason i(?:'m| am) calling\\b|\\bi noticed\\b`,
  "i",
);
const BUSY_REMARK = /\byou(?:'re| are| sound| seem) (?:busy|swamped|slammed|rushed)\b/i;

const IDENTITY =
  /\b(?:are|r) (?:you|u) (?:a |an )?(?:real|actual|live)?\s*(?:person|human|bot|robot|ai|machine|recording|real)\b|\bis this (?:a |an )?(?:real |actual |live )?(?:person|human|bot|robot|ai|machine|recording)\b|\b(?:am i|are we) (?:talking|speaking) (?:to|with) (?:a |an )?(?:real |actual |live )?(?:person|human|bot|robot|ai|machine|recording)\b/i;

const TIME_CHECK =
  /\bis (?:now|this) (?:an? )?(?:ok(?:ay)?|good|bad|alright|decent) (?:time|moment)\b|\b(?:got|do you have|have you got|you have|have you) (?:a |two |2 |five |5 |a couple of |a few |a quick |a spare )?(?:minute|minutes|min|sec|second|moment)s?\b|\bcatch you at an? (?:good|bad|ok(?:ay)?|alright|decent) (?:time|moment)\b|\bcaught you (?:in the middle|at a bad)\b|\bin the middle of something\b|\binterrupting\b|\b(?:okay|good|bad) (?:moment|time) to (?:talk|chat|call)\b|\bis this a (?:terrible|awful|bad|good|okay|decent|convenient) (?:time|moment)\b|\bif (?:it'?s|its|this is) a bad (?:time|moment)\b|\b(?:called|calling|ringing|rang|catching|caught|catch|reached|reaching|got) (?:you )?at (?:a |an )?(?:bad|good|ok(?:ay)?|alright|decent|terrible|awful|convenient|inconvenient|reasonable) (?:time|moment)\b/i;
const SMALL_TALK: readonly { topic: SmallTalkTopic; pattern: RegExp }[] = [
  { topic: "time", pattern: TIME_CHECK },
  {
    topic: "weekend",
    pattern:
      /\b(?:good|nice|decent|great|fun|long) weekend\b|\bhow was (?:your|the) weekend\b|\bweekend plans\b|\bplans for the weekend\b|^weekend\b|\bany (?:fun |big |nice )?plans\b|\bday off\b|\bon holiday\b|\bvacation\b|\btime off\b/i,
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
      /\bhow(?:'s| is| are|'re) (?:you|things|it|everything|life|stuff)(?: (?:doing|going|been|holding up|treating you))?(?: (?:today|this week|these days|so far|lately|over there))?\s*[?!.,]*$|\bhow have you been\b|\bhow(?:'ve| have) things been\b|\bhow(?:'s| is| has| was) (?:your )?(?:week|day|morning|afternoon|\w+day|month|quarter)(?: been| going| treating you| so far)?\s*[?!.,]*$|\bit'?s been (?:forever|a while|ages|too long|a minute)\b|\blong time\b|\bhope (?:you'?re|you are|all is|everything'?s|everything is) (?:well|good|doing well|having|okay|ok|great)|\bhappy (?:friday|monday|tuesday|wednesday|thursday|new year|holidays|belated)\b|\bgood to (?:hear|talk to|catch up with) you\b|\bnice to (?:hear from|talk to) you\b/i,
  },
];

const GREETING =
  /^(?:hi|hey|hello|hiya|yo|good (?:morning|afternoon|evening)|morning|afternoon)\b[\w ,!.?']{0,20}$/i;

/** The student's first name: "I'm Chris", "this is Alex", "Casey here from". */
const INTRO_NAME =
  /\b(?:I'm|I am|[Tt]his is|[Mm]y name is|[Ii]t's|[Nn]ame's) ([A-Z][a-z]+)\b|\b([A-Z][a-z]+) (?:here|calling)(?:,| from| with| at| over at)\b/;
/** The same without capitals: "my name is kevin im with routebird". */
const INTRO_NAME_LOOSE =
  /\bmy name is ([a-z]+)\b|\b(?:i'?m|im|its|it's) ([a-z]+),? (?:i'?m |im )?(?:with|from|at|calling|over at) \w+/i;
const NOT_A_NAME = new Set(
  [
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
    "New",
    "Over",
  ].map((word) => word.toLowerCase()),
);

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

function nameIn(line: string): string | undefined {
  const match = INTRO_NAME.exec(line);
  const loose = match ? undefined : INTRO_NAME_LOOSE.exec(line);
  const name = match?.[1] ?? match?.[2] ?? loose?.[1] ?? loose?.[2];
  return name && !NOT_A_NAME.has(name.toLowerCase()) ? capitalized(name) : undefined;
}

/** "I'm from Fleetline", "calling from Fleetline", "it's Ben over at Cartwise". */
const INTRO_FROM =
  /\b(?:I'm|I am|[Tt]his is|[Cc]alling|I work|here|over) (?:from|with|at|for) [A-Z]\w+/;
const INTRO_FROM_LOOSE =
  /\b(?:i'?m|im) \w+,? (?:i'?m |im )?(?:from|with|at) \w+|\b(?:i'?m|im) (?:calling|here) (?:from|with|on behalf of)\b|\bim (?:with|from|at) \w+/i;
/** "Priya from Routekeep": a name and a company, which only introduces someone on the first turn. */
const NAME_FROM_COMPANY = /\b[A-Z][a-z]+ (?:from|with|at|over at) [A-Z]\w+/;
const INTRO_SELF =
  /\blet me introduce myself\b|\bi graduate\b|\bi'?m (?:a|an) (?:senior|junior|sophomore|student|graduate|recent grad|final-year|first-year)\b|\bi'?m (?:finishing|studying|wrapping up|about to finish|graduating)\b|\bmy (?:background|degree) is\b|\bi work (?:at|for|with) (?:a|an) (?:company|firm|startup|team|business)\b|\bi'?m (?:calling|reaching out|getting in touch) (?:from|on behalf of|with)\b|\bmy name is\b/i;
const COMPANY_DESCRIPTION =
  /\bwe (?:do|build|make|sell|offer|provide|work with|help|run|specialise in|specialize in|focus on)\b|\bi work with (?:\w+ )?(?:carriers|clinics|teams|companies|retailers|shops|groups|firms|practices|stores|dispatch|logistics|dental)\b|\bwe(?:'re| are) a \w+ (?:company|startup|platform|team)\b/i;

// Proof, pitches and money.

/** Someone else who got a result; "your size" on its own only counts with a result verb. */
const THIRD_PARTY =
  /\b(?:one|a|another|the last|our last|a similar|a comparable) (?:[\w-]+ ){0,2}(?:firm|carrier|clinic|group|team|company|practice|customer|client|store|retailer|shop|chain|operator|dealer|agency|school|business|hospital|fleet|distributor|manufacturer|office)\b|\b(?:teams?|clinics|carriers|companies|groups|customers|clients|firms|practices|stores|businesses|operators|fleets|shops) (?:like|about|around|of) yours?\b|\bcase stud(?:y|ies)\b|\bother (?:clinics|carriers|customers|clients|teams|companies)\b|\bmost of our (?:customers|clients)\b/i;
const YOUR_SIZE = /\byour size\b/i;
const RESULT =
  /\b(?:went from|cut|reduced|saved|lowered|dropped|increased|doubled|tripled|halved|grew|was live|were live|went live|booked|closed|recovered|got back|freed up|see results|saw results|results|took them)\b/i;
const NUMBERISH =
  /\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|a third|a quarter|double|percent)\b/i;
const MONEY =
  /\b(?:price|pricing|budget|expensive|cheap|afford|roi|subscription|fee)\b|\$\d|\b\d[\d,]* (?:dollars|a month|per month|a year)\b|\bcosts? (?:less|more|about|around|under)\b|\bpay (?:for|per|about|around|less|more)\b|\bwe charge\b|\bper (?:driver|seat|user|location|clinic|store|month)\b/i;

const isProof = (text: string) =>
  (!MONEY.test(text) || RESULT.test(text)) &&
  ((THIRD_PARTY.test(text) && (RESULT.test(text) || NUMBERISH.test(text))) ||
    (YOUR_SIZE.test(text) && RESULT.test(text)));

const BENEFIT_VERB =
  "(?:also\\s+|just\\s+|basically\\s+|then\\s+)?(?:cuts?|saves?|reduces?|rebuilds?|reshuffles?|fills?|frees?|stops?|removes?|handles?|automates?|texts?|sends?|push(?:es)?|flags?|catch(?:es)?|lets? you|helps? (?:you|your|teams?|clinics|carriers|dispatch|the|people|front desks)|does (?:all|everything|that|it|this)|takes care of)\\b";
const PRONOUN_BENEFIT = new RegExp(
  `\\b(?:we|our [\\w-]+|it|this|that tool|the (?:tool|planner|platform|app|service|system|software)|which)\\s+${BENEFIT_VERB}|\\bwe help\\b|\\bhelps? (?:you|your)\\b|\\bmeans (?:the|your|you)\\b|\\bso your\\b|\\bso nobody\\b|\\bno more\\b|\\bwithout (?:anyone|someone) having to\\b`,
  "i",
);
/** A company as the subject: "Shiftwell automates the reminders". */
const PROPER_BENEFIT = new RegExp(`\\b[A-Z][a-z]+(?:[A-Z][a-z]+)?\\s+${BENEFIT_VERB}`);
/** What changes for them: "your drivers get the new route", "you'd never touch a spreadsheet". */
const OUTCOME_CLAIM =
  /\b(?:your|the) (?:[\w-]+ )?(?:customer|patient|driver|team|manager|front desk|support|dispatcher|store)s? (?:get|gets|see|sees|receive|receives|stop|stops)\b|\b\w+ stops? (?:getting|having to|doing|chasing|hearing)\b|\byou(?:'d| would) never (?:have to )?\w+|\byou (?:don'?t|won'?t|wouldn'?t) (?:need|have to)\b|\bautomatically\b|\bworks with whatever you have\b|\bin (?:about |under |like |around |roughly )?(?:a couple of |two|three|four|five|ten|\d+) (?:minutes|seconds)\b|\b(?:our|the) [\w-]+ (?:does|takes|gets|turns|makes|sorts|covers) (?:it|that|this|them|all of it|all that)\b/i;
const isBenefitClaim = (text: string) =>
  PRONOUN_BENEFIT.test(text) || PROPER_BENEFIT.test(text) || OUTCOME_CLAIM.test(text);
/** A candidate's or student's own record: "I ran…", "I booked 40…". */
const SELF_PITCH =
  /\bI (?:ran|led|built|booked|sold|managed|hit|grew|started|organi[sz]ed|raised|closed|worked|interned|made|won|doubled|tracked|founded|coached|trained|spent|ended up|finished|placed|came (?:first|second|third|top)|was (?:top|first|second|named)|earned|achieved|delivered|brought in|generated|handled|carried|exceeded|beat|reached)\b|\bI'?ve been (?:running|leading|doing|managing|working|selling|building|handling)\b|\bI'?ve (?:run|led|built|sold|managed|brought in|closed|booked|grown|raised)\b|\bI (?:run|lead|manage)\b|\bI (?:\w+ ){0,3}(?:hit|beat|exceeded|closed|booked|sold|won|landed|brought in|grew|raised|generated) (?:them|it|every|all|my|the|\d|about|around|over|nineteen|eleven|twenty|thirty)\b|\bI set (?:weekly |monthly |my own )?targets\b|\bI did (?:\w+ )?(?:bring|sell|hit|make|close|book|run|land|win)\b/i;

// Endings.

const GOODBYE =
  /\b(?:bye|goodbye|see you(?: then| there| soon)?|talk (?:soon|then|later|to you (?:then|soon|later))|speak (?:soon|then|later)|chat (?:soon|then|later)|take care|have a (?:good|great|nice|lovely) (?:rest of your )?(?:one|day|week|weekend|afternoon|evening)|enjoy (?:the rest of )?(?:your|the) (?:weekend|evening|day|week|afternoon)|give my best|say hi to|all the best|cheers|ciao|catch you later)\b/i;
const SIGN_OFF =
  /^(?:ok(?:ay)?|cool|great|perfect|awesome|amazing|yeah|yea|ya|right|fair|true|exactly|agreed|totally|sounds good|sounds great|alright|will do|thx|thanks|thank you|ty|cheers|nice|good|got it|gotcha|sure|yep|yes|no problem|no worries|no stress|no sweat|all good|k|fine|deal|done|love it|love that|brilliant|lovely|wonderful|excellent|fantastic|that works|works for me|sweet|interesting|absolutely|definitely|certainly|noted|understood|makes sense|fair enough|of course|for sure|good to know|that's helpful|helpful|good stuff|roger|copy that|wow|oh wow|right on|indeed|fab|super|splendid|terrific)\b[\w ,.!']{0,30}$/i;
const THANKS =
  /\b(?:thanks?|thank you|thx|ty|appreciate (?:it|that|this|your time|you)|grateful|you'?re the best)\b/i;
/**
 * Everyday words. A short line with none of them is noise, not a turn: "asdf qwerty" gets a
 * "say that again", while "cheers mate" or "noted" is heard as the short reply it is.
 */
const COMMON_WORDS = new Set(
  (
    "the a an is are was be been i you we it that this to of in on for and or but so ok okay yeah yes no sure right cool got hm hmm mm good great fine thanks thank hi hey hello bye what how who when why where k thx ty yep nice wow oh um uh well not do does did can could would will have has had my your our me us them they he she him her his hers their just like really very too also then there here with about from at by up down out over all any some more most one two three if as fair totally exactly agreed true makes sense ya yea nah alright perfect awesome brilliant lovely sweet " +
    "gotcha interesting absolutely definitely certainly noted understood understand fantastic cheers mate man dude pal buddy folks worries problem stress sweat thing things stuff deal done love hate indeed roger copy wow super fab terrific splendid helpful helps help know knew think thought feel felt mean meant say said see saw seen hear heard tell told ask asked want wanted need needed get give take make made go going went come came back again still already yet now today tomorrow later soon never always often sometimes maybe perhaps probably honestly basically actually obviously clearly roughly around almost quite pretty rather fairly bit little lot much many few several each every both either neither other another same different new old long short big small high low first last next early late time times day days week weeks month months year years morning afternoon evening night minute minutes hour hours second seconds moment " +
    "call calls calling meeting meet chat talk talking speak speaking email emails send sent note invite demo pilot trial price pricing cost costs budget money team teams people person staff boss manager director owner lead customer customers client clients patient patients driver drivers dispatcher dispatchers route routes order orders store stores clinic clinics shop shops company companies business job jobs role roles work working works tool tools system software app process setup plan plans schedule scheduling reminder reminders calendar spreadsheet phone phones text texts " +
    "sales selling sell sold pitch quota target targets result results number numbers percent half double week's way ways point points question questions answer answers reason reasons idea ideas sense worth value case example examples issue issues problem problems pain challenge challenges change changes better worse best worst easy easier hard harder quick quickly slow fast busy quiet free okay fine happy sorry please welcome glad awesome amazing wonderful excellent cool yes no"
  ).split(/\s+/),
);
const isNonsense = (text: string) => {
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  return (
    tokens.length > 0 &&
    tokens.length <= 3 &&
    tokens.every((token) => !COMMON_WORDS.has(token.replace(/'s$/, "")))
  );
};
const VAGUE = /\b(?:kind of|sort of|a bunch of|stuff|i guess|whatever you think|you know)\b/i;

// Questions.

const QUESTION_LEAD =
  "(?:(?:so|and|but|ok(?:ay)?|sorry|hey|um|also|quick question|one more|last one|great|right|cool|oh|roughly|just|now|then|basically|honestly|actually|first|next|finally|lastly|maybe|like|before i go on),?\\s+){0,3}";
const QUESTION_SHAPE = new RegExp(
  [
    `\\?\\s*$`,
    `^${QUESTION_LEAD}(?:what|how|who|when|where|why|which|whose)\\b`,
    `^${QUESTION_LEAD}(?:can you |could you |would you |will you |please )?(?:walk me through|tell me (?:more )?about|talk me through|give me a sense of|help me understand|remind me)\\b`,
    `^${QUESTION_LEAD}(?:do|does|did|is|are|can|could|would|should|will|have|has|was|were|am)\\s+(?:you|your|we|i|it|this|that|the|they|there|anyone|anybody|someone|somebody|\\w+day)\\b`,
    `\\b(?:want to|like to|love to|need to|trying to|curious|wondering|help me|let me|can i|could i|may i) (?:learn|know|understand|hear|ask|find out|about) (?:about )?(?:how|what|why|who|when|where|which)\\b`,
    `\\b(?:want to|like to|love to|need to|trying to|help me|let me) understand (?:your|the) \\w+`,
    `\\b(?:can|could|may) i ask\\b`,
    `\\bi'?d (?:love|like) to (?:learn|know|hear|understand|ask)\\b`,
  ].join("|"),
  "i",
);
const isQuestion = (sentence: string) => QUESTION_SHAPE.test(sentence);

/** A question the student answers themself: "Why sales over marketing? I like the conversations." */
const isRhetorical = (sentence: string, index: number, sentences: readonly string[]) =>
  /^why\b/i.test(sentence) &&
  words(sentence) <= 6 &&
  index < sentences.length - 1 &&
  sentences.slice(index + 1).every((rest) => !isQuestion(rest));

/** Small talk is short. A long sentence that mentions a holiday or a game is about something else. */
const SMALL_TALK_WORDS = 14;
const smallTalkTopic = (text: string): SmallTalkTopic | undefined =>
  words(text) <= SMALL_TALK_WORDS
    ? SMALL_TALK.find(({ pattern }) => pattern.test(text))?.topic
    : undefined;

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_CHECK = /^is (?:this|that|it) ([a-z]+)\s*[?.!]*$/i;
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
  const other = NAME_CHECK.exec(stripFillers(text, firstName))?.[1]?.toLowerCase();
  return other !== undefined && !NOT_A_NAME_CHECK.has(other) ? "wrong" : undefined;
}

/** A yes-or-no question about how they work: "Do you call patients the day before?" */
const YES_NO_QUESTION = new RegExp(
  `^${QUESTION_LEAD}(?:do|does|did|is|are|have|has|was|were|would|will|can|could)\\s+(?:you|your|they|the|it|that|those|these|there|anyone|[\\w-]+s|\\w+day)\\b`,
  "i",
);

/** "Which is busier…", "what about Mondays…": a question that wants an answer, not a yes. */
const WH_QUESTION = new RegExp(
  `^${QUESTION_LEAD}(?:which|what|when|who|how|why|where|whose)\\b`,
  "i",
);
/** "How about Monday?" offers a day; it is the one wh-shape that doesn't ask about their week. */
const HOW_ABOUT_LEAD = new RegExp(`^${QUESTION_LEAD}(?:how|what) about\\b`, "i");

/** The frames in which a day or time is being proposed to this person. */
function isProposal(sentence: string, dayAsked: boolean): boolean {
  if (!timeIn(sentence)) return false;
  if (OPERATIONS_SUBJECT.test(sentence) || TIMING_QUESTION.test(sentence)) return false;
  if (HOW_BUSY.test(sentence) || QUARTER_END.test(sentence)) return false;
  if (AVAILABILITY_QUESTION.test(sentence)) return false;
  const asked = isQuestion(sentence);
  if (
    MEETING_SETUP.test(sentence) ||
    FREE_YOU.test(sentence) ||
    TIME_FITS_YOU.test(sentence) ||
    HOW_ABOUT.test(sentence) ||
    BARE_TIME.test(sentence) ||
    WE_MEET.test(sentence) ||
    WE_COULD.test(sentence) ||
    LETS.test(sentence) ||
    WANT_TO.test(sentence) ||
    HAVE_TIME.test(sentence) ||
    CAN_YOU_DO.test(sentence) ||
    CALENDAR.test(sentence) ||
    DOES_THAT_SUIT.test(sentence) ||
    WHAT_ABOUT_MEETING.test(sentence) ||
    (SAY_TIME.test(sentence) && asked) ||
    // "Is Monday or Tuesday quieter for you?" asks about their week, not for a slot in it.
    (EITHER_OR.test(sentence) &&
      !BUSIEST_QUESTION.test(sentence) &&
      (EITHER_OR_FRAME.test(sentence) || MEETING_NOUN_IN.test(sentence))) ||
    (THINKING.test(sentence) && (asked || /\bif that works\b/i.test(sentence))) ||
    (TO_MEET.test(sentence) && asked)
  ) {
    return true;
  }
  // A short answer with a day in it, right after a day came up: "Wednesday works, 3pm?". A question
  // about their week ("which is busier, Monday or Friday?") is never one; "how about" offers.
  return (
    dayAsked &&
    words(sentence) <= 8 &&
    !YES_NO_QUESTION.test(sentence) &&
    (!WH_QUESTION.test(sentence) || HOW_ABOUT_LEAD.test(sentence))
  );
}

/** "Do you have a minute?" checks the time; it never sets a meeting up. */
const isOpenProposal = (sentence: string) =>
  !TIME_CHECK.test(sentence) &&
  (OPEN_PROPOSAL.test(sentence) ||
    (!timeIn(sentence) &&
      (MEETING_SETUP.test(sentence) || FREE_YOU.test(sentence)) &&
      isQuestion(sentence)));

// Kinds of question.

const RELATIONSHIP_QUESTION =
  /\bhow well do you know\b|\bin touch\b|\bin contact\b|\bdo you (?:still |two |guys )?(?:still )?(?:talk|speak|chat)\b|\bwhen did you last\b|\bhow (?:do |did )?you (?:two )?(?:know|met|meet)\b|\bhow close are you\b|\bare you (?:two |guys )?(?:close|friendly|tight)\b|\b(?:spoken|talked) to \w+ (?:recently|lately)\b|\bheard from \w+ (?:recently|lately)\b|\byou two\b/i;
const JOB_QUESTIONS: readonly { topic: JobTopic; pattern: RegExp }[] = [
  {
    topic: "mix",
    pattern:
      /\bcold calling\b|\bversus\b|\bvs\.?\b|\bhow much of the (?:job|role|day|week)\b|\bsplit between\b|\boutbound\b|\binbound\b/i,
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
      /\bsuccess look like\b|\bfirst (?:six|6|three|3|twelve|12) months\b|\bfirst (?:quarter|90 days|ninety days)\b|\bgreat first\b|\btargets?\b|\bquota\b|\bmeasured\b/i,
  },
  {
    topic: "size",
    pattern:
      /\bhow big\b|\bhow many (?:people|reps|sdrs|folks)\b(?! (?:are you|do you|will you) (?:looking|planning|going|hiring|adding|bring|take))|\bteam size\b|\bheadcount\b/i,
  },
  {
    topic: "timeline",
    pattern:
      /\btimeline\b|\btime ?frame\b|\bwhen are you (?:hoping|looking|planning|aiming|trying|wanting) to (?:fill|hire|have|bring|start|make)\b|\bhow soon\b|\bhow quickly (?:are you|do you|would you|will you)\b|\bfill (?:the|this|that) (?:role|position|seat|opening)\b|\bstart date\b|\bwhen would (?:someone|i|the role|this|they) start\b|\bwhen (?:do|would|will) you (?:want|need) (?:someone|them|people|me) (?:to start|in|starting|on board|in the seat)\b/i,
  },
  {
    topic: "challenge",
    pattern:
      /\bbiggest (?:challenge|struggle|hurdle|mistake|problem)\b|\bhardest (?:part|thing|bit)\b|\bstruggle (?:with|most)\b|\btrips? (?:people|reps|them) up\b|\bwhere do (?:new )?(?:reps|people|sdrs|hires) (?:struggle|fail|go wrong|slip)\b|\bcommon mistakes?\b/i,
  },
  {
    topic: "team",
    pattern:
      /\bculture\b|\bhow (?:is|are) the team (?:structured|organi[sz]ed|set up)\b|\bteam like\b/i,
  },
];
const DETAIL_QUESTIONS: readonly { topic: DetailTopic; pattern: RegExp; voice?: Voice }[] = [
  {
    topic: "checkBack",
    pattern:
      /\bis that (?:right|fair|correct|about right)\b|\bam i (?:right|hearing you right|getting that right)\b|\bif i(?:'m| am) hearing you\b|\bsounds like\b|\bso (?:the|your) (?:main|big|biggest|real) (?:issue|problem|thing|headache)\b|\bdid i get that right\b/i,
  },
  {
    topic: "anythingElse",
    pattern:
      /\b(?:is there |got )?anything else (?:i should|you'd|you want|worth|to|about)\b|^anything else\b|\bwhat else should i know\b|\bam i missing\b|\bhaven'?t asked\b|\bshould have asked\b|\bforgot to ask\b|\bdidn'?t ask\b|\bmissed anything\b/i,
  },
  {
    topic: "behind",
    pattern:
      /\bwhat(?:'s| is) (?:driving|behind)\b|\bwhere(?:'s| is) that coming from\b|\bwhy is that a (?:concern|worry|problem)\b|\bwhat(?:'s| is) the (?:concern|worry)\b/i,
  },
  {
    topic: "wish",
    pattern:
      /\bchange one thing\b|\bmagic wand\b|\bif you could (?:change|fix|wave)\b|\bwhat would you change\b|\bideal(?:ly)?\b|\bwish\b|\bbetter version\b|\bwhat would (?:good|better|great|a win) look like\b/i,
  },
  {
    topic: "impact",
    pattern:
      /\bwhat would (?:it|that) (?:mean|be worth|do for|free up|save)\b|\bif [^?]* (?:dropped|fell|went away|disappeared|halved|doubled)\b|\bwhat would [^?]* save you\b/i,
  },
  {
    topic: "picked",
    pattern:
      /\bwhat made you (?:pick|choose|go with)\b|\bwhy did you (?:pick|choose|go with)\b|\bhow did you (?:pick|choose|end up with)\b/i,
  },
  {
    topic: "tried",
    pattern:
      /\bwhat have you tried\b|\bhas anyone (?:looked at|tried)\b|\bhave you (?:looked at|tried|ever)\b|\blooked at (?:fixing|other|alternatives)\b|\banyone tried\b|\blast (?:tool|vendor|system)\b|\bprevious (?:tool|vendor|system)\b|\bwhat went wrong\b|\bpromise you\b/i,
  },
  {
    topic: "more",
    pattern: /\btell me more\b|\bsay more\b|\bexpand on\b|\belaborate\b|\bgo on about\b/i,
  },
  {
    topic: "priorities",
    pattern:
      /\bwhat does your (?:boss|manager|ceo|director|team|owner) (?:care|want|look for|worry)\b|\bwhat matters most to\b|\bwhat(?:'s| is) important to\b|\bcare about most\b|\bwhat(?:'s| is) (?:your|the) (?:boss|manager|owner) (?:focused|measured) on\b/i,
  },
  {
    topic: "quarter",
    pattern: /\bquarter end\b|\bend of (?:the|your) quarter\b|\bquarter ends?\b/i,
  },
  { topic: "howBusy", pattern: /\bhow busy\b|\bhow hectic\b|\bhow slammed\b/i },
  {
    topic: "trend",
    pattern:
      /\bbetter or worse\b|\bgetting (?:better|worse)\b|\bover the last (?:year|few years|six months|twelve months)\b|\bsince you (?:grew|started|expanded|opened)\b|\bchanged (?:at all|much)\b|\btrend\b/i,
  },
  {
    topic: "coaching",
    pattern:
      /\bcoaching\b|\btraining\b|\bonboarding\b|\bhow much support\b|\bmentor|\blearning curve\b|\bworr(?:y|ies) your team\b|\badopt(?:ion)?\b|\btake to it\b/i,
  },
  {
    topic: "opinion",
    pattern:
      /\byour take\b|\byour view\b|\byour opinion\b|\bwhat do you think\b(?! (?:he|she|they)\b)|\bwhat do you reckon\b|\byour thoughts\b|\bhow does that sound to you\b|\bhonest opinion\b|\bgut feel\b|\bwhat do you make of\b|\bwhat(?:'s| is) your (?:gut|sense|read)\b/i,
  },
  {
    topic: "pain",
    pattern:
      /\bbiggest (?:headache|challenge|problem|pain|issue|frustration)\b|\bwhat(?:'s| is) the (?:hardest|worst|most annoying) (?:part|bit|thing)\b|\bkeeps you up\b|\bwhat frustrates\b|\bwhat(?:'s| is) (?:painful|broken)\b/i,
  },
  { topic: "why", pattern: /^(?:why|how come)\b|\bwhy is that\b|\bwhy do you think\b/i },
  {
    topic: "enjoy",
    voice: "hiring",
    pattern:
      /\bwhat do you (?:enjoy|like|love) (?:most |best )?about\b|\bfavou?rite (?:part|thing)\b/i,
  },
  {
    topic: "worries",
    voice: "hiring",
    pattern:
      /\banything about (?:my|me)\b[^?]*\b(?:worr|concern|bother|give you pause)|\bwhat worries you\b|\bany (?:concerns|hesitations|red flags)\b|\bwhat(?:'s| is) holding you back\b/i,
  },
  {
    topic: "story",
    voice: "hiring",
    pattern:
      /\bhow did you (?:get into|end up in|start in|get started)\b|\byour (?:path|journey|story|own background)\b|\bhow long have you been (?:in sales|here|at)\b/i,
  },
  {
    topic: "graduates",
    voice: "hiring",
    pattern:
      /\bstraight out of (?:college|school|uni|university)\b|\bnew grads?\b|\brecent graduates?\b|\bhow many (?:sdrs|reps|people) (?:are you|do you|will you) (?:looking to |planning to |going to )?(?:add|hire|bring on|take on)\b|\b(?:hiring|adding) this year\b|\bhire (?:many|a lot of|people|anyone) (?:out of|from|without)\b|\bfirst job\b/i,
  },
  {
    topic: "nextStep",
    voice: "hiring",
    pattern:
      /\bnext steps? (?:in|of|for) (?:your|the) process\b|\bwhat happens next\b|\bwhat are the next steps\b|\bhow does the process work\b|\bwhat(?:'s| is) (?:your|the) (?:interview |hiring )?process\b|\bwhat(?:'s| is) the next step\b|\b(?:interview|hiring|interviewing) process\b|\bhow many (?:rounds|interviews|stages|steps)\b|\bsteps? from here\b/i,
  },
  {
    topic: "wants",
    voice: "contact",
    pattern:
      /\bwhat (?:do you think |would )?(?:he|she|they)(?:'d| would)? want\b|\bwhat should i (?:send|include|say|put)\b|\bwhat (?:would|do) you want me to (?:say|put|include|write|send)\b|\bwhat should (?:it|the note|the email) say\b|\bwhat would (?:help|make it easy|make it easier)\b|\bwhat (?:do|would) they look for\b/i,
  },
];
const HOW_BUSY = /\bhow busy\b|\bhow hectic\b/i;
const QUARTER_END = /\bquarter end\b|\bend of (?:the|your) quarter\b|\bquarter ends?\b/i;

const QUALITY_QUESTION =
  /\bhow well (?:does|do|is|has|did|are) (?:it|that|this|the|your)\b|\bdoes (?:it|that) (?:work well|work for you|do the job|hold up)\b|\bhow (?:happy|satisfied) are you\b|\bwhat (?:(?:does|do) )?(?:it|that|the (?:current )?[\w-]+(?: [\w-]+)?) (?:do|does) well\b|\bwhat do you like about\b|\bwhat'?s (?:good|working|not working) about\b|\bhow(?:'s| is) (?:that|it) (?:working|going)\b|\bis (?:that|it) working\b/i;
const QUANTITY_QUESTION =
  /\bhow (?:much time|long|many|often|frequently|big|large)\b|\bhow much (?:of your|of the|of their) (?:day|time|week)\b|\bwhat (?:share|proportion|percentage|fraction|percent) of\b|\bhow much of (?:your|the|their) (?:orders|slots|routes|appointments|time|day)\b/i;
/** Which kind of number a quantity question wants. */
const quantityKind = (question: string): QuantityKind =>
  /\bhow (?:often|frequently|regularly)\b/i.test(question)
    ? "frequency"
    : /\bhow (?:long|much time|much of)\b|\bhow many (?:hours|minutes|days)\b|\btime does\b|\bspend\b/i.test(
          question,
        )
      ? "duration"
      : "count";
const TIMING_QUESTION =
  /\bwhat time\b|\bwhen do (?:they|you|your \w+|the \w+)\b|\bhow early\b|\bhow late\b/i;
const BUSIEST_QUESTION =
  /\b(?:worst|worse|busiest|busier|hardest|toughest|slowest|slower|quietest|quieter|peak)\b|\bcertain days\b/i;
const STAFF_QUESTION = /\bwho (?:works|staffs|covers|is on|answers|mans|sits at)\b/i;
const COST_SUBJECT =
  /\b(?:tool|system|setup|software|subscription|vendor|licen[cs]e|platform|current|existing|today|now|salary|budget|pay|price|pricing|charge|invoice|contract|plan|service|compensation|range)\b/i;
const MONEY_VERB =
  /\b(?:cost|costing|costs|pay|paying|run|running|charge|charging|budget|salary|price|pricing|spend|spending|compensation|range)\b/i;
const PROBLEM_COST =
  /\bwhat (?:does|would|did|do) [^?]*? cost(?:ing)?\b|\bcosts? (?:you|us|them|the business|the clinic|the company)\b|\bwhat(?:'s| is) that costing\b|\bwhat (?:does|would) (?:a|an|one|each) [\w-]+ (?:cost|run)\b|\bwhat happens (?:to|with) the (?:customer|patient|order|client) when\b/i;
const CONDITIONS_QUESTION =
  /\bwhat would (?:it take|make (?:it|you|this|that|the \w+)|you need|need to happen|change your mind|get you|get your|convince you|help you|help)\b|\bwhat (?:do|would) you need to (?:see|hear|know)\b|\bwhat would (?:you )?(?:have|need) to (?:be true|happen)\b|\bwhat would (?:a |the )?(?:good|right|ideal) (?:outcome|result|setup|fix|solution|answer|version|first step) look like\b/i;
const OWNER_QUESTION =
  /\bwho (?:owns|runs|looks after|is in charge of|handles|manages|is responsible for|leads|heads|ends up|gets stuck|has to fix|fixes|sorts|gets the blame|takes the heat|gets the call)\b|\bwho (?:would|will|do|'d) I (?:be )?(?:work(?:ing)?|report(?:ing)?|sit(?:ting)?) (?:with|to|next to|under|for)\b|\bwho(?:'s| is) (?:my|the) (?:manager|boss|lead)\b/i;
const DECISION_QUESTION =
  /\bwho (?:decides|else|signs|approves|makes the call|has the final say|green-?lights|would need to|needs to|has to|besides you)\b|\bwho on your (?:side|team|end)\b|\bwho (?:would|should|will|needs? to|has to|gets to|is|would have to|'d)\b[^?]*\b(?:sign|decide|approve|involved|say|weigh|buy|see|know|meet|comfortable|convinced|on board|bless|okay|look at|review|check|in the loop|hear about)\b|\bsign[- ]?off\b|\bdecision\b|\bbesides you\b|\bconvince\b|\bwin over\b|\bget on board\b|\bwho would you want (?:in the room|involved|there|on the call|to see it|to be there)\b|\bwho at (?:head office|the top|your end|your company|hq)\b/i;
const TOOL_QUESTION =
  /\bwhat (?:are|is) (?:you|your [\w-]+(?: [\w-]+)?) (?:using|on|running)\b|\bwhat (?:tool|tools|system|software|platform|vendor|product)s?\b|\bwhat do you use\b|\bwhich (?:tool|system|software|platform|vendor)\b/i;
const PROCESS_QUESTION =
  /\bhow (?:do|does|did|are|is|you|your|would|has|have|u)\b|\bwalk me through\b|\btell me about\b|\btalk (?:me through|(?:a bit |a little |more )?about)\b|\bwhat does [^?]* look like\b|\bwhat [^?]* is like\b|\bwhat happens\b|\bhow you\b|\bspend (?:most of )?(?:their|your|the|a) (?:day|time|week|morning)\b|\bspend (?:most of )?(?:their|your) \w+ on\b|\bwhat(?:'s| is) (?:the|your) (?:process|setup|routine|workflow)\b|\bwhat (?:do|does) (?:you|your \w+|the \w+) do (?:when|if|about|with|first|today|now)\b|\bgive me a sense of\b|\bhelp me understand\b|\bwhat(?:'s| is) (?:a |the )?(?:typical|normal|usual|average) (?:day|week|morning|afternoon|shift)\b|\bramp\b|\bfirst (?:month|week|day)\b|\bwhat'?s (?:it|that) like\b|\bhow are [\w ]+ (?:planned|handled|done|managed|booked|scheduled)\b|\bunderstand (?:your|the|how your|how the) (?:\w+ )?(?:process|setup|workflow|routine|day|week|operation|side|team|situation)\b/i;

/**
 * A contact asked, yes or no, about the person the student wants to reach: "Is he still hiring?"
 * "Can you talk me through how she hires?" asks the contact to explain, so it isn't one.
 */
const TARGET_PRONOUN = /\b(?:he|she|they|him|her|them|his|hers|their)\b/i;
const TARGET_YES_NO = new RegExp(
  `^${QUESTION_LEAD}(?:is|are|does|do|did|has|have|was|were|would|will|can|could|should)\\b(?!\\s+you (?:talk|speak|tell|walk|explain|describe|say (?:more|why|what|how|a bit|a little|anything))\\b)|\\bdo you know (?:if|whether)\\b|\\bany idea (?:if|whether)\\b`,
  "i",
);
const TARGET_TOPICS: readonly { topic: TargetTopic; pattern: RegExp }[] = [
  {
    topic: "replies",
    pattern:
      /\brepl(?:y|ies|ied)\b|\brespond|\banswer|\bget back\b|\bread (?:their|his|her) email/i,
  },
  {
    topic: "rightPerson",
    pattern:
      /\bright person\b|\bbest person\b|\bthe one (?:to|who|doing|i should|in charge|making|running|hiring)\b|\bin charge\b|\bdecid|\bwho i should\b|\bworth (?:talking|reaching)\b/i,
  },
  {
    topic: "hiring",
    pattern:
      /\bhiring\b|\bhires?\b|\bopenings?\b|\btaking (?:people )?on\b|\blooking for (?:people|reps|anyone)\b|\bopen roles?\b/i,
  },
  {
    topic: "there",
    pattern:
      /\bstill (?:work|there|at|with|around|run|running|head|heading|lead|leading|in|on)\b|\bmoved on\b|\bleft\b|\bwork(?:s|ing)? (?:there|at)\b/i,
  },
];
const targetTopic = (question: string): TargetTopic =>
  TARGET_TOPICS.find(({ pattern }) => pattern.test(question))?.topic ?? "other";
const isTargetQuestion = (question: string) =>
  TARGET_PRONOUN.test(question) && TARGET_YES_NO.test(question);

function questionIntent(
  question: string,
  voice: Voice,
): {
  intent: Intent;
  job: JobTopic | undefined;
  detail: DetailTopic | undefined;
  about: TargetTopic | undefined;
} {
  const job =
    voice === "hiring" ? JOB_QUESTIONS.find(({ pattern }) => pattern.test(question)) : undefined;
  const detail = DETAIL_QUESTIONS.find(
    (entry) => (entry.voice === undefined || entry.voice === voice) && entry.pattern.test(question),
  );
  const about =
    voice === "contact" && isTargetQuestion(question) ? targetTopic(question) : undefined;
  const intent = ((): Intent => {
    if (voice === "contact" && RELATIONSHIP_QUESTION.test(question)) return "relationship_question";
    // "Is he the person who runs the SDR team?" asks who runs it, in a yes-or-no shape.
    if (about !== undefined && !detail) {
      return OWNER_QUESTION.test(question) ? "owner_question" : "target_question";
    }
    if (job) return "job_question";
    if (QUALITY_QUESTION.test(question)) return "quality_question";
    if (detail) return "detail_question";
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
  return { intent, job: job?.topic, detail: detail?.topic, about };
}

const offerTopic = (text: string): OfferTopic =>
  /\bcase stud|example|reference|result/i.test(text)
    ? "caseStudy"
    : /\b(?:manager|boss|board|team|director|owner)\b/i.test(text)
      ? "passAlong"
      : "generic";

/** The kind of turn the student just took, with what the reply needs from it. */
export function readTurn(line: string, context: TurnContext): Reading {
  const { voice, stage, firstName, objectionRaised } = context;
  const turn = context.turn ?? 1;
  const booking = context.booking ?? NO_BOOKING;
  const rawSentences = sentencesOf(line);
  // "anyway um what does your boss care about" reads as the question underneath the filler.
  const sentences = rawSentences.map((sentence) => stripFillers(sentence, firstName));
  const core = sentences.join(" ");
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
    orTime: orTimeIn(sentence),
    name,
    named: false,
    smallTalk: undefined,
    job: undefined,
    about: undefined,
    offer: undefined,
    detail: undefined,
    quantity: undefined,
    invite,
    motivation: false,
    wrongName: false,
    nonsense: false,
    ...extra,
  });
  const find = (test: (sentence: string) => boolean) => sentences.find(test);

  if (IDENTITY.test(line)) return reading("identity");

  // A meeting, proposed or promised: the one thing that beats a question in the same turn.
  const followUp = find(
    (sentence) =>
      timeIn(sentence) !== undefined &&
      ((FOLLOW_UP.test(sentence) && !isQuestion(sentence)) || FOLLOW_UP_ASK.test(sentence)),
  );
  if (followUp) {
    // "I'll send the draft Thursday and check in Monday": the time that goes with the follow-up.
    const tail = followUp.slice(FOLLOW_UP_VERB.exec(followUp)?.index ?? 0);
    return reading("follow_up", followUp, { time: timeIn(tail) ?? timeIn(followUp) });
  }
  const proposal = find((sentence) => isProposal(sentence, booking.dayAsked));
  if (proposal) return reading("proposal", proposal);
  if (voice === "contact" && FAVOUR.test(core)) return reading("favour");
  const availability = find((sentence) => AVAILABILITY_QUESTION.test(sentence));
  if (availability) return reading("availability_question", availability);
  const confirm = find((sentence) => CONFIRM.test(sentence) && timeIn(sentence) === undefined);
  if (confirm) return reading("confirm", confirm);
  const open = find(isOpenProposal);
  if (open) return reading("open_proposal", open);
  if (booking.booked !== undefined && (GOODBYE.test(core) || invite)) return reading("wrap_up");
  if ((booking.booked !== undefined || closing) && INVITE_GUEST.test(core)) {
    return reading("invite_guest");
  }
  if (!closing && invite) return reading("open_proposal");
  if (SMALL_START.test(core)) return reading("small_start");
  if (OFFER_TO_SEND.test(core)) return reading("offer_to_send", line, { offer: offerTopic(core) });
  const hypothetical = find((sentence) => HYPOTHETICAL.test(sentence));
  if (hypothetical) return reading("hypothetical", hypothetical);
  // "Do you know if she's hiring?" asks about the person; "I think she's hiring" names them.
  if (voice === "contact" && TARGET.test(core) && !sentences.some(isTargetQuestion)) {
    return reading("target");
  }

  // Questions: small talk and "is this Maya?" only count when nothing substantive was asked.
  const questions = sentences.filter(
    (sentence, index) => isQuestion(sentence) && !isRhetorical(sentence, index, sentences),
  );
  const substantive = questions.filter(
    (question) =>
      !smallTalkTopic(question) &&
      !nameCheck(question, firstName) &&
      !TOPIC_ASK.test(question) &&
      !GREETING.test(question),
  );
  const topics = sentences.map(smallTalkTopic);
  const smallTalk = topics.includes("time") ? "time" : topics.find((topic) => topic !== undefined);
  const namedIntro =
    INTRO_NAME.test(line) ||
    INTRO_NAME_LOOSE.test(line) ||
    INTRO_FROM.test(line) ||
    INTRO_FROM_LOOSE.test(line) ||
    INTRO_SELF.test(line) ||
    (turn === 1 && NAME_FROM_COMPANY.test(line));
  const opener =
    (namedIntro && !(turn > 1 && voice === "hiring" && SELF_PITCH.test(core))) ||
    ((stage === "opening" || turn <= 3) && COMPANY_DESCRIPTION.test(core) && !isBenefitClaim(core));
  if (substantive.length === 0 && smallTalk && (smallTalk === "time" || !opener)) {
    return reading("small_talk", line, { smallTalk });
  }
  const checked = nameCheck(core, firstName);
  if (substantive.length === 0 && checked) {
    return reading("name_check", line, { wrongName: checked === "wrong" });
  }
  if (substantive.length === 0 && TOPIC_ASK.test(core)) return reading("topic");
  const question = substantive.at(-1);
  if (question) {
    const { intent, job, detail, about } = questionIntent(question, voice);
    return reading(intent, question, { job, detail, about, quantity: quantityKind(question) });
  }

  // Statements.
  if (BUSY_REMARK.test(core)) return reading("busy_remark");
  const booked = booking.booked !== undefined;
  const goodbye = GOODBYE.test(core) || invite;
  if ((booked && (goodbye || THANKS.test(core) || SIGN_OFF.test(core))) || (closing && goodbye)) {
    return reading("wrap_up");
  }
  if (opener) return reading("opener", line, { named: namedIntro });
  if (voice === "hiring" && GOAL.test(core)) {
    return reading("target", line, { motivation: MOTIVATION.test(core) });
  }
  if (TOPIC.test(core)) return reading("topic");
  // "Totally understand": the lead-in is a filler word, so the unstripped line is checked too.
  const acknowledging = (ACKNOWLEDGE.test(core) || ACKNOWLEDGE.test(line)) && objectionRaised;
  if (voice !== "buyer") {
    if (acknowledging) return reading("acknowledgement");
    if (SELF_PITCH.test(core)) return reading("pitch");
  }
  if (isProof(core)) return reading("proof");
  if (acknowledging && !MONEY.test(core)) return reading("acknowledgement");
  if (isBenefitClaim(core) || MONEY.test(core)) return reading("pitch");
  if (GREETING.test(line)) return reading("greeting");
  if (THANKS.test(core)) return reading("thanks");
  // A short "gotcha" or "cheers mate" is a turn; only words the persona can't place are noise.
  if (SIGN_OFF.test(line) || SIGN_OFF.test(core)) return reading("short_reply");
  if (isNonsense(core)) return reading("unclear", line, { nonsense: true });
  if (words(core) <= 4) return reading("short_reply");
  if (VAGUE.test(core)) return reading("vague");
  return reading("unclear");
}
