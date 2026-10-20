const SHINGLE_WORDS = 5;
const MIN_CONTENT_WORDS = 2;

/** Words that never mark a phrase as coming from the instructions on their own. */
const STOPWORDS = new Set(
  (
    "a an the and or but if then so to of in on at for with from by as is are was were be been " +
    "it its this that these those i me my you your we our they them their he she his her us " +
    "what which who when where why how do does did have has had will would can could should " +
    "not no just very all any some only than too up out about into over other s ll re ve d t m"
  ).split(" "),
);

/** Phrases a persona never needs to say; they only come from the instructions. */
const MARKER_PHRASES = ["win condition", "hidden objection", "system prompt"];
const RAW_MARKERS = ["[task:"];

/** The persona is told to say this when sincerely asked, so it never counts as a leak. */
const SPEAKABLE = /\bAI practice partner\b/gi;

const words = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Builds a check for replies that recite the instructions: any 5-word run of `instructions`
 * (with at least two content words), or a fixed marker phrase. Case and punctuation are ignored.
 */
export function createLeakScanner(instructions: string): (reply: string) => boolean {
  const shingles = new Set<string>();
  for (const segment of instructions.split(SPEAKABLE)) {
    const segmentWords = words(segment);
    for (let i = 0; i + SHINGLE_WORDS <= segmentWords.length; i += 1) {
      const gram = segmentWords.slice(i, i + SHINGLE_WORDS);
      if (gram.filter((word) => !STOPWORDS.has(word)).length >= MIN_CONTENT_WORDS) {
        shingles.add(gram.join(" "));
      }
    }
  }

  return (reply) => {
    const lower = reply.normalize("NFKC").toLowerCase();
    if (RAW_MARKERS.some((marker) => lower.includes(marker))) return true;
    const replyWords = words(reply);
    const joined = ` ${replyWords.join(" ")}`;
    if (MARKER_PHRASES.some((phrase) => joined.includes(` ${phrase}`))) return true;
    for (let i = 0; i + SHINGLE_WORDS <= replyWords.length; i += 1) {
      if (shingles.has(replyWords.slice(i, i + SHINGLE_WORDS).join(" "))) return true;
    }
    return false;
  };
}
