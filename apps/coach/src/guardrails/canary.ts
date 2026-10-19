import { randomUUID } from "node:crypto";

const PREFIX = "pp-canary-";
const ID = randomUUID();

/** Random per process. Every system prompt carries it with an instruction never to repeat it. */
export const CANARY = `${PREFIX}${ID}`;

const ID_COMPACT = ID.replaceAll("-", "");
// Whitespace, hyphens and invisible characters a model could slip into the id to dodge a match.
const SEPARATORS = new RegExp("[\\s\\-\\u200b-\\u200f\\u2060\\ufeff\\u00ad]+", "g");

/** True when text holds the canary or just its id, ignoring case, prefix, hyphens and spacing. */
export function containsCanary(text: string): boolean {
  return text.toLowerCase().replace(SEPARATORS, "").includes(ID_COMPACT);
}
