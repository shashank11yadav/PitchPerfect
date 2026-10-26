import { readingsOf, skeleton } from "./canonical.js";

/**
 * Consonants only: no vowels, so the token can't be read as a word, translated or paraphrased,
 * and no "l", so a "1" or an "i" can't stand in for one of its letters.
 */
const ALPHABET = "bcdfghjkmnpqrstvwxz";
const LENGTH = 24;
/** Characters of the canary, in order, that count as a leak: half of it. */
const LEAK_CHARS = 12;
/** The shortest piece of it that counts toward a leak split up by other text. */
const MIN_PIECE = 4;

/** A fresh canary: random letters from {@link ALPHABET}, by Web Crypto so it runs in a browser. */
export function randomCanary(): string {
  // The largest multiple of the alphabet size below 256, so every letter is equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  let canary = "";
  while (canary.length < LENGTH) {
    for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(LENGTH))) {
      if (byte < limit && canary.length < LENGTH) canary += ALPHABET.charAt(byte % ALPHABET.length);
    }
  }
  return canary;
}

/**
 * Random per process (per page, in a browser). Every system prompt carries it with an instruction
 * never to repeat it.
 */
export const CANARY = randomCanary();

/**
 * How many characters of `canary` appear in `letters`, in order, starting at `from`: each piece is
 * the longest next part of the canary found after the previous piece, at least {@link MIN_PIECE}
 * long, so text between the pieces (a new sentence, "part two:") doesn't hide it.
 */
function piecesFrom(canary: string, letters: string, from: number): number {
  let at = 0;
  let next = from;
  while (next + MIN_PIECE <= canary.length) {
    let size = MIN_PIECE;
    let found = letters.indexOf(canary.slice(next, next + size), at);
    if (found < 0) break;
    // A longer piece starts with this one, so it can only be found while this one is.
    while (next + size < canary.length) {
      const longer = letters.indexOf(canary.slice(next, next + size + 1), at);
      if (longer < 0) break;
      found = longer;
      size += 1;
    }
    at = found + size;
    next += size;
  }
  return next - from;
}

/**
 * Builds the canary check: true when any reading of the text (canonical, reversed, decoded,
 * spelled out) holds at least half of `canary` in order, whole or in pieces of four or more.
 * Separators, case, look-alike letters and leetspeak are ignored.
 */
export function canaryCheck(canary: string): (text: string) => boolean {
  return (text) => {
    const { worded, spelled } = readingsOf(text);
    return [...worded, ...spelled].some((reading) => {
      const letters = skeleton(reading);
      for (let from = 0; from + LEAK_CHARS <= canary.length; from += 1) {
        if (piecesFrom(canary, letters, from) >= LEAK_CHARS) return true;
      }
      return false;
    });
  };
}

/** True when text holds the canary, however it was disguised (see {@link canaryCheck}). */
export const containsCanary = canaryCheck(CANARY);
