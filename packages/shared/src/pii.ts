import { LIMITS } from "./limits.js";
import { countChars, normalizeTurnText } from "./text.js";

// Full-width forms of ASCII (U+FF01–FF5E) and the ideographic space, as CJK keyboards type them.
const FULL_WIDTH = /[\uff01-\uff5e\u3000]/g;
const FULL_WIDTH_OFFSET = 0xfee0;
// Decimal digits from any script other than ASCII: Arabic-Indic, Devanagari, mathematical, ….
const OTHER_DIGIT = /(?![0-9])\p{Nd}/gu;
const DIGIT = /\p{Nd}/u;

/**
 * The ASCII digit for any decimal digit. Unicode encodes decimal digits only in runs of ten, from
 * 0 to 9, so the digit's distance from the start of its run gives its value.
 */
function asciiDigit(char: string): string {
  const point = char.codePointAt(0) ?? 0;
  let start = point;
  while (start > 0 && DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
  return String((point - start) % 10);
}

/** Full-width characters and other scripts' digits as the ASCII the patterns below match. */
function foldForMatching(text: string): string {
  return text
    .replace(FULL_WIDTH, (char) =>
      char === "\u3000" ? " " : String.fromCharCode(char.charCodeAt(0) - FULL_WIDTH_OFFSET),
    )
    .replace(OTHER_DIGIT, asciiDigit);
}

const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}/g;

// An email address spelled out so a filter misses it: "jane dot doe at gmail dot com",
// "jane(at)gmail(dot)com", "jane [at] gmail". A label holds no spaces, dots or brackets, so the
// words "at" and "dot" between labels can only be read one way.
const LABEL = "[a-z0-9_%+-]{1,64}";
const BRACKETED = (word: string) => `\\s*[[({<]\\s*${word}\\s*[\\])}>]\\s*`;
const SPELLED_DOT = `(?:${BRACKETED("dot")}|\\s+dot\\s+)`;
const SPELLED_DOT_ONE = new RegExp(SPELLED_DOT, "i");
const ANY_DOT = `(?:${SPELLED_DOT}|\\.)`;
const DOTTED = `${LABEL}(?:${ANY_DOT}${LABEL}){0,5}`;
const EMAIL_TLD = "com|net|org|edu|gov|io|co|ai|app|dev|me|us|uk|ca|de|fr|in|au|info|biz|test";
// Not inside a word, an address or a placeholder such as "[email]".
const WORD_START = "(?<![\\w.'’@[-])";
// "[at]" and its kin are never ordinary prose, so the domain needs no top-level domain.
const BRACKETED_EMAIL = new RegExp(
  `${WORD_START}${DOTTED}${BRACKETED("at")}${DOTTED}(?![\\w@])`,
  "gi",
);
// A plain "at", or an "@" with spaces around it, needs a domain ending in a known top-level one.
const SPOKEN_EMAIL = new RegExp(
  `${WORD_START}(${DOTTED})(\\s+at\\s+|\\s*@\\s*)(${LABEL}(?:${ANY_DOT}${LABEL}){0,4}${ANY_DOT}(?:${EMAIL_TLD}))(?![\\w@]|\\.\\w)`,
  "gi",
);
// Words that come before "at" in ordinary speech: "look at", "find us at", "we are at".
const NOT_A_MAILBOX =
  /^(?:me|us|you|him|her|them|it|we|i|they|is|are|am|was|were|be|been|look|looking|meet|find|see|visit|go|head|live|based|work|works|here|there|that|this|out|up|now|or|and|but|more|online|site|website|page)$/i;
const MAIL_PROVIDER =
  /^(?:gmail|googlemail|yahoo|ymail|hotmail|outlook|icloud|aol|protonmail|proton|gmx|zoho|fastmail|yandex)\./i;

/**
 * A spoken email: "jane at gmail dot com", "jane @ example.test". With a plain "at" and every
 * dot written as a dot, only a known mail provider counts, so "Find us at routewise.example" is
 * left as it was.
 */
