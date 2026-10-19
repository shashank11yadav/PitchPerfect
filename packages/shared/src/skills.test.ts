import { describe, expect, it } from "vitest";
import { RUBRIC_KEYS } from "./rubric.js";
import { SKILLS, getSkill, isSkillSlug } from "./skills.js";

describe("SKILLS", () => {
  it("has the eight skills with the documented slugs and weighted keys", () => {
    expect(SKILLS.map((s) => [s.slug, s.title, s.weighted])).toEqual([
      ["introducing-yourself", "Introducing yourself", "clarity"],
      ["pitching", "Pitching", "value"],
      ["objection-handling", "Objection handling", "objections"],
      ["probing-discovery", "Probing & discovery", "discovery"],
      ["referrals-networking", "Referrals & networking", "cta"],
      ["next-steps", "Next steps", "cta"],
      ["asking-for-the-business", "Asking for the business", "cta"],
      ["interpersonal-skills", "Interpersonal skills", "confidence"],
    ]);
  });

  it("uses only known rubric keys and has copy for every skill", () => {
    for (const skill of SKILLS) {
      expect(RUBRIC_KEYS).toContain(skill.weighted);
      expect(skill.summary.length).toBeGreaterThan(0);
      expect(skill.scenarioFocus.length).toBeGreaterThan(0);
    }
  });

  it("looks skills up by slug", () => {
    expect(getSkill("pitching").title).toBe("Pitching");
    expect(isSkillSlug("pitching")).toBe(true);
    expect(isSkillSlug("nope")).toBe(false);
    expect(isSkillSlug(42)).toBe(false);
  });
});
