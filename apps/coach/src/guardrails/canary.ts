import { randomUUID } from "node:crypto";

const PREFIX = "pp-canary-";
const ID = randomUUID();

/** Random per process. Every system prompt carries it with an instruction never to repeat it. */
export const CANARY = `${PREFIX}${ID}`;

const ID_COMPACT = ID.replaceAll("-", "");

/** True when text holds the canary, or just its id (models sometimes drop the prefix or hyphens). */
export function containsCanary(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes(ID) || lower.replaceAll("-", "").includes(ID_COMPACT);
}
