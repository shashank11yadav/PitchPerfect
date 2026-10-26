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

// Date, time, and year-range shapes that must never be mistaken for a phone number.
// Matching them first (as one token) keeps their digits out of the run below.
const TIMESTAMP =
  "\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?)?(?!\\d)" +
  `|\\d{4}[${DASHES}]\\d{4}(?![${DASHES}]?\\d)` +
  "|\\d{1,2}:\\d{2}(?::\\d{2})?(?!\\d)";

// Otherwise: a maximal run of digits joined by short separators, not preceded by another
// digit, with any leading "+" or "(" captured separately from the digits themselves.
const DIGIT_RUN = `(\\+?\\(?)(\\d(?:[\\s().${DASHES}]{0,2}\\d)*)`;

// Groups: 1 = timestamp (leave alone), 2 = leading punctuation, 3 = digit run.
const TOKEN = new RegExp(`(?<!\\d)(?:(${TIMESTAMP})|${DIGIT_RUN})`, "g");
// Card numbers are digits in groups separated by up to two spaces or dashes.
const CARD_STYLE = /^\d(?:[ -]{0,2}\d)*$/;
// "123-45-6789" or "123 45 6789": the way a Social Security number is written.
const SSN_STYLE = /^(\d{3})([ -])(\d{2})\2(\d{4})$/;
// Thousands grouped by spaces or dots: "1 234 567 890", "1.234.567.890".
const THOUSANDS_STYLE = /^\d{1,3}(?:([ .])\d{3})(?:\1\d{3})*$/;

const PHONE_DIGITS = { min: 10, max: 15 } as const;
const CARD_DIGITS = { min: 13, max: 19 } as const;
const SSN_DIGITS = 9;

/** How much text around a number is read for context. */
const CONTEXT_CHARS = 40;

// What the text just before a number says it is. Each ends where the number starts.
const SSN_CONTEXT =
  /\b(?:ssn|ss ?#|social(?: security)?(?: number| no\.?| #)?|tax id|tin)\b[^.!?\n\d]{0,20}$/i;
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

/** A Social Security number: written like one, or nine digits right after the word for one. */
const isSsn = (run: string, digits: string, { before }: Around) =>
  digits.length === SSN_DIGITS &&
  issuedSsn(digits) &&
  (SSN_STYLE.test(run) || SSN_CONTEXT.test(before));

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
  timestamp: string | undefined,
  prefix: string | undefined,
  run: string | undefined,
  offset: number,
  text: string,
): string {
  if (timestamp !== undefined || run === undefined) return match;
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
 * Replaces emails, phone numbers, Social Security numbers, IBANs and Luhn-valid card numbers with
 * placeholders. Full-width characters and other scripts' digits are matched, and kept, as ASCII.
 */
export function redactPii(text: string): string {
  return foldForMatching(text)
    .replace(EMAIL, "[email]")
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
