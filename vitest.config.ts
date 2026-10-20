import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const apiGlobalSetup = fileURLToPath(new URL("./apps/api/test/setup.ts", import.meta.url));
const webSetup = fileURLToPath(new URL("./apps/web/vitest.setup.ts", import.meta.url));

// The subpath entries must come before the package root, which would otherwise match them first.
const alias = {
  "@pitchperfect/shared/env": fileURLToPath(
    new URL("./packages/shared/src/env.ts", import.meta.url),
  ),
  "@pitchperfect/shared/hmac": fileURLToPath(
    new URL("./packages/shared/src/hmac.ts", import.meta.url),
  ),
  "@pitchperfect/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
  "@pitchperfect/coach/app": fileURLToPath(new URL("./apps/coach/src/app.ts", import.meta.url)),
};

const webAlias = {
  ...alias,
  "@/": fileURLToPath(new URL("./apps/web/", import.meta.url)),
};

export default defineConfig({
  test: {
    passWithNoTests: true,
    // Explicit: every test file gets a fresh module graph (module-level caches, mocks).
    isolate: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "shared",
          root: "packages/shared",
          environment: "node",
          include: ["src/**/*.test.ts", "test/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "api",
          root: "apps/api",
          environment: "node",
          pool: "forks",
          globalSetup: [apiGlobalSetup],
          // The first run downloads a MongoDB binary for mongodb-memory-server.
          hookTimeout: 180_000,
          include: ["test/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "coach",
          root: "apps/coach",
          environment: "node",
          include: ["test/**/*.test.ts", "src/**/*.test.ts", "evals/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: webAlias },
        test: {
          name: "web",
          root: "apps/web",
          environment: "jsdom",
          setupFiles: [webSetup],
          include: ["proxy.test.ts", "{app,components,content,lib}/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
