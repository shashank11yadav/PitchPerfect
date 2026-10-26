import { stripInvisible } from "./text.js";

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
const NON_WORD_OR_STOP = /[^a-z0-9\s.]+/g;
const CLAUSE_END = /[?!;:,]+|\.+/g;

/**
 * Lowercase, accent-free, de-obfuscated words separated by single spaces. With `stops`, every run
 * of sentence punctuation is kept as a "." word, so a pattern can see where a clause ends.
 */
export function normalizeWords(text: string, stops = false): string {
  const plain = stripInvisible(text)
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(LEET_NEXT_TO_LETTER, (char) => LEET[char] ?? char);
  const words = stops
    ? plain.replace(CLAUSE_END, " . ").replace(NON_WORD_OR_STOP, " ")
    : plain.replace(NON_WORD, " ");
  return words.replace(/\s+/g, " ").trim();
}

const MYSELF = "(?:myself|my self)";

/**
 * A student saying, in the first person, that they might end their life or hurt themselves.
 * Sales hyperbole ("this deal is killing me", "I'd die for that discount", "career suicide") and
 * accidents ("I cut myself shaving") are not; when a line is unclear, intent words decide.
 */
const SELF_HARM: readonly RegExp[] = [
  new RegExp(
    `\\b(?:kill|killing|unalive|hang|hanging|drown|drowning|shoot|shooting|poison|poisoning) ${MYSELF}\\b`,
  ),
  /\b(?:end|ending|take|taking) my (?:own )?life\b/,
  /\bsuicidal\b/,
  /\b(?:commit|committing|attempt|attempting|attempted|thinking about|thinking of|thought about|thoughts of|considering|contemplating|planning) suicide\b/,
  /\b(?:i|i m|im|i am) (?:just |really |honestly )?(?:want|wanna|wish|ready) (?:to )?die\b(?! (?:laughing|of|for|on|in|at|with|happy|rich|old|a little))/,
  /\bi wish i (?:was|were) dead\b/,
  /\b(?:better off (?:dead|without me)|no reason to (?:live|go on)|nothing (?:left )?to live for|not worth living|end it all|can t go on (?:living|anymore)|cannot go on (?:living|anymore))\b/,
  /\b(?:don t|dont|do not) want to (?:live|be alive|wake up|exist)(?: anymore)?\b(?! without)/,
  new RegExp(
    `\\b(?:want|wanna|going|gonna|thinking about|thought about|tried|trying|try|urge|urges) (?:to )?(?:hurt|harm|cut|burn|starve) ${MYSELF}\\b`,
  ),
  new RegExp(
    `\\b(?:been|keep|started|start) (?:hurting|harming|cutting|burning|starving) ${MYSELF}\\b`,
  ),
  new RegExp(`\\b(?:hurting|harming|cutting) ${MYSELF} on purpose\\b`),
  /\bi (?:\w+ ){0,3}?self (?:harm|harming|harmed)\b/,
  /\btake all (?:of )?(?:my|the) (?:pills|meds|medication)\b|\boverdos(?:e|ing) on purpose\b/,
];

/**
 * True when a student turn signals suicide or self-harm. Such a turn gets the support message,
 * out of character, instead of a reply or a redirect, and never counts as a strike.
 */
export function signalsSelfHarm(text: string): boolean {
  const words = normalizeWords(text);
  return SELF_HARM.some((pattern) => pattern.test(words));
}

/**
 * Sent instead of any reply when a student turn signals suicide or self-harm. It is PitchPerfect
 * speaking, not the persona, so it goes out as its own `support` event and never through the
 * partner's reply filter, which would block the helpline's web address.
 */
export const SUPPORT_LINE =
  "This is PitchPerfect, stepping out of the practice call. If you're thinking about suicide or hurting yourself, please talk to someone now. In the US, call or text 988 to reach the 988 Suicide & Crisis Lifeline, free and open 24 hours a day. Outside the US, findahelpline.com lists free helplines by country. If you're in danger right now, call your local emergency number. This didn't use one of your turns, and you can go back to the call whenever you're ready.";
