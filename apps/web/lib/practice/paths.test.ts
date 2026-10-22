import { afterEach, describe, expect, it, vi } from "vitest";

/** `paths` reads the export flag at load, so each build is loaded fresh. */
async function load(pagesExport: boolean) {
  vi.resetModules();
  vi.stubEnv("PAGES_EXPORT", pagesExport ? "1" : "");
  vi.stubEnv("PAGES_BASE_PATH", undefined);
  return import("./paths");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("in the student app", () => {
  it("points at the app's practice, history and lesson pages", async () => {
    const paths = await load(false);
    expect(paths.practiceHref()).toBe("/app/practice");
    expect(paths.practiceHref("pitching")).toBe("/app/practice/pitching");
    expect(paths.practiceHref("pitching", "abc")).toBe("/app/practice/pitching?jobId=abc");
    expect(paths.attemptPath("id1")).toBe("/app/practice/attempt/id1");
    expect(paths.historyHref()).toBe("/app/history");
    expect(paths.historyHref("pitching", 2)).toBe("/app/history?skill=pitching&page=2");
    expect(paths.lessonPath()).toBe("/app/learn");
    expect(paths.lessonPath("next-steps")).toBe("/app/learn/next-steps");
    expect(paths.browserUrl("/app/practice/pitching")).toBe("/app/practice/pitching");
  });
});

describe("in the static demo", () => {
  it("points at the public pages, with the slash the static host serves them under", async () => {
    const paths = await load(true);
    expect(paths.practiceHref()).toBe("/practice/");
    expect(paths.practiceHref("pitching")).toBe("/practice/pitching/");
    expect(paths.practiceHref("pitching", "abc")).toBe("/practice/pitching/?jobId=abc");
    expect(paths.attemptPath("id 1")).toBe("/practice/attempt/?id=id%201");
    expect(paths.historyHref()).toBe("/practice/history/");
    expect(paths.historyHref("pitching", 2)).toBe("/practice/history/?skill=pitching&page=2");
    expect(paths.lessonPath()).toBe("/learn/");
    expect(paths.lessonPath("next-steps")).toBe("/learn/next-steps/");
  });

  it("adds the base path only for the History API, which Link adds itself", async () => {
    const paths = await load(true);
    expect(paths.browserUrl(paths.attemptPath("x"))).toBe("/PitchPerfect/practice/attempt/?id=x");
  });
});
