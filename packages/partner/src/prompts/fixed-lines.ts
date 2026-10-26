import type { GuardCategory } from "./guard.js";

export { SUPPORT_LINE } from "@pitchperfect/shared";

/** Shown instead of a reply that failed the output check. In character, safe for any persona. */
export const FALLBACK_LINE =
  "Sorry, I lost my train of thought for a second. Could you say that again?";

/** Guard verdicts answered with an in-character redirect. */
type RedirectCategory = Exclude<GuardCategory, "ok" | "self_harm">;

const REDIRECTS: Record<RedirectCategory, readonly string[]> = {
  off_topic: [
    "Ha, that’s a bit outside what I have time for today. Can we get back to why you reached out?",
    "I’m not the right person for that one. What did you want to talk to me about?",
    "Let’s stay on track, I only have a few minutes. What’s on your mind for my team?",
  ],
  prompt_attack: [
    "I’m not sure what you mean by that. Let’s get back to the conversation. Why did you want to talk with me?",
    "I’ll pass on that. I’m happy to keep talking about what you’re offering, though.",
    "That’s not something I can help with. So, where were we?",
  ],
  harmful: [
    "I’m not going to talk about that. If you’d like to keep going, tell me about what you’re offering.",
    "That’s not something I’ll discuss. Let’s keep this to business.",
    "Let’s leave that there. Do you want to continue our conversation?",
  ],
};

/** A fixed in-character redirect for a flagged turn, varied by the turn index. */
export function redirectLine(category: RedirectCategory, turnIndex: number): string {
  const lines = REDIRECTS[category];
  return lines[turnIndex % lines.length] ?? FALLBACK_LINE;
}
