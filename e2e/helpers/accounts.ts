import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { expect, request, type APIRequestContext, type APIResponse } from "@playwright/test";
import { E2E_PASSWORD, WEB_URL } from "./stack";

/** The seeded demo accounts (`npm run seed -- --demo`); their password is `E2E_PASSWORD`. */
export const DEMO_STUDENT_EMAIL = "student@pitchperfect.example";
export const DEMO_EMPLOYER_EMAIL = "employer@pitchperfect.example";

/** Saved sessions of the demo accounts, written by the global setup. */
export const STUDENT_STATE = resolve(import.meta.dirname, "../.auth/student.json");
export const EMPLOYER_STATE = resolve(import.meta.dirname, "../.auth/employer.json");

/** A fresh suffix, so every run signs up new accounts and finds only its own emails. */
export const uniqueId = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * The api as a browser on the web origin sees it: requests go through web's `/api` proxy, and
 * every state-changing one carries the `Origin` and the CSRF token the api checks.
 */
export class ApiClient {
  private constructor(readonly context: APIRequestContext) {}

  /** Signed out, or signed in from a saved session file. */
  static async open(storageState?: string): Promise<ApiClient> {
    const context = await request.newContext({
      baseURL: WEB_URL,
      extraHTTPHeaders: { origin: WEB_URL },
      ...(storageState && { storageState }),
    });
    return new ApiClient(context);
  }

  async send(method: Method, path: string, body?: unknown): Promise<APIResponse> {
    const headers: Record<string, string> = {};
    if (method !== "GET") {
      // The token is bound to the session, which signing in replaces: ask for it every time.
      const csrf = await this.context.get("/api/auth/csrf");
      expect(csrf.ok(), "GET /api/auth/csrf").toBe(true);
      const { csrfToken } = (await csrf.json()) as { csrfToken: string };
      headers["x-csrf-token"] = csrfToken;
    }
    return this.context.fetch(`/api${path}`, {
      method,
      headers,
      ...(body !== undefined && { data: body }),
    });
  }

  /** Sends, expects a 2xx, and returns the JSON body. */
  async json<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const response = await this.send(method, path, body);
    expect(response.ok(), `${method} /api${path} → ${String(response.status())}`).toBe(true);
    return (await response.json()) as T;
  }

  async signIn(email: string, password = E2E_PASSWORD): Promise<void> {
    await this.json("POST", "/auth/signin", { email, password });
  }

  dispose(): Promise<void> {
    return this.context.dispose();
  }
}

/** Signs in once through the api and saves the session for browser contexts to reuse. */
export async function saveSignedInState(email: string, path: string): Promise<void> {
  const api = await ApiClient.open();
  try {
    await api.signIn(email);
    await api.context.storageState({ path });
  } finally {
    await api.dispose();
  }
}

/** Runs `task` with an api client signed in from a saved session, then closes it. */
export async function withApi<T>(
  storageState: string,
  task: (api: ApiClient) => Promise<T>,
): Promise<T> {
  const api = await ApiClient.open(storageState);
  try {
    return await task(api);
  } finally {
    await api.dispose();
  }
}
