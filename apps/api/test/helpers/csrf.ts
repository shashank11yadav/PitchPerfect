import type { Express } from "express";
import request from "supertest";

/** `APP_URL` of the default test environment. */
export const TEST_ORIGIN = "http://localhost:3000";

export type TestAgent = ReturnType<typeof request.agent>;

/** `GET /api/auth/csrf` on this agent, which also stores the paired cookie. */
export async function fetchCsrfToken(agent: TestAgent): Promise<string> {
  const res = await agent.get("/api/auth/csrf").expect(200);
  return (res.body as { csrfToken: string }).csrfToken;
}

/** Fetches a CSRF token for an existing agent; `post` sends it with the correct Origin. */
export async function withCsrf(agent: TestAgent) {
  const token = await fetchCsrfToken(agent);
  return {
    agent,
    token,
    post: (path: string) => agent.post(path).set("Origin", TEST_ORIGIN).set("x-csrf-token", token),
  };
}

export type CsrfAgent = Awaited<ReturnType<typeof withCsrf>>;

/** A new agent that already holds a CSRF token. */
export function csrfAgent(app: Express): Promise<CsrfAgent> {
  return withCsrf(request.agent(app));
}
