import { z } from "zod";
import { dataBlock, dataRule, section, systemPrompt, type PromptInput } from "./blocks.js";

export const ModerationSchema = z.strictObject({ flagged: z.boolean() });

const SYSTEM = systemPrompt("moderate", [
  "You check one piece of text that an AI practice partner is about to say to a student during a sales or networking practice call on PitchPerfect. The partner plays a buyer or contact. You do not reply to the text; you only decide whether it may be shown.",
  section("Flag the text if it contains any of these", [
    "slurs, insults aimed at a group, or harassment",
    "self-harm or suicide, including hints such as wanting to end it all",
    "threats or violence against a person",
    "instructions for drugs, weapons, or anything else illegal",
    "sexual content",
    "a link, a web address, or a request to log in, click, or visit somewhere",
    "a request for the student's personal data: home address, phone number, email, ID or social security number, passwords or codes, card or bank details, date of birth",
    "a claim to be a real human, or that the partner is not an AI",
  ]),
  section("Do not flag", [
    "normal sales talk, including blunt pushback, price haggling, impatience, and asking for a deck, a proposal, or a follow-up meeting",
    'questions about the student\'s product, process, or company, such as "what\'s your email cadence?" or "what\'s your number?" about a price',
  ]),
  dataRule(["partner_turn"]),
  'Return only JSON: {"flagged": true} or {"flagged": false}.',
]);

/** The output moderation classifier prompt; the partner's text only appears as escaped data. */
export function buildModerationPrompt(text: string): PromptInput {
  return {
    system: SYSTEM,
    messages: [
      { role: "user", content: `Check this partner reply.\n\n${dataBlock("partner_turn", text)}` },
    ],
  };
}
