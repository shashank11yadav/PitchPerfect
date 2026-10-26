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
/** What someone can be ready to overdose on. */
const PILLS = "(?:pills|tablets|meds|medication|sleeping pills|painkillers)";
/** "Done living out of a suitcase", "tired of living with spreadsheets": a way of working. */
const NOT_A_WAY_OF_LIVING = "(?! (?:out|in|with|without|like|on|off|at|from|under|through)\\b)";
/** "Life" as a product: "life insurance", "life cover". */
const NOT_A_PRODUCT =
  "(?! (?:insurance|cover|coverage|policy|policies|admin|sciences?|cycle|span)\\b)";
/** Counts and verbs that make "kms" a distance: "400 kms", "how many kms", "kms per driver". */
const NOT_A_DISTANCE_BEFORE =
  "(?<!\\b(?:\\d+|few|many|more|less|fewer|extra|of|the|in|per|our|your|their|total|those|these|some|several|thousand|hundred|million|hundreds|thousands|cut|add|added|log|logged|drive|drove|driven|cover|covered) )";
const NOT_A_DISTANCE_AFTER =
  "(?! (?:of|from|to|away|per|a|an|each|every|long|north|south|east|west|in|on|by|driven|travelled|traveled|logged|covered|left|ahead|daily|weekly|monthly)\\b)";
/** "You should kys" is aimed at someone else. */
const NOT_SOMEONE_ELSE = "(?<!\\b(?:you|u|ya|they|he|she|we) )";
const HI_WANT = "(?:chahta|chahti|chahata|chahte|chaahta|chaahti)";
const HI_NOT = "(?:nahi|nahin|nai|nhi)";

/**
 * A student saying, in the first person, that they might end their life or hurt themselves.
 * Sales hyperbole ("this deal is killing me", "I'd die for that discount", "career suicide",
 * "shoot myself an email") and accidents ("I cut myself shaving") are not; when a line is
 * unclear, intent words decide.
 */