function redactSpokenEmail(match: string, local: string, at: string, domain: string): string {
  const firstWord = local.split(/[^a-z0-9_%+-]/i)[0] ?? "";
  if (NOT_A_MAILBOX.test(firstWord)) return match;
  const spelled = [local, domain].some((part) => SPELLED_DOT_ONE.test(part));
  if (at.includes("@") || spelled || MAIL_PROVIDER.test(domain)) return "[email]";
  return match;
}

// Two letters, two check digits, then up to 30 letters and digits, run together or in fours.
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gi;
const IBAN_LENGTH = { min: 15, max: 34 } as const;
/** Every country's account part is mostly digits; words that happen to fit the shape are not. */
const IBAN_MIN_ACCOUNT_DIGITS = 8;

/** The ISO 13616 check: moved to the end, letters as 10–35, the number mod 97 is 1. */
function passesIbanCheck(compact: string): boolean {
  const moved = (compact.slice(4) + compact.slice(0, 4)).toUpperCase();
  let rest = 0;
  for (const char of moved) {
    const value = Number.parseInt(char, 36);
    rest = (value > 9 ? rest * 100 + value : rest * 10 + value) % 97;
  }
  return rest === 1;
}

/**
 * The longest valid IBAN at the start of a match, dropping trailing groups the pattern took from
 * the next word ("…7034 ok"), with what follows it kept as it was.
 */
function redactIban(match: string): string {
  let candidate = match;
  for (;;) {
    const compact = candidate.replace(/ /g, "");
    if (compact.length < IBAN_LENGTH.min) return match;
    const accountDigits = compact.slice(4).replace(/\D/g, "").length;
    if (
      compact.length <= IBAN_LENGTH.max &&
      accountDigits >= IBAN_MIN_ACCOUNT_DIGITS &&
      passesIbanCheck(compact)
    ) {
      return `[iban]${match.slice(candidate.length)}`;
    }
    const space = candidate.lastIndexOf(" ");
    if (space === -1) return match;
    candidate = candidate.slice(0, space);
  }
}

// Hyphens and dashes people put between digit groups, the minus sign included.
const DASHES = "\\-\\u2010-\\u2015\\u2212";

// One part of an IPv4 address, 0 to 255.
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";

// Date, time, year-range and IPv4 address shapes that must never be mistaken for a phone number.
// Matching them first (as one token) keeps their digits out of the run below.
const KEPT_SHAPE =
  "\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?)?(?!\\d)" +
  `|\\d{4}[${DASHES}]\\d{4}(?![${DASHES}]?\\d)` +
  "|\\d{1,2}:\\d{2}(?::\\d{2})?(?!\\d)" +
  `|(?:${OCTET}\\.){3}${OCTET}(?!\\.?\\d)`;

// Otherwise: a maximal run of digits joined by short separators, not preceded by another
// digit, with any leading "+" or "(" captured separately from the digits themselves.
const DIGIT_RUN = `(\\+?\\(?)(\\d(?:[\\s().${DASHES}]{0,2}\\d)*)`;

// Groups: 1 = a shape to leave alone, 2 = leading punctuation, 3 = digit run.
const TOKEN = new RegExp(`(?<!\\d)(?:(${KEPT_SHAPE})|${DIGIT_RUN})`, "g");
// Card numbers are digits in groups separated by up to two spaces or dashes, or by single dots
// between the groups printed on the card: 4-4-4-4, 4-4-4 or 4-6-5.
const CARD_STYLE = /^\d(?:[ -]{0,2}\d)*$|^\d{4}(?:\.\d{4}){2,3}$|^\d{4}\.\d{6}\.\d{4,5}$/;
// A number with a decimal point: "3.141592653589", "12345.678901".
const DECIMAL_STYLE = /^\d+\.\d+$/;
// "123-45-6789" or "123 45 6789": the way a Social Security number is written.
const SSN_STYLE = /^(\d{3})([ -])(\d{2})\2(\d{4})$/;
// Thousands grouped by spaces or dots: "1 234 567 890", "1.234.567.890".
const THOUSANDS_STYLE = /^\d{1,3}(?:([ .])\d{3})(?:\1\d{3})*$/;

