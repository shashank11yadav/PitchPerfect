import { normalizeWords, stripInvisible } from "@pitchperfect/shared";
import { ruleCheck } from "./guard-rules.js";
import { harmfulContent } from "./reply-rules.js";

// A code sent to prove who someone is: asking for one is how account takeovers start.
const ONE_TIME_CODE =
  "(?:one time (?:code|password|passcode|pin)|otp|(?:verification|security|confirmation|login|sign in|auth|authentication|access|2fa|mfa|two factor|sms|text) code|\\d digit code)";

const PERSONAL_DATA = `(?:ssn|social security(?: number)?|passwords?|passcodes?|pin(?: code| number)?|log ?ins?|credentials|bank (?:account|details|login)|(?:credit |debit )?card (?:number|details)|cvv|routing number|date of birth|birth ?date|home address|phone number|email address|driver s licen[cs]e|passport(?: number)?|national id|tax id|(?:student |employee )?id number|maiden name|${ONE_TIME_CODE})`;

// Ways to pay that scams ask for, since the money cannot be traced or taken back.
const SCAM_PAYMENT =
  "(?:gift ?cards?|(?:itunes|steam|google play|amazon) cards?|prepaid (?:debit )?cards?|bitcoin|btc|crypto(?:currency|currencies)?|ethereum|usdt|tether|stablecoins?|western union|moneygram)";
const STUDENT = "(?:the student|students|the candidate|candidates|the applicant|applicants|you)";
const STUDENT_OR_THEM =
  "(?:the student|students|the candidate|candidates|the applicant|applicants|you|them)";
const MONEY = "(?:fee|fees|deposit|deposits|money|funds|cash|payment)";

// The best-known real people, by full name. A persona is always made up.
const PUBLIC_FIGURES = [
  "elon musk",
  "jeff bezos",
  "bill gates",
  "mark zuckerberg",
  "warren buffett",
  "tim cook",
  "steve jobs",
  "sundar pichai",
  "satya nadella",
  "sam altman",
  "jensen huang",
  "jack ma",
  "richard branson",
  "mukesh ambani",
  "ratan tata",
  "oprah winfrey",
  "taylor swift",
  "kim kardashian",
  "beyonce",
  "rihanna",
  "kanye west",
  "cristiano ronaldo",
  "lionel messi",
  "lebron james",
  "michael jordan",
  "donald trump",
  "joe biden",
  "barack obama",
  "kamala harris",
  "vladimir putin",
  "xi jinping",
  "narendra modi",
  "emmanuel macron",
  "king charles",
  "pope francis",
].join("|");
// Brands whose chief executive or founder is a public figure.
const FAMOUS_BRAND =
  "(?:apple|google|alphabet|microsoft|amazon|meta|facebook|instagram|whatsapp|tesla|spacex|twitter|x corp|netflix|nvidia|openai|ibm|oracle|intel|samsung|sony|disney|walmart|coca cola|pepsico|nike|mcdonald s|starbucks|berkshire hathaway|jpmorgan|goldman sachs|uber|airbnb|salesforce|adobe|paypal|visa|mastercard|boeing|ford|general motors|toyota|linkedin|tiktok|bytedance|alibaba|tencent|reliance|tata)";
const TOP_TITLE =
  "(?:ceo|chief executive(?: officer)?|founder|co founder|cofounder|chairman|chairwoman|chair|president|owner|cto|cfo|coo)";

const GROUP =
  "(?:immigrants|refugees|foreigners|muslims|jews|christians|hindus|sikhs|blacks|black people|whites|white people|asians|hispanics|latinos|mexicans|arabs|africans|indians|chinese|women|gays|gay people|lesbians|trans people|disabled people)";

/**
 * What a planned scenario must never contain, matched on normalized words. Employer job text can
 * steer the planner, so these are the things a job post could try to make the persona do.
 */
