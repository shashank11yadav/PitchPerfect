import type { PublicJobSummary } from "@pitchperfect/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

const fetchMock = vi.fn<typeof fetch>();

const summary = (slug: string, verification: PublicJobSummary["company"]["verification"]) => ({
  id: `65f1c0ffee00000000000${slug.length.toString().padStart(3, "0")}`,
  slug,
  title: "Sales development representative",
  location: "Columbus, OH",
  workplace: "onsite",
  employmentType: "full_time",
  pay: { type: "unpaid" },
  skills: [],
  publishedAt: "2026-10-01T12:00:00.000Z",
  company: {
    name: "Quarrow Logistics Software",
    slug: "quarrow",
    logoUrl: null,
    verification,
    verifiedDomain: verification === "verified" ? "quarrow.example" : null,
  },
});

const page = (items: unknown[], pageNumber: number, total: number) =>
  new Response(JSON.stringify({ items, page: pageNumber, pageSize: 50, total }), {
    headers: { "content-type": "application/json" },
  });

async function load() {
  vi.resetModules();
  return {
    sitemap: (await import("./sitemap")).default,
    robots: (await import("./robots")).default,
  };
}

const STATIC_URLS = [
  "https://example.test/",
  "https://example.test/students",
  "https://example.test/employers",
  "https://example.test/how-it-works",
  "https://example.test/jobs",
  "https://example.test/about",
  "https://example.test/privacy",
  "https://example.test/terms",
];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SITE_URL", "https://example.test");
  vi.stubEnv("API_ORIGIN", "http://api.test:4000");
  vi.stubEnv("PROXY_SHARED_SECRET", "p".repeat(32));
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sitemap", () => {
  it("lists the static pages and the active jobs of verified companies, paging until done", async () => {
    fetchMock
      .mockResolvedValueOnce(
        page([summary("verified-one", "verified"), summary("unverified-two", "unverified")], 1, 51),
      )
      .mockResolvedValueOnce(page([summary("verified-three", "verified")], 2, 51));
    const { sitemap } = await load();

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toEqual([
      ...STATIC_URLS,
      "https://example.test/jobs/verified-one",
      "https://example.test/jobs/verified-three",
    ]);
    // publishedAt is when a job went live, not when its page last changed, so it is left out.
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(true);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://api.test:4000/api/jobs?pageSize=50&page=1",
      "http://api.test:4000/api/jobs?pageSize=50&page=2",
    ]);
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-pp-proxy")).toBe("p".repeat(32));
  });

  it("stops at an empty page even if the total says there is more", async () => {
    fetchMock.mockResolvedValueOnce(page([], 1, 99));
    const { sitemap } = await load();
    expect((await sitemap()).map((entry) => entry.url)).toEqual(STATIC_URLS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still lists the static pages when the api is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const { sitemap } = await load();
    expect((await sitemap()).map((entry) => entry.url)).toEqual(STATIC_URLS);
  });

  it("lists no jobs in the static demo, whose board is samples", async () => {
    vi.stubEnv("PAGES_EXPORT", "1");
    const { sitemap } = await load();
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://example.test/jobs/");
    expect(urls.filter((url) => url.includes("/jobs/") && !url.endsWith("/jobs/"))).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still lists the static pages when the api fails part way", async () => {
    fetchMock
      .mockResolvedValueOnce(page([summary("verified-one", "verified")], 1, 60))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));
    const { sitemap } = await load();
    expect((await sitemap()).map((entry) => entry.url)).toEqual(STATIC_URLS);
  });
});

/** Google's robots.txt matching: longest matching rule wins, `$` anchors the end. */
function isBlocked(path: string, disallow: readonly string[]): boolean {
  return disallow.some((rule) => {
    const anchored = rule.endsWith("$");
    const prefix = anchored ? rule.slice(0, -1) : rule;
    return anchored ? path === prefix : path.startsWith(prefix);
  });
}

describe("robots", () => {
  it("disallows the app, employer and api areas without blocking public pages", async () => {
    const { robots } = await load();
    const result = await robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules).toHaveLength(1);
    const [rule] = rules;
    expect(rule?.userAgent).toBe("*");
    expect(rule?.allow).toBe("/");
    const disallow = [rule?.disallow ?? []].flat();

    for (const path of ["/app", "/app/practice", "/employer", "/employer/jobs/1", "/api/jobs"]) {
      expect(isBlocked(path, disallow), path).toBe(true);
    }
    for (const path of ["/", "/employers", "/apple-icon.png", "/jobs", "/jobs/sdr-1", "/about"]) {
      expect(isBlocked(path, disallow), path).toBe(false);
    }
    expect(result.sitemap).toBe("https://example.test/sitemap.xml");
  });
});