const SELF_HARM: readonly RegExp[] = [
  new RegExp(`\\b(?:kill|killing|unalive|hang|hanging|poison|poisoning) ${MYSELF}\\b`),
  new RegExp(
    `\\b(?:shoot|shooting) ${MYSELF}\\b(?! (?:an?|the|some|my|over|quick|in the foot)\\b)`,
  ),
  new RegExp(
    `\\b(?:drown|drowning) ${MYSELF}\\b(?! in (?:work|paperwork|emails?|meetings|coffee|data|spreadsheets|reports|admin|calls|details|tickets)\\b)`,
  ),
  /\b(?:end|ending|take|taking) my (?:own )?life\b/,
  /\bsuicidal\b|\bsuicide (?:note|letter)\b|\bsewer ?slide\b/,
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
  // A method, or being ready with one. Pills "ready for pickup" or "ready to ship" are stock.
  new RegExp(
    `\\b${PILLS} (?:are |all )?(?:ready|lined up|counted out|saved up)\\b(?! (?:for|to)\\b)`,
  ),
  new RegExp(
    `\\b(?:saving|saved|stockpiling|stockpiled|hoarding|hoarded) (?:up )?(?:all )?(?:of )?(?:my |the )?${PILLS}\\b`,
  ),
  new RegExp(
    `\\b(?:swallow|swallowed|swallowing|take|took|taking) (?:a bottle|a whole bottle|the whole bottle|a handful|too many|all)(?: of)?(?: (?:my|the|these|those))? ${PILLS}\\b`,
  ),
  /\b(?:rope|noose) (?:is |s )?(?:ready|around my neck)\b(?! (?:for|to)\b)|\b(?:tie|tied|tying|made|make|making|bought|got) (?:a |the |my )?noose\b/,
  /\b(?:i ll|i will|i m going to|im going to|i m gonna|im gonna|going to|gonna|want to|wanna|thinking about|thought about|thinking of|planning to|plan to|ready to|about to|tempted to|might|should just) (?:jump|jumping) (?:off|from|in front of) (?:a |the |this |that )?(?:bridge|roof|rooftop|building|cliff|balcony|overpass|ledge|train|bus|truck)\b/,
  /\bthrow(?:ing)? myself (?:off|from|in front of|under) (?:a |the )?(?:bridge|roof|building|cliff|train|bus|truck|car)\b/,
  new RegExp(
    `\\b(?:done|finished) with (?:life|living|being alive|my life|this life)\\b${NOT_A_PRODUCT}`,
  ),
  new RegExp(
    `\\b(?:i m|im|i am) (?:just |so |honestly |really )?done living\\b${NOT_A_WAY_OF_LIVING}`,
  ),
  new RegExp(
    `\\b(?:tired|sick|weary) of (?:living|being alive|life)\\b${NOT_A_WAY_OF_LIVING}${NOT_A_PRODUCT}`,
  ),
  /\b(?:given|give|giving) up on life\b/,
  // Abbreviations: "kms" ("kill myself") unless it is a distance, and "kys" aimed at oneself.
  new RegExp(`${NOT_A_DISTANCE_BEFORE}\\bkms\\b${NOT_A_DISTANCE_AFTER}`),
  new RegExp(
    `${NOT_SOMEONE_ELSE}\\b(?:i ll|i will|i m gonna|im gonna|i m going to|imma|ima|gonna|going to|about to|might|should|want to|wanna|could|will|ready to) (?:just |literally |honestly |actually )?kys\\b`,
  ),
  // Hopelessness, and being a burden.
  new RegExp(
    `\\bno (?:point|reason|use) (?:in |of )?(?:living|being alive|staying alive)\\b${NOT_A_WAY_OF_LIVING}|\\bno point (?:in )?going on(?=$| anymore| like this)`,
  ),
  new RegExp(
    `\\bwhat s the point (?:of|in) (?:living|being alive|life|going on)\\b${NOT_A_WAY_OF_LIVING}${NOT_A_PRODUCT}`,
  ),
  /\b(?:nobody|no one|noone) (?:would|will|d|is going to|gonna) (?:even )?(?:care|notice|miss me)(?: at all)? if i (?:died|disappeared|was dead|were dead|was gone|were gone|killed myself|ended it|wasn t (?:here|around|alive)|weren t (?:here|around|alive))\b(?! (?:for|from|to|on|at|during|over|until)\b)/,
  /\bi m (?:just |only )?(?:a|such a) burden (?:to|on|for) (?:everyone|everybody|my family|my \w+|them|people|all of you)\b/,
  /\bi (?:don t|do not) deserve to live\b/,
  /\bi (?:wish|want) (?:i d|i had|i was|i were|that i had|that i was) never (?:been )?born\b/,
  // Spanish. "Me muero por ver la demo" and "este precio me va a matar" are hyperbole.
  /\b(?:quiero|quisiera|deseo|ganas de|pienso en|pensando en|he pensado en) (?:morir(?:me)?|matarme|suicidarme|quitarme la vida|acabar con mi vida)\b(?! (?:de|por)\b)/,
  /\b(?:me quiero|me voy a|voy a) (?:morir|matar|suicidar|matarme|suicidarme)\b(?! (?:de|por)\b)/,
  /\b(?:ya )?no quiero (?:seguir )?(?:vivir|viviendo|estar vivo|estar viva)\b(?! (?:sin|con|en|asi)\b)/,
  /\b(?:estarian|estaran|estaria) mejor sin mi\b|\bno vale la pena vivir\b/,
  // Hindi, in Latin script. "Jaan de dunga" ("I'll give my all") is devotion, not this.
  new RegExp(
    `\\b(?:marna|mar jana|mar jaana|marjana) ${HI_WANT}\\b|\\b(?:mujhe|muje|mujhko) (?:marna|mar jana|mar jaana) (?:hai|he)\\b`,
  ),
  new RegExp(
    `\\b(?:jeena|jina|jeene|jine) ${HI_NOT} ${HI_WANT}\\b|\\b(?:mujhe|muje) (?:jeena|jina) ${HI_NOT}\\b|\\b(?:jeene|jine) ka (?:mann|man|mn) ${HI_NOT}\\b`,
  ),
  /\b(?:khudkushi|khudkhushi|khud kushi|aatmahatya|atmahatya|aatmhatya|atmhatya)\b|\bsuicide (?:kar|karna|karunga|karungi|kar lunga|kar lungi|karne)\b/,
  /\b(?:apni|apna) (?:jaan|jan|zindagi) (?:le|lena|le lunga|le lungi|khatam)\b|\b(?:khud ko|khudko) (?:maar|mar|khatam) (?:dunga|dungi|lunga|lungi|doon|dena|karna|kar)\b/,
  /\bzindagi (?:se )?(?:thak gaya|thak gayi|tang aa gaya|tang aa gayi)\b/,
  // French. "Ce prix va me tuer" is hyperbole.
  /\b(?:je veux|j ai envie de|envie de|je vais|je voudrais|je pense a|j ai pense a|pense a) (?:mourir|me tuer|me suicider|mettre fin a mes jours|en finir avec (?:la|ma) vie)\b(?! (?:de|d)\b)/,
  /\bme suicider\b|\bmettre fin a (?:mes jours|ma vie)\b|\ben finir avec (?:la|ma) vie\b|\bje (?:ne )?veux plus vivre\b/,
  /\b(?:ils|tout le monde|ma famille) (?:seraient|serait) mieux sans moi\b/,
  // Portuguese. "Esse preco vai me matar" is hyperbole.
  /\b(?:quero|vou|penso em|pensando em|vontade de) (?:morrer|me matar|me suicidar|suicidar me|tirar (?:a )?minha (?:propria )?vida|acabar com (?:a )?minha vida)\b(?! (?:de|por)\b)/,
  /\bnao (?:quero|aguento) mais viver\b|\b(?:tirar|acabar com) (?:a )?minha (?:propria )?vida\b/,
  /\b(?:estariam|ficariam|seriam) melhor(?:es)? sem mim\b/,
  // German. "Der Preis bringt mich um" and "kommerzieller Selbstmord" are hyperbole.
  /\bich (?:will|mochte|moechte|wurde gern|wurde lieber) (?:einfach |nur )?(?:sterben|tot sein|nicht mehr leben)\b|\bich (?:kann|will|mochte) nicht mehr leben\b/,
  /\bich bring(?:e)? mich (?:selbst )?um\b|\bich (?:will|werde|mochte) mich (?:selbst )?umbringen\b|\bmich (?:selbst )?umzubringen\b/,
  /\b(?:selbstmord|suizid) (?:begehen|machen)\b|\b(?:selbstmordgedanken|suizidgedanken|suizidal)\b|\b(?:denke|denken|gedacht) an (?:selbstmord|suizid)\b/,
  /\bmir das leben (?:zu )?nehmen\b|\bohne mich besser dran\b/,
  // Italian.
  /\b(?:voglio|vorrei) (?:morire|uccidermi|suicidarmi|togliermi la vita|farla finita)\b|\bnon voglio piu vivere\b/,
];

