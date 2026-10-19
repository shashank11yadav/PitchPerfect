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

// Chat-template control tokens are matched on the raw text, before punctuation is dropped.
const CONTROL_TOKENS = /<\|?\/?(?:im_start|im_end|system|endoftext)\|?>|\[\/?inst\]|<<\/?sys>>/i;

const INSTRUCTION_WORDS = "(?:instructions|rules|prompts?|guidelines|programming|directions)";
const REVEAL_VERBS =
  "(?:reveal|show|print|repeat|display|output|leak|recite|dump|share|tell|give|send|paste|copy|write|say|read)";

const PROMPT_ATTACK: readonly RegExp[] = [
  // Dropping the rules.
  new RegExp(
    `\\b(?:ignore|disregard|forget|override|bypass)\\b (?:\\w+ ){0,3}?(?:previous|prior|above|earlier|preceding|original|system|your|all) (?:\\w+ )?${INSTRUCTION_WORDS}\\b`,
  ),
  /\b(?:ignore|disregard|forget) (?:everything|all) (?:above|before|previously|you were told|you know)\b/,
  /\b(?:disable|turn off|bypass|override|circumvent|remove) your (?:\w+ )?(?:safety|guardrails?|filters?|restrictions|content policy|safeguards|rules)\b/,
  // Extracting the prompt.
  new RegExp(
    `\\b${REVEAL_VERBS}\\b (?:\\w+ ){0,5}?(?:system|initial|hidden|original|secret|developer|internal) ${INSTRUCTION_WORDS}\\b`,
  ),
  new RegExp(
    `\\b(?:reveal|print|repeat|output|display|leak|recite|dump|show me|tell me|give me) your ${INSTRUCTION_WORDS}\\b`,
  ),
  new RegExp(
    `\\byour (?:system|initial|hidden|secret|original|developer) (?:${INSTRUCTION_WORDS}|message)\\b`,
  ),
  /\brepeat (?:everything|all|the words|the text) (?:above|before)\b/,
  /\bcanary (?:token|string|word|value|code)\b/,
  // Swapping the role.
  /\byou are now (?:a |an )?(?:dan|no longer|unrestricted|unfiltered|uncensored|jailbroken|evil|ai|assistant|chatbot|bot|hacker|language model)\b/,
  /\b(?:pretend|imagine|roleplay) (?:to be |as |like |that you are |you are |you re )(?:if )?(?:a |an |the )?(?:ai|assistant|chatbot|bot|hacker|dan|unrestricted|unfiltered|uncensored|evil|language model|gpt|admin|jailbroken)\b/,
  /\b(?:act|behave) (?:as|like) (?:a |an |the )?(?:hacker|dan|unrestricted|unfiltered|uncensored|evil|jailbroken|gpt|admin)\b/,
  /\bstop (?:being|playing|acting as) (?:the |a |an )?(?:buyer|persona|character|role|customer|prospect)\b/,
  /\b(?:break|drop) (?:the |your )?(?:character|persona|role)\b/,
  /\b(?:you are|you re|be|as|become|called|named) dan\b|\bdan mode\b|\bdo anything now\b/,
  /\bdeveloper mode\b/,
  /\bjail ?break(?:s|ed|ing)?\b/,
];

const HARMFUL: readonly RegExp[] = [
  // Weapons and explosives.
  /\b(?:make|build|create|assemble|construct|synthesize|manufacture) (?:\w+ ){0,3}?(?:bombs?|explosives?|bioweapons?|chemical weapons?|nerve agents?|ghost guns?)\b/,
  // Self-harm.
  /\b(?:kill myself|commit suicide|end my life|take my own life|hurt myself|harm myself)\b/,
  // Violence against people.
  /\bhow (?:do i|to|can i|would i) (?:\w+ ){0,2}?(?:kill|murder|poison|strangle) (?:a |an |the )?(?:person|someone|somebody|people|him|her|them|my (?:wife|husband|boss|neighbou?r|teacher|mother|father|friend))\b/,
  // Hard drugs.
  /\bhow (?:do i|to|can i) (?:\w+ ){0,2}?(?:make|cook|synthesize|manufacture|produce) (?:\w+ ){0,2}?(?:meth|methamphetamine|cocaine|heroin|fentanyl)\b/,
  // Sexual content involving minors.
  /\bsexual (?:content|material|images?|stor(?:y|ies)|roleplay|acts?) (?:\w+ ){0,4}?(?:child|children|minors?|underage|kids?|teens?|teenagers?)\b/,
  /\b(?:child|children|minors?|underage|kids?|teens?) (?:\w+ ){0,3}?(?:porn\w*|nude|naked|erotic)\b/,
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
  if (CONTROL_TOKENS.test(text) || anyMatch(PROMPT_ATTACK, words)) return "prompt_attack";
  return null;
}
