import { afterEach, describe, expect, it, vi } from "vitest";

/** The module reads its flags at load, so each case loads it fresh with its own environment. */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./pages-export");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a normal build", () => {
  it("is not an export and has no base path", async () => {
    const flags = await load({ PAGES_EXPORT: undefined, PAGES_BASE_PATH: undefined });
    expect(flags.PAGES_EXPORT).toBe(false);
    expect(flags.BASE_PATH).toBe("");
    expect(flags.withBasePath("/jobs")).toBe("/jobs");
    expect(flags.formAction("/jobs")).toBe("/jobs");
    expect(flags.exportOnly(() => [{ id: "x" }])).toBeUndefined();
  });

  it("ignores a base path given without the export flag", async () => {
    const flags = await load({ PAGES_EXPORT: "", PAGES_BASE_PATH: "/elsewhere" });
    expect(flags.BASE_PATH).toBe("");
  });
});

describe("the static export", () => {
  it("lives under /PitchPerfect by default and addresses raw URLs there", async () => {
    const flags = await load({ PAGES_EXPORT: "1", PAGES_BASE_PATH: undefined });
    expect(flags.PAGES_EXPORT).toBe(true);
    expect(flags.BASE_PATH).toBe("/PitchPerfect");
    expect(flags.withBasePath("/brand/logo.svg")).toBe("/PitchPerfect/brand/logo.svg");
    expect(flags.formAction("/jobs")).toBe("/PitchPerfect/jobs/");
  });

  it("takes another base path, and keeps the static params for its dynamic routes", async () => {
    const flags = await load({ PAGES_EXPORT: "1", PAGES_BASE_PATH: "/fork" });
    expect(flags.withBasePath("/jobs")).toBe("/fork/jobs");
    const params = flags.exportOnly(() => [{ id: "x" }]);
    expect(params?.()).toEqual([{ id: "x" }]);
  });

  it("carries a policy with no eval and no request off the page's origin", async () => {
    const { STATIC_CSP } = await load({ PAGES_EXPORT: "1" });
    expect(STATIC_CSP).toContain("default-src 'self'");
    expect(STATIC_CSP).toContain("connect-src 'self'");
    expect(STATIC_CSP).toContain("object-src 'none'");
    expect(STATIC_CSP).not.toContain("unsafe-eval");
    // Browsers ignore it in a meta policy and warn; the header version (proxy.ts) carries it.
    expect(STATIC_CSP).not.toContain("frame-ancestors");
  });
});