/** Hindi in Devanagari, matched on the raw text, since normalizing drops the script. */
const SELF_HARM_DEVANAGARI: readonly string[] = [
  "आत्महत्या",
  "खुदकुशी",
  "ख़ुदकुशी",
  "मरना चाहता",
  "मरना चाहती",
  "जीना नहीं चाहता",
  "जीना नहीं चाहती",
  "अपनी जान ले",
].map((phrase) => phrase.normalize("NFD"));

/**
 * Lines that may mean self-harm and may not: "I can't do this anymore", "I just want to
 * disappear". A live partner's model guard reads them; the scripted partner checks in instead.
 */
const MAY_SIGNAL: readonly RegExp[] = [
  /\bi (?:can t|cannot|can not) (?:do this|take (?:it|this)|go on|keep going|cope)(?: \w+)? anymore\b/,
  /\bi (?:just )?(?:want|wanna|wish i could) (?:to )?disappear\b(?! (?:for|from|into|to|on|after|until|over)\b)/,
  /\bwhat s the point (?:of (?:anything|it all|trying|me)|anymore)\b/,
  /\bnothing matters (?:anymore|any more)\b/,
  /\bi (?:feel|am|m) (?:so |completely |totally |just )?(?:hopeless|worthless)\b/,
  /\bi (?:feel like|m|am) (?:just |only )?a burden\b/,
  new RegExp(`\\bi (?:might|could|may|will|ll) (?:end up )?(?:hurt|harm|cut) ${MYSELF}\\b`),
  /\bi won t be (?:here|around) (?:much longer|for (?:much )?longer|for long)\b(?! (?:at|in|with|on)\b)/,
  /\bi want (?:it all|everything|this|it) to (?:stop|end)(?=$| (?:forever|for good|now|already)\b)/,
  /\bi hate my life\b/,
  /\b(?:nobody|no one|noone) (?:would|will) (?:even )?(?:miss|notice) me\b/,
];