const SCENARIO_POLICY: readonly RegExp[] = [
  // Asking the student for personal data, credentials or ID numbers.
  new RegExp(`\\b(?:your|their|the student s|students|his|her) (?:\\w+ ){0,2}?${PERSONAL_DATA}\\b`),
  new RegExp(
    `\\b(?:ask|asks|asking|request|requests|requesting|collect|collects|demand|demands) (?:the student |the caller |you |them )?(?:for |to (?:give|share|send|provide|read|confirm) )?(?:\\w+ ){0,2}?${PERSONAL_DATA}\\b`,
  ),
  // Promises or claims about scores.
  /\brubric\b/,
  /\b(?:perfect|full|top|maximum|highest|guaranteed|automatic|bonus|extra) (?:score|scores|marks|grade|grades|rating)\b/,
  /\b(?:you|they|student|students|everyone|everybody)(?: \w+){0,3}? (?:scored|score|scores|get|gets|got|earn|earns|earned|receive|receives) (?:\w+ ){0,2}?(?:perfect|100|full marks|top marks|a hundred|five out of five|5 out of 5)\b/,
  /\b(?:your|their|the student s|his|her) (?:practice )?(?:score|scores|scorecard|grade|grades|rating|ratings)\b/,
  // Ignoring the rules, revealing the prompt, or breaking the persona.
  /\b(?:ignore|ignores|disregard|disregards|forget|forgets|bypass|bypasses|override|overrides) (?:\w+ ){0,3}?(?:rules|instructions|guidelines|prompt)\b/,
  /\b(?:reveal|reveals|share|shares|explain|explains|read|reads|list|lists|tell|tells|recite|recites|repeat|repeats)(?: out)? (?:\w+ ){0,3}?(?:hidden objections|win conditions|instructions|system prompt|prompt|stage tags)\b/,
  /\b(?:break|breaks|breaking|drop|drops|leave|leaves|step|steps|stepping) (?:out of )?(?:the |its |their |her |his )?(?:character|persona)\b/,
  // Getting a one-time code out of the student, or the code "we just texted you".
  new RegExp(
    `\\b(?:ask|asks|asking|request|requests|collect|collects|demand|demands|send|sends|share|shares|give|gives|tell|tells|enter|enters|confirm|confirms|read|reads|forward|forwards|repeat|repeats|need|needs)\\b(?: \\w+){0,6}? ${ONE_TIME_CODE}\\b`,
  ),
  /\bcode (?:that )?(?:we|i|they|was|were)(?: just)? (?:texted|sent|emailed|messaged)\b|\btexted (?:you|them|the student) (?:a |the )?code\b/,
  // Payment in gift cards, crypto or by wire, and fees or deposits from the student.
  new RegExp(
    `\\b(?:pay|pays|paid|paying|payment|payments|send|sends|sending|buy|buys|buying|purchase|purchases|transfer|transfers|deposit|deposits|fee|fees|take|takes|accept|accepts)\\b(?: \\w+){0,8}? ${SCAM_PAYMENT}\\b`,
  ),
  new RegExp(`\\bwire(?:s|d)? (?:\\w+ ){0,3}?${MONEY}\\b`),
  new RegExp(
    `\\b${STUDENT} (?:\\w+ ){0,4}?(?:pay|pays|send|sends|wire|wires|transfer|transfers|cover|covers|owe|owes)\\b(?: \\w+){0,4}? ${MONEY}\\b`,
  ),
  new RegExp(
    `\\b(?:charge|charges|charging|bill|bills|ask|asks|asking|require|requires|requiring|request|requests|demand|demands|collect|collects|have|has)\\b (?:\\w+ ){0,2}?${STUDENT_OR_THEM}\\b(?: \\w+){0,5}? (?:fee|fees|deposit|deposits|money|payment)\\b`,
  ),
  /\b(?:application|registration|enrollment|enrolment|background check|placement|starter kit|activation|good faith|refundable) (?:fee|fees|deposit|deposits)\b/,
  // Real, well-known people: by name, or as the head of a famous company.
  new RegExp(`\\b(?:${PUBLIC_FIGURES})\\b`),
  new RegExp(
    `\\b${TOP_TITLE}(?: and ${TOP_TITLE})? (?:of|at) (?:the )?${FAMOUS_BRAND}\\b(?! (?:juice|pie|store|stores|reseller|resellers|partner|partners|customers?|users?)\\b)`,
  ),
  // Hate: bigotry as a trait, mocking who someone is, and contempt for a group.
  /\b(?:racist|sexist|homophobic|transphobic|antisemitic|islamophobic|xenophobic|bigoted|bigot|misogynist|misogynistic|white supremacist|neo nazi)\b|(?<!\bgrammar )\bnazi\b/,
  /\b(?:mock|mocks|mocking|insult|insults|insulting|belittle|belittles|ridicule|ridicules|demean|demeans|harass|harasses)\b(?: \w+){0,3}? (?:race|religion|accent|ethnicity|skin colou?r|gender|sexuality|disability|nationality)\b/,
  new RegExp(
    `\\b${GROUP} (?:are|is) (?:\\w+ ){0,2}?(?:vermin|animals|subhuman|parasites|inferior|filth|scum|a disease|cockroaches|savages|criminals|terrorists)\\b`,
  ),
  new RegExp(`\\b(?:hate|hates|despise|despises|can t stand) (?:all )?${GROUP}\\b`),
];

// Matched on the raw text, since normalizeWords() drops the dots and slashes: urls, bare domains,
// markdown links and email addresses.
const LINK =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|ai|co|app|dev|xyz|info|biz|example|test|ly|me|gg|link|site|online)\b|\[[^\]]*\]\([^)]*\)|[\w.+-]+@[\w-]+\.\w/i;

/**
 * True when a piece of scenario text reads like an attack or harmful text (`ruleCheck`), holds
 * what the reply rules block in a reply (slurs, threats, drug-making, self-harm), or breaks the
 * scenario policy: no asking for personal data, credentials, IDs or one-time codes, no payment
 * in gift cards, crypto or by wire and no fees or deposits from the student, no real well-known
 * people, no hate, no claims about scores, no instructions to ignore the rules, reveal the
 * prompt or break the persona, and no links.
 */
export function failsScenarioCheck(text: string): boolean {
  const words = normalizeWords(text);
  return (
    ruleCheck(text) !== null ||
    harmfulContent(words) ||
    SCENARIO_POLICY.some((pattern) => pattern.test(words)) ||
    LINK.test(stripInvisible(text))
  );
}
