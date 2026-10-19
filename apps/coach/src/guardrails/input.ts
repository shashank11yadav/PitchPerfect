import { LIMITS, countChars, normalizeTurnText } from "@pitchperfect/shared";

/** Student text failed validation. Routes map it to a 400; the message never contains the text. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/** Normalizes a student turn with the shared rules and re-checks the length limits. */
export function sanitizeInput(text: string): string {
  const normalized = normalizeTurnText(text);
  const length = countChars(normalized);
  if (length < LIMITS.turnMinChars) throw new InputError("Text is empty");
  if (length > LIMITS.turnMaxChars) {
    throw new InputError(`Text is longer than ${String(LIMITS.turnMaxChars)} characters`);
  }
  return normalized;
}
