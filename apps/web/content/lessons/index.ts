import type { SkillSlug } from "@pitchperfect/shared";
import type { ComponentType } from "react";
import AskingForTheBusiness from "./asking-for-the-business.mdx";
import InterpersonalSkills from "./interpersonal-skills.mdx";
import IntroducingYourself from "./introducing-yourself.mdx";
import NextSteps from "./next-steps.mdx";
import ObjectionHandling from "./objection-handling.mdx";
import Pitching from "./pitching.mdx";
import ProbingDiscovery from "./probing-discovery.mdx";
import ReferralsNetworking from "./referrals-networking.mdx";

/** One lesson per skill; titles and summaries come from the shared `SKILLS` list. */
export const LESSONS: Record<SkillSlug, ComponentType> = {
  "introducing-yourself": IntroducingYourself,
  pitching: Pitching,
  "objection-handling": ObjectionHandling,
  "probing-discovery": ProbingDiscovery,
  "referrals-networking": ReferralsNetworking,
  "next-steps": NextSteps,
  "asking-for-the-business": AskingForTheBusiness,
  "interpersonal-skills": InterpersonalSkills,
};