const anyMatch = (patterns: readonly RegExp[], words: string) =>
  patterns.some((pattern) => pattern.test(words));

/**
 * True when a student turn signals suicide or self-harm, in English, Spanish, Hindi (Latin or
 * Devanagari script), French, Portuguese, German or Italian. Such a turn gets the support
 * message, out of character, instead of a reply or a redirect, never counts as a strike, and is
 * never scored.
 */
export function signalsSelfHarm(text: string): boolean {
  if (anyMatch(SELF_HARM, normalizeWords(text))) return true;
  const raw = stripInvisible(text).normalize("NFD");
  return SELF_HARM_DEVANAGARI.some((phrase) => raw.includes(phrase));
}

/**
 * True when a turn signals self-harm (`signalsSelfHarm`) or may: an unclear line such as "I
 * can't do this anymore". The scripted partner, which has no model guard to read such a line,
 * answers it with `CHECK_IN_LINE`; scoring leaves out every line this is true for.
 */
export function maySignalSelfHarm(text: string): boolean {
  return signalsSelfHarm(text) || anyMatch(MAY_SIGNAL, normalizeWords(text));
}

/**
 * Sent instead of any reply when a student turn signals suicide or self-harm. It is PitchPerfect
 * speaking, not the persona, so it goes out as its own `support` event and never through the
 * partner's reply filter, which would block the helpline's web address.
 */
export const SUPPORT_LINE =
  "This is PitchPerfect, stepping out of the practice call. If you're thinking about suicide or hurting yourself, please talk to someone now. In the US, call or text 988 to reach the 988 Suicide & Crisis Lifeline, free and open 24 hours a day. Outside the US, findahelpline.com lists free helplines by country. If you're in danger right now, call your local emergency number. This didn't use one of your turns, and you can go back to the call whenever you're ready.";

/**
 * Sent by the scripted partner instead of a reply when a turn may signal self-harm but is
 * unclear. Like `SUPPORT_LINE`, it is PitchPerfect speaking, a `support` event that uses no turn
 * and keeps nothing.
 */
export const CHECK_IN_LINE =
  "This is PitchPerfect, stepping out of the practice call for a moment. Some of what you wrote can mean you're thinking about hurting yourself, so we want to check in. If you are, please talk to someone now. In the US, call or text 988 to reach the 988 Suicide & Crisis Lifeline, free and open 24 hours a day. Outside the US, findahelpline.com lists free helplines by country. If you meant something else, that's fine: this didn't use one of your turns, so put it another way and the call goes on.";
