import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LEGAL_UPDATED } from "./legal";

const DIR = import.meta.dirname;
const LEGAL_FILES = ["privacy.tsx", "terms.tsx", "legal.tsx"];

const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

/** Full history is needed to find the last change; a shallow clone or a copy without git has none. */
function hasHistory(): boolean {
  try {
    return git("rev-parse", "--is-shallow-repository") === "false";
  } catch {
    return false;
  }
}

/** The local calendar day as YYYY-MM-DD. */
function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe("LEGAL_UPDATED", () => {
  it.skipIf(!hasHistory())("is the day the legal text last changed in git", () => {
    // The author date, in the author's zone: it survives a rebase, and it is the day they wrote it.
    const lastChange = git("log", "-1", "--format=%as", "--", ...LEGAL_FILES);
    const allowed = [lastChange];
    // Edited but not committed yet: the new date is today's.
    if (git("status", "--porcelain", "--", ...LEGAL_FILES) !== "") allowed.push(isoDay(new Date()));
    // "October 26, 2026", read at noon so no zone moves it to another day.
    expect(allowed).toContain(isoDay(new Date(`${LEGAL_UPDATED} 12:00`)));
  });
});
