import { SKILL_SLUGS, type SkillSlug } from "@pitchperfect/shared";
import { StudentProfile } from "../../db/models/index.js";
import { NotFoundError } from "../../errors.js";

/** Always in course order, whatever order lessons were finished in. */
const inCourseOrder = (done: readonly SkillSlug[]): SkillSlug[] =>
  SKILL_SLUGS.filter((slug) => done.includes(slug));

export async function completedLessons(userId: string): Promise<SkillSlug[]> {
  const profile = await StudentProfile.findOne({ userId }).select("lessonsCompleted").lean();
  if (!profile) throw new NotFoundError();
  return inCourseOrder(profile.lessonsCompleted);
}

/** Marks a lesson done or not done. Setting what is already set changes nothing. */
export async function setLessonCompleted(
  userId: string,
  skill: SkillSlug,
  completed: boolean,
): Promise<SkillSlug[]> {
  const profile = await StudentProfile.findOneAndUpdate(
    { userId },
    completed ? { $addToSet: { lessonsCompleted: skill } } : { $pull: { lessonsCompleted: skill } },
    { returnDocument: "after", projection: { lessonsCompleted: 1 } },
  ).lean();
  if (!profile) throw new NotFoundError();
  return inCourseOrder(profile.lessonsCompleted);
}
