/**
 * Shared by the fake provider's parts: what it listens for in a student's words, and its number
 * generator. The scorer and the demo buyer use the same patterns, so a line the buyer treats as a
 * meeting request is one the scorecard credits as an ask.
 */

/** A day or a time: "Thursday at 10am", "2pm", "next week". */
export const TIME_PHRASE =
  /\b(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|tomorrow)(?:\s+at\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?)?|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:next|this) week\b/i;

/**
 * An ask for something next: a proposal ("could we", "let's") or a next-step word. A meeting word
 * on its own isn't one, so "thanks for taking the call" doesn't count.
 */
export const ASK =
  /\b(?:could|can|shall|should) we\b|\blet'?s\b|\bwould you be (?:open|up) to\b|\b(?:next step|follow up|schedule|book|introduce|introduction|trial|pilot)\b/i;

/** Agreeing a concern is fair before answering it. */
export const ACKNOWLEDGE =
  /\b(understand|fair|makes sense|hear you|good question|great question|i see|i get (?:it|that))\b/i;

/** Saying what changes for the buyer. */
export const BENEFIT =
  /\b(save|saves|reduce|cut|cuts|grow|increase|faster|less|stops|help|helps)\b/i;

/** Mulberry32: a small seeded number generator, so the fake gives the same output for the same input. */
export function mulberry32(start: number): () => number {
  let state = start >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
