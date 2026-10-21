import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MongoClient } from "mongodb";
import {
  DEMO_EMPLOYER_EMAIL,
  DEMO_STUDENT_EMAIL,
  EMPLOYER_STATE,
  STUDENT_STATE,
  saveSignedInState,
} from "./helpers/accounts";
import { API_ENV, E2E_DATABASE, MAILPIT_URL, MONGO_URL } from "./helpers/stack";

const ROOT = resolve(import.meta.dirname, "..");
const TSX = resolve(ROOT, "node_modules/.bin/tsx");
const INFRA_HINT = "Start it with `npm run dev:infra` (Docker), then run the suite again.";

/**
 * Fails with a readable message when MongoDB or Mailpit isn't up, instead of a service that dies
 * on boot or a test that waits for an email that never comes.
 */
export async function assertInfraReachable(): Promise<void> {
  const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 3_000 });
  try {
    await client.db("admin").command({ ping: 1 });
  } catch {
    throw new Error(`MongoDB isn't reachable at ${MONGO_URL}. ${INFRA_HINT}`);
  } finally {
    await client.close();
  }
  try {
    const response = await fetch(`${MAILPIT_URL}/api/v1/info`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    throw new Error(`Mailpit isn't reachable at ${MAILPIT_URL}. ${INFRA_HINT}`);
  }
}

async function dropE2eDatabase(): Promise<void> {
  const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 3_000 });
  try {
    await client.db(E2E_DATABASE).dropDatabase();
  } finally {
    await client.close();
  }
}

/** Runs one of the api's own CLI scripts against the e2e database. Output only on failure. */
function apiScript(script: string, ...args: string[]): void {
  execFileSync(TSX, [resolve(ROOT, "apps/api/src/scripts", script), ...args], {
    cwd: ROOT,
    env: { ...process.env, ...API_ENV },
    stdio: ["ignore", "pipe", "inherit"],
  });
}

/**
 * A clean, seeded database for every run: the six fictional companies, their jobs, and the demo
 * student and employer (signed in once here, so tests reuse their sessions instead of tripping
 * the sign-in limit).
 */
export default async function globalSetup(): Promise<void> {
  await assertInfraReachable();
  await dropE2eDatabase();
  apiScript("admin.ts", "migrate");
  apiScript("seed.ts", "--demo");

  mkdirSync(dirname(STUDENT_STATE), { recursive: true });
  await saveSignedInState(DEMO_STUDENT_EMAIL, STUDENT_STATE);
  await saveSignedInState(DEMO_EMPLOYER_EMAIL, EMPLOYER_STATE);
}
