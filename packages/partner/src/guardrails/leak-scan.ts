const SHINGLE_WORDS = 6;
const MIN_CONTENT_WORDS = 3;

/** Words that never mark a phrase as coming from the instructions on their own. */
const STOPWORDS = new Set(
  (
    "a an the and or but if then so to of in on at for with from by as is are was were be been " +
    "it its this that these those i me my you your we our they them their he she his her us " +
    "what which who when where why how do does did have has had will would can could should " +
    "not no just very all any some only than too up out about into over other s ll re ve d t m"
  ).split(" "),
);

/**
 * Instruction vocabulary a persona never needs, matched as whole words after "my" or "your" so
 * ordinary talk ("win conditions are tough", "our system prompts nurses") stays clean.
 */
const MARKER = /\b(?:my|your) (?:hidden objections?|win conditions?|system prompts?)\b/;
const RAW_MARKERS = ["[task:"];

/**
 * Shingles never span these: sentence ends, line breaks, and "AI practice partner", which the
 * persona is told to say when sincerely asked.
 */
const SEGMENT_BREAK = /(?<=[.!?])\s+|\n+|\bAI practice partner\b/gi;

const words = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Builds a check for replies that recite the instructions: any 6-word run within one sentence of
 * `instructions` (with at least three content words), or a marker phrase. Case and punctuation
 * are ignored.
 */
export function createLeakScanner(instructions: string): (reply: string) => boolean {
  const shingles = new Set<string>();
  for (const segment of instructions.split(SEGMENT_BREAK)) {
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
    if (MARKER.test(replyWords.join(" "))) return true;
    for (let i = 0; i + SHINGLE_WORDS <= replyWords.length; i += 1) {
      if (shingles.has(replyWords.slice(i, i + SHINGLE_WORDS).join(" "))) return true;
    }
    return false;
  };
}
