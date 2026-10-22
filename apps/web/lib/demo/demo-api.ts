import {
  AttemptListQuerySchema,
  isSkillSlug,
  StartPracticeSchema,
  type PracticeEvent,
} from "@pitchperfect/shared";
import { ApiError, type Parser } from "@/lib/api";
import {
  acceptDemoConsent,
  deleteDemoAttempt,
  demoLessonsDone,
  demoQuota,
  endDemoSession,
  getDemoAttempt,
  listDemoAttempts,
  runDemoTurn,
  setDemoLessonDone,
  startDemoSession,
} from "./practice";

/**
 * The api as the static demo's practice room sees it: the handful of routes the room, lessons
 * and history call, answered from this browser (lib/demo/practice.ts). Everything else is a 404,
 * the same way a missing route would be.
 */

interface Options<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: Parser<T>;
}

const ORIGIN = "https://demo.invalid";
const SESSION = /^\/practice\/sessions\/([^/]+)(\/end)?$/;
const ATTEMPT = /^\/practice\/attempts\/([^/]+)$/;
const LESSON = /^\/me\/lessons\/([^/]+)$/;

const missing = () =>
  new ApiError(404, "not_found", "That isn’t part of the static demo. The full app has it.");

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** `{ completed }`, as `GET /api/me/lessons` answers. */
const lessons = () => ({ completed: demoLessonsDone() });

async function answer(path: string, { method = "GET", body }: Options<unknown>): Promise<unknown> {
  const url = new URL(path, ORIGIN);
  const { pathname } = url;

  if (pathname === "/practice/quota" && method === "GET") return demoQuota();
  if (pathname === "/practice/attempts" && method === "GET") {
    const query = AttemptListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) throw new ApiError(400, "validation_failed", "Bad query");
    return listDemoAttempts(query.data);
  }
  if (pathname === "/practice/sessions" && method === "POST") {
    const input = StartPracticeSchema.safeParse(body);
    if (!input.success) throw new ApiError(400, "validation_failed", "Pick a skill to practice.");
    return startDemoSession(input.data);
  }
  const session = SESSION.exec(pathname);
  if (session?.[1]) {
    const id = decodeURIComponent(session[1]);
    if (session[2] && method === "POST") return { attempt: await endDemoSession(id) };
    if (!session[2] && method === "GET") return { attempt: getDemoAttempt(id) };
  }
  const attempt = ATTEMPT.exec(pathname);
  if (attempt?.[1] && method === "DELETE") {
    deleteDemoAttempt(decodeURIComponent(attempt[1]));
    return undefined;
  }
  if (pathname === "/me/lessons" && method === "GET") return lessons();
  const lesson = LESSON.exec(pathname);
  if (lesson?.[1] && method === "PUT" && isSkillSlug(lesson[1])) {
    const done = isObject(body) && body.completed === true;
    setDemoLessonDone(lesson[1], done);
    return lessons();
  }
  if (pathname === "/me/practice-consent" && method === "POST") {
    return { practiceConsentAt: acceptDemoConsent() };
  }
  // The scorecard's share card asks for open applications; a visitor has none.
  if (pathname === "/me/applications" && method === "GET") {
    return { items: [], page: 1, pageSize: 50, total: 0 };
  }
  throw missing();
}

/** `apiFetch` in export mode. */
export async function demoFetch<T>(path: string, options: Options<T> = {}): Promise<T> {
  const data = await answer(path, options);
  return options.schema ? options.schema.parse(data) : (data as T);
}

/** `apiStream` in export mode: the only stream is a practice turn. */
export async function demoStream(
  path: string,
  body: unknown,
  onEvent: (event: PracticeEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const match = /^\/practice\/sessions\/([^/]+)\/turns$/.exec(new URL(path, ORIGIN).pathname);
  if (!match?.[1]) throw missing();
  const text = isObject(body) && typeof body.text === "string" ? body.text : "";
  await runDemoTurn(
    decodeURIComponent(match[1]),
    text,
    onEvent,
    signal ?? new AbortController().signal,
  );
}
