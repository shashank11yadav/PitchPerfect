import type { RubricKey } from "./rubric.js";

export const SKILL_SLUGS = [
  "introducing-yourself",
  "pitching",
  "objection-handling",
  "probing-discovery",
  "referrals-networking",
  "next-steps",
  "asking-for-the-business",
  "interpersonal-skills",
] as const;
export type SkillSlug = (typeof SKILL_SLUGS)[number];

export interface Skill {
  slug: SkillSlug;
  title: string;
  summary: string;
  scenarioFocus: string;
  /** The rubric dimension that counts double when this skill is scored. */
  weighted: RubricKey;
}

export const SKILLS: readonly Skill[] = [
  {
    slug: "introducing-yourself",
    title: "Introducing yourself",
    summary: "Make a strong first impression in under a minute.",
    scenarioFocus: "30–60 s intro to a hiring manager or prospect at an event",
    weighted: "clarity",
  },
  {
    slug: "pitching",
    title: "Pitching",
    summary: "Tie what you offer to what the buyer actually needs.",
    scenarioFocus: "Core value pitch of the student’s product/role to a busy buyer",
    weighted: "value",
  },
  {
    slug: "objection-handling",
    title: "Objection handling",
    summary: "Respond calmly to pushback on price, timing, or risk.",
    scenarioFocus: "Buyer raises 2–3 concrete objections (price, timing, incumbent, risk)",
    weighted: "objections",
  },
  {
    slug: "probing-discovery",
    title: "Probing & discovery",
    summary: "Ask open questions that uncover the real problem.",
    scenarioFocus: "Buyer is vague; student must uncover pain, impact, decision process",
    weighted: "discovery",
  },
  {
    slug: "referrals-networking",
    title: "Referrals & networking",
    summary: "Ask a contact for an introduction without being awkward.",
    scenarioFocus: "Ask a contact for an introduction or referral",
    weighted: "cta",
  },
  {
    slug: "next-steps",
    title: "Next steps",
    summary: "Leave every good conversation with a date on the calendar.",
    scenarioFocus: "End a good call by locking a concrete next meeting",
    weighted: "cta",
  },
  {
    slug: "asking-for-the-business",
    title: "Asking for the business",
    summary: "Ask for the decision when the buyer is interested but unsure.",
    scenarioFocus: "Buyer is interested but hesitant to commit",
    weighted: "cta",
  },
  {
    slug: "interpersonal-skills",
    title: "Interpersonal skills",
    summary: "Build rapport with someone who is distracted or irritated.",
    scenarioFocus: "Buyer is distracted/irritated; student must build rapport",
    weighted: "confidence",
  },
];

export function isSkillSlug(value: unknown): value is SkillSlug {
  return typeof value === "string" && (SKILL_SLUGS as readonly string[]).includes(value);
}

export function getSkill(slug: SkillSlug): Skill {
  const skill = SKILLS.find((candidate) => candidate.slug === slug);
  if (!skill) throw new Error(`Unknown skill: ${slug}`);
  return skill;
}
