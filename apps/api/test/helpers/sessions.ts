import type { Express } from "express";
import request from "supertest";
import type { CsrfAgent } from "./csrf.js";
import { createEmployer, createStudent, signIn } from "./factories.js";

/** An employer (with company) and a signed-in session for them. */
export async function employerSession(
  app: Express,
  options: Parameters<typeof createEmployer>[0] = {},
) {
  const employer = await createEmployer(options);
  const session = await signIn(request.agent(app), employer.email, employer.password);
  return { ...employer, session };
}

/** A student and a signed-in session for them. */
export async function studentSession(
  app: Express,
  options: Parameters<typeof createStudent>[0] = {},
) {
  const student = await createStudent(options);
  const session = await signIn(request.agent(app), student.email, student.password);
  return { ...student, session };
}

export type Method = "get" | "post" | "put" | "patch" | "delete";

/** Sends `method path` (with `body`, if any) on the session, with CSRF headers on writes. */
export function call(session: CsrfAgent, method: Method, path: string, body?: object) {
  const req = method === "get" ? session.agent.get(path) : session[method](path);
  return body ? req.send(body) : req;
}
