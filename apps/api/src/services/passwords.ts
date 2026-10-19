import { randomBytes } from "node:crypto";
import argon2 from "argon2";

/** argon2id with the OWASP minimum profile (19 MiB, 2 passes, 1 lane). */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** False for a wrong password and for a malformed stored hash; never throws on bad input. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same work as a real check when there is no account, so a sign-in for an unknown
 * email takes about as long as one with a wrong password. The hash is of a random value made
 * once per process, so nothing can ever match it.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  await verifyPassword(await dummyHash, password);
}
