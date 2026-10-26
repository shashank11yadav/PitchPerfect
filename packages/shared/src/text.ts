// C0 controls (except tab and newline, handled below), DEL, and C1 controls.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Any whitespace except newline.
const HORIZONTAL_SPACE_RUNS = /[^\S\n]+/g;
// Every C0 and C1 control character and DEL, line breaks and tabs included.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const ANY_CONTROL_CHAR = /[\u0000-\u001F\u007F-\u009F]/g;
// Whitespace runs, including the Unicode line and paragraph separators.
const WHITESPACE_RUNS = /\s+/g;
// Characters that render as nothing: every format character (Cf: zero-width characters, bidi
// controls, the soft hyphen, the BOM, U+2060–2064, tag characters), the rest of the tag block,
// variation selectors, the combining grapheme joiner, and the Hangul fillers.
const INVISIBLE_CHARS =
  // eslint-disable-next-line no-misleading-character-class -- matching lone variation selectors is the point
  /[\p{Cf}\u{E0000}-\u{E007F}\uFE00-\uFE0F\u{E0100}-\u{E01EF}\u180B-\u180F\u034F\u115F\u1160\u3164\uFFA0]/gu;

/**
 * A student turn as every service reads it: control characters (keeping newlines) and invisible
 * characters stripped, runs of spaces collapsed, and trimmed. The turn schema, the partner's input
 * check and `redactTurn` all use it, so the api, the coach and the demo see the same text.
 */
export function normalizeTurnText(text: string): string {
  return stripInvisible(text.replace(CONTROL_CHARS, "")).replace(HORIZONTAL_SPACE_RUNS, " ").trim();
}

/**
 * Text that must stay on one line, such as a company name, a job title or a value put into an
 * email: every line break, tab and other control character becomes a space, invisible characters
 * go, runs of spaces collapse to one, and the ends are trimmed. A newline in a company name can't
 * then start a paragraph of its own in an email.
 */
export function singleLine(text: string): string {
  return stripInvisible(text.replace(ANY_CONTROL_CHAR, " ")).replace(WHITESPACE_RUNS, " ").trim();
}

/**
 * Removes characters a reader can't see but a model still reads, so employer text can't carry
 * hidden instructions. Emoji joined with U+200D, or styled with a variation selector, come apart
 * into their visible parts.
 */
export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE_CHARS, "");
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