const PHONE_DIGITS = { min: 10, max: 15 } as const;
const CARD_DIGITS = { min: 13, max: 19 } as const;
const SSN_DIGITS = 9;

/** How much text around a number is read for context. */
const CONTEXT_CHARS = 60;

// The words for a Social Security or taxpayer number, but not "social media" or "social selling".
const SSN_WORD =
  "(?:ssn|ss ?#|ss (?:number|no\\.?)|soc(?:ial)? sec(?:urity)?(?: number| no\\.?| #)?|social(?: security)?(?: number| no\\.?| #)?|tax id|i?tin)\\b" +
  "(?!\\s+(?:media|network|networks|channels?|posts?|proof|selling|skills?|events?|clubs?|teams?|budget|accounts?|handles?|campaigns?)\\b)";
// What the text just before a number says it is. Each ends where the number starts.
const SSN_CONTEXT = new RegExp(`\\b${SSN_WORD}[^.!?\\n\\d]{0,30}$`, "i");
// The same said just after it: "123456789 is my social", "123456789 (my SSN)".
const SSN_AFTER = new RegExp(
  `^\\s*[(,:${DASHES}]?\\s*(?:(?:is|was)\\s+)?(?:my|his|her|their|our|the)\\s+${SSN_WORD}`,
  "i",
);
const PHONE_CONTEXT =
  /\b(?:call|calls|phone|cell|mobile|text|tel|telephone|whatsapp|signal|reach me|fax|landline)\b[^.!?\n\d]{0,20}$/i;
