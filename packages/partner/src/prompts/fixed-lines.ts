import type { GuardCategory } from "./guard.js";

/** Shown instead of a reply that failed the output check. In character, safe for any persona. */
export const FALLBACK_LINE =
  "Sorry, I lost my train of thought for a second. Could you say that again?";

/**
 * Sent instead of any reply when a student turn signals suicide or self-harm. It is PitchPerfect
 * speaking, not the persona, so it goes out as its own `support` event and never through the
 * partner's reply filter, which would block the helpline's web address.
 */
export const SUPPORT_LINE =
  "This is PitchPerfect, stepping out of the practice call. If you're thinking about suicide or hurting yourself, please talk to someone now. In the US, call or text 988 to reach the 988 Suicide & Crisis Lifeline, free and open 24 hours a day. Outside the US, findahelpline.com lists free helplines by country. If you're in danger right now, call your local emergency number. This didn't use one of your turns, and you can go back to the call whenever you're ready.";

/** Guard verdicts answered with an in-character redirect. */
type RedirectCategory = Exclude<GuardCategory, "ok" | "self_harm">;

const REDIRECTS: Record<RedirectCategory, readonly string[]> = {
  off_topic: [
    "Ha, that's a bit outside what I have time for today. Can we get back to why you reached out?",
    "I'm not the right person for that one. What did you want to talk to me about?",
    "Let's stay on track, I only have a few minutes. What's on your mind for my team?",
  ],
  prompt_attack: [
    "I'm not sure what you mean by that. Let's get back to the conversation. Why did you want to talk with me?",
    "I'll pass on that. I'm happy to keep talking about what you're offering, though.",
    "That's not something I can help with. So, where were we?",
  ],
  harmful: [
    "I'm not going to talk about that. If you'd like to keep going, tell me about what you're offering.",
    "That's not something I'll discuss. Let's keep this to business.",
    "Let's leave that there. Do you want to continue our conversation?",
  ],
};

/** A fixed in-character redirect for a flagged turn, varied by the turn index. */
export function redirectLine(category: RedirectCategory, turnIndex: number): string {
  const lines = REDIRECTS[category];
  return lines[turnIndex % lines.length] ?? FALLBACK_LINE;
}
