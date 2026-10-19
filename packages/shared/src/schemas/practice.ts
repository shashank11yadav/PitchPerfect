import { z } from "zod";
import type { AttemptStatus } from "../enums.js";
import type { Scorecard } from "../rubric.js";
import type { SkillSlug } from "../skills.js";
import type { ScenarioPublic, TranscriptEntry } from "./coach.js";
import { skillSlug } from "./coach.js";
import { objectId, turnText } from "./common.js";

export const StartPracticeSchema = z.strictObject({
  skill: skillSlug(),
  jobId: objectId().optional(),
});
export type StartPractice = z.infer<typeof StartPracticeSchema>;

export const TurnSchema = z.strictObject({ text: turnText() });
export type Turn = z.infer<typeof TurnSchema>;

export const ShareScorecardSchema = z.strictObject({ attemptId: objectId().nullable() });
export type ShareScorecard = z.infer<typeof ShareScorecardSchema>;

/** Never includes `scenarioPrivate`. */
export interface AttemptView {
  id: string;
  skill: SkillSlug;
  jobId: string | null;
  status: AttemptStatus;
  scenarioPublic: ScenarioPublic;
  transcript: TranscriptEntry[];
  scorecard: Scorecard | null;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
}

export interface AttemptSummary {
  id: string;
  skill: SkillSlug;
  status: AttemptStatus;
  overall: number | null;
  startedAt: string;
  endedAt: string | null;
}
