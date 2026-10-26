import { normalizeWords } from "./guard-rules.js";

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
