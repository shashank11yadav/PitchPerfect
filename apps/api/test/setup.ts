import { MongoMemoryServer } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/** Vitest global setup: one in-memory MongoDB for the whole run, shared with tests via `inject`. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const server = await MongoMemoryServer.create();
  project.provide("mongoUri", server.getUri());
  return async () => {
    await server.stop();
  };
}
