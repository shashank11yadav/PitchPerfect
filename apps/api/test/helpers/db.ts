import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, inject } from "vitest";
import { connectDb, disconnectDb } from "../../src/db/connect.js";

/** Each worker gets its own database on the shared in-memory server, so files can run in parallel. */
function workerDbUri(): string {
  const url = new URL(inject("mongoUri"));
  url.pathname = `/pitchperfect-test-${process.env.VITEST_POOL_ID ?? "0"}`;
  return url.toString();
}

/** Empties every collection but keeps indexes. */
async function clearDb(): Promise<void> {
  const collections = await mongoose.connection.db?.collections();
  await Promise.all((collections ?? []).map((collection) => collection.deleteMany({})));
}

/** Call at the top of a test file that needs MongoDB: connects once, clears between tests. */
export function useTestDb(): void {
  beforeAll(async () => {
    await connectDb(workerDbUri());
  });
  afterEach(clearDb);
  afterAll(disconnectDb);
}
