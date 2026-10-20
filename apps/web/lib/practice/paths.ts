import type { SkillSlug } from "@pitchperfect/shared";

/** One practice session: the room while it runs, the scorecard after. */
export const attemptPath = (id: string) => `/app/practice/attempt/${id}`;

/** `/app/practice` or a skill's start screen, keeping the job the student is practicing for. */
export function practiceHref(skill?: SkillSlug, jobId?: string): string {
  const path = skill ? `/app/practice/${skill}` : "/app/practice";
  return jobId ? `${path}?jobId=${encodeURIComponent(jobId)}` : path;
}
