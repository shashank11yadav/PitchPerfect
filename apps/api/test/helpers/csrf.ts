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

/** An agent that already holds a CSRF token; `post` sends it with the correct Origin. */
export async function csrfAgent(app: Express) {
  const agent = request.agent(app);
  const token = await fetchCsrfToken(agent);
  return {
    agent,
    token,
    post: (path: string) => agent.post(path).set("Origin", TEST_ORIGIN).set("x-csrf-token", token),
  };
}
