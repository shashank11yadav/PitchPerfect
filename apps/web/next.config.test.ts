// @vitest-environment node
import type { NextConfig } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** The headers next.config.ts sets on every page, read with `NODE_ENV` as given. */
async function pageHeaders(nodeEnv: string | undefined): Promise<Record<string, string>> {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const config: NextConfig = (await import("./next.config")).default;
  const rules = (await config.headers?.()) ?? [];
  return Object.fromEntries(rules.flatMap((rule) => rule.headers).map((h) => [h.key, h.value]));
}

describe("next.config.ts headers", () => {
  it.each([
    ["in production", "production"],
    ["when NODE_ENV is unset", undefined],
  ])("sends HSTS %s", async (_label, nodeEnv) => {
    expect((await pageHeaders(nodeEnv))["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("leaves HSTS out only in development, which serves plain http", async () => {
    expect((await pageHeaders("development"))["Strict-Transport-Security"]).toBeUndefined();
  });
});
