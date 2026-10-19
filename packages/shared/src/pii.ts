const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}/g;

// A maximal run of digits joined by short separators, not preceded by another digit.
const DIGIT_RUN = /(?<!\d)\+?\(?\d(?:[\s().-]{0,2}\d)*/g;
const CARD_STYLE = /^\d(?:[ -]?\d)*$/;

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

function redactDigitRun(run: string): string {
  const digits = run.replace(/\D/g, "");
  const count = digits.length;
  if (
    count >= CARD_DIGITS.min &&
    count <= CARD_DIGITS.max &&
    CARD_STYLE.test(run) &&
    passesLuhn(digits)
  ) {
    return "[number]";
  }
  if (count >= PHONE_DIGITS.min && count <= PHONE_DIGITS.max) return "[phone]";
  return run;
}

/** Replaces emails, phone numbers, and Luhn-valid card numbers with placeholders. */
export function redactPii(text: string): string {
  return text.replace(EMAIL, "[email]").replace(DIGIT_RUN, redactDigitRun);
}
