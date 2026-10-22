// C0 controls (except tab and newline, handled below), DEL, and C1 controls.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Any whitespace except newline.
const HORIZONTAL_SPACE_RUNS = /[^\S\n]+/g;

/** Strips control characters (keeping newlines), collapses runs of spaces, and trims. */
export function normalizeTurnText(text: string): string {
  return text.replace(CONTROL_CHARS, "").replace(HORIZONTAL_SPACE_RUNS, " ").trim();
}

/** Counts user-visible characters as code points, so an emoji counts once. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

const MAX_SLUG_BASE_LENGTH = 60;

/** `"Senior SDR — Boston!"` + `"a1b2c3"` → `"senior-sdr-boston-a1b2c3"`. Base is ascii, hyphenated, ≤ 60 chars. */
export function slugify(title: string, suffix: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_SLUG_BASE_LENGTH)
    .replace(/-+$/, "");
  return base === "" ? suffix : `${base}-${suffix}`;
}
