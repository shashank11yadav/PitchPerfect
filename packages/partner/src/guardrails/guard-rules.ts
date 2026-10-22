export type RuleVerdict = "prompt_attack" | "harmful";

const ZERO_WIDTH = new RegExp("[\\u200b-\\u200f\\u2060\\ufeff\\u00ad]", "g");
const COMBINING_MARKS = /\p{M}/gu;
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "@": "a",
  $: "s",
};
// A leet symbol next to a letter stands in for that letter; plain numbers are left alone.
const LEET_NEXT_TO_LETTER = /(?<=[a-z])[01345@$]|[01345@$](?=[a-z])/g;
const NON_WORD = /[^a-z0-9\s]+/g;

/** Lowercase, accent-free, de-obfuscated words separated by single spaces. */
function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(ZERO_WIDTH, "")
    .toLowerCase()
    .replace(LEET_NEXT_TO_LETTER, (char) => LEET[char] ?? char)
    .replace(NON_WORD, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// These are matched on the raw text: they rely on punctuation or capitals that normalize() drops.
const RAW_ATTACKS: readonly RegExp[] = [
  /<\|?\/?(?:im_start|im_end|system|endoftext)\|?>|\[\/?inst\]|<<\/?sys>>/i,
  /^\s*(?:new|updated|revised)\s+(?:system\s+)?instructions\s*:/i,
];

// The lead-in is case-insensitive but the name must be upper case: "Dan" is a common first name.
const DAN_LEAD_IN = /\b(?:you are|you're|you’re|be|as|act as|become)\s+(?:now\s+)?(dan)\b/gi;
const isDan = (text: string) =>
  Array.from(text.matchAll(DAN_LEAD_IN)).some((match) => match[1] === "DAN");

const PROMPT_WORDS = "(?:prompts?|instructions|message|programming)";
const REVEAL_VERBS =
  "(?:reveal|show|print|repeat|display|output|leak|recite|dump|share|tell|give|send|paste|copy|write|say|read)";
const DROP_VERBS = "(?:ignore|disregard|forget|override|bypass)";

const PROMPT_ATTACK: readonly RegExp[] = [
  // Dropping the rules.
  new RegExp(
    `\\b${DROP_VERBS}\\b (?:\\w+ ){0,3}?(?:previous|prior|above|earlier|preceding|original|system|your|all|these|those|any|my) (?:\\w+ )?(?:instructions|prompts?|programming|directions)\\b`,
  ),
  new RegExp(
    `\\b${DROP_VERBS}\\b (?:\\w+ ){0,3}?(?:previous|prior|above|your|system) (?:rules|guidelines)\\b(?! of thumb)`,
  ),
  new RegExp(
    `\\b(?:ignore|disregard|forget)\\b (?:\\w+ ){0,2}?(?:instructions|prompts?|directions) (?:above|before|given)\\b`,
  ),
  /\b(?:ignore|disregard|forget) (?:(?:the|all|everything|anything) )*(?:above|preceding)\b/,
  /\b(?:ignore|disregard|forget) (?:everything|all|anything) (?:before|previously|you were told|you know)\b/,
  /\b(?:ignore|disregard|override|bypass) all (?:the |of the )?(?:rules|guidelines)\b(?! of thumb)/,
  /\b(?:disable|turn off|bypass|override|circumvent|remove) your (?:\w+ )?(?:safety|guardrails?|filters?|restrictions|content policy|safeguards|rules)\b/,
  // Extracting the prompt.
  new RegExp(
    `\\b${REVEAL_VERBS}\\b (?:\\w+ ){0,5}?(?:system|initial|hidden|secret|developer) ${PROMPT_WORDS}\\b`,
  ),
  new RegExp(
    `\\b(?:reveal|print|repeat|output|display|leak|recite|dump|show me|tell me|give me) your (?:${PROMPT_WORDS})\\b(?! (?:for|on|about|regarding|to)\\b)`,
  ),
  // Rules and guidelines are only an extraction request after a strong verb, not "tell me your rules".
  /\b(?:reveal|print|repeat|output|display|leak|recite|dump) your (?:rules|guidelines)\b(?! (?:for|on|about|regarding|to)\b)/,
  new RegExp(`\\byour (?:system|developer) (?:${PROMPT_WORDS})\\b`),
  /\byour (?:initial|hidden|secret|original) (?:prompts?|instructions|programming)\b/,
  /\brepeat (?:everything|all|the words|the text) (?:above|before)\b/,
  /\brepeat (?:the |your |all )?(?:instructions|prompt|text|words) above\b/,
  /\brepeat (?:the )?above (?:instructions|prompt|text|words|verbatim|word for word)\b/,
  /\bcanary (?:token|string|word|value|code)\b/,
  // Swapping the role.
  /\byou (?:are|re) now (?:a |an )?(?:dan|no longer|unrestricted|unfiltered|uncensored|jailbroken|evil|ai|assistant|chatbot|bot|hacker|language model)\b/,
  /\b(?:pretend|imagine|roleplay) (?:to be |as |like |that you are |you are |you re )(?:if )?(?:a |an |the )?(?:ai|assistant|chatbot|bot|hacker|dan|unrestricted|unfiltered|uncensored|evil|language model|gpt|jailbroken)\b/,
  /\b(?:act|behave) (?:as|like) (?:a |an |the )?(?:hacker|dan|unrestricted|unfiltered|uncensored|evil|jailbroken|gpt)\b/,
  /\bstop (?:being|playing|acting as) (?:the |a |an )?(?:buyer|persona|character|role|customer|prospect)\b/,
  /\b(?:break|drop|leave|abandon|forget) (?:the |your )?(?:character|persona)\b/,
  /\b(?:drop|leave|abandon|forget) your role\b/,
  // "The role" alone is ordinary talk about jobs, so it needs to be an order to the model.
  /^(?:(?:please|ok|okay|now|just) )*drop the role\b|\bdrop the role (?:and|then) (?:act|talk|answer|respond|speak|be)\b|\bdrop the role (?:of )?(?:an? )?(?:ai|assistant|chatbot|bot)\b/,
  /\bdan mode\b|\bdo anything now\b/,
  /\b(?:enable|enter|activate|switch to|turn on|go into) developer mode\b|\b(?:you are|you re) (?:now )?in developer mode\b|\bdeveloper mode (?:enabled|activated)\b/,
  /\bjail ?break (?:yourself|this (?:ai|model|chatbot|bot)|mode|prompt)\b/,
];

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
  // Self-harm.
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
 * Harm is checked first because it is the more serious verdict.
 */
export function ruleCheck(text: string): RuleVerdict | null {
  const words = normalize(text);
  if (anyMatch(HARMFUL, words)) return "harmful";
  if (anyMatch(RAW_ATTACKS, text) || isDan(text) || anyMatch(PROMPT_ATTACK, words))
    return "prompt_attack";
  return null;
}
