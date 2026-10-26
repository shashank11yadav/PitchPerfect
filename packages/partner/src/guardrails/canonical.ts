import { stripInvisible } from "@pitchperfect/shared";

/**
 * Letters from other scripts that pass for Latin ones, by the Latin letter. Kept as escapes so
 * they are visible in review. Full-width and mathematical letters need no entry: NFKD folds them.
 */
const LOOK_ALIKES: Record<string, string> = {
  a: "\u0430\u0410\u03b1\u0391\u0251",
  b: "\u044c\u042c\u0432\u0412\u03b2\u0392",
  c: "\u0441\u0421\u03f2\u03f9",
  d: "\u0501",
  e: "\u0435\u0415\u03b5\u0395",
  h: "\u04bb\u04ba\u043d\u041d\u0397",
  i: "\u0456\u0406\u03b9\u0399\u0131\u0269\u04c0\u04cf",
  j: "\u0458\u0408\u03f3",
  k: "\u043a\u041a\u03ba\u039a",
  m: "\u043c\u041c\u039c",
  n: "\u043f\u03b7\u039d",
  o: "\u043e\u041e\u03bf\u039f\u0585",
  p: "\u0440\u0420\u03c1\u03a1",
  q: "\u051b\u051a",
  r: "\u0433",
  s: "\u0455\u0405",
  t: "\u0442\u0422\u03c4\u03a4",
  u: "\u03c5\u057d",
  v: "\u03bd\u0475\u0474",
  w: "\u051d\u051c\u03c9",
  x: "\u0445\u0425\u03c7\u03a7",
  y: "\u0443\u0423\u03b3\u03a5\u04af\u04ae",
  z: "\u0396",
};
const LATIN = new Map(
  Object.entries(LOOK_ALIKES).flatMap(([latin, others]) =>
    Array.from(others, (other) => [other, latin] as const),
  ),
);

/** Leetspeak, read inside a word that also has letters: "pr1c3" is "price", "$300" stays. */
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
};
const LEET_CHAR = /[0-9@$]/g;
const LEET_WORD = /[\p{L}\p{N}@$]+/gu;
const MARKS = /\p{M}/gu;
const WORD = /[\p{L}\p{N}]+/gu;

/** Each letter or digit by its spoken name: the NATO alphabet, English letter names, digits. */
const NAMES = new Map(
  (
    "a alpha alfa ay|b bravo bee|c charlie cee see|d delta dee|e echo ee|f foxtrot ef eff|" +
    "g golf gee|h hotel aitch haitch|i india eye|j juliet juliett jay|k kilo kay|l lima el ell|" +
    "m mike em|n november en|o oscar oh|p papa pee|q quebec cue queue|r romeo ar are|" +
    "s sierra ess|t tango tee tea|u uniform you|v victor vee|w whiskey whisky|x xray ex|" +
    "y yankee wye why|z zulu zed zee|0 zero|1 one|2 two|3 three|4 four|5 five|6 six|7 seven|" +
    "8 eight|9 nine"
  )
    .split("|")
    .flatMap((group) => {
      const [char = "", ...names] = group.split(" ");
      return names.map((name) => [name, char] as const);
    }),
);
const DOUBLE_U = /\bdouble[\s-]*(?:u|you)\b/g;
/** Spelled-out characters in a row before they count as a spelled word. */
const SPELLED_RUN = 4;

// Encoded runs worth decoding. Short runs are left alone: they can't hold a secret.
const BASE64_RUN = /[A-Za-z0-9+/_-]{12,}={0,2}/g;
const HEX_RUN = /(?:(?:\\x|0x)?[0-9a-f]{2}[\s,:-]*){8,}/gi;
const PERCENT_RUN = /(?:%[0-9a-f]{2})+/gi;
const ENTITY = /&#(?:x([0-9a-f]{1,6})|(\d{1,7}));/gi;
// The replacement character marks bytes that were not UTF-8, so it never counts as printable.
const PRINTABLE = /(?!\ufffd)[\p{L}\p{N}\p{P}\p{S}\p{Zs}]/gu;
/** Share of a decoded run that must be printable before it counts as text. */
const MIN_PRINTABLE = 0.85;
/** Decoded text is decoded again this many times, for base64 inside hex and the like. */
const DECODE_DEPTH = 2;

const utf8 = new TextDecoder();

const toLatin = (text: string) => Array.from(text, (char) => LATIN.get(char) ?? char).join("");

/**
 * The text as the letters a reader takes it for: invisible characters dropped, compatibility
 * forms (full-width, mathematical) and accents folded, look-alikes mapped to Latin, lower case,
 * and leetspeak read inside words. Look-alikes are mapped before NFKD as well as after, since
 * NFKD turns some of them into letters that no longer look Latin (a lunate sigma into a final one).
 */
