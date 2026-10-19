import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@pitchperfect/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
};

export default defineConfig({
  test: {
    passWithNoTests: true,
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
          include: ["test/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "coach",
          root: "apps/coach",
          environment: "node",
          include: ["test/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
    ],
  },
});
