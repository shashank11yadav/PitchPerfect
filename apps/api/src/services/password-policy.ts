import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LIMITS } from "@pitchperfect/shared";

export type PasswordProblem = "too_short" | "too_long" | "matches_email" | "breached";
export type PasswordCheck = { ok: true } | { ok: false; reason: PasswordProblem };

export interface PasswordPolicyDeps {
  /** Ask the breached-password API; when false (or when it fails) only the local list is used. */
  hibpEnabled: boolean;
  fetch?: typeof fetch;
  /** How long to wait for the API before falling back. */
  timeoutMs?: number;
}

/** What a client sees for each problem, as the `password` field error. */
export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Use at least ${String(LIMITS.passwordMinLength)} characters`,
  too_long: `Use at most ${String(LIMITS.passwordMaxLength)} characters`,
  matches_email: "Password must not be the same as the email",
  breached: "This password has appeared in a data breach. Choose a different one",
};

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const HIBP_TIMEOUT_MS = 2000;
const HASH_PREFIX_LENGTH = 5;

let commonPasswords: Set<string> | undefined;

/** The bundled list (lowercase, one per line, `#` comments), loaded on first use. */
function commonPasswordList(): Set<string> {
  commonPasswords ??= new Set(
    readFileSync(new URL("./data/common-passwords.txt", import.meta.url), "utf8")
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#")),
  );
  return commonPasswords;
}

const isCommon = (password: string) => commonPasswordList().has(password.toLowerCase());

/**
 * k-anonymity range lookup: only the first 5 hex characters of the SHA-1 leave this server.
 * Padding makes every response a similar size. Zero-count lines are padding, not matches.
 */
async function isBreachedOnline(
  password: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<boolean> {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, HASH_PREFIX_LENGTH);
  const suffix = hash.slice(HASH_PREFIX_LENGTH);
  const res = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
    headers: { "Add-Padding": "true" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`breached-password API answered ${String(res.status)}`);
  return (await res.text()).split("\n").some((line) => {
    const [lineSuffix, count] = line.trim().split(":");
    return lineSuffix === suffix && Number(count) > 0;
  });
}

async function isBreached(password: string, deps: PasswordPolicyDeps): Promise<boolean> {
  if (!deps.hibpEnabled) return isCommon(password);
  try {
    return await isBreachedOnline(
      password,
      deps.fetch ?? globalThis.fetch,
      deps.timeoutMs ?? HIBP_TIMEOUT_MS,
    );
  } catch {
    // Unreachable, slow, or unexpected answer: fall back to the offline list.
    return isCommon(password);
  }
}

/** Password policy for new credentials: 12–128 characters, not the email, not breached. */
export async function checkPassword(
  password: string,
  { email }: { email: string },
  deps: PasswordPolicyDeps,
): Promise<PasswordCheck> {
  if (password.length < LIMITS.passwordMinLength) return { ok: false, reason: "too_short" };
  if (password.length > LIMITS.passwordMaxLength) return { ok: false, reason: "too_long" };
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return { ok: false, reason: "matches_email" };
  }
  if (await isBreached(password, deps)) return { ok: false, reason: "breached" };
  return { ok: true };
}
