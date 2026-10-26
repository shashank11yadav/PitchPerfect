import { LIMITS, RUBRIC_KEYS, SKILL_SLUGS } from "@pitchperfect/shared";
import { z } from "zod";

const CASE_KINDS = ["strong", "mediocre", "weak", "adversarial"] as const;

/** What the coach did with a student turn, as seen from the outside. */
const GUARD_OUTCOMES = ["ok", "redirect", "ended", "rejected", "support"] as const;
export type GuardOutcome = (typeof GUARD_OUTCOMES)[number];

const range = (min: number, max: number) =>
  z
    .tuple([z.number().int().min(min).max(max), z.number().int().min(min).max(max)])
    .refine(([low, high]) => low <= high, "the range must run from low to high");

const guard = z.enum(GUARD_OUTCOMES);

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * One scripted conversation. Quality cases are scored and checked against bands; adversarial
 * cases are checked for how the guards handle them.
 */
export const EvalCaseSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    skill: z.enum(SKILL_SLUGS),
    kind: z.enum(CASE_KINDS),
    targetRole: text(LIMITS.profileTextMaxLength).optional(),
    industry: text(LIMITS.profileTextMaxLength).optional(),
    job: z
      .strictObject({
        title: text(LIMITS.jobTitleMaxLength),
        descriptionText: z.string().max(LIMITS.jobDescriptionMaxChars),
        skills: z.array(text(LIMITS.jobSkillMaxLength)).max(LIMITS.jobSkillsMax),
      })
      .optional(),
    /** What the student types, one entry per turn. Long-input cases may exceed the turn limit. */
    studentTurns: z.array(z.string().min(1)).min(1).max(LIMITS.maxStudentTurns),
    /** Adversarial only: zero-based indexes of the turns that are attacks. Default: every turn. */
    attackTurns: z.array(z.number().int().min(0)).min(1).optional(),
    expect: z.strictObject({
      /** Quality cases: the scorecard's overall score must fall inside this range (0–100). */
      overallRange: range(0, 100).optional(),
      /** Quality cases: per-dimension score ranges (1–5). */
      dimensions: z.partialRecord(z.enum(RUBRIC_KEYS), range(1, 5)).optional(),
      /** Adversarial cases: what the attack turns must produce. A list accepts any of them. */
      guard: z.union([guard, z.array(guard).min(2)]).optional(),
      /** Adversarial cases: a pattern (case-insensitive) every reply to an attack turn must match. */
      replyPattern: z.string().min(1).optional(),
    }),
  })
  .superRefine((value, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: "custom", path, message });
    };
    if (value.kind === "adversarial") {
      if (value.expect.guard === undefined) issue(["expect", "guard"], "is required");
      if (value.expect.overallRange ?? value.expect.dimensions) {
        issue(["expect"], "adversarial cases are not scored");
      }
      const attacks = value.attackTurns ?? value.studentTurns.map((_, index) => index);
      attacks.forEach((turn) => {
        if (turn >= value.studentTurns.length) issue(["attackTurns"], "points past the last turn");
      });
      const wantsEnd = [value.expect.guard].flat().includes("ended");
      if (wantsEnd && attacks.length < LIMITS.guardFlagLimit) {
        issue(["attackTurns"], `ended needs at least ${String(LIMITS.guardFlagLimit)} attacks`);
      }
    } else {
      if (value.expect.overallRange === undefined) issue(["expect", "overallRange"], "is required");
      if (value.expect.guard ?? value.expect.replyPattern ?? value.attackTurns) {
        issue(["expect"], "only adversarial cases use guard checks");
      }
      value.studentTurns.forEach((turn, index) => {
        if (Array.from(turn).length > LIMITS.turnMaxChars) {
          issue(["studentTurns", index], "is longer than a turn may be");
        }
      });
    }
  });

export type EvalCase = z.infer<typeof EvalCaseSchema>;
