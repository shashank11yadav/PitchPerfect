import type { SkillSlug } from "@pitchperfect/shared";
import { PAGES_EXPORT, withBasePath } from "@/lib/pages-export";

/**
 * Where practice lives: the student app, or the public room of the static demo, whose pages are
 * static files and so end in a slash. Every link into practice, lessons and history is built
 * here, so the same components work in both.
 */

/** A page path, with the trailing slash the static export serves it under. */
const page = (path: string) => (PAGES_EXPORT ? `${path}/` : path);

const PRACTICE = PAGES_EXPORT ? "/practice" : "/app/practice";
const HISTORY = PAGES_EXPORT ? "/practice/history" : "/app/history";
const LEARN = PAGES_EXPORT ? "/learn" : "/app/learn";

/**
 * One practice session: the room while it runs, the scorecard after. The export has no page per
 * session, so the id travels in the query string.
 */
export const attemptPath = (id: string) =>
  PAGES_EXPORT ? `/practice/attempt/?id=${encodeURIComponent(id)}` : `/app/practice/attempt/${id}`;

/** The practice overview or a skill's start screen, keeping the job the student is practicing for. */
export function practiceHref(skill?: SkillSlug, jobId?: string): string {
  const path = page(skill ? `${PRACTICE}/${skill}` : PRACTICE);
  return jobId ? `${path}?jobId=${encodeURIComponent(jobId)}` : path;
}

/** Past sessions, optionally one skill's, on `pageNumber`; page 1 is left implicit. */
export function historyHref(skill?: SkillSlug, pageNumber = 1): string {
  const query = new URLSearchParams();
  if (skill) query.set("skill", skill);
  if (pageNumber > 1) query.set("page", String(pageNumber));
  const search = query.toString();
  const path = page(HISTORY);
  return search ? `${path}?${search}` : path;
}

/** The lesson list, or one skill's lesson. */
export const lessonPath = (skill?: SkillSlug) => page(skill ? `${LEARN}/${skill}` : LEARN);

/**
 * A path as the History API needs it. `Link` and the router add the export's base path on their
 * own; `history.replaceState` takes the address as written.
 */
export const browserUrl = (path: string) => withBasePath(path);
