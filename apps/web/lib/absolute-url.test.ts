import { afterEach, describe, expect, it, vi } from "vitest";

/** `seo` reads the export flag and SITE_URL at load, so each case loads it fresh. */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./seo");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("absoluteUrl", () => {
  it("joins a page to the site's origin in the normal build", async () => {
    const { absoluteUrl } = await load({ PAGES_EXPORT: "", SITE_URL: "https://pitch.example" });
    expect(absoluteUrl("/")).toBe("https://pitch.example/");
    expect(absoluteUrl("/students")).toBe("https://pitch.example/students");
    expect(absoluteUrl("/icons/icon-512.png")).toBe("https://pitch.example/icons/icon-512.png");
  });

  it("keeps the base path and adds the export's trailing slash to pages, not files", async () => {
    const { absoluteUrl } = await load({
      PAGES_EXPORT: "1",
      SITE_URL: "https://shashank11yadav.github.io/PitchPerfect",
    });
    expect(absoluteUrl("/")).toBe("https://shashank11yadav.github.io/PitchPerfect/");
    expect(absoluteUrl("/jobs/sdr-zentrova")).toBe(
      "https://shashank11yadav.github.io/PitchPerfect/jobs/sdr-zentrova/",
    );
    expect(absoluteUrl("/icons/icon-512.png")).toBe(
      "https://shashank11yadav.github.io/PitchPerfect/icons/icon-512.png",
    );
  });
});
