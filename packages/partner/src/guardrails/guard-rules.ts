import { normalizeWords } from "@pitchperfect/shared";

export type RuleVerdict = "prompt_attack" | "harmful";

// These are matched on the raw text: they rely on punctuation or capitals that normalizeWords() drops.
const CHAT_TEMPLATE = /<\|?\/?(?:im_start|im_end|system|endoftext)\|?>|\[\/?inst\]|<<\/?sys>>/i;
// A header followed by an order to the partner; "Updated instructions: delivery moves to Friday" is not one.
const INSTRUCTIONS_HEADER =
  /^\s*(?:new|updated|revised)\s+(?:system\s+)?instructions\s*:\s*(?:from now on|answer|obey|ignore|disregard|forget|respond|reply|act as|pretend|stop|reveal|print|repeat|you(?:\s+are|['’]re)\s+now|you\s+(?:no longer|have no|don['’]t have|do not have))\b/i;
const HEADER_TAKEOVER =
  /\b(?:obey|ignore|disregard|forget|reveal|rules|restrictions|filters|prompt|unrestricted|unfiltered|no longer|(?:anything|everything) i (?:ask|say))\b/;

// The lead-in is case-insensitive but the name must be upper case: "Dan" is a common first name.
const DAN_LEAD_IN = /\b(?:you are|you're|you’re|be|as|act as|become)\s+(?:now\s+)?(dan)\b/gi;
const isDan = (text: string) =>
  Array.from(text.matchAll(DAN_LEAD_IN)).some((match) => match[1] === "DAN");

const PROMPT_WORDS = "(?:prompts?|instructions|programming)";
const REVEAL_VERBS =
  "(?:reveal|show|print|repeat|display|output|leak|recite|dump|share|tell|give|send|paste|copy|write|say|read)";
const DROP_VERBS = "(?:ignore|disregard|forget|override|bypass)";
const OFF_VERBS = "(?:disable|turn off|bypass|override|circumvent|remove)";
const EARLIER = "(?:previous|prior|above|earlier|preceding|original|initial|system)";
const RULE_WORDS = "(?:instructions|prompts?|programming|directions|rules|guidelines)";
const FREE = "(?:unrestricted|unfiltered|uncensored|jailbroken|evil)";
/** "An AI" as something to become, not "an AI skeptic" or "an AI-ready team". */
const MODEL_NOUN =
  "(?:ai|assistant|chatbot|bot|language model|gpt|hacker)(?=$| (?:with|without|that|who|and|called|named|now|from|instead|not|no)\\b)";
/**
 * The order stops here, or another one follows. "Ignore the previous instructions I sent" and
 * "forget your persona slides" go on to talk about something else.
 */
const ENDS =
  "(?=$| (?:and|then|now|just|please|completely|entirely|from now on|you were|you ve been|you have been|word for word|verbatim|exactly|in full|into|for me|to me)\\b)";
/** Instructions that belong to someone else: "I sent", "in the welcome pack". */
const NOT_THEIRS =
  "(?! (?:i|we|they) \\w+| (?:in|from|for|about|on|of) (?:the|our|this|that|my|their)\\b)";

/**
 * Attacks the stricter check accepts as confirmed: each one names the partner's own rules, prompt,
 * scenario or role, or asks to be free of them, with nothing after it that makes it ordinary talk.
 */
const CONFIRMED_ATTACK: readonly RegExp[] = [
  // Dropping the rules.
  new RegExp(
    `\\b${DROP_VERBS} (?:(?:all|any)(?: of)?(?: the| your| these| those)?(?: ${EARLIER})?|(?:(?:the|these|those|your) )?${EARLIER}|your(?: (?:safety|content))?) ${RULE_WORDS}${ENDS}`,
  ),
  new RegExp(
    `\\b(?:${OFF_VERBS}|ignore) your (?:guardrails?|safeguards|content (?:policy|filters?|rules)|safety (?:filters?|rules|settings|guidelines|policy))\\b`,
  ),
  new RegExp(`\\b${OFF_VERBS} your (?:filters|restrictions|rules)${ENDS}`),
  // Extracting the prompt or the scenario.
  new RegExp(
    `\\b(?:${REVEAL_VERBS}|translate|summari[sz]e|what is|what s|whats) (?:me |us )?(?:\\w+ ){0,3}?(?:your|the) (?:system|initial|hidden|secret) prompts?${ENDS}`,
  ),
  new RegExp(
    `\\b(?:reveal|print|repeat|output|display|leak|recite|dump|show|share|paste|show me|tell me|give me|send me) your (?:(?:system|initial|hidden|secret|original) )?${PROMPT_WORDS}${ENDS}`,
  ),
  // Rules and guidelines are only an extraction request after a strong verb, not "tell me your rules".
  new RegExp(
    `\\b(?:reveal|print|repeat|output|display|leak|recite|dump) your (?:rules|guidelines)${ENDS}`,
  ),
  /\brepeat (?:everything|all|the words|the text) (?:above|before)\b/,
  /\brepeat (?:the |your |all )?(?:instructions|prompt|text|words) above\b/,
  /\brepeat (?:the )?above (?:instructions|prompt|text|words|verbatim|word for word)\b/,
  new RegExp(
    `\\b(?:${REVEAL_VERBS}|what is|what s|whats|spell) (?:me |us )?(?:the |your )(?:secret |hidden )?canary (?:token|string|word|value|code)\\b`,
  ),
  /\bcanary (?:token|string|word|value|code) you (?:were|ve been|have been)\b/,
  /\b(?:show|list|reveal|print|read|recite|dump|leak|repeat|give me|tell me|show me) (?:your|the) (?:hidden objections|win conditions|stage tags)(?=$| (?:and|then|so|in|from|for this|you were|you ve been|you have)\b)/,
  // Swapping the role, or being free of the rules.
  new RegExp(`\\byou (?:are|re) now (?:a |an )?(?:dan|no longer|${FREE})\\b`),
  new RegExp(`\\b(?:from now on|now) you (?:are|re|will be) (?:a |an )?${FREE}\\b`),
  new RegExp(`\\b${FREE} (?:ai|assistant|chatbot|bot|model|language model|mode|version)\\b`),
  /\b(?:ai|assistant|chatbot|bot|model|yourself)(?: \w+){0,2}? (?:with|that has|who has) no (?:rules|restrictions|limits|filters|guidelines)\b/,
  /\b(?:answer|respond|reply|talk)(?: \w+)? without (?:any )?(?:rules|restrictions|limits|filters|guidelines)\b/,
  new RegExp(
    `\\bstop (?:being|playing|acting as) (?:the |a |an )?(?:buyer|persona|character|prospect)${ENDS}`,
  ),
  /\b(?:break|drop|leave|abandon|forget) (?:the |your )?(?:character|persona)(?=$| (?:and|then|now|for a|please|completely)\b)/,
  new RegExp(`\\b(?:drop|leave|abandon|forget) your role${ENDS}`),
  // "The role" alone is ordinary talk about jobs, so it needs to be an order to the model.
  /^(?:(?:please|ok|okay|now|just) )*drop the role(?=$| (?:and|then|now|please)\b)|\bdrop the role (?:and|then) (?:act|talk|answer|respond|speak|be)\b|\bdrop the role (?:of )?(?:an? )?(?:ai|assistant|chatbot|bot)\b/,
  /\bdan mode\b|\bdo anything now\b/,
  /\b(?:you are|you re) (?:now )?in developer mode\b|\bdeveloper mode (?:is )?(?:enabled|activated|on)(?: now)? (?:answer|respond|reply|ignore|you|tell|from now)\b/,
  /\b(?:enable|enter|activate|switch to|turn on|go into) developer mode (?:and|then) (?:ignore|answer|disable|bypass|forget|reveal|respond|reply|tell|show|print|drop|break|stop)\b/,
  /\bjail ?break (?:yourself|this (?:ai|model|chatbot|bot)|mode|prompt)\b/,
];

/**
 * Attack-shaped lines the stricter check does not confirm on its own: a role or mode change
 * without asking to be free of the rules, or a request for instructions that may be the buyer's.
 */
const SUSPECT_ATTACK: readonly RegExp[] = [
  new RegExp(
    `\\b${DROP_VERBS}\\b (?:\\w+ ){0,3}?(?:previous|prior|above|earlier|preceding|original|system|your|all|these|those|any) (?:\\w+ )?(?:instructions|prompts?|programming|directions)\\b${NOT_THEIRS}`,
  ),
  new RegExp(
    `\\b${DROP_VERBS}\\b (?:\\w+ ){0,3}?(?:previous|prior|above|your|system) (?:rules|guidelines)\\b(?! of thumb)${NOT_THEIRS}`,
  ),
  new RegExp(
    `\\b(?:ignore|disregard|forget)\\b (?:\\w+ ){0,2}?(?:instructions|prompts?|directions) (?:above|before|given)\\b`,
  ),
  new RegExp(
    `\\b(?:ignore|disregard|forget) (?:(?:the|all|everything|anything) )*(?:above|preceding)${ENDS}`,
  ),
  new RegExp(
    `\\b(?:ignore|disregard|forget) (?:everything|all|anything) (?:before|previously|you were told|you ve been told|you have been told|you know)(?: (?:before|so far|until now|already))?${ENDS}`,
  ),
  /\b(?:ignore|disregard|override|bypass) all (?:the |of the )?(?:rules|guidelines)\b(?! of thumb)/,
  new RegExp(
    `\\b${OFF_VERBS} your (?:(?:safety|content|moderation) )?(?:guardrails?|filters?|restrictions|content policy|safeguards|rules)\\b`,
  ),
  new RegExp(
    `\\b${REVEAL_VERBS}\\b (?:\\w+ ){0,5}?(?:system|initial|hidden|secret) ${PROMPT_WORDS}\\b(?! (?:for|on|about|regarding|to|from|of|in)\\b)`,
  ),
  /\byour (?:system|developer) (?:prompts?|message)\b(?! (?:users?|callers?|customers?|people|drivers?|patients?|staff|agents?|them|you|reps?)\b)/,
  /\byour system (?:instructions|programming)\b(?! (?:for|on|about|regarding|to|from|in)\b)/,
  /\byour (?:initial|hidden|secret|original) (?:prompts?|instructions|programming)\b(?! (?:for|on|about|regarding|to|from|in|of)\b)/,
  new RegExp(`\\byou (?:are|re) now (?:a |an )?${MODEL_NOUN}`),
  new RegExp(
    `\\b(?:pretend|imagine|roleplay) (?:to be |as |like |that you are |you are |you re )(?:if )?(?:a |an |the )?(?:${MODEL_NOUN}|dan\\b|${FREE}\\b)`,
  ),
  new RegExp(
    `\\b(?:act|behave) (?:as|like) (?:a |an |the )?(?:(?:hacker|gpt)(?=$| (?:and|with|who|that|now|instead)\\b)|dan\\b|${FREE}\\b)`,
  ),
  /\bstop (?:being|playing|acting as) (?:the |a |an )?(?:buyer|persona|character|role|customer|prospect)\b(?! (?:who|that|which|of|for)\b)/,
  /\b(?:enable|enter|activate|switch to|turn on|go into) developer mode(?=$| (?:and|then|now|please)\b)/,
  /\bdeveloper mode (?:is )?(?:enabled|activated)(?=$| (?:now|you|answer|respond|reply|ignore|from)\b)/,
];

/** Whoever, or whatever, grades the call. "Evaluator" and "coach" are ordinary words on a call. */
const GRADER =
  "(?:(?:ai |automated )?(?:grader|scorer)s?|ai (?:evaluator|judge|coach)s?|(?:grading|scoring) (?:ai|model|bot|engine)s?|whoever (?:is |s )?(?:grading|scoring|marking))";
const SCORE_VERBS = "(?:score|grade|rate|mark|give|award|assign)";
/** What this call is, as something to be scored: "me", "this call", "every dimension". */
const SCORED =
  "(?:me|this|this (?:call|conversation|transcript|session|attempt|pitch)|the student|my (?:call|pitch|performance|answers?|turns?|responses?)|(?:every|all|each) (?:of the |the )?(?:dimensions?|categories|criteria|rubric \\w+)|everything)";
/** A top mark: "5", "5/5", "100", "full marks", "all fives". */
const TOP_MARK =
  "(?:5|five|10|ten|100|perfect(?: scores?| marks)?|full marks|top marks|max(?:imum)?(?: score)?|(?:the )?highest(?: score| rating| marks?)?|all (?:5|fives|ss)|fives|ss)";

/**
 * Notes to the grader or orders about the score, written into a turn so the scorer reads them.
 * They are suspect: the turn is redirected, so it is never scored.
 */
const GRADER_ATTACK: readonly RegExp[] = [
  new RegExp(
    `\\b(?:note|message|memo|reminder|hint|ps|p s|psst) (?:to|for) (?:the |any |my )?${GRADER}\\b`,
  ),
  new RegExp(`\\b(?:dear|hey|hi|hello|attention|attn|to) (?:the )?${GRADER}\\b`),
  new RegExp(`\\b(?:score|grade|rate|mark)s? ${SCORED} (?:as |at |with |an? )?${TOP_MARK}\\b`),
  new RegExp(
    `\\b(?:give|award|assign|grant) ${SCORED} (?:an? |the )?(?:5 5|5 out of 5|10 10|10 out of 10|100 100|100 out of 100|100 points|full marks|top marks|perfect (?:score|marks)s?|(?:highest|maximum|max|top) (?:score|rating|marks?|grade)s?|all (?:5|fives|ss)|straight (?:5|fives|ss)|fives|5 (?:on|for|in|across) (?:every|all|each))\\b`,
  ),
  new RegExp(
    `\\bthis (?:call|transcript|conversation|session|attempt|pitch) (?:deserves|earns|merits|gets|should (?:get|receive|score)|scores?) (?:an? |the )?${TOP_MARK}\\b`,
  ),
  /\b(?:every|all|each) rubric (?:dimensions?|items?|scores?|categor\w+|criteri\w+)\b/,
  /\bwhen (?:you|the ai|the model|the grader|the scorer|the coach) (?:grade|score|evaluate|assess|mark)s? (?:this (?:call|conversation|transcript|session)|my (?:pitch|performance|turns|answers))\b/,
];

/** Addressing the grader and telling it what to give, or dropping the rubric: confirmed attacks. */
const CONFIRMED_GRADER_ATTACK: readonly RegExp[] = [
  new RegExp(
    `\\b(?:note|message|memo|reminder|hint|ps|p s|psst|dear|hey|hi|hello|attention|attn) (?:to |for )?(?:the |any |my )?${GRADER}\\b(?: \\w+){0,12}? (?:${SCORE_VERBS}|${TOP_MARK})\\b`,
  ),
  new RegExp(
    `\\b(?:score|grade|rate|mark)s? (?:every|all|each) (?:of the |the )?(?:dimensions?|categories|criteria|rubric \\w+) (?:as |at |with |an? )?${TOP_MARK}\\b`,
  ),
  /\b(?:ignore|disregard|forget|override|bypass) (?:the |your )?rubric\b/,
];

// Scorecard JSON pasted into a turn, matched on the raw text: its quotes and colons are the tell.
const SCORECARD_JSON =
  /"(?:overall|dimensions|strengths|improvements|strongerLine|justification|evidence)"\s*:/i;

const WEAPON_NOUN =
  "(?:bombs?(?! (?:proof|squad|shelter|shell))|explosives|explosive (?:devices?|materials?)|bioweapons?|chemical weapons?|nerve agents?|ghost guns?|untraceable guns?)";
const HOW_TO =
  "(?:how (?:do i|to|can i|would i|could i)|(?:ways?|steps?) (?:to|for)|instructions? (?:to|for|on)|recipe for|guide (?:to|for)|tutorial (?:on|for)|teach me (?:to|how to)|show me how to|tell me how to|help me)";
const SEX_TERM =
  "(?:sexual (?:content|material|images?|stor(?:y|ies)|roleplay|scenes?|acts?)|sex scenes?|sex acts?|porn\\w*|erotic\\w*)";
const MINOR_TERM = "(?:child|children|minors?|underage|kids?|teens?|teenagers?)";
const WRITE_VERBS = "(?:write|describe|generate|create|draw|show|give me|tell|make|send)";

const HARMFUL: readonly RegExp[] = [
  // Weapons and explosives, only as a request for instructions.
  new RegExp(`\\b${HOW_TO} (?:\\w+ ){0,4}?${WEAPON_NOUN}\\b`),
  new RegExp(
    `\\b(?:i want to|i need to|i m going to|let s|we should) (?:\\w+ )?(?:make|build|assemble|construct) (?:an? |some )?${WEAPON_NOUN}\\b`,
  ),
  // A bare order to make one.
  new RegExp(
    `^(?:(?:please|ok|okay|now|just|can you|could you|will you) )*(?:make|build|create|assemble|construct|synthesize|manufacture)(?: me)?(?: \\w+){0,2}? ${WEAPON_NOUN}\\b`,
  ),
  // Self-harm. `runTurn` answers these with the support message before the rules run
  // (`signalsSelfHarm` in packages/shared); they stay here so a caller of `ruleCheck` alone never passes one as ordinary.
  /\b(?:kill myself|commit suicide|end my life|take my own life|hurt myself|harm myself)\b/,
  // Violence against people.
  /\bhow (?:do i|to|can i|would i) (?:\w+ ){0,2}?(?:kill|murder|poison|strangle) (?:a |an |the )?(?:person|someone|somebody|people|him|her|them|my (?:wife|husband|boss|neighbou?r|teacher|mother|father|friend))\b/,
  // Hard drugs.
  /\bhow (?:do i|to|can i) (?:\w+ ){0,2}?(?:make|cook|synthesize|manufacture|produce) (?:\w+ ){0,2}?(?:meth|methamphetamine|cocaine|heroin|fentanyl)\b/,
  // Sexual content involving minors: a request, a sexual term, and a minor.
  new RegExp(`\\b${WRITE_VERBS}\\b (?:\\w+ ){0,4}?${SEX_TERM} (?:\\w+ ){0,5}?${MINOR_TERM}\\b`),
  new RegExp(`\\b${WRITE_VERBS}\\b (?:\\w+ ){0,6}?${MINOR_TERM} (?:\\w+ ){0,5}?${SEX_TERM}`),
  /\bchild porn\w*|\bcsam\b/,
  // Hate.
  /\b(?:kill|exterminate|gas|lynch|wipe out) (?:(?:all|the|every) )*(?:jews|muslims|christians|blacks|whites|gays|immigrants|asians|mexicans|arabs|women)\b/,
  /\bheil hitler\b|\bwhite power\b/,
];

const anyMatch = (patterns: readonly RegExp[], text: string) =>
  patterns.some((pattern) => pattern.test(text));

/**
 * Cheap pre-check before the model guard. `null` means undecided, so the caller asks the model.
 * A verdict marks the line as suspect: it is redirected, but only counts toward ending the
 * session once a second check confirms it (`confirmsAttack`, or the model guard).
 * Harm is checked first because it is the more serious verdict.
 */
export function ruleCheck(text: string): RuleVerdict | null {
  const words = normalizeWords(text);
  if (anyMatch(HARMFUL, words)) return "harmful";
  const flagged =
    CHAT_TEMPLATE.test(text) ||
    SCORECARD_JSON.test(text) ||
    INSTRUCTIONS_HEADER.test(text) ||
    isDan(text) ||
    anyMatch(CONFIRMED_ATTACK, words) ||
    anyMatch(SUSPECT_ATTACK, words) ||
    anyMatch(CONFIRMED_GRADER_ATTACK, words) ||
    anyMatch(GRADER_ATTACK, words);
  return flagged ? "prompt_attack" : null;
}

/**
 * The stricter second check for a suspect line when no model guard runs (the scripted partner):
 * true only for an unmistakable attack, which then counts toward ending the session. Every line
 * it confirms is one `ruleCheck` flags too.
 */
export function confirmsAttack(text: string): boolean {
  const words = normalizeWords(text);
  return (
    anyMatch(HARMFUL, words) ||
    CHAT_TEMPLATE.test(text) ||
    SCORECARD_JSON.test(text) ||
    (INSTRUCTIONS_HEADER.test(text) && HEADER_TAKEOVER.test(words)) ||
    isDan(text) ||
    anyMatch(CONFIRMED_ATTACK, words) ||
    anyMatch(CONFIRMED_GRADER_ATTACK, words)
  );
}
