const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}/g;

// Date, time, and year-range shapes that must never be mistaken for a phone number.
// Matching them first (as one token) keeps their digits out of the run below.
const TIMESTAMP =
  "\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?)?(?!\\d)" +
  "|\\d{4}-\\d{4}(?!-?\\d)" +
  "|\\d{1,2}:\\d{2}(?::\\d{2})?(?!\\d)";

// Otherwise: a maximal run of digits joined by short separators, not preceded by another
// digit, with any leading "+" or "(" captured separately from the digits themselves.
const DIGIT_RUN = "(\\+?\\(?)(\\d(?:[\\s().-]{0,2}\\d)*)";

// Groups: 1 = timestamp (leave alone), 2 = leading punctuation, 3 = digit run.
const TOKEN = new RegExp(`(?<!\\d)(?:(${TIMESTAMP})|${DIGIT_RUN})`, "g");
// Card numbers are digits in groups separated by up to two spaces or dashes.
const CARD_STYLE = /^\d(?:[ -]{0,2}\d)*$/;

const PHONE_DIGITS = { min: 10, max: 15 } as const;
const CARD_DIGITS = { min: 13, max: 19 } as const;

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

function redactToken(match: string, timestamp?: string, prefix = "", run = ""): string {
  if (timestamp !== undefined) return match;
  const digits = run.replace(/\D/g, "");
  const count = digits.length;
  if (
    count >= CARD_DIGITS.min &&
    count <= CARD_DIGITS.max &&
    CARD_STYLE.test(run) &&
    passesLuhn(digits)
  ) {
    return `${prefix}[number]`;
  }
  if (count >= PHONE_DIGITS.min && count <= PHONE_DIGITS.max) return "[phone]";
  return match;
}

/** Replaces emails, phone numbers, and Luhn-valid card numbers with placeholders. */
export function redactPii(text: string): string {
  return text.replace(EMAIL, "[email]").replace(TOKEN, redactToken);
}