const REFERENCE_CONTEXT =
  /\b(?:order|invoice|po|ticket|case|ref|reference|tracking|sku|part|serial|model|isbn|confirmation|booking|quote)\b(?:\s*(?:no\.?|number|num|id|code))?\s*[#:]?\s*$/i;
const MONEY_CONTEXT = /(?:[$€£¥₹]|\b(?:usd|eur|gbp|inr|jpy))\s*$/i;
// What a number in a sales call counts: "1234567890 events", "2500000000 a month".
const COUNT_WORDS = [
  "events?",
  "users?",
  "units?",
  "items?",
  "records?",
  "rows?",
  "requests?",
  "calls",
  "messages",
  "emails",
  "transactions?",
  "impressions?",
  "clicks?",
  "views?",
  "visits?",
  "visitors?",
  "downloads?",
  "customers?",
  "clients?",
  "accounts",
  "orders",
  "packages?",
  "parcels?",
  "shipments?",
  "deliveries",
  "tickets",
  "devices?",
  "sensors?",
  "readings?",
  "queries",
  "searches",
  "pages?",
  "files?",
  "documents?",
  "leads?",
  "subscribers?",
  "followers?",
  "members?",
  "people",
  "patients?",
  "students?",
  "employees?",
  "seats?",
  "licen[cs]es?",
  "miles?",
  "km",
  "kilomet(?:er|re)s?",
  "kg",
  "lbs?",
  "pounds?",
  "tons?",
  "tonnes?",
  "lit(?:er|re)s?",
  "gallons?",
  "bytes?",
  "[kmgt]b",
  "tokens?",
  "points?",
  "dollars?",
  "euros?",
  "usd",
  "eur",
  "gbp",
  "yen",
  "rupees?",
  "cents?",
  "times",
  "per",
  "a (?:day|week|month|year)",
  "each",
  "(?:in )?total",
];
const COUNT_AFTER = new RegExp(`^\\s*(?:${COUNT_WORDS.join("|")})\\b`, "i");

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Area, group and serial numbers the SSA has never issued (000, 666 and 9xx areas; zeros). */
const issuedSsn = (digits: string) =>
  !/^(?:000|666|9)/.test(digits) && digits.slice(3, 5) !== "00" && digits.slice(5) !== "0000";

interface Around {
  before: string;
  after: string;
}

/**
 * A Social Security or taxpayer number: an issued one written like one, or any nine digits the
 * words around them call one, unless what follows counts something ("123456789 followers").
 */
function isSsn(run: string, digits: string, { before, after }: Around): boolean {
  if (digits.length !== SSN_DIGITS) return false;
  if (SSN_STYLE.test(run) && issuedSsn(digits)) return true;
  return (SSN_CONTEXT.test(before) || SSN_AFTER.test(after)) && !COUNT_AFTER.test(after);
}

/**
 * A phone number, from how it is written and what is around it. A leading "+" always is one; an
 * amount of money, a count of something, or a number grouped in thousands is not, unless the
 * text just before it is about calling.
 */
function isPhone(prefix: string, run: string, digits: string, { before, after }: Around): boolean {
  if (digits.length < PHONE_DIGITS.min || digits.length > PHONE_DIGITS.max) return false;
  if (prefix.includes("+")) return true;
  if (MONEY_CONTEXT.test(before) || COUNT_AFTER.test(after)) return false;
  if (THOUSANDS_STYLE.test(run)) return PHONE_CONTEXT.test(before);
  return true;
}

function redactToken(
  match: string,
  kept: string | undefined,
  prefix: string | undefined,
  run: string | undefined,
  offset: number,
  text: string,
): string {
  if (kept !== undefined || run === undefined || DECIMAL_STYLE.test(run)) return match;
  const lead = prefix ?? "";
  const digits = run.replace(/\D/g, "");
  const count = digits.length;
  if (
    count >= CARD_DIGITS.min &&
    count <= CARD_DIGITS.max &&
    CARD_STYLE.test(run) &&
    passesLuhn(digits)
  ) {
    return `${lead}[number]`;
  }
  const around: Around = {
    before: text.slice(Math.max(0, offset - CONTEXT_CHARS), offset),
    after: text.slice(offset + match.length, offset + match.length + CONTEXT_CHARS),
  };
  // An order, invoice or tracking number is the business's, not the student's.
  if (REFERENCE_CONTEXT.test(around.before)) return match;
  if (isSsn(run, digits, around)) return `${lead}[ssn]`;
  if (isPhone(lead, run, digits, around)) return "[phone]";
  return match;
}

/**
 * Replaces emails (spelled-out ones too), phone numbers, Social Security numbers, IBANs and
 * Luhn-valid card numbers with placeholders. IP addresses, decimals, dates and times are left as
 * they are. Full-width characters and other scripts' digits are matched, and kept, as ASCII.
 */
export function redactPii(text: string): string {
  return foldForMatching(text)
    .replace(EMAIL, "[email]")
    .replace(BRACKETED_EMAIL, "[email]")
    .replace(SPOKEN_EMAIL, redactSpokenEmail)
    .replace(IBAN, redactIban)
    .replace(TOKEN, redactToken);
}

const clip = (text: string) => Array.from(text).slice(0, LIMITS.turnMaxChars).join("");

/** A placeholder such as `[email]` cut short at the end of the text. */
const CUT_PLACEHOLDER = /\[[a-z]*$/;

/**
 * A student's turn as it is stored and forwarded: normalized, clipped to the turn limit, then
 * PII-redacted. A placeholder can be longer than what it replaced; if that pushes the text over
 * the limit, the text is clipped again and a placeholder cut in half is dropped, never kept partial.
 */
export function redactTurn(text: string): string {
  const redacted = redactPii(clip(normalizeTurnText(text)));
  if (countChars(redacted) <= LIMITS.turnMaxChars) return redacted;
  return clip(redacted).replace(CUT_PLACEHOLDER, "").trimEnd();
}
