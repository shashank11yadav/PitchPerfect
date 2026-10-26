import { stripInvisible } from "@pitchperfect/shared";
import { normalizeWords, ruleCheck } from "./guard-rules.js";

/**
 * Why the local rules blocked a partner reply. These run on every reply, with every provider and
 * in the browser demo, before any text is shown; a moderator adds to them, never replaces them.
 */
export type ReplyRuleVerdict =
  "link" | "personal_data" | "human_claim" | "self_harm" | "threat" | "drugs" | "slur" | "harmful";

// Links are matched on the raw text: normalizeWords() drops the dots and slashes they are made of.
const COMMON_TLD =
  "com|net|org|io|co|ai|app|dev|info|biz|xyz|me|ly|gl|link|click|site|online|top|ru|cn|tk|us|uk|de|test|example|invalid|local|login|support|help|page|live|shop|store";
const LINKS: readonly RegExp[] = [
  /\b[a-z][a-z0-9+.-]*:\/\/|\bwww\d?\.|\bmailto:/i,
  // A dotted host on a common top-level domain, in any case: "Example.COM/login", "bit.ly".
  new RegExp(`\\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9-]+)*\\.(?:${COMMON_TLD})\\b`, "i"),
  // Any other lower-case dotted host. Upper case is left out so "fine.Thanks" is not a link, and
  // a file name such as "deck.pdf" is not one either.
  /\b[a-z0-9-]{2,}(?:\.[a-z0-9-]{2,})*\.(?!(?:pdf|docx?|xlsx?|pptx?|csv|txt|png|jpe?g|gif|mp4|mov)\b)[a-z]{2,24}(?=[/:?#\s"')\]]|[.,!?;]?(?:\s|$)|$)/,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  /\b[a-z0-9-]+ ?(?:\(dot\)|\[dot\]| dot ) ?(?:com|net|org|io|co|ai|app)\b/i,
];
// A pointer to a link that isn't written out: "click here", "sign in via this page".
const LINK_PROMPTS =
  /\b(?:click|tap) (?:here|this link|the link|on the link|below)\b|\b(?:log|sign) ?in (?:here|via|below|using this|through this|on this (?:page|link|site))\b/;

const YOUR = "(?:your|ur|yr)";
// Never fine to ask for, whatever the verb.
const SENSITIVE = [
  "(?:home|street|mailing|postal|residential|house) address",
  "social security(?: number)?",
  "ssn",
  "social insurance number",
  "national (?:id|insurance)(?: number)?",
  "passport(?: number)?",
  "driver s licen[cs]e(?: number)?",
  "id (?:card|number)",
  "tax id",
  "date of birth",
  "dob",
  "birth ?date",
  "password",
  "passcode",
  "pin(?: code| number)?",
  "one time (?:code|password|passcode|pin)",
  "otp",
  "(?:verification|security|confirmation|login|sign in|two factor|2fa|auth|authentication|access) code",
  "(?:credit|debit|bank) card(?: number| details| info)?",
  "card (?:number|details|info)",
  "cvv",
  "cvc",
  "bank (?:account|details|info|login)(?: number)?",
  "account number",
  "routing number",
  "sort code",
  "iban",
  "login (?:details|credentials|info)",
].join("|");
// "Your password manager", "your bank card fees": the noun names a product or policy, not the data.
const NOT_THE_DATA =
  "(?! (?:manager|policy|policies|reset|resets|rules|requirements|strength|vault|tool|system|software|app|process|security|management|rotation|changes?|field|form|page|screen|features?|integration|provider|issuer|limits?|fees?|rates?|statements?|balance|reviews?|scan|scanning|quality|base|samples)\\b)";
// Ordinary words that are personal data only as the object of a request: "what's your email?"
// A bare "number" is left out: "what's your number?" on a sales call asks for a price.
const CONTACT =
  "(?:address|e ?mail(?: address)?|phone(?: number)?|cell(?: phone)?(?: number)?|mobile(?: number)?|digits|birthday|code|login|username|social|zip(?: code)?|post ?code|postal code)";
const ASK =
  "(?:what s|whats|what is|send(?: me| us)?(?: over)?|give(?: me| us)?|share|tell(?: me| us)|text(?: me| us)|type(?: in)?|enter|drop(?: me| us)|confirm|provide|need|want|get|have|leave|jot down|write down|read(?: me| out)|pass(?: me| along)|can i (?:get|have)|may i (?:get|have)|could i (?:get|have))";
// The noun ends the request: a clause end, or a word that cannot be part of a longer noun, so
// "what's your email cadence" and "your number one priority" are left alone.
const REQUEST_ENDS =
  "(?= \\.| (?:so|please|thanks|then|now|here|again|first|too|real quick|with me|for me|to me|over|i|we|to (?:reach|call|text|contact))\\b)";

// Matched on normalizeWords(text, true), where "." marks the end of a clause.
const PERSONAL_DATA: readonly RegExp[] = [
  new RegExp(
    `\\b${YOUR} (?:(?:full|personal|own|current|exact|private|real|actual|home|online) )?(?:${SENSITIVE})\\b${NOT_THE_DATA}`,
  ),
  new RegExp(
    `\\b${ASK} (?:all )?${YOUR} (?:(?:full|best|personal|direct|cell|mobile|home|work|private|own|current) )?${CONTACT}${REQUEST_ENDS}`,
  ),
  new RegExp(
    `\\b${YOUR} (?:(?:best|direct|cell|mobile|personal|home) )?number (?:to|for) (?:reach|call|text|contact)(?:ing)?\\b`,
  ),
  /\bwhere (?:exactly )?do you live\b|\bwhat (?:street|neighbou?rhood|apartment|building) do you live\b/,
  /\b(?:send|give|tell|share|text|type|enter|read)(?: me| us)?(?: in)? (?:the|that|this) (?:password|passcode|pin|verification code|security code|one time code|otp|code (?:we|i) (?:just )?sent)\b/,
];

const ME = "(?:i m|i am|im)";
const CERTAINLY =
  "(?:(?:a|an|really|actually|definitely|totally|truly|very much|completely|of course|100 percent) )*";
const HUMAN_CLAIM: readonly RegExp[] = [
  new RegExp(
    `\\b${ME} ${CERTAINLY}(?:real|actual|genuine|living|breathing|live) (?:human|person|man|woman|guy|human being|people)\\b`,
  ),
  // "I'm only human" is an idiom and "a human resources manager" is a job, so neither counts.
  new RegExp(
    `\\b${ME} ${CERTAINLY}(?:human|human being|flesh and blood)\\b(?! (?:resources|rights|error|nature|factor|touch|side|capital|interest|connection|element)\\b)`,
  ),
  new RegExp(
    `\\b${ME} (?:(?:really|actually|definitely|totally|certainly|obviously|clearly|honestly) )?not (?:an? |some )?(?:ai|a i|bot|robot|chatbot|chat bot|machine|computer|program|language model|llm|artificial intelligence|algorithm|simulation|script)\\b(?! (?:manager|director|lead|person|people|guy|fan|expert)\\b)`,
  ),
  /\b(?:nope|no) (?:i m )?not (?:an? )?(?:ai|bot|robot|chatbot)\b/,
  /\b(?:you re|you are) (?:talking|speaking|chatting) (?:to|with) (?:a )?(?:real|actual|live) (?:human|person)\b/,
];

const SELF_HARM =
  /\b(?:end(?:ing)? it all|kill(?:ing)? (?:myself|yourself|urself|themselves)|kys|commit(?:ting)? suicide|suicidal|(?:take|taking|end|ending) (?:my|your) (?:own )?life|(?:hurt|harm|cut|cutting|hurting|harming) (?:myself|yourself)|better off dead|(?:want|wanted|wanna) (?:to )?die|not worth living|no reason to live|(?:don t|do not) want to (?:live|be alive|exist) anymore|self harm)\b/;

const THREATS: readonly RegExp[] = [
  // "I'll shoot you an email" is a promise, not a threat.
  /\b(?:i ll|i will|i m going to|i am going to|i m gonna|im gonna|gonna) (?:\w+ ){0,3}?(?:kill|murder|stab|shoot|strangle|choke|hurt|attack|harm|beat up) (?:you|your (?:family|kids|wife|husband))\b(?! (?:an?|the|over|a quick|some|my|our|that|this|it)\b)/,
  /\b(?:i ll|i will) (?:\w+ )?break your (?:legs|neck|face|arm|arms)\b/,
  /\bi know where you live\b|\bwatch your back\b|\byou(?: ll| will) pay for this\b/,
  /\byou(?: ll| will| are going to| re going to) (?:get hurt|die|be dead)\b/,
];

const HARD_DRUG =
  "(?:meth|methamphetamine|crystal meth|crack cocaine|cocaine|heroin|fentanyl|lsd|mdma|ecstasy|ghb|ketamine|pcp|dmt)";
const DRUGS: readonly RegExp[] = [
  new RegExp(
    `\\b(?:cook|make|synthesi[sz]e|manufacture|produce|brew|extract|cut|lace)(?:s|d|ed|ing)? (?:\\w+ ){0,3}?${HARD_DRUG}\\b`,
  ),
  new RegExp(
    `\\b${HARD_DRUG} (?:\\w+ ){0,8}?(?:pseudoephedrine|ephedrine|red phosphorus|lye|anhydrous ammonia|lithium strips|precursors?|reagents?|baking soda)\\b`,
  ),
  new RegExp(`\\bhow (?:to|do i|can i|you) (?:buy|get|score|find|order) (?:some )?${HARD_DRUG}\\b`),
  new RegExp(`\\b(?:snort|inject|smoke|shoot up)(?:s|ing)? (?:\\w+ ){0,2}?${HARD_DRUG}\\b`),
];

// Kept ROT13-encoded so the source does not spell the words out; decoded once at load.
const ENCODED_SLURS =
  "avttre avttn snttbg snt ergneq ergneqrq xvxr fcvp jrgonpx genaal genaavrf tbbx gbjryurnq enturnq ornare qlxr cnxv";
const rot13 = (text: string) =>
  text.replace(/[a-z]/g, (char) => String.fromCharCode(((char.charCodeAt(0) - 84) % 26) + 97));
const SLURS = new RegExp(`\\b(?:${rot13(ENCODED_SLURS).split(" ").join("|")})s?\\b`);

const anyMatch = (patterns: readonly RegExp[], text: string) =>
  patterns.some((pattern) => pattern.test(text));

/**
 * The local output rules for a partner reply: no links, no requests for the student's personal
 * data, no claim to be a real person, and best-effort self-harm, threat, drug and slur patterns,
 * plus the guard's harmful-request rules. `partial` is for text that is still streaming: its end
 * is not taken as the end of a sentence, so "what's your email" can still become "what's your
 * email cadence". `null` means none matched.
 */
export function replyRuleCheck(text: string, { partial = false } = {}): ReplyRuleVerdict | null {
  const words = normalizeWords(text);
  if (anyMatch(LINKS, stripInvisible(text)) || LINK_PROMPTS.test(words)) return "link";
  const clauses = `${normalizeWords(text, true)}${partial ? "" : " ."}`;
  if (anyMatch(PERSONAL_DATA, clauses)) return "personal_data";
  if (anyMatch(HUMAN_CLAIM, words)) return "human_claim";
  if (SELF_HARM.test(words)) return "self_harm";
  if (anyMatch(THREATS, words)) return "threat";
  if (anyMatch(DRUGS, words)) return "drugs";
  if (SLURS.test(words)) return "slur";
  return ruleCheck(text) === "harmful" ? "harmful" : null;
}