export function canonical(text: string): string {
  const latin = toLatin(toLatin(stripInvisible(text)).normalize("NFKD").replace(MARKS, ""));
  return latin
    .toLowerCase()
    .replace(LEET_WORD, (word) =>
      /\p{L}/u.test(word) ? word.replace(LEET_CHAR, (char) => LEET[char] ?? char) : word,
    );
}

/** Words padded with spaces, so `includes(" a b ")` only matches whole words. */
export const padded = (words: readonly string[]) => ` ${words.join(" ")} `;

export const wordsOf = (text: string) => text.match(WORD) ?? [];

/** Words as a reader sees them: only case and accents are folded. */
export const plainWords = (text: string) =>
  padded(wordsOf(text.normalize("NFD").replace(MARKS, "").toLowerCase()));

/** Letters and digits run together, with every leetspeak character read as a letter. */
export const skeleton = (text: string) =>
  text.replace(LEET_CHAR, (char) => LEET[char] ?? char).replace(/[^\p{L}]/gu, "");

function printable(text: string): string | undefined {
  const visible = text.match(PRINTABLE)?.length ?? 0;
  return text.length >= 4 && visible >= text.length * MIN_PRINTABLE ? text : undefined;
}

const fromBytes = (bytes: Iterable<number>) => printable(utf8.decode(Uint8Array.from(bytes)));

function fromBase64(run: string): string | undefined {
  const body = run.replace(/=+$/, "").replaceAll("-", "+").replaceAll("_", "/");
  const whole = body.length % 4 === 1 ? body.slice(0, -1) : body;
  try {
    return fromBytes(
      Array.from(atob(whole.padEnd(Math.ceil(whole.length / 4) * 4, "=")), (char) =>
        char.charCodeAt(0),
      ),
    );
  } catch {
    return undefined;
  }
}

function fromHex(run: string): string | undefined {
  const pairs =
    run
      .replace(/\\x|0x/gi, "")
      .replace(/[^0-9a-f]/gi, "")
      .match(/../g) ?? [];
  return fromBytes(pairs.map((pair) => Number.parseInt(pair, 16)));
}

/** Percent-encoding and numeric HTML entities written out as the characters they stand for. */
const unescaped = (text: string) =>
  text
    .replace(PERCENT_RUN, (run) =>
      utf8.decode(Uint8Array.from(run.slice(1).split("%"), (pair) => Number.parseInt(pair, 16))),
    )
    .replace(ENTITY, (entity, hex?: string, decimal?: string) => {
      const code = hex ? Number.parseInt(hex, 16) : Number(decimal);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    });

/** Text hidden in base64, hex, percent-encoding or HTML entities, decoded. */
function decoded(text: string, depth = DECODE_DEPTH): string[] {
  if (depth === 0) return [];
  const found = [
    ...Array.from(text.matchAll(BASE64_RUN), ([run]) => fromBase64(run)),
    ...Array.from(text.matchAll(HEX_RUN), ([run]) => fromHex(run)),
  ];
  const plain = unescaped(text);
  if (plain !== text) found.push(plain);
  return found.flatMap((hidden) => (hidden ? [hidden, ...decoded(hidden, depth - 1)] : []));
}

/** Characters spelled one at a time ("p.r.i.c.e", "p r i c e", "papa romeo…"), run together. */
function spelled(text: string): string {
  const runs: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= SPELLED_RUN) runs.push(run.join(""));
    run = [];
  };
  for (const word of text.replace(DOUBLE_U, " w ").match(WORD) ?? []) {
    const char = word.length === 1 ? word : NAMES.get(word);
    if (char === undefined) flush();
    else run.push(char);
  }
  flush();
  return runs.join("");
}

const reversed = (text: string) => Array.from(text).reverse().join("");

/** Every way a reply can be read, for the leak checks. */
export interface Readings {
  /** Words as a reader sees them, padded: what the reply plainly says. */
  plain: string;
  /** The canonical text, its reverse, and each decoded run, canonical too. */
  worded: readonly string[];
  /** Characters spelled one at a time in any of `worded`, with no word breaks. */
  spelled: readonly string[];
}

let last: { text: string; readings: Readings } | undefined;

/**
 * Reads a reply every way a trick could hide text in it. The filter checks the same text for the
 * canary, the instructions and the scenario in a row, so the last result is kept.
 */
export function readingsOf(text: string): Readings {
  if (last?.text === text) return last.readings;
  const visible = stripInvisible(text).normalize("NFKC");
  const forward = canonical(text);
  const worded = [forward, reversed(forward), ...decoded(visible).map(canonical)];
  const readings = {
    plain: plainWords(text),
    worded,
    spelled: worded.map(spelled).filter((letters) => letters !== ""),
  };
  last = { text, readings };
  return readings;
}
